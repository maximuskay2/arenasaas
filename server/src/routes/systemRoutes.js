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
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Platform administrator only' });
  }
  next();
}

router.use(requireAuth, requirePlatformAdmin);

router.get('/custom-game-titles', async (_req, res) => {
  try {
    const { rows } = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(
        `SELECT t.id, t.slug, t.name, t.genre_id, g.name AS genre_name,
                t.genre_template_id, gt.name AS genre_template_name, gt.slug AS genre_template_slug,
                t.created_by_tenant_id, t.created_date,
                t.default_team_roster_size, t.competition_scoring_type, t.match_scoring_mode, t.banner_url, t.icon_url,
                t.verified_at
         FROM game_titles t
         INNER JOIN game_genres g ON g.id = t.genre_id
         LEFT JOIN game_genre_templates gt ON gt.id = t.genre_template_id
         WHERE t.source = 'custom' AND t.verified_at IS NULL
         ORDER BY t.created_date DESC
         LIMIT 500`
      )
    );
    res.json({ titles: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.patch('/custom-game-titles/:id/verify', express.json(), async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  const bannerUrl = req.body?.banner_url != null ? String(req.body.banner_url).trim().slice(0, 2000) : null;
  const iconUrl = req.body?.icon_url != null ? String(req.body.icon_url).trim().slice(0, 2000) : null;
  const uid = String(req.user?.sub || '').trim();
  if (!uid) return res.status(400).json({ error: 'User id missing' });
  try {
    const r = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(
        `UPDATE game_titles
         SET verified_at = NOW(),
             verified_by = $2::uuid,
             banner_url = COALESCE(NULLIF($3, ''), banner_url),
             icon_url = COALESCE(NULLIF($4, ''), icon_url),
             updated_date = NOW()
         WHERE id = $1::uuid AND source = 'custom'
         RETURNING id, slug, name, verified_at`,
        [id, uid, bannerUrl || '', iconUrl || '']
      )
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Not found or not a custom title' });
    await auditPlatformAdminAction(req, 'custom_game_title_verified', 'game_titles', id, { slug: r.rows[0]?.slug });
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

const GENRE_TEMPLATE_FORMATS = new Set(['single_elimination', 'double_elimination', 'round_robin', 'swiss']);
const GENRE_TEMPLATE_COMP = new Set(['bracket', 'points']);
const GENRE_TEMPLATE_MATCH = new Set(['best_of_1', 'best_of_3', 'best_of_5', 'points']);

function slugifyTemplateSlug(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

router.get('/game-genre-templates', async (_req, res) => {
  try {
    const { rows } = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(
        `SELECT id, slug, name, rules_summary, default_team_roster_size, min_team_size, max_team_size,
                suggested_format, competition_scoring_type, match_scoring_mode, swiss_recommended, sort_order,
                created_date, updated_date
         FROM game_genre_templates
         ORDER BY sort_order ASC, name ASC`
      )
    );
    res.json({ templates: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/game-genre-templates', express.json(), async (req, res) => {
  const slug = slugifyTemplateSlug(req.body?.slug);
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ error: 'slug required (lowercase letters, numbers, hyphens)' });
  }
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 200) return res.status(400).json({ error: 'name required (max 200 chars)' });
  const rules_summary = String(req.body?.rules_summary ?? '').trim().slice(0, 4000);
  const suggested_format = String(req.body?.suggested_format || 'single_elimination');
  const competition_scoring_type = String(req.body?.competition_scoring_type || 'bracket');
  const match_scoring_mode = String(req.body?.match_scoring_mode || 'best_of_1');
  if (!GENRE_TEMPLATE_FORMATS.has(suggested_format)) return res.status(400).json({ error: 'invalid suggested_format' });
  if (!GENRE_TEMPLATE_COMP.has(competition_scoring_type)) return res.status(400).json({ error: 'invalid competition_scoring_type' });
  if (!GENRE_TEMPLATE_MATCH.has(match_scoring_mode)) return res.status(400).json({ error: 'invalid match_scoring_mode' });
  const default_team_roster_size = Math.max(1, Math.min(64, parseInt(String(req.body?.default_team_roster_size || '5'), 10) || 5));
  const sort_order = Math.max(0, Math.min(9999, parseInt(String(req.body?.sort_order ?? '100'), 10) || 100));
  let min_team_size = null;
  let max_team_size = null;
  if (req.body?.min_team_size !== undefined && req.body?.min_team_size !== null && req.body?.min_team_size !== '') {
    min_team_size = Math.max(1, Math.min(64, parseInt(String(req.body.min_team_size), 10) || 1));
  }
  if (req.body?.max_team_size !== undefined && req.body?.max_team_size !== null && req.body?.max_team_size !== '') {
    max_team_size = Math.max(1, Math.min(64, parseInt(String(req.body.max_team_size), 10) || 1));
  }
  const swiss_recommended = !!req.body?.swiss_recommended;
  try {
    const { rows } = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(
        `INSERT INTO game_genre_templates (
           slug, name, rules_summary, default_team_roster_size, min_team_size, max_team_size,
           suggested_format, competition_scoring_type, match_scoring_mode, swiss_recommended, sort_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          slug,
          name,
          rules_summary,
          default_team_roster_size,
          min_team_size,
          max_team_size,
          suggested_format,
          competition_scoring_type,
          match_scoring_mode,
          swiss_recommended,
          sort_order,
        ]
      )
    );
    await auditPlatformAdminAction(req, 'game_genre_template_created', 'game_genre_templates', rows[0]?.id, { slug });
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Template slug already exists' });
    }
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.patch('/game-genre-templates/:id', express.json(), async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  const body = req.body || {};
  const sets = [];
  const vals = [];
  let i = 1;

  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name || name.length > 200) return res.status(400).json({ error: 'invalid name' });
    sets.push(`name = $${i++}`);
    vals.push(name);
  }
  if (body.rules_summary !== undefined) {
    sets.push(`rules_summary = $${i++}`);
    vals.push(String(body.rules_summary ?? '').trim().slice(0, 4000));
  }
  if (body.default_team_roster_size !== undefined) {
    const n = Math.max(1, Math.min(64, parseInt(String(body.default_team_roster_size), 10) || 1));
    sets.push(`default_team_roster_size = $${i++}`);
    vals.push(n);
  }
  if (body.min_team_size !== undefined) {
    sets.push(`min_team_size = $${i++}`);
    vals.push(
      body.min_team_size === null || body.min_team_size === ''
        ? null
        : Math.max(1, Math.min(64, parseInt(String(body.min_team_size), 10) || 1))
    );
  }
  if (body.max_team_size !== undefined) {
    sets.push(`max_team_size = $${i++}`);
    vals.push(
      body.max_team_size === null || body.max_team_size === ''
        ? null
        : Math.max(1, Math.min(64, parseInt(String(body.max_team_size), 10) || 1))
    );
  }
  if (body.suggested_format !== undefined) {
    const sf = String(body.suggested_format);
    if (!GENRE_TEMPLATE_FORMATS.has(sf)) return res.status(400).json({ error: 'invalid suggested_format' });
    sets.push(`suggested_format = $${i++}`);
    vals.push(sf);
  }
  if (body.competition_scoring_type !== undefined) {
    const c = String(body.competition_scoring_type);
    if (!GENRE_TEMPLATE_COMP.has(c)) return res.status(400).json({ error: 'invalid competition_scoring_type' });
    sets.push(`competition_scoring_type = $${i++}`);
    vals.push(c);
  }
  if (body.match_scoring_mode !== undefined) {
    const m = String(body.match_scoring_mode);
    if (!GENRE_TEMPLATE_MATCH.has(m)) return res.status(400).json({ error: 'invalid match_scoring_mode' });
    sets.push(`match_scoring_mode = $${i++}`);
    vals.push(m);
  }
  if (body.swiss_recommended !== undefined) {
    sets.push(`swiss_recommended = $${i++}`);
    vals.push(!!body.swiss_recommended);
  }
  if (body.sort_order !== undefined) {
    const so = Math.max(0, Math.min(9999, parseInt(String(body.sort_order), 10) || 0));
    sets.push(`sort_order = $${i++}`);
    vals.push(so);
  }

  if (!sets.length) return res.status(400).json({ error: 'No valid fields to update' });
  sets.push('updated_date = NOW()');
  vals.push(id);
  try {
    const { rows } = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(
        `UPDATE game_genre_templates SET ${sets.join(', ')} WHERE id = $${i}::uuid RETURNING *`,
        vals
      )
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await auditPlatformAdminAction(req, 'game_genre_template_updated', 'game_genre_templates', id, {
      slug: rows[0].slug,
    });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

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
