import express from 'express';
import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';
import {
  getStripeSecretKey,
  getPaystackSecretKey,
  getFlutterwaveSecretKey,
  loadPaymentGatewaySettings,
} from '../config/paymentCredentials.js';

const router = express.Router();

/** Which payment rails are configured server-side (no secrets exposed). */
router.get('/payment-rails', async (req, res) => {
  try {
    const cur = String(req.query.currency || '')
      .trim()
      .toUpperCase();
    const [stripeKey, payKey, fwKey, pg] = await Promise.all([
      getStripeSecretKey(),
      getPaystackSecretKey(),
      getFlutterwaveSecretKey(),
      loadPaymentGatewaySettings(),
    ]);
    const stripe = Boolean(stripeKey) && pg.stripe_enabled !== false;
    const paystack = Boolean(payKey) && pg.paystack_enabled !== false;
    const flutterwave = Boolean(fwKey) && pg.flutterwave_enabled !== false;
    /** NGN: match Paystack / Flutterwave alongside Stripe (all three when keys exist). */
    const recommended_order =
      cur === 'NGN'
        ? ['paystack', 'flutterwave', 'stripe'].filter((k) =>
            k === 'stripe' ? stripe : k === 'paystack' ? paystack : flutterwave
          )
        : ['stripe', 'paystack', 'flutterwave'].filter((k) =>
            k === 'stripe' ? stripe : k === 'paystack' ? paystack : flutterwave
          );
    res.json({
      stripe,
      paystack,
      flutterwave,
      recommended_order,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'payment-rails failed' });
  }
});

/** Display amounts for landing + registration (no secrets). */
router.get('/pricing', async (_req, res) => {
  const keys = [
    'saas_monthly_amount_usd',
    'saas_monthly_amount_ngn',
    'saas_one_shot_amount_usd',
    'saas_one_shot_amount_ngn',
  ];
  try {
    const rows = await runWithRls(
      pool,
      { allowPublicPlatformConfigRead: true },
      (client) =>
        client.query(`SELECT key, value FROM platform_config WHERE key = ANY($1::text[])`, [keys]).then((r) => r.rows)
    );
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const num = (k, fallback) => {
      const n = Number(map[k]);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    res.json({
      saas_monthly_amount_usd: num('saas_monthly_amount_usd', 29),
      saas_monthly_amount_ngn: num('saas_monthly_amount_ngn', 15000),
      saas_one_shot_amount_usd: num('saas_one_shot_amount_usd', 79),
      saas_one_shot_amount_ngn: num('saas_one_shot_amount_ngn', 45000),
    });
  } catch (e) {
    console.error(e);
    res.json({
      saas_monthly_amount_usd: 29,
      saas_monthly_amount_ngn: 15000,
      saas_one_shot_amount_usd: 79,
      saas_one_shot_amount_ngn: 45000,
    });
  }
});

/** No auth — for marketing shell / login page banners. */
router.get('/status', async (_req, res) => {
  try {
    const rows = await runWithRls(
      pool,
      { allowPublicPlatformConfigRead: true },
      (client) =>
        client
          .query(`SELECT key, value FROM platform_config WHERE key = ANY($1::text[])`, [
            ['platform_maintenance', 'manual_reporting_mode'],
          ])
          .then((r) => r.rows)
    );
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({
      platform_maintenance: map.platform_maintenance === '1' || map.platform_maintenance === 'true',
      manual_reporting_mode: map.manual_reporting_mode === '1' || map.manual_reporting_mode === 'true',
    });
  } catch (e) {
    console.error(e);
    res.json({ platform_maintenance: false, manual_reporting_mode: false });
  }
});

/** CNAME / custom domain → tenant shell (§tenancy). Point DNS to your edge; resolve host here. */
router.get('/tenant-by-host', async (req, res) => {
  const host = String(req.query.host || req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].trim();
  if (!host) return res.status(400).json({ error: 'host query required' });
  try {
    const { rows } = await pool.query(`SELECT arena_tenant_by_custom_host($1) AS data`, [host]);
    const data = rows[0]?.data;
    if (!data) return res.status(404).json({ error: 'No tenant for this host' });
    res.json(data);
  } catch (e) {
    if (e.code === '42883') {
      return res.status(503).json({ error: 'Run migrate to enable arena_tenant_by_custom_host' });
    }
    console.error(e);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

export default router;
