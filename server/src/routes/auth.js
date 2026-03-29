import express from 'express';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { pool } from '../db.js';
import { signToken, requireAuth, verifyToken } from '../middleware/auth.js';
import { runWithRls, rlsContextFromRequest } from '../rls/transaction.js';
import { assertHwidNotBannedDefault } from '../hwidCheck.js';
import {
  refreshCookiesEnabled,
  replaceRefreshSession,
  rotateRefreshFromRequest,
  clearRefreshCookie,
  revokeRefreshForUser,
  revokeRefreshByCookie,
} from '../auth/refreshTokens.js';
import { assertPrizeWithdrawalKycAllowed, fetchPrizePayoutKycPayload } from '../lib/prizePayoutKyc.js';

const router = express.Router();

const MFA_REQUIRED_FOR_ADMIN = process.env.MFA_REQUIRED_FOR_ADMIN === 'true';
const MFA_REQUIRED_FOR_SUPER_ADMIN = process.env.MFA_REQUIRED_FOR_SUPER_ADMIN === 'true';

router.post('/register', async (req, res) => {
  const { email, password, full_name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    try {
      await assertHwidNotBannedDefault(req.body?.client_hwid ?? req.body?.hwid);
    } catch (e) {
      if (e.code === 'hwid_banned') {
        return res.status(403).json({
          error: 'This device is banned from the platform.',
          code: 'hwid_banned',
        });
      }
      throw e;
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await runWithRls(pool, { allowUserRegister: true }, async (client) => {
      const r = await client.query(
        `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING RETURNING id, email, full_name, role, game_handles, created_date`,
        [email.toLowerCase(), hash, full_name || null]
      );
      return r.rows[0] || null;
    });
    if (!user) return res.status(409).json({ error: 'Email already registered' });
    const token = signToken(accessTokenPayload(user, []));
    const body = { token, user: formatUser(user, { tenant_memberships: [] }) };
    if (refreshCookiesEnabled()) {
      await replaceRefreshSession(user.id, res);
      body.refresh_cookie = true;
    }
    res.status(201).json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const loginEmail = email.toLowerCase();
    const user = await runWithRls(pool, { authLoginEmail: loginEmail }, async (client) => {
      const r = await client.query(
        `SELECT id, email, full_name, role, game_handles, password_hash, mfa_secret, mfa_enabled FROM users WHERE email = $1`,
        [loginEmail]
      );
      return r.rows[0] || null;
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.password_hash) return res.status(401).json({ error: 'Set password first' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    try {
      await assertHwidNotBannedDefault(req.body?.client_hwid ?? req.body?.hwid);
    } catch (e) {
      if (e.code === 'hwid_banned') {
        return res.status(403).json({
          error: 'This device is banned from the platform.',
          code: 'hwid_banned',
        });
      }
      throw e;
    }

    const tmEarly = await fetchTenantMemberships(user.id);

    if (MFA_REQUIRED_FOR_ADMIN && user.role === 'admin' && !user.mfa_enabled) {
      delete user.password_hash;
      delete user.mfa_secret;
      return res.status(403).json({
        error: 'Platform administrators must enable MFA before signing in.',
        code: 'mfa_setup_required',
        user: formatUser(user, { tenant_memberships: tmEarly }),
      });
    }

    if (MFA_REQUIRED_FOR_SUPER_ADMIN && user.role === 'super_admin' && !user.mfa_enabled) {
      delete user.password_hash;
      delete user.mfa_secret;
      return res.status(403).json({
        error:
          'Tenant Super Admins must enable MFA before signing in. Ask your platform operator if you need a one-time exception.',
        code: 'mfa_setup_required_super_admin',
        user: formatUser(user, { tenant_memberships: tmEarly }),
      });
    }

    if (user.mfa_enabled && user.mfa_secret) {
      delete user.password_hash;
      const mfaToken = signToken(
        { sub: user.id, email: user.email, typ: 'mfa_login' },
        { expiresIn: '5m' }
      );
      delete user.mfa_secret;
      return res.json({
        mfa_required: true,
        mfa_token: mfaToken,
        user: formatUser(user, { tenant_memberships: tmEarly }),
      });
    }

    const tm = tmEarly;
    const token = signToken(accessTokenPayload(user, tm));
    delete user.password_hash;
    delete user.mfa_secret;
    const body = { token, user: formatUser(user, { tenant_memberships: tm }) };
    if (refreshCookiesEnabled()) {
      await replaceRefreshSession(user.id, res);
      body.refresh_cookie = true;
    }
    res.json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/login/mfa', async (req, res) => {
  const { mfa_token: mfaToken, code } = req.body || {};
  if (!mfaToken || !code) return res.status(400).json({ error: 'mfa_token and code required' });
  try {
    try {
      await assertHwidNotBannedDefault(req.body?.client_hwid ?? req.body?.hwid);
    } catch (e) {
      if (e.code === 'hwid_banned') {
        return res.status(403).json({
          error: 'This device is banned from the platform.',
          code: 'hwid_banned',
        });
      }
      throw e;
    }
    const decoded = verifyToken(mfaToken);
    if (!decoded || decoded.typ !== 'mfa_login' || !decoded.sub) {
      return res.status(401).json({ error: 'Invalid or expired MFA session' });
    }
    const row = await runWithRls(
      pool,
      { userId: String(decoded.sub), userEmail: String(decoded.email || '').toLowerCase() },
      async (client) => {
        const r = await client.query(
          `SELECT id, email, full_name, role, game_handles, mfa_secret, mfa_enabled FROM users WHERE id = $1`,
          [decoded.sub]
        );
        return r.rows[0] || null;
      }
    );
    if (!row?.mfa_enabled || !row.mfa_secret) {
      return res.status(401).json({ error: 'MFA not active for this account' });
    }
    const valid = authenticator.verify({ token: String(code).replace(/\s/g, ''), secret: row.mfa_secret });
    if (!valid) return res.status(401).json({ error: 'Invalid authenticator code' });
    const tm = await fetchTenantMemberships(row.id);
    const token = signToken(accessTokenPayload(row, tm));
    delete row.mfa_secret;
    const body = { token, user: formatUser(row, { tenant_memberships: tm }) };
    if (refreshCookiesEnabled()) {
      await replaceRefreshSession(row.id, res);
      body.refresh_cookie = true;
    }
    res.json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/mfa/setup-init', requireAuth, async (req, res) => {
  try {
    const secret = authenticator.generateSecret();
    const email = req.user.email;
    const otpauth = authenticator.keyuri(email, 'ArenaSaaS', secret);
    res.json({ secret, otpauth_url: otpauth });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/mfa/setup-verify', requireAuth, async (req, res) => {
  const { secret, code } = req.body || {};
  if (!secret || !code) return res.status(400).json({ error: 'secret and code required' });
  try {
    const ok = authenticator.verify({ token: String(code).replace(/\s/g, ''), secret: String(secret) });
    if (!ok) return res.status(400).json({ error: 'Code does not match secret' });
    const row = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      const r = await client.query(
        `UPDATE users SET mfa_secret = $1, mfa_enabled = TRUE WHERE id = $2
         RETURNING id, email, full_name, role, game_handles, mfa_enabled, created_date`,
        [String(secret), req.user.sub]
      );
      return r.rows[0];
    });
    const tm = await fetchTenantMemberships(req.user.sub);
    res.json(formatUser(row, { tenant_memberships: tm }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/mfa/disable', requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password required' });
  try {
    const result = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      const r = await client.query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.sub]);
      const u = r.rows[0];
      if (!u?.password_hash) return { error: 'no_password' };
      const match = await bcrypt.compare(password, u.password_hash);
      if (!match) return { error: 'bad_password' };
      const u2 = await client.query(
        `UPDATE users SET mfa_secret = NULL, mfa_enabled = FALSE WHERE id = $1
         RETURNING id, email, full_name, role, game_handles, mfa_enabled, created_date`,
        [req.user.sub]
      );
      return { row: u2.rows[0] };
    });
    if (result?.error === 'bad_password') return res.status(401).json({ error: 'Invalid password' });
    if (result?.error === 'no_password') return res.status(400).json({ error: 'Password not set' });
    const tm = await fetchTenantMemberships(req.user.sub);
    res.json(formatUser(result.row, { tenant_memberships: tm }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const row = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      const r = await client.query(
        `SELECT id, email, full_name, role, game_handles, mfa_enabled, kyc_cleared, achievements, created_date FROM users WHERE id = $1`,
        [req.user.sub]
      );
      return r.rows[0] || null;
    });
    if (!row) return res.status(404).json({ error: 'User not found' });
    const tm = await fetchTenantMemberships(req.user.sub);
    res.json(formatUser(row, { tenant_memberships: tm }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Cumulative USD prize payouts vs KYC gate (default $600). Env: PRIZE_KYC_THRESHOLD_USD */
router.get('/me/prize-payout-kyc', requireAuth, async (req, res) => {
  try {
    const row = await runWithRls(pool, rlsContextFromRequest(req), async (client) =>
      fetchPrizePayoutKycPayload(client, req.user.sub)
    );
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/**
 * Player vault withdrawal (debits user_wallets). Requires X-Tenant-ID for the org where prize credits exist.
 * KYC gate when cumulative USD prize_payout ≥ PRIZE_KYC_THRESHOLD_USD and kyc_cleared is false.
 */
router.post('/me/withdrawal-request', requireAuth, async (req, res) => {
  const headerTenant = (req.headers['x-tenant-id'] || req.headers['X-Tenant-ID'] || '').toString().trim();
  const tenantId = headerTenant || String(req.user.tenant_id || '').trim();
  if (!tenantId) {
    return res.status(400).json({ error: 'X-Tenant-ID required (organization where you received prize credits)' });
  }

  const { amount: rawAmt, currency: rawCur, notes } = req.body || {};
  const amount = Number(rawAmt);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  const currency = String(rawCur || 'USD').toUpperCase().slice(0, 8);

  try {
    const out = await runWithRls(pool, { ...rlsContextFromRequest(req), tenantId }, async (client) => {
      const proof = await client.query(
        `SELECT 1 FROM payment_ledger
         WHERE beneficiary_user_id = $1::uuid AND tenant_id = $2 AND type = 'prize_payout' AND status = 'completed'
         LIMIT 1`,
        [req.user.sub, tenantId]
      );
      if (!proof.rowCount) {
        return {
          error:
            'No completed prize credits found for this organization. Withdrawals apply to tournament winnings credited to your vault under this tenant.',
          status: 403,
          code: 'no_prize_credits_for_tenant',
        };
      }

      await assertPrizeWithdrawalKycAllowed(client, req.user.sub);

      const minRow = await client.query(`SELECT value FROM platform_config WHERE key = 'min_withdrawal_amount' LIMIT 1`);
      const minW = Number(minRow.rows[0]?.value || 0);
      if (minW > 0 && amount < minW) {
        return {
          error: `Minimum withdrawal is ${currency} ${minW.toFixed(2)}`,
          status: 400,
          code: 'below_min_withdrawal',
        };
      }

      const w = await client.query(
        `SELECT id, balance FROM user_wallets WHERE user_id = $1::uuid AND upper(trim(currency)) = upper(trim($2)) FOR UPDATE`,
        [req.user.sub, currency]
      );
      const wrow = w.rows[0];
      if (!wrow || Number(wrow.balance) < amount) {
        return { error: 'Insufficient balance in vault for this currency', status: 400, code: 'insufficient_balance' };
      }

      const ins = await client.query(
        `INSERT INTO withdrawal_requests (
           tenant_id, amount, currency, status, aml_status, notes, beneficiary_user_id, created_by
         ) VALUES ($1, $2::numeric, $3, 'pending', 'none', $4, $5::uuid, $6)
         RETURNING *`,
        [
          tenantId,
          amount,
          currency,
          notes ? String(notes).slice(0, 2000) : null,
          req.user.sub,
          String(req.user.email || ''),
        ]
      );

      await client.query(
        `UPDATE user_wallets SET balance = balance - $1::numeric, updated_date = NOW() WHERE id = $2`,
        [amount, wrow.id]
      );

      return { ok: true, withdrawal: ins.rows[0] };
    });

    if (out.error) {
      return res.status(out.status || 400).json({ error: out.error, code: out.code });
    }
    res.status(201).json(out);
  } catch (e) {
    if (e.statusCode === 403 && e.code === 'withdrawal_kyc_required') {
      return res.status(403).json({ error: e.message, code: e.code });
    }
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Player internal wallet balances (per currency) — hybrid monetization / entry fees. */
router.get('/me/wallet', requireAuth, async (req, res) => {
  try {
    const rows = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      const r = await client.query(
        `SELECT currency, balance, updated_date FROM user_wallets WHERE user_id = $1::uuid ORDER BY currency`,
        [req.user.sub]
      );
      return r.rows;
    });
    res.json({ wallets: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Tournament placements / badges (match resolution prize engine). */
router.get('/me/accolades', requireAuth, async (req, res) => {
  try {
    const rows = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      const r = await client.query(
        `SELECT id, tournament_id, tournament_title, rank, badge_id, metadata, created_date
         FROM user_accolades WHERE user_id = $1::uuid ORDER BY created_date DESC`,
        [req.user.sub]
      );
      return r.rows;
    });
    res.json({ accolades: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { full_name, game_handles } = req.body || {};
    const sets = [];
    const vals = [];
    let i = 1;
    if (full_name !== undefined) {
      sets.push(`full_name = $${i++}`);
      vals.push(full_name);
    }
    if (game_handles !== undefined) {
      sets.push(`game_handles = $${i++}::jsonb`);
      vals.push(JSON.stringify(game_handles));
    }
    const row = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      if (!sets.length) {
        const r = await client.query(
          `SELECT id, email, full_name, role, game_handles, mfa_enabled, kyc_cleared, achievements, created_date FROM users WHERE id = $1`,
          [req.user.sub]
        );
        return r.rows[0];
      }
      vals.push(req.user.sub);
      const r = await client.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id, email, full_name, role, game_handles, mfa_enabled, kyc_cleared, achievements, created_date`,
        vals
      );
      return r.rows[0];
    });
    const tm = await fetchTenantMemberships(req.user.sub);
    res.json(formatUser(row, { tenant_memberships: tm }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/refresh', async (req, res) => {
  if (!refreshCookiesEnabled()) {
    return res.status(503).json({ error: 'Set REFRESH_COOKIE_ENABLED=true; use credentials: include on the client' });
  }
  try {
    const userId = await rotateRefreshFromRequest(req, res);
    if (!userId) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Invalid or expired refresh session' });
    }
    const row = await runWithRls(pool, { userId: String(userId), userEmail: '' }, async (client) => {
      const r = await client.query(
        `SELECT id, email, full_name, role, game_handles, mfa_enabled, achievements, created_date FROM users WHERE id = $1`,
        [userId]
      );
      return r.rows[0];
    });
    if (!row) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'User not found' });
    }
    const tm = await fetchTenantMemberships(userId);
    const token = signToken(accessTokenPayload(row, tm));
    res.json({ token, user: formatUser(row, { tenant_memberships: tm }), refresh_cookie: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const h = req.headers.authorization;
    const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
    const user = token ? verifyToken(token) : null;
    if (user?.sub) {
      await revokeRefreshForUser(String(user.sub));
    } else if (refreshCookiesEnabled()) {
      await revokeRefreshByCookie(req);
    }
    clearRefreshCookie(res);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/export-my-data', requireAuth, async (req, res) => {
  try {
    const data = await runWithRls(pool, rlsContextFromRequest(req), async (client) => {
      const u = await client.query(
        `SELECT id, email, full_name, role, game_handles, mfa_enabled, achievements, created_date FROM users WHERE id = $1`,
        [req.user.sub]
      );
      const ut = await client.query(
        `SELECT tenant_id, role_in_tenant, created_date FROM user_tenants WHERE user_id = $1`,
        [req.user.sub]
      );
      return { user: u.rows[0], tenant_memberships: ut.rows, exported_at: new Date().toISOString() };
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="arena-export-my-data.json"');
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

function accessTokenPayload(userRow, tenantMemberships) {
  const tid = tenantMemberships[0]?.tenant_id ?? '';
  return {
    sub: String(userRow.id),
    email: userRow.email,
    role: userRow.role,
    tenant_id: tid ? String(tid) : '',
  };
}

function formatUser(row, opts = {}) {
  const tenant_memberships = opts.tenant_memberships ?? [];
  const tenant_id = tenant_memberships[0]?.tenant_id ?? null;
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    game_handles: row.game_handles || {},
    mfa_enabled: !!row.mfa_enabled,
    kyc_cleared: !!row.kyc_cleared,
    achievements: row.achievements ?? [],
    created_date: row.created_date,
    tenant_memberships,
    /** Primary tenant for organizer dashboard (first membership). */
    tenant_id,
  };
}

async function fetchTenantMemberships(userId) {
  try {
    return await runWithRls(pool, { userId: String(userId), userEmail: '' }, async (client) => {
      const r = await client.query(
        `SELECT tenant_id, role_in_tenant, created_date FROM user_tenants WHERE user_id = $1 ORDER BY created_date`,
        [userId]
      );
      return r.rows;
    });
  } catch {
    return [];
  }
}

export default router;
