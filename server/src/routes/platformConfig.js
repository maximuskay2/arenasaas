import express from 'express';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runWithRls, rlsContextFromRequest } from '../rls/transaction.js';

const router = express.Router();

const KEYS = [
  'withdrawal_fee_percent',
  'withdrawal_fee_fixed',
  'min_withdrawal_amount',
  'entry_platform_fee_percent',
  'platform_maintenance',
  'manual_reporting_mode',
  'platform_name',
  'support_email',
  'email_settings',
  'payment_gateway_settings',
];

const BOOL_KEYS = new Set(['platform_maintenance', 'manual_reporting_mode']);
const JSON_KEYS = new Set(['email_settings', 'payment_gateway_settings']);
const NUM_KEYS = new Set([
  'withdrawal_fee_percent',
  'withdrawal_fee_fixed',
  'min_withdrawal_amount',
  'entry_platform_fee_percent',
]);

function serializeConfigValue(k, raw) {
  if (BOOL_KEYS.has(k)) {
    return typeof raw === 'boolean' ? (raw ? '1' : '0') : String(raw) === 'true' || String(raw) === '1' ? '1' : '0';
  }
  if (JSON_KEYS.has(k)) {
    if (raw && typeof raw === 'object') return JSON.stringify(raw);
    if (typeof raw === 'string') return raw;
    return '{}';
  }
  if (NUM_KEYS.has(k)) return String(Number(raw) || 0);
  return String(raw ?? '');
}

async function auditPlatformConfigChange(req, method) {
  if (req.user?.role !== 'admin') return;
  const keys = KEYS.filter((k) => req.body[k] !== undefined);
  try {
    await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(
        `INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_email, actor_role, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          null,
          method === 'POST' ? 'platform_config_post' : 'platform_config_patch',
          'platform_config',
          'platform',
          String(req.user.email || 'unknown'),
          'admin',
          JSON.stringify({ method, keys }),
        ]
      )
    );
  } catch (e) {
    console.error('[audit_logs platform_config]', e);
  }
}

function rowToDto(rows) {
  const o = { id: 'platform-config' };
  for (const r of rows) {
    if (KEYS.includes(r.key)) {
      if (BOOL_KEYS.has(r.key)) {
        o[r.key] = r.value === '1' || r.value === 'true';
        continue;
      }
      if (JSON_KEYS.has(r.key)) {
        try {
          o[r.key] = JSON.parse(r.value);
        } catch {
          o[r.key] = {};
        }
        continue;
      }
      o[r.key] = NUM_KEYS.has(r.key) ? Number(r.value) || 0 : r.value;
    }
  }
  return o;
}

router.get('/', async (req, res) => {
  try {
    const rows = await runWithRls(
      pool,
      {
        ...rlsContextFromRequest(req, { publicCatalog: true }),
        allowPublicPlatformConfigRead: true,
      },
      (client) =>
        client.query(`SELECT key, value FROM platform_config WHERE key = ANY($1::text[])`, [KEYS]).then((r) => r.rows)
    );
    res.json([rowToDto(rows)]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const dto = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      for (const k of KEYS) {
        if (req.body[k] === undefined) continue;
        const raw = req.body[k];
        const v = serializeConfigValue(k, raw);
        await client.query(
          `INSERT INTO platform_config (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_date = NOW()`,
          [k, v]
        );
      }
      const r = await client.query(`SELECT key, value FROM platform_config WHERE key = ANY($1::text[])`, [KEYS]);
      return rowToDto(r.rows);
    });
    await auditPlatformConfigChange(req, 'POST');
    res.status(201).json(dto);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const dto = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      for (const k of KEYS) {
        if (req.body[k] === undefined) continue;
        const raw = req.body[k];
        const v = serializeConfigValue(k, raw);
        await client.query(
          `INSERT INTO platform_config (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_date = NOW()`,
          [k, v]
        );
      }
      const r = await client.query(`SELECT key, value FROM platform_config WHERE key = ANY($1::text[])`, [KEYS]);
      return rowToDto(r.rows);
    });
    await auditPlatformConfigChange(req, 'PATCH');
    res.json(dto);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
