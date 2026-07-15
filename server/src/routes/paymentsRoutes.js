import express from 'express';
import crypto from 'crypto';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runWithRls, rlsContextFromRequest } from '../rls/transaction.js';
import {
  fulfillStripeCheckoutSession,
  fulfillCheckoutMetadata,
  applyStripeSubscriptionUpdated,
  applyStripeSubscriptionDeleted,
  applyStripeInvoicePaid,
} from '../payments/checkoutFulfillment.js';
import { verifyEntryFeeAndRecordLedger, EntryFeeVerifyError } from '../payments/verifyEntryFeeReference.js';
import { getStripeSecretKey, getPaystackSecretKey, getFlutterwaveSecretKey } from '../config/paymentCredentials.js';
import { effectiveEntryFee, tournamentRequiresEntryPayment } from '../lib/tournamentEntryFee.js';

const router = express.Router();
router.use(express.json());

function tenantIdFromRequest(req) {
  const h = req.headers || {};
  const header = String(h['x-tenant-id'] || h['X-Tenant-ID'] || '').trim();
  if (header) return header;
  const jwtTid = req.user?.tenant_id;
  if (jwtTid != null && String(jwtTid).trim()) return String(jwtTid).trim();
  return '';
}

async function assertTenantScope(req, tenantId) {
  const tid = String(tenantId || '').trim();
  if (!tid) {
    const err = new Error('tenant_id required');
    err.statusCode = 400;
    throw err;
  }
  if (req.user?.role === 'admin' || req.user?.role === 'super_admin') return;
  const jwtTid = String(req.user?.tenant_id || '').trim();
  if (jwtTid && jwtTid === tid) return;
  const sub = String(req.user?.sub || '').trim();
  if (!sub) {
    const err = new Error('Not allowed for this organization');
    err.statusCode = 403;
    throw err;
  }
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM user_tenants WHERE user_id::text = $1::text AND tenant_id::text = $2::text LIMIT 1`,
      [sub, tid]
    );
    if (rows.length > 0) return;
  } catch (e) {
    console.error('[assertTenantScope]', e);
  }
  const err = new Error('Not allowed for this organization');
  err.statusCode = 403;
  throw err;
}

/**
 * Server-only Stripe Connect account flags for the current tenant (no secret leakage).
 */
router.get('/stripe-connect-status', requireAuth, async (req, res) => {
  const key = await getStripeSecretKey();
  const tenantId = tenantIdFromRequest(req);
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant context required (X-Tenant-ID or JWT tenant_id)' });
  }
  if (!key) {
    return res.json({
      ok: false,
      reason: 'stripe_not_configured',
      connected_account_id: null,
    });
  }
  try {
    const ctx =
      req.user?.role === 'admin'
        ? { isPlatformAdmin: true }
        : { ...rlsContextFromRequest(req), tenantId };
    const { rows } = await runWithRls(pool, ctx, (client) =>
      client.query(`SELECT stripe_account_id FROM tenant_configs WHERE tenant_id::text = $1::text LIMIT 1`, [tenantId])
    );
    const acctId = String(rows[0]?.stripe_account_id || '').trim();
    if (!acctId) {
      return res.json({
        ok: true,
        connected_account_id: null,
        payouts_enabled: false,
        charges_enabled: false,
        details_submitted: false,
      });
    }
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(key);
    const account = await stripe.accounts.retrieve(acctId);
    res.json({
      ok: true,
      connected_account_id: acctId,
      payouts_enabled: !!account.payouts_enabled,
      charges_enabled: !!account.charges_enabled,
      details_submitted: !!account.details_submitted,
      country: account.country || null,
      default_currency: account.default_currency || null,
      disabled_reason: account.requirements?.disabled_reason || null,
    });
  } catch (e) {
    console.error('[stripe-connect-status]', e);
    res.json({
      ok: false,
      reason: 'stripe_retrieve_failed',
      connected_account_id: null,
      error: clientSafeErrorMessage(e),
    });
  }
});

/**
 * Stripe Checkout for registration / entry fees (§8.1 — server-owned session).
 */
router.post('/create-checkout-session', requireAuth, async (req, res) => {
  const key = await getStripeSecretKey();
  if (!key) {
    return res.status(503).json({ error: 'Stripe secret not configured (env or vault)' });
  }
  try {
    const tourId = String(req.body?.tournament_id || '').trim();
    let amount;
    let currency = String(req.body?.currency || 'usd').toLowerCase();
    let tenantMeta = String(req.body?.tenant_id || '').trim();
    let description = String(req.body?.description || 'Tournament registration');

    if (tourId) {
      const { rows } = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
        client.query(
          `SELECT id, tenant_id, name, entry_type, entry_fee, currency FROM tournaments WHERE id::text = $1`,
          [tourId]
        )
      );
      const trow = rows[0];
      if (!trow) return res.status(404).json({ error: 'Tournament not found' });
      if (!tournamentRequiresEntryPayment(trow)) {
        return res.status(400).json({ error: 'Tournament does not require a paid entry', code: 'not_paid_entry' });
      }
      amount = effectiveEntryFee(trow);
      currency = String(trow.currency || 'USD').toLowerCase().slice(0, 8);
      tenantMeta = String(trow.tenant_id || tenantMeta || '').trim();
      if (trow.name) description = `Entry fee: ${trow.name}`.slice(0, 120);
    } else {
      amount = Number(req.body?.amount);
    }

    const successUrl = String(req.body?.success_url || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/`);
    const cancelUrl = String(req.body?.cancel_url || successUrl);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number (major units)' });
    }
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(key);
    const unitAmount = Math.round(amount * 100);
    const payer = String(req.user?.email || '').trim();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(payer ? { customer_email: payer } : {}),
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: description.slice(0, 120) },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl.includes('?') ? `${successUrl}&session_id={CHECKOUT_SESSION_ID}` : `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        user_sub: String(req.user.sub || ''),
        tenant_id: tenantMeta,
        tournament_id: tourId || String(req.body?.tournament_id || ''),
        type: 'registration',
        checkout_kind: String(req.body?.checkout_kind || 'registration').trim().slice(0, 64),
        payer_email: String(req.user?.email || '')
          .trim()
          .toLowerCase(),
      },
    });
    res.json({ url: session.url, id: session.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/**
 * Monthly SaaS hosting — Stripe (subscription mode), Paystack, or Flutterwave (hosted checkout + same webhook fulfillment as entry fees).
 */
router.post('/create-subscription-session', requireAuth, async (req, res) => {
  const tenantId = String(req.body?.tenant_id || '').trim();
  try {
    await assertTenantScope(req, tenantId);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.message });
  }

  const provider = String(req.body?.provider || 'stripe').toLowerCase();
  const amount = Number(req.body?.amount);
  const currency = String(req.body?.currency || (provider === 'stripe' ? 'usd' : 'ngn')).toLowerCase();
  const description = String(req.body?.description || 'Arena hosting (monthly)');
  const successUrl = String(req.body?.success_url || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/`);
  const cancelUrl = String(req.body?.cancel_url || successUrl);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number (major units / month)' });
  }

  const email = String(req.user?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'Authenticated email required' });

  if (provider === 'stripe') {
    const key = await getStripeSecretKey();
    if (!key) return res.status(503).json({ error: 'Stripe secret not configured (env or vault)' });
    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(key);
      const unitAmount = Math.round(amount * 100);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: description.slice(0, 120) },
              recurring: { interval: 'month' },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl.includes('?')
          ? `${successUrl}&session_id={CHECKOUT_SESSION_ID}`
          : `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        subscription_data: {
          metadata: {
            tenant_id: tenantId,
            checkout_kind: 'saas_monthly',
          },
        },
        metadata: {
          user_sub: String(req.user.sub || ''),
          tenant_id: tenantId,
          tournament_id: '',
          type: 'saas',
          checkout_kind: 'saas_monthly',
        },
      });
      return res.json({ url: session.url, id: session.id, provider: 'stripe' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: clientSafeErrorMessage(e) });
    }
  }

  if (provider === 'paystack') {
    const secret = await getPaystackSecretKey();
    if (!secret) return res.status(503).json({ error: 'Paystack secret not configured (env or vault)' });
    const reference = `ps_saas_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
    const metadata = {
      user_sub: String(req.user.sub || ''),
      tenant_id: tenantId,
      tournament_id: '',
      checkout_kind: 'saas_monthly',
      payer_email: email.toLowerCase(),
    };
    try {
      const r = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: Math.round(amount * 100),
          currency: currency.toUpperCase(),
          reference,
          metadata,
          callback_url: successUrl,
        }),
      });
      const data = await r.json();
      if (!data.status) {
        return res.status(400).json({ error: data.message || 'Paystack initialize failed' });
      }
      return res.json({
        url: data.data.authorization_url,
        reference: data.data.reference || reference,
        provider: 'paystack',
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: clientSafeErrorMessage(e) });
    }
  }

  if (provider === 'flutterwave') {
    const secret = await getFlutterwaveSecretKey();
    if (!secret) return res.status(503).json({ error: 'Flutterwave secret not configured (env or vault)' });
    const txRef = `fw_saas_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const meta = {
      user_sub: String(req.user.sub || ''),
      tenant_id: tenantId,
      tournament_id: '',
      checkout_kind: 'saas_monthly',
      payer_email: email.toLowerCase(),
    };
    try {
      const r = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tx_ref: txRef,
          amount,
          currency: currency.toUpperCase(),
          redirect_url: successUrl,
          customer: { email, name: email.split('@')[0] || 'Customer' },
          meta,
          customizations: { title: description.slice(0, 120) },
        }),
      });
      const data = await r.json();
      if (data.status !== 'success') {
        return res.status(400).json({ error: data.message || 'Flutterwave initialize failed' });
      }
      return res.json({ url: data.data.link, tx_ref: txRef, provider: 'flutterwave' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: clientSafeErrorMessage(e) });
    }
  }

  return res.status(400).json({ error: 'provider must be stripe, paystack, or flutterwave' });
});

/**
 * Billing management — Stripe Customer Portal when possible; Paystack / Flutterwave return self-service payload (no hosted portal).
 */
router.post('/create-portal-session', requireAuth, async (req, res) => {
  const tenantId = String(req.body?.tenant_id || '').trim();
  const returnUrl = String(req.body?.return_url || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings`);
  try {
    await assertTenantScope(req, tenantId);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.message });
  }

  try {
    const ctx =
      req.user?.role === 'admin'
        ? { isPlatformAdmin: true }
        : { ...rlsContextFromRequest(req), tenantId };
    const { rows } = await runWithRls(pool, ctx, async (client) => {
      return client.query(
        `SELECT stripe_customer_id, subscription_provider, subscription_expires_at,
                subscription_cancel_at_period_end, subscription_external_reference
         FROM tenant_entitlements WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );
    });
    const row = rows[0];
    const rawProv = String(row?.subscription_provider || '').trim().toLowerCase();

    const selfServicePayload = (provLabel) => ({
      url: null,
      provider: provLabel,
      mode: 'self_service',
      manage: {
        subscription_expires_at: row?.subscription_expires_at || null,
        cancel_at_period_end: !!row?.subscription_cancel_at_period_end,
        reference: row?.subscription_external_reference || null,
        message:
          'Hosting is activated after each successful payment. Before expiry, run Subscribe again to renew. Use cancel-at-period-end to mark that you do not intend to renew (access continues until the current period ends).',
      },
    });

    if (rawProv === 'paystack' || rawProv === 'flutterwave') {
      return res.json(selfServicePayload(rawProv));
    }

    if (row?.stripe_customer_id) {
      const key = await getStripeSecretKey();
      if (!key) return res.status(503).json({ error: 'Stripe secret not configured (env or vault)', provider: 'stripe' });
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(key);
      const portal = await stripe.billingPortal.sessions.create({
        customer: row.stripe_customer_id,
        return_url: returnUrl,
      });
      return res.json({ url: portal.url, provider: 'stripe', mode: 'redirect' });
    }

    if (row?.subscription_external_reference) {
      return res.json(selfServicePayload(rawProv || 'alternate'));
    }

    return res.status(400).json({
      error: 'No active billing profile. Complete a monthly subscription checkout first.',
      needs_checkout: true,
      provider: rawProv || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/**
 * Mark cancel-at-period-end (all providers; Stripe also syncs from webhooks when customer cancels in portal).
 */
router.post('/subscription-cancel-at-period-end', requireAuth, async (req, res) => {
  const tenantId = String(req.body?.tenant_id || '').trim();
  const cancelAtEnd = req.body?.cancel_at_period_end !== false && req.body?.cancel_at_period_end !== 0;
  try {
    await assertTenantScope(req, tenantId);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.message });
  }
  try {
    const ctx =
      req.user?.role === 'admin'
        ? { isPlatformAdmin: true }
        : { ...rlsContextFromRequest(req), tenantId };
    await runWithRls(pool, ctx, async (client) => {
      await client.query(
        `UPDATE tenant_entitlements SET
           subscription_cancel_at_period_end = $2,
           updated_date = NOW()
         WHERE tenant_id = $1`,
        [tenantId, cancelAtEnd]
      );
    });
    res.json({ ok: true, cancel_at_period_end: cancelAtEnd });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/**
 * Local/dev only: insert a completed entry_fee ledger row so paid join E2E works without provider keys.
 * Blocked when NODE_ENV=production.
 */
router.post('/dev-simulate-entry', requireAuth, async (req, res) => {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const tournament_id = String(req.body?.tournament_id || '').trim();
  const amount = Number(req.body?.amount);
  const currency = String(req.body?.currency || 'USD').trim().toUpperCase() || 'USD';
  const provider = String(req.body?.provider || 'dev').slice(0, 32);
  const captain_email = String(req.body?.captain_email || req.user?.email || '')
    .trim()
    .toLowerCase();
  if (!tournament_id) return res.status(400).json({ error: 'tournament_id required' });

  try {
    const out = await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      const { rows } = await client.query(
        `SELECT id, tenant_id, entry_type, entry_fee, currency FROM tournaments WHERE id::text = $1`,
        [tournament_id]
      );
      const t = rows[0];
      if (!t) return { error: 'not_found', status: 404 };
      const fee = effectiveEntryFee(t);
      const major = Number.isFinite(amount) && amount > 0 ? amount : fee;
      if (!(major > 0)) return { error: 'fee_zero', status: 400 };
      const ref =
        String(req.body?.reference || '').trim() ||
        `dev_entry_${tournament_id.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fulfilled = await fulfillCheckoutMetadata(client, {
        meta: {
          tenant_id: String(t.tenant_id),
          tournament_id: String(t.id),
          checkout_kind: 'registration',
          payer_email: captain_email,
        },
        amountMajor: major,
        currency: currency || String(t.currency || 'USD').toUpperCase(),
        ledgerReference: ref,
        provider,
      });
      return { ok: true, reference: ref, provider, ...fulfilled };
    });
    if (out?.status) return res.status(out.status).json({ error: out.error });
    res.json(out);
  } catch (e) {
    console.error('[dev-simulate-entry]', e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/**
 * Verify a completed entry-fee payment with Stripe / Paystack / Flutterwave and write payment_ledger
 * (idempotent if reference already recorded).
 */
router.post('/verify-entry-reference', requireAuth, async (req, res) => {
  const tournament_id = String(req.body?.tournament_id || '').trim();
  const provider = String(req.body?.provider || '').trim();
  const reference = String(req.body?.reference || '').trim();
  const captain_email = String(req.body?.captain_email || req.user?.email || '')
    .trim()
    .toLowerCase();

  try {
    const out = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      verifyEntryFeeAndRecordLedger(client, {
        tournamentId: tournament_id,
        provider,
        reference,
        captainEmail: captain_email,
      })
    );
    res.json(out);
  } catch (e) {
    if (e instanceof EntryFeeVerifyError) {
      return res.status(e.status).json({ error: e.message, code: e.code });
    }
    console.error('[verify-entry-reference]', e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/**
 * Platform admin — Stripe Connect transfer to tenant’s connected account + ledger row.
 */
router.post('/release-payout', requireAuth, async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Platform admin only' });
  }
  const tournamentId = String(req.body?.tournament_id || '').trim();
  const amountMajor = Number(req.body?.amount_major);
  if (!tournamentId) return res.status(400).json({ error: 'tournament_id required' });
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return res.status(400).json({ error: 'amount_major must be a positive number' });
  }
  const key = await getStripeSecretKey();
  if (!key) return res.status(503).json({ error: 'Stripe secret not configured (env or vault)' });

  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(key);

    const row = await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      const t = await client.query(
        `SELECT t.id AS tid, t.tenant_id, t.name, tw.stripe_account_id, tw.currency
         FROM tournaments t
         JOIN tenant_wallets tw ON tw.tenant_id = t.tenant_id
         WHERE t.id = $1`,
        [tournamentId]
      );
      return t.rows[0] || null;
    });
    if (!row) return res.status(404).json({ error: 'Tournament not found' });
    if (!row.stripe_account_id) {
      return res.status(400).json({ error: 'Tenant has no Stripe Connect account (tenant_wallets.stripe_account_id)' });
    }

    const currency = String(row.currency || 'usd').toLowerCase();
    const amountCents = Math.round(amountMajor * 100);
    const idemKey = `release_payout:${tournamentId}:${amountCents}:${currency}`;

    const dup = await runWithRls(pool, { isPlatformAdmin: true }, (client) =>
      client.query(`SELECT id FROM payment_ledger WHERE reference = $1 LIMIT 1`, [idemKey])
    );
    if (dup.rowCount) {
      return res.json({ ok: true, duplicate: true, reference: idemKey });
    }

    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency,
        destination: row.stripe_account_id,
        transfer_group: tournamentId,
        metadata: { tournament_id: tournamentId, tenant_id: row.tenant_id },
      },
      { idempotencyKey: idemKey.slice(0, 250) }
    );

    await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      const curU = (row.currency || 'USD').toUpperCase();
      const amountMinor = Math.round(amountMajor * 100);
      await client.query(
        `INSERT INTO payment_ledger (tenant_id, tournament_id, type, amount, amount_minor, currency, provider, held, reference, description, status)
         VALUES ($1, $2, 'prize_payout', $3, $4, $5, 'stripe', FALSE, $6, $7, 'completed')`,
        [
          row.tenant_id,
          tournamentId,
          amountMajor,
          amountMinor,
          curU,
          idemKey,
          `Prize release Stripe transfer_id=${transfer.id} ${row.name || tournamentId}`,
        ]
      );
    });

    res.json({ ok: true, transfer_id: transfer.id, amount_major: amountMajor, currency: row.currency || 'USD' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;

export async function stripeWebhookHandler(req, res) {
  const key = await getStripeSecretKey();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !whSecret) {
    return res.status(503).send('Stripe webhook not configured');
  }
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing stripe-signature');

  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(key);
    const buf = req.body;
    const event = stripe.webhooks.constructEvent(buf, sig, whSecret);

    const result = await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      const ins = await client.query(
        `INSERT INTO stripe_webhook_events (event_id, type, payload_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [event.id, event.type, JSON.stringify(event)]
      );
      if (!ins.rowCount) {
        return { duplicate: true };
      }

      switch (event.type) {
        case 'checkout.session.completed':
          await fulfillStripeCheckoutSession(client, event.data.object);
          break;
        case 'customer.subscription.updated':
          await applyStripeSubscriptionUpdated(client, event.data.object);
          break;
        case 'customer.subscription.deleted':
          await applyStripeSubscriptionDeleted(client, event.data.object);
          break;
        case 'invoice.paid':
          await applyStripeInvoicePaid(client, event.data.object);
          break;
        default:
          break;
      }
      return { ok: true };
    });

    if (result.duplicate) {
      return res.json({ received: true, duplicate: true });
    }
    res.json({ received: true });
  } catch (e) {
    console.error('[stripe webhook]', e);
    res.status(400).send(`Webhook error: ${e.message}`);
  }
}
