/**
 * §4.3 — hosting entitlements before creating tournaments (server-enforced).
 */

export class EntitlementError extends Error {
  constructor(message, statusCode = 403, code = 'entitlement') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function assertCanCreateTournament(client, tenantId, userRole) {
  if (userRole === 'admin') return;
  if (!tenantId) throw new EntitlementError('tenant_id required', 400, 'tenant_required');

  const { rows: trows } = await client.query(`SELECT status FROM tenants WHERE id::text = $1 LIMIT 1`, [
    String(tenantId),
  ]);
  const tst = trows[0]?.status;
  if (tst === 'pending') {
    throw new EntitlementError(
      'Your organization is pending platform approval before you can create tournaments.',
      403,
      'tenant_pending'
    );
  }
  if (tst === 'suspended' || tst === 'cancelled') {
    throw new EntitlementError('This organization cannot create tournaments right now.', 403, 'tenant_inactive');
  }

  const { rows } = await client.query(
    `SELECT is_active, plan_type, single_tournament_remaining, status
     FROM tenant_entitlements WHERE tenant_id = $1 LIMIT 1`,
    [String(tenantId)]
  );
  const row = rows[0];
  if (!row) throw new EntitlementError('No hosting entitlement for this organization', 403, 'no_entitlement');

  const active = row.is_active !== false && ['active', 'trial', 'one_shot'].includes(row.status);
  if (!active) {
    throw new EntitlementError('Hosting subscription is inactive. Renew to create tournaments.', 402, 'inactive');
  }

  if (row.plan_type === 'one_shot' && Number(row.single_tournament_remaining || 0) < 1) {
    throw new EntitlementError('No one-shot tournament credits remaining.', 402, 'no_credits');
  }
}

export async function decrementOneShotCredit(client, tenantId) {
  await client.query(
    `UPDATE tenant_entitlements
     SET single_tournament_remaining = GREATEST(single_tournament_remaining - 1, 0),
         updated_date = NOW()
     WHERE tenant_id = $1 AND plan_type = 'one_shot' AND single_tournament_remaining > 0`,
    [String(tenantId)]
  );
}
