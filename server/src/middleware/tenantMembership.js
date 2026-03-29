import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';

/**
 * When ENFORCE_USER_TENANTS=true, require X-Tenant-ID to appear in user_tenants for this user.
 * Legacy users with zero membership rows are unchanged (backward compatible).
 */
export async function tenantMembershipMiddleware(req, res, next) {
  if (process.env.ENFORCE_USER_TENANTS !== 'true') return next();
  if (!req.user?.sub) return next();
  if (req.user?.role === 'admin' || req.user?.role === 'super_admin') return next();

  const tid = String(req.headers['x-tenant-id'] || req.headers['X-Tenant-ID'] || '').trim();
  if (!tid) return next();

  const ctx = { userId: String(req.user.sub), userEmail: String(req.user.email || '').toLowerCase() };

  try {
    const { rows: anyRows } = await runWithRls(pool, ctx, async (client) =>
      client.query(`SELECT EXISTS (SELECT 1 FROM user_tenants WHERE user_id = $1::uuid) AS has_any`, [req.user.sub])
    );
    if (!anyRows[0]?.has_any) return next();

    const ok = await runWithRls(pool, ctx, async (client) =>
      client.query(
        `SELECT 1 FROM user_tenants WHERE user_id = $1::uuid AND tenant_id = $2 LIMIT 1`,
        [req.user.sub, tid]
      )
    );
    if (!ok.rowCount) {
      return res.status(403).json({ error: 'Not a member of this organization', code: 'tenant_membership' });
    }
    next();
  } catch (e) {
    next(e);
  }
}
