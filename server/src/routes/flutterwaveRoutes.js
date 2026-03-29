import express from 'express';
import crypto from 'crypto';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runWithRls } from '../rls/transaction.js';
import { fulfillCheckoutMetadata } from '../payments/checkoutFulfillment.js';
import { getFlutterwaveSecretKey, getFlutterwaveSecretHash } from '../config/paymentCredentials.js';
import { resolvePaidEntryCheckoutFromTournament } from '../lib/paidEntryCheckoutFromTournament.js';

const router = express.Router();
router.use(express.json());

router.post('/initialize', requireAuth, async (req, res) => {
  const secret = await getFlutterwaveSecretKey();
  if (!secret) return res.status(503).json({ error: 'Flutterwave secret not configured (env or vault)' });
  const tourIdRaw = String(req.body?.tournament_id || '').trim();
  let amount = Number(req.body?.amount);
  let currency = String(req.body?.currency || 'NGN').toUpperCase();
  let tenantMeta = String(req.body?.tenant_id || '').trim();
  let title = String(req.body?.description || 'Arena payment').slice(0, 120);

  if (tourIdRaw) {
    try {
      const resolved = await resolvePaidEntryCheckoutFromTournament(pool, tourIdRaw);
      amount = resolved.amount;
      currency = resolved.currency;
      tenantMeta = resolved.tenant_id;
      title = resolved.description;
    } catch (e) {
      return res.status(e.statusCode || 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) });
    }
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be positive (major units)' });
  }
  const email = String(req.user?.email || req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  const txRef = `fw_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const checkoutKind = String(req.body?.checkout_kind || 'registration').trim().slice(0, 64);
  const meta = {
    user_sub: String(req.user.sub || ''),
    tenant_id: tenantMeta,
    tournament_id: tourIdRaw,
    type: 'registration',
    checkout_kind: checkoutKind,
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
        currency,
        redirect_url: String(req.body?.redirect_url || process.env.FRONTEND_URL || 'http://localhost:5173'),
        customer: { email, name: String(req.body?.customer_name || req.user.email || 'Customer') },
        meta,
        customizations: { title },
      }),
    });
    const data = await r.json();
    if (data.status !== 'success') {
      return res.status(400).json({ error: data.message || 'Flutterwave initialize failed' });
    }
    res.json({ link: data.data.link, tx_ref: txRef });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export async function flutterwaveWebhookHandler(req, res) {
  const secretHash = await getFlutterwaveSecretHash();
  if (!secretHash) return res.status(503).send('Flutterwave secret hash not configured');
  const verif = req.headers['verif-hash'];
  if (String(verif) !== String(secretHash)) {
    return res.status(400).send('Invalid verif-hash');
  }
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  const event = String(payload.event || '');
  if (event !== 'charge.completed') {
    return res.json({ received: true, ignored: true });
  }
  const d = payload.data || {};
  const dedupeId = String(d.id || d.flw_ref || d.tx_ref || '');
  if (!dedupeId) return res.status(400).send('Missing id');
  /** Prefer tx_ref for ledger + join paste; matches initialize response. */
  const ledgerRef = String(d.tx_ref || d.flw_ref || d.id || dedupeId);

  try {
    const result = await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      const ins = await client.query(
        `INSERT INTO flutterwave_webhook_events (external_id, event_type, payload_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (external_id) DO NOTHING
         RETURNING external_id`,
        [dedupeId, event, JSON.stringify(payload)]
      );
      if (!ins.rowCount) return { duplicate: true };

      const m = d.meta && typeof d.meta === 'object' && !Array.isArray(d.meta) ? d.meta : {};
      const custEmail = d.customer?.email || '';
      const flatMeta = {
        tenant_id: String(m.tenant_id || ''),
        tournament_id: String(m.tournament_id || ''),
        checkout_kind: String(m.checkout_kind || 'registration'),
        user_sub: String(m.user_sub || ''),
        payer_email: String(custEmail || m.payer_email || '')
          .trim()
          .toLowerCase(),
      };
      const amountMajor = d.amount != null ? Number(d.amount) : 0;
      const currency = String(d.currency || 'NGN').toUpperCase();
      await fulfillCheckoutMetadata(client, {
        meta: flatMeta,
        amountMajor,
        currency,
        ledgerReference: ledgerRef,
        provider: 'flutterwave',
      });
      return { ok: true };
    });
    if (result.duplicate) return res.json({ received: true, duplicate: true });
    res.json({ received: true });
  } catch (e) {
    console.error('[flutterwave webhook]', e);
    res.status(500).send('Handler error');
  }
}

export default router;
