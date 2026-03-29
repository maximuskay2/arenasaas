/**
 * Verify Stripe / Paystack / Flutterwave entry-fee payments and record payment_ledger
 * (same shape as webhooks) so tournament join can match payment_proof.reference.
 */
import { fulfillCheckoutMetadata } from './checkoutFulfillment.js';
import { getStripeSecretKey, getPaystackSecretKey, getFlutterwaveSecretKey } from '../config/paymentCredentials.js';
import { effectiveEntryFee } from '../lib/tournamentEntryFee.js';

export class EntryFeeVerifyError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normCurrency(c) {
  return String(c || 'USD')
    .trim()
    .toUpperCase();
}

function currenciesMatch(a, b) {
  return normCurrency(a) === normCurrency(b);
}

function amountCoversFee(amountMajor, fee) {
  const a = Number(amountMajor);
  const f = Number(fee);
  if (!Number.isFinite(a) || !Number.isFinite(f)) return false;
  return a + 1e-6 >= f;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{ tournamentId: string, provider: string, reference: string, captainEmail: string }} args
 */
export async function verifyEntryFeeAndRecordLedger(client, { tournamentId, provider, reference, captainEmail }) {
  const cap = String(captainEmail || '')
    .trim()
    .toLowerCase();
  const prov = String(provider || '').toLowerCase();
  const ref = String(reference || '').trim();
  if (!tournamentId || !ref) {
    throw new EntryFeeVerifyError(400, 'tournament_id and reference are required', 'bad_request');
  }
  if (!['stripe', 'paystack', 'flutterwave'].includes(prov)) {
    throw new EntryFeeVerifyError(400, 'provider must be stripe, paystack, or flutterwave', 'bad_request');
  }

  const { rows } = await client.query(
    `SELECT id, tenant_id, entry_type, entry_fee, currency FROM tournaments WHERE id::text = $1`,
    [String(tournamentId)]
  );
  const t = rows[0];
  if (!t) throw new EntryFeeVerifyError(404, 'Tournament not found', 'not_found');
  const fee = effectiveEntryFee(t);
  if (fee <= 0) {
    throw new EntryFeeVerifyError(400, 'This tournament has no paid entry', 'fee_zero');
  }

  const dup = await client.query(
    `SELECT id FROM payment_ledger
     WHERE tournament_id::text = $1 AND type = 'entry_fee' AND reference = $2 LIMIT 1`,
    [String(t.id), ref]
  );
  if (dup.rowCount) {
    return { ok: true, duplicate: true, tournament_id: String(t.id) };
  }

  const tCur = normCurrency(t.currency || 'USD');
  let amountMajor = 0;
  let currency = tCur;
  const baseMeta = {
    tenant_id: String(t.tenant_id),
    tournament_id: String(t.id),
    checkout_kind: 'registration',
    payer_email: cap,
  };

  if (prov === 'stripe') {
    const key = await getStripeSecretKey();
    if (!key) throw new EntryFeeVerifyError(503, 'Stripe secret not configured', 'provider_not_configured');
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(key);

    if (ref.startsWith('cs_')) {
      const session = await stripe.checkout.sessions.retrieve(ref);
      if (session.payment_status !== 'paid') {
        throw new EntryFeeVerifyError(400, 'Stripe Checkout session is not paid', 'payment_incomplete');
      }
      const tid = String(session.metadata?.tournament_id || '').trim();
      if (tid !== String(t.id)) {
        throw new EntryFeeVerifyError(400, 'This payment is for a different tournament', 'tournament_mismatch');
      }
      const tenantMeta = String(session.metadata?.tenant_id || '').trim();
      if (tenantMeta && tenantMeta !== String(t.tenant_id)) {
        throw new EntryFeeVerifyError(400, 'Payment organization does not match tournament', 'tenant_mismatch');
      }
      const payer = String(session.customer_details?.email || session.customer_email || '')
        .trim()
        .toLowerCase();
      if (payer && payer !== cap) {
        throw new EntryFeeVerifyError(403, 'Stripe payer email does not match captain email', 'payer_mismatch');
      }
      amountMajor = Number(session.amount_total) / 100;
      currency = normCurrency(session.currency || tCur);
    } else if (ref.startsWith('pi_')) {
      const pi = await stripe.paymentIntents.retrieve(ref);
      if (pi.status !== 'succeeded') {
        throw new EntryFeeVerifyError(400, 'PaymentIntent is not succeeded', 'payment_incomplete');
      }
      const tid = String(pi.metadata?.tournament_id || '').trim();
      if (tid !== String(t.id)) {
        throw new EntryFeeVerifyError(400, 'This payment is for a different tournament', 'tournament_mismatch');
      }
      const payer = String(pi.metadata?.payer_email || pi.receipt_email || '')
        .trim()
        .toLowerCase();
      if (payer && payer !== cap) {
        throw new EntryFeeVerifyError(403, 'Stripe payer email does not match captain email', 'payer_mismatch');
      }
      const charged = pi.amount_received != null ? Number(pi.amount_received) : Number(pi.amount);
      amountMajor = charged / 100;
      currency = normCurrency(pi.currency || tCur);
    } else {
      throw new EntryFeeVerifyError(
        400,
        'Stripe reference must be a Checkout Session id (cs_…) or PaymentIntent id (pi_…)',
        'bad_reference'
      );
    }
    if (!amountCoversFee(amountMajor, fee)) {
      throw new EntryFeeVerifyError(400, 'Paid amount is less than tournament entry fee', 'amount_too_low');
    }
    if (!currenciesMatch(currency, tCur)) {
      throw new EntryFeeVerifyError(400, 'Payment currency does not match tournament currency', 'currency_mismatch');
    }

    await fulfillCheckoutMetadata(client, {
      meta: { ...baseMeta },
      amountMajor,
      currency,
      ledgerReference: ref,
      provider: 'stripe',
    });
    return { ok: true, duplicate: false, tournament_id: String(t.id) };
  }

  if (prov === 'paystack') {
    const secret = await getPaystackSecretKey();
    if (!secret) {
      throw new EntryFeeVerifyError(503, 'Paystack secret not configured', 'provider_not_configured');
    }
    const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = await r.json();
    if (!json.status || json.data?.status !== 'success') {
      throw new EntryFeeVerifyError(400, json.message || 'Paystack verification failed', 'verify_failed');
    }
    const d = json.data;
    const meta = d.metadata && typeof d.metadata === 'object' ? d.metadata : {};
    const tid = String(meta.tournament_id || '').trim();
    if (tid !== String(t.id)) {
      throw new EntryFeeVerifyError(400, 'This payment is for a different tournament', 'tournament_mismatch');
    }
    const payer = String(d.customer?.email || meta.payer_email || '')
      .trim()
      .toLowerCase();
    if (payer && payer !== cap) {
      throw new EntryFeeVerifyError(403, 'Paystack payer email does not match captain email', 'payer_mismatch');
    }
    amountMajor = d.amount != null ? Number(d.amount) / 100 : 0;
    currency = normCurrency(d.currency || tCur);
    if (!amountCoversFee(amountMajor, fee)) {
      throw new EntryFeeVerifyError(400, 'Paid amount is less than tournament entry fee', 'amount_too_low');
    }
    if (!currenciesMatch(currency, tCur)) {
      throw new EntryFeeVerifyError(400, 'Payment currency does not match tournament currency', 'currency_mismatch');
    }

    const paystackMeta = { ...meta };
    delete paystackMeta.payer_email;
    await fulfillCheckoutMetadata(client, {
      meta: { ...baseMeta, ...paystackMeta, payer_email: cap },
      amountMajor,
      currency,
      ledgerReference: ref,
      provider: 'paystack',
    });
    return { ok: true, duplicate: false, tournament_id: String(t.id) };
  }

  /* flutterwave */
  const fwSecret = await getFlutterwaveSecretKey();
  if (!fwSecret) {
    throw new EntryFeeVerifyError(503, 'Flutterwave secret not configured', 'provider_not_configured');
  }
  const fr = await fetch(
    `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(ref)}`,
    { headers: { Authorization: `Bearer ${fwSecret}` } }
  );
  const fjson = await fr.json();
  if (fjson.status !== 'success' || fjson.data?.status !== 'successful') {
    throw new EntryFeeVerifyError(400, fjson.message || 'Flutterwave verification failed', 'verify_failed');
  }
  const d = fjson.data;
  const m = d.meta && typeof d.meta === 'object' && !Array.isArray(d.meta) ? d.meta : {};
  const tid = String(m.tournament_id || '').trim();
  if (tid !== String(t.id)) {
    throw new EntryFeeVerifyError(400, 'This payment is for a different tournament', 'tournament_mismatch');
  }
  const payer = String(d.customer?.email || m.payer_email || '')
    .trim()
    .toLowerCase();
  if (payer && payer !== cap) {
    throw new EntryFeeVerifyError(403, 'Flutterwave payer email does not match captain email', 'payer_mismatch');
  }
  amountMajor = d.amount != null ? Number(d.amount) : 0;
  currency = normCurrency(d.currency || tCur);
  if (!amountCoversFee(amountMajor, fee)) {
    throw new EntryFeeVerifyError(400, 'Paid amount is less than tournament entry fee', 'amount_too_low');
  }
  if (!currenciesMatch(currency, tCur)) {
    throw new EntryFeeVerifyError(400, 'Payment currency does not match tournament currency', 'currency_mismatch');
  }

  await fulfillCheckoutMetadata(client, {
    meta: {
      tenant_id: String(m.tenant_id || t.tenant_id),
      tournament_id: String(t.id),
      checkout_kind: String(m.checkout_kind || 'registration'),
      user_sub: String(m.user_sub || ''),
      payer_email: cap,
    },
    amountMajor,
    currency,
    ledgerReference: ref,
    provider: 'flutterwave',
  });
  return { ok: true, duplicate: false, tournament_id: String(t.id) };
}
