/**
 * Shared idempotent fulfillment for registration / SaaS checkout metadata (Stripe, Paystack, Flutterwave).
 */

import { creditTenantWalletEntryFeeNet } from './entryPlatformFeeSplit.js';

export async function ensureTenantEntitlementRow(client, tenantId) {
  await client.query(
    `INSERT INTO tenant_entitlements (tenant_id, plan, status, is_active, plan_type, single_tournament_remaining, one_shot_credits)
     SELECT $1, 'free', 'inactive', FALSE, 'monthly', 0, 0
     WHERE NOT EXISTS (SELECT 1 FROM tenant_entitlements WHERE tenant_id = $1)`,
    [tenantId]
  );
}

export async function fulfillCheckoutMetadata(client, { meta, amountMajor, currency, ledgerReference, provider = 'stripe' }) {
  const tenantId = String(meta.tenant_id || '').trim();
  const kind = String(meta.checkout_kind || meta.type || 'registration').trim();
  const cur = String(currency || 'USD').toUpperCase();

  if (kind === 'saas_monthly' && tenantId) {
    await ensureTenantEntitlementRow(client, tenantId);
    const prov = String(provider || 'stripe').toLowerCase();
    const subId =
      prov === 'stripe' && meta.stripe_subscription_id ? String(meta.stripe_subscription_id) : null;
    const custId =
      prov === 'stripe' && meta.stripe_customer_id ? String(meta.stripe_customer_id) : null;
    const extRef = String(ledgerReference || '').trim() || null;
    await client.query(
      `UPDATE tenant_entitlements SET
        status = 'active',
        plan_type = 'monthly',
        is_active = TRUE,
        plan = CASE WHEN plan IS NULL OR TRIM(plan) = '' THEN 'pro' ELSE plan END,
        subscription_expires_at = NOW() + INTERVAL '30 days',
        stripe_subscription_id = COALESCE($2::text, stripe_subscription_id),
        stripe_customer_id = COALESCE($3::text, stripe_customer_id),
        subscription_provider = $4,
        subscription_external_reference = COALESCE($5::text, subscription_external_reference),
        subscription_status = 'active',
        subscription_cancel_at_period_end = FALSE,
        updated_date = NOW()
       WHERE tenant_id = $1`,
      [tenantId, subId, custId, prov, extRef]
    );
    return { kind: 'saas_monthly' };
  }

  if (kind === 'saas_one_shot' && tenantId) {
    await ensureTenantEntitlementRow(client, tenantId);
    await client.query(
      `UPDATE tenant_entitlements SET
        status = 'one_shot',
        plan_type = 'one_shot',
        is_active = TRUE,
        single_tournament_remaining = single_tournament_remaining + 1,
        one_shot_credits = COALESCE(one_shot_credits, 0) + 1,
        updated_date = NOW()
       WHERE tenant_id = $1`,
      [tenantId]
    );
    return { kind: 'saas_one_shot' };
  }

  const tournamentId = String(meta.tournament_id || '').trim();
  if (tenantId && tournamentId && amountMajor > 0) {
    let payerEmail = String(meta.payer_email || meta.customer_email || meta.email || '')
      .trim()
      .toLowerCase();
    if (!payerEmail && meta.user_sub) {
      const uid = String(meta.user_sub).trim();
      if (uid) {
        const u = await client.query(`SELECT lower(trim(email)) AS e FROM users WHERE id::text = $1 LIMIT 1`, [uid]);
        payerEmail = String(u.rows[0]?.e || '').trim().toLowerCase();
      }
    }
    const amountMinor = Math.round(Number(amountMajor) * 100);
    const prov = String(provider).slice(0, 32);
    const desc = `Tournament registration (${prov})${payerEmail ? ` payer=${payerEmail}` : ''}`;
    // Partial unique index on reference — concurrent webhook + verify must not double-credit.
    const ins = await client.query(
      `INSERT INTO payment_ledger (tenant_id, tournament_id, type, amount, amount_minor, currency, provider, held, reference, description, status, created_by)
       VALUES ($1, $2, 'entry_fee', $3, $4, $5, $6, FALSE, $7, $8, 'completed', NULLIF($9, ''))
       ON CONFLICT (reference) WHERE (reference IS NOT NULL AND btrim(reference) <> '')
       DO NOTHING
       RETURNING id`,
      [tenantId, tournamentId, amountMajor, amountMinor, cur, prov, String(ledgerReference), desc, payerEmail || null]
    );
    if (!ins.rowCount) {
      return { kind: 'registration', duplicate: true };
    }
    await creditTenantWalletEntryFeeNet(client, {
      tenantId,
      tournamentId,
      grossMajor: amountMajor,
      currency: cur,
      ledgerReferenceBase: String(ledgerReference),
    });
    return { kind: 'registration' };
  }

  return { kind: 'noop' };
}

export async function fulfillStripeCheckoutSession(client, session) {
  let meta = { ...(session.metadata || {}) };
  if (session.mode === 'subscription' && session.subscription) {
    meta.checkout_kind = meta.checkout_kind || 'saas_monthly';
    meta.stripe_subscription_id = String(session.subscription);
  }
  if (session.customer) {
    meta.stripe_customer_id = String(session.customer);
  }
  const payerFromSession =
    session.customer_details?.email ||
    session.customer_email ||
    (typeof session.customer === 'object' && session.customer?.email) ||
    '';
  if (payerFromSession) {
    meta.payer_email = String(payerFromSession).trim().toLowerCase();
  } else if (meta.payer_email) {
    meta.payer_email = String(meta.payer_email).trim().toLowerCase();
  }
  const amountMajor =
    session.amount_total != null && session.amount_total !== ''
      ? Number(session.amount_total) / 100
      : 0;
  const currency = String(session.currency || 'usd').toUpperCase();
  return fulfillCheckoutMetadata(client, {
    meta,
    amountMajor,
    currency,
    ledgerReference: String(session.id),
    provider: 'stripe',
  });
}

export async function applyStripeSubscriptionUpdated(client, subscription) {
  const subId = String(subscription.id || '');
  if (!subId) return 0;
  const tenantId = String(subscription.metadata?.tenant_id || '').trim();
  const periodEnd =
    subscription.current_period_end != null
      ? new Date(Number(subscription.current_period_end) * 1000)
      : null;
  const status = String(subscription.status || '');
  const cancelAtEnd = !!subscription.cancel_at_period_end;
  const active = ['active', 'trialing', 'past_due'].includes(status);
  const { rowCount } = await client.query(
    `UPDATE tenant_entitlements SET
      subscription_status = $2,
      subscription_cancel_at_period_end = $3,
      subscription_expires_at = COALESCE($4::timestamptz, subscription_expires_at),
      is_active = $5,
      status = CASE
        WHEN $5 THEN 'active'
        WHEN $2 IN ('canceled', 'unpaid', 'incomplete_expired', 'incomplete') THEN 'inactive'
        ELSE status
      END,
      subscription_provider = COALESCE(NULLIF(TRIM(COALESCE(subscription_provider, '')), ''), 'stripe'),
      stripe_subscription_id = CASE
        WHEN stripe_subscription_id IS NULL OR TRIM(COALESCE(stripe_subscription_id, '')) = '' THEN $6::text
        ELSE stripe_subscription_id
      END,
      updated_date = NOW()
     WHERE stripe_subscription_id = $6
        OR (NULLIF(TRIM(COALESCE($1::text, '')), '') IS NOT NULL AND tenant_id = NULLIF(TRIM(COALESCE($1::text, '')), ''))`,
    [tenantId || null, status, cancelAtEnd, periodEnd, active, subId]
  );
  return rowCount;
}

export async function applyStripeSubscriptionDeleted(client, subscription) {
  const subId = String(subscription.id || '');
  if (!subId) return;
  await client.query(
    `UPDATE tenant_entitlements SET
      subscription_status = 'canceled',
      is_active = FALSE,
      status = 'inactive',
      updated_date = NOW()
     WHERE stripe_subscription_id = $1`,
    [subId]
  );
}

/** Renew period end after successful invoice (subscription cycle). */
export async function applyStripeInvoicePaid(client, invoice) {
  const rawSub = invoice.subscription;
  const subId =
    rawSub && typeof rawSub === 'object' && rawSub.id != null ? String(rawSub.id) : rawSub != null ? String(rawSub) : '';
  if (!subId) return 0;
  const line = invoice.lines?.data?.[0];
  const end = line?.period?.end;
  const periodEnd = end != null ? new Date(Number(end) * 1000) : null;
  if (!periodEnd) return 0;
  const { rowCount } = await client.query(
    `UPDATE tenant_entitlements SET
      subscription_expires_at = $2,
      subscription_status = 'active',
      is_active = TRUE,
      status = 'active',
      updated_date = NOW()
     WHERE stripe_subscription_id = $1`,
    [subId, periodEnd]
  );
  return rowCount;
}
