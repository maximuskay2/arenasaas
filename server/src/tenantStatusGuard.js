import { pool } from './db.js';
import { EntitlementError } from './entitlements.js';

/**
 * Blocks organizer writes when the organization is pending superadmin approval.
 * Platform admins bypass.
 */
export async function assertTenantActiveForWrites(tenantId, userRole) {
  if (!tenantId || userRole === 'admin') return;
  const { rows } = await pool.query(`SELECT status FROM tenants WHERE id::text = $1 LIMIT 1`, [
    String(tenantId),
  ]);
  const st = rows[0]?.status;
  if (st === 'pending') {
    throw new EntitlementError(
      'This organization is pending platform approval. You can browse the dashboard; hosting actions unlock after approval.',
      403,
      'tenant_pending'
    );
  }
  if (st === 'suspended' || st === 'cancelled') {
    throw new EntitlementError(
      'This organization cannot perform this action right now.',
      403,
      'tenant_inactive'
    );
  }
}
