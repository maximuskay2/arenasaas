import express from 'express';
import crypto from 'crypto';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runWithRls } from '../rls/transaction.js';
import { fulfillCheckoutMetadata } from '../payments/checkoutFulfillment.js';
import { getPaystackSecretKey } from '../config/paymentCredentials.js';
import { resolvePaidEntryCheckoutFromTournament } from '../lib/paidEntryCheckoutFromTournament.js';

const router = express.Router();
router.use(express.json());

router.post('/initialize', requireAuth, async (req, res) => {
  const secret = await getPaystackSecretKey();
  if (!secret) return res.status(503).json({ error: 'Paystack secret not configured (env or vault)' });
  const tourIdRaw = String(req.body?.tournament_id || '').trim();
  let amount = Number(req.body?.amount);
  let currency = String(req.body?.currency || 'NGN').toUpperCase();
  let tenantMeta = String(req.body?.tenant_id || '').trim();

  if (tourIdRaw) {
    try {
      const resolved = await resolvePaidEntryCheckoutFromTournament(pool, tourIdRaw);
      amount = resolved.amount;
      currency = resolved.currency;
      tenantMeta = resolved.tenant_id;
    } catch (e) {
      return res.status(e.statusCode || 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) });
    }
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be positive (major units)' });
  }
  const email = String(req.user?.email || req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  const reference = `ps_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const checkoutKind = String(req.body?.checkout_kind || 'registration').trim().slice(0, 64);
  const metadata = {
    user_sub: String(req.user.sub || ''),
    tenant_id: tenantMeta,
    tournament_id: tourIdRaw,
    type: 'registration',
    checkout_kind: checkoutKind,
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
        currency,
        reference,
        metadata,
        callback_url: String(req.body?.callback_url || process.env.FRONTEND_URL || 'http://localhost:5173'),
      }),
    });
    const data = await r.json();
    if (!data.status) {
      return res.status(400).json({ error: data.message || 'Paystack initialize failed' });
    }
    res.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference || reference,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

function verifyPaystackSignature(rawBody, signature, secret) {
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return hash === signature;
}

export async function paystackWebhookHandler(req, res) {
  const secret = await getPaystackSecretKey();
  if (!secret) return res.status(503).send('Paystack not configured');
  const sig = req.headers['x-paystack-signature'];
  const raw = req.body;
  if (!Buffer.isBuffer(raw)) return res.status(400).send('Expected raw body');
  if (!sig || !verifyPaystackSignature(raw, String(sig), secret)) {
    return res.status(400).send('Invalid signature');
  }
  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (payload.event !== 'charge.success') {
    return res.json({ received: true, ignored: true });
  }
  const d = payload.data || {};
  const reference = String(d.reference || '');
  if (!reference) return res.status(400).send('Missing reference');

  try {
    const result = await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      const ins = await client.query(
        `INSERT INTO paystack_webhook_events (reference, event_type, payload_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (reference) DO NOTHING
         RETURNING reference`,
        [reference, payload.event, JSON.stringify(payload)]
      );
      if (!ins.rowCount) return { duplicate: true };

      const rawMeta = d.metadata && typeof d.metadata === 'object' ? d.metadata : {};
      const custEmail = d.customer?.email || d.authorization?.customer?.email || '';
      const meta = {
        ...rawMeta,
        payer_email: String(custEmail || rawMeta.payer_email || '')
          .trim()
          .toLowerCase(),
      };
      const amountMajor = d.amount != null ? Number(d.amount) / 100 : 0;
      const currency = String(d.currency || 'NGN').toUpperCase();
      await fulfillCheckoutMetadata(client, {
        meta,
        amountMajor,
        currency,
        ledgerReference: reference,
        provider: 'paystack',
      });
      return { ok: true };
    });
    if (result.duplicate) return res.json({ received: true, duplicate: true });
    res.json({ received: true });
  } catch (e) {
    console.error('[paystack webhook]', e);
    res.status(500).send('Handler error');
  }
}

export default router;
