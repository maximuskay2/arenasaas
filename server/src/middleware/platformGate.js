import { verifyToken } from './auth.js';
import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';

let cache = {
  at: 0,
  platformMaintenance: false,
  tenantMaint: new Map(),
};

const TTL_MS = 5000;

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) {
    return xf.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

function adminAllowlist() {
  const raw = process.env.ADMIN_IP_ALLOWLIST || process.env.ADMIN_IP_WHITELIST || '';
  const parts = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? new Set(parts) : null;
}

async function refreshMaintenanceCache() {
  const now = Date.now();
  if (now - cache.at < TTL_MS) return;
  try {
    const row = await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      const pc = await client.query(
        `SELECT key, value FROM platform_config WHERE key IN ('platform_maintenance', 'manual_reporting_mode')`
      );
      const tenants = await client.query(
        `SELECT id::text AS id FROM tenants WHERE maintenance_mode = TRUE`
      );
      return { pc: pc.rows, tenants: tenants.rows };
    });
    const platformMaintenance = row.pc.some(
      (r) => r.key === 'platform_maintenance' && (r.value === '1' || r.value === 'true')
    );
    const tenantMaint = new Map();
    for (const t of row.tenants) tenantMaint.set(t.id, true);
    cache = { at: now, platformMaintenance, tenantMaint };
  } catch (e) {
    console.error('[platformGate] maintenance cache refresh', e);
    cache = { ...cache, at: now };
  }
}

/**
 * Optional auth + platform admin IP allowlist + maintenance enforcement.
 * Mount on /api/v1, /api/functions, /api/integrations (not /api/auth or /api/system).
 */
export async function platformGateMiddleware(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
  req.user = token ? verifyToken(token) : null;

  const allow = adminAllowlist();
  if (allow && req.user?.role === 'admin') {
    const ip = clientIp(req);
    if (ip && !allow.has(ip)) {
      return res.status(403).json({ error: 'Admin access denied from this IP', code: 'admin_ip_blocked' });
    }
  }

  await refreshMaintenanceCache();

  if (cache.platformMaintenance && req.user?.role !== 'admin') {
    return res.status(503).json({
      error: 'Platform maintenance in progress',
      code: 'platform_maintenance',
    });
  }

  const tid = String(req.headers['x-tenant-id'] || req.headers['X-Tenant-ID'] || '').trim();
  if (tid && cache.tenantMaint.has(tid) && req.user?.role !== 'admin') {
    return res.status(503).json({
      error: 'This organization is temporarily unavailable',
      code: 'tenant_maintenance',
    });
  }

  next();
}
