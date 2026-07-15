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

/**
 * Monthly SaaS hosting is active only when plan status and provider subscription_status allow it.
 * past_due / unpaid / canceled / incomplete_expired block new tournaments (product rule).
 */
export function isMonthlySubscriptionUsable(row) {
  if (!row) return false;
  if (row.is_active === false) return false;
  const planStatus = String(row.status || '').toLowerCase();
  if (!['active', 'trial'].includes(planStatus)) return false;

  const sub = String(row.subscription_status || '').toLowerCase().trim();
  if (!sub) return true; // legacy rows without provider status
  if (['active', 'trialing'].includes(sub)) return true;
  if (row.subscription_cancel_at_period_end && sub === 'active') return true;
  // Grace: still in period but marked cancel_at_period_end is OK until expires
  if (['past_due', 'unpaid', 'canceled', 'cancelled', 'incomplete', 'incomplete_expired', 'paused'].includes(sub)) {
    return false;
  }
  // Unknown provider status — require plan-level active only
  return ['active', 'trialing'].includes(sub) || planStatus === 'trial';
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
    `SELECT is_active, plan_type, single_tournament_remaining, status,
            subscription_status, subscription_cancel_at_period_end, subscription_expires_at
     FROM tenant_entitlements WHERE tenant_id = $1 LIMIT 1`,
    [String(tenantId)]
  );
  const row = rows[0];
  if (!row) throw new EntitlementError('No hosting entitlement for this organization', 403, 'no_entitlement');

  const planType = String(row.plan_type || 'monthly').toLowerCase();

  if (planType === 'one_shot') {
    const active = row.is_active !== false && ['active', 'trial', 'one_shot'].includes(String(row.status || ''));
    if (!active) {
      throw new EntitlementError('Hosting plan is inactive. Purchase a one-shot or subscription.', 402, 'inactive');
    }
    if (Number(row.single_tournament_remaining || 0) < 1) {
      throw new EntitlementError('No one-shot tournament credits remaining.', 402, 'no_credits');
    }
    return;
  }

  // Monthly / unlimited plans
  if (!isMonthlySubscriptionUsable(row)) {
    const sub = String(row.subscription_status || row.status || 'inactive');
    throw new EntitlementError(
      `Hosting subscription is not usable (status: ${sub}). Renew or update billing to create tournaments.`,
      402,
      sub === 'past_due' || sub === 'unpaid' ? 'subscription_past_due' : 'inactive'
    );
  }

  // Soft expiry check when cancel_at_period_end and expires_at passed
  if (row.subscription_expires_at) {
    const exp = new Date(row.subscription_expires_at);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now() && row.subscription_cancel_at_period_end) {
      throw new EntitlementError(
        'Your subscription period has ended. Renew hosting to create tournaments.',
        402,
        'subscription_expired'
      );
    }
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
