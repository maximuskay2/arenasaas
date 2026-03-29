import express from 'express';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';

const router = express.Router();

router.post('/send-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  const em = email.toLowerCase();
  try {
    await runWithRls(pool, { otpSessionEmail: em }, (client) =>
      client.query(`INSERT INTO otp_records (email, code, expires_at) VALUES ($1, $2, $3)`, [em, code, expires])
    );
    console.info(`[dev-otp] ${email} code=${code}`);
    res.json({
      success: true,
      message: 'OTP sent (check server logs in development)',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'email and code required' });
  const em = email.toLowerCase();
  try {
    const ok = await runWithRls(pool, { otpSessionEmail: em }, async (client) => {
      const r = await client.query(
        `SELECT id FROM otp_records
         WHERE email = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
         ORDER BY created_date DESC LIMIT 1`,
        [em, String(code)]
      );
      if (!r.rowCount) return false;
      await client.query(`UPDATE otp_records SET used = TRUE WHERE id = $1`, [r.rows[0].id]);
      return true;
    });
    if (!ok) return res.json({ success: false, message: 'Invalid or expired code' });
    res.json({ success: true, message: 'Email verified' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/setup-stripe', async (req, res) => {
  res.json({
    success: true,
    redirectUrl: null,
    accountId: null,
    message: 'Stripe Connect not configured locally — set STRIPE_SECRET_KEY on Railway',
  });
});

export default router;
