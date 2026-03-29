import express from 'express';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool, getReadPool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runWithRls } from '../rls/transaction.js';
import { encryptSecret, isVaultConfigured } from '../crypto/secretsVault.js';
import { normalizeClientHwid } from '../hwidCheck.js';
import { enqueueBracketJob, bracketQueueDepth, drainBracketJobs } from '../jobs/bracketJobQueue.js';
import {
  enqueueFcmNotificationJob,
  fcmNotificationQueueDepth,
  drainFcmNotificationJobs,
} from '../jobs/fcmNotificationQueue.js';
import { processFcmQueueJob } from '../notifications/fcmStub.js';
import { getEmailTransportSummary, sendPlatformEmail } from '../mail/sendPlatformEmail.js';
import { getStripeSecretKey } from '../config/paymentCredentials.js';

const router = express.Router();

async function auditPlatformAdminAction(req, action, entityType, entityId, details) {
  try {
    await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(
        `INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_email, actor_role, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          null,
          action,
          entityType,
          String(entityId ?? ''),
          String(req.user?.email || 'unknown'),
          'admin',
          typeof details === 'string' ? details : JSON.stringify(details ?? {}),
        ]
      )
    );
  } catch (e) {
    console.error('[audit_logs system]', e);
  }
}

const ALLOWED_SECRET_KEYS = new Set([
  'riot_api',
  'steam_api',
  'ubisoft_api',
  'resend_api_key',
  'smtp_password',
  'stripe_secret_key',
  'paystack_secret_key',
  'flutterwave_secret_key',
  'flutterwave_secret_hash',
]);

function requirePlatformAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Platform administrator only' });
  }
  next();
}

router.use(requireAuth, requirePlatformAdmin);

router.get('/email-status', async (_req, res) => {
  try {
    const summary = await getEmailTransportSummary();
    res.json({ ...summary, vault_configured: isVaultConfigured() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/test-email', async (req, res) => {
  const to = String(req.body?.to || req.user?.email || '').trim();
  if (!to) return res.status(400).json({ error: 'to required' });
  try {
    const out = await sendPlatformEmail({
      to,
      subject: String(req.body?.subject || 'Arena — test email'),
      body: String(req.body?.body || 'Outbound email is configured.'),
    });
    res.json({ ok: true, result: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Aggregate counts on read replica when DATABASE_READ_REPLICA_URL is set. */
router.get('/pulse-readonly', async (_req, res) => {
  const p = getReadPool();
  try {
    const run = async (sql, params = []) =>
      runWithRls(p, { isPlatformAdmin: true }, (client) => client.query(sql, params).then((r) => r.rows[0]));

    const [tActive, tourn, teams, pay] = await Promise.all([
      run(`SELECT COUNT(*)::int AS c FROM tenants WHERE status = 'active'`),
      run(`SELECT COUNT(*)::int AS c FROM tournaments WHERE status = 'in_progress'`),
      run(`SELECT COUNT(*)::int AS c FROM teams`),
      run(`SELECT COALESCE(SUM(amount),0)::float AS s FROM payment_ledger WHERE type = 'platform_fee'`),
    ]);
    const tEngine = Date.now();
    const engineRow = await run(
      `SELECT COUNT(*)::int AS c FROM matches m
       INNER JOIN tournaments t ON t.id::text = m.tournament_id
       WHERE t.status = 'in_progress'
         AND m.status IN ('scheduled', 'in_progress', 'check_in_open')`
    );
    const engine_query_ms = Date.now() - tEngine;
    res.json({
      source: readPoolLabel(),
      active_tenants: tActive?.c ?? 0,
      tournaments_in_progress: tourn?.c ?? 0,
      teams_total: teams?.c ?? 0,
      platform_fee_ledger_sum: pay?.s ?? 0,
      engine_query_ms,
      engine_active_bracket_rows: engineRow?.c ?? 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

function readPoolLabel() {
  return process.env.DATABASE_READ_REPLICA_URL ? 'read_replica' : 'primary_pool';
}

router.get('/stripe-escrow', async (_req, res) => {
  const key = await getStripeSecretKey();
  if (!key) {
    return res.json({
      configured: false,
      message: 'Set STRIPE_SECRET_KEY (env) or stripe_secret_key in the vault.',
      available_usd: null,
    });
  }
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(key);
    const rows = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client
        .query(
          `SELECT DISTINCT stripe_account_id FROM tenant_configs
           WHERE stripe_account_id IS NOT NULL AND stripe_account_id <> ''`
        )
        .then((r) => r.rows)
    );
    let availableUsd = 0;
    let pendingUsd = 0;
    const errors = [];
    for (const { stripe_account_id: acct } of rows) {
      try {
        const bal = await stripe.balance.retrieve({ stripeAccount: acct });
        for (const x of bal.available || []) {
          if (x.currency === 'usd') availableUsd += x.amount / 100;
        }
        for (const x of bal.pending || []) {
          if (x.currency === 'usd') pendingUsd += x.amount / 100;
        }
      } catch (err) {
        errors.push({ account: acct, message: err.message });
      }
    }
    res.json({
      configured: true,
      accounts_checked: rows.length,
      currency: 'USD',
      available_usd: Math.round(availableUsd * 100) / 100,
      pending_usd: Math.round(pendingUsd * 100) / 100,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/platform-secrets', async (_req, res) => {
  if (!isVaultConfigured()) {
    return res.json({ configured: false, keys: [], message: 'Set SECRETS_MASTER_KEY (64 hex) to use the vault.' });
  }
  try {
    const rows = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(`SELECT key_name, updated_date FROM platform_integration_secrets ORDER BY key_name`).then((r) => r.rows)
    );
    res.json({
      configured: true,
      keys: rows.map((r) => ({
        key_name: r.key_name,
        updated_date: r.updated_date,
        has_value: true,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.put('/platform-secrets/:key', express.json(), async (req, res) => {
  if (!isVaultConfigured()) {
    return res.status(503).json({ error: 'SECRETS_MASTER_KEY not configured' });
  }
  const key = req.params.key;
  if (!ALLOWED_SECRET_KEYS.has(key)) {
    return res.status(400).json({ error: 'Unknown secret key' });
  }
  const value = req.body?.value;
  if (value === undefined || value === null || String(value).trim() === '') {
    return res.status(400).json({ error: 'value required' });
  }
  try {
    const ciphertext = encryptSecret(String(value).trim());
    await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(
        `INSERT INTO platform_integration_secrets (key_name, ciphertext, updated_date)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key_name) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_date = NOW()`,
        [key, ciphertext]
      )
    );
    await auditPlatformAdminAction(req, 'platform_secret_upsert', 'platform_integration_secret', key, { key_name: key });
    res.json({ ok: true, key_name: key });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/hwid-bans', async (_req, res) => {
  try {
    const rows = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client
        .query(
          `SELECT id, hwid_norm, reason, created_by_email, created_date
           FROM platform_hwid_bans ORDER BY created_date DESC LIMIT 500`
        )
        .then((r) => r.rows)
    );
    res.json({ bans: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/hwid-bans', express.json(), async (req, res) => {
  const hwid_norm = normalizeClientHwid(req.body?.hwid);
  const reason = String(req.body?.reason ?? '').trim().slice(0, 2000);
  if (!hwid_norm) return res.status(400).json({ error: 'hwid required' });
  try {
    await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(
        `INSERT INTO platform_hwid_bans (hwid_norm, reason, created_by_email)
         VALUES ($1, $2, $3)
         ON CONFLICT (hwid_norm) DO UPDATE SET reason = EXCLUDED.reason, created_by_email = EXCLUDED.created_by_email`,
        [hwid_norm, reason || '(no reason)', req.user?.email || null]
      )
    );
    await auditPlatformAdminAction(req, 'platform_hwid_ban_upsert', 'platform_hwid_ban', hwid_norm, { reason: reason.slice(0, 200) });
    res.json({ ok: true, hwid_norm });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.delete('/hwid-bans/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const r = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(`DELETE FROM platform_hwid_bans WHERE id = $1::uuid RETURNING id`, [id])
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    await auditPlatformAdminAction(req, 'platform_hwid_ban_delete', 'platform_hwid_ban', id, {});
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.delete('/platform-secrets/:key', async (req, res) => {
  if (!isVaultConfigured()) {
    return res.status(503).json({ error: 'SECRETS_MASTER_KEY not configured' });
  }
  const key = req.params.key;
  if (!ALLOWED_SECRET_KEYS.has(key)) {
    return res.status(400).json({ error: 'Unknown secret key' });
  }
  try {
    await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(`DELETE FROM platform_integration_secrets WHERE key_name = $1`, [key])
    );
    await auditPlatformAdminAction(req, 'platform_secret_delete', 'platform_integration_secret', key, { key_name: key });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** In-process bracket job stub (§5.5); replace queue with BullMQ/SQS for production. */
router.post('/bracket-jobs', express.json(), async (req, res) => {
  try {
    const id = enqueueBracketJob(req.body || {});
    await auditPlatformAdminAction(req, 'bracket_job_enqueue', 'bracket_job', id, { depth_after: bracketQueueDepth() });
    res.status(202).json({ id, depth: bracketQueueDepth() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/bracket-jobs/depth', (_req, res) => {
  res.json({ depth: bracketQueueDepth() });
});

router.post('/bracket-jobs/drain', express.json(), async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 10));
    const jobs = drainBracketJobs(limit);
    if (jobs.length) {
      await auditPlatformAdminAction(req, 'bracket_job_drain', 'bracket_job', 'batch', { count: jobs.length });
    }
    res.json({ drained: jobs.length, jobs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** §7.2 — FCM notification job stub (in-process queue + stub sender). */
router.post('/notification-jobs/fcm', express.json(), async (req, res) => {
  try {
    const id = enqueueFcmNotificationJob(req.body || {});
    await auditPlatformAdminAction(req, 'fcm_notification_enqueue', 'fcm_notification_job', id, {});
    res.status(202).json({ id, depth: fcmNotificationQueueDepth() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/notification-jobs/fcm/depth', (_req, res) => {
  res.json({ depth: fcmNotificationQueueDepth() });
});

router.post('/notification-jobs/fcm/drain', express.json(), async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 10));
    const jobs = drainFcmNotificationJobs(limit);
    const results = [];
    for (const job of jobs) {
      results.push(await processFcmQueueJob(job));
    }
    if (jobs.length) {
      await auditPlatformAdminAction(req, 'fcm_notification_drain', 'fcm_notification_job', 'batch', {
        count: jobs.length,
      });
    }
    res.json({ drained: jobs.length, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
