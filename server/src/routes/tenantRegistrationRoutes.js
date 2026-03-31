/**
 * Self-serve tenant (organizer) registration — runs with platform RLS so inserts succeed
 * after the user has authenticated (JWT). Plain CRUD tenant create fails for logged-in users
 * because RLS only allows bootstrap without auth or platform admin.
 */
import express from 'express';
import { runWithRls } from '../rls/transaction.js';
import { pool } from '../db.js';
import { requireAuth, signToken } from '../middleware/auth.js';

async function fetchUserRowAndMemberships(userId) {
  const userRow = await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
    const u = await client.query(`SELECT id, email, full_name, role, game_handles, created_date FROM users WHERE id = $1`, [
      userId,
    ]);
    return u.rows[0];
  });
  const tm = await runWithRls(pool, { userId: String(userId), userEmail: '' }, async (client) => {
    const r = await client.query(
      `SELECT tenant_id, role_in_tenant, created_date FROM user_tenants WHERE user_id = $1 ORDER BY created_date`,
      [userId]
    );
    return r.rows;
  });
  return { userRow, tm };
}

/** Match auth route: JWT primary tenant prefers staff membership so X-Tenant-ID / RLS align with league ops. */
function primaryTenantFromMemberships(tenantMemberships) {
  const list = Array.isArray(tenantMemberships) ? tenantMemberships : [];
  const staffRoles = new Set(['organizer', 'admin', 'staff']);
  const staffFirst = list.find((m) => m?.role_in_tenant && staffRoles.has(String(m.role_in_tenant)));
  const pick = staffFirst || list[0];
  return pick?.tenant_id ?? null;
}

function accessTokenPayload(userRow, tenantMemberships) {
  const tidRaw = primaryTenantFromMemberships(tenantMemberships);
  const tid = tidRaw != null && String(tidRaw).trim() !== '' ? String(tidRaw).trim() : '';
  return {
    sub: String(userRow.id),
    email: userRow.email,
    role: userRow.role,
    tenant_id: tid,
  };
}

function formatUser(row, tenant_memberships) {
  const tenant_id = primaryTenantFromMemberships(tenant_memberships);
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    game_handles: row.game_handles || {},
    created_date: row.created_date,
    tenant_memberships,
    tenant_id,
  };
}

const router = express.Router();

function normSlug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 48);
}

router.post('/', requireAuth, async (req, res) => {
  const user = req.user;
  if (user?.role === 'admin') {
    return res.status(400).json({ error: 'Use platform admin tools to provision tenants.' });
  }

  const body = req.body || {};
  const name = String(body.name || '').trim();
  const slug = normSlug(body.slug || body.subdomain);
  const logoUrl = String(body.logo_url || body.logoUrl || '').trim() || 'https://mails.bybata.com/logomail.png';
  const stripeAccountId = String(body.stripe_account_id || body.stripeAccountId || '').trim() || null;
  const billingPlan = String(body.billing_plan || body.billingPlan || 'monthly').toLowerCase();
  const ownerEmail = String(user.email || '').toLowerCase();
  const rawCur = String(body.wallet_currency || body.settlement_currency || 'USD')
    .toUpperCase()
    .slice(0, 8);
  const walletCurrency = rawCur === 'NGN' ? 'NGN' : 'USD';

  if (!name || !slug) {
    return res.status(400).json({ error: 'name and slug (subdomain) are required' });
  }
  if (!ownerEmail) {
    return res.status(400).json({ error: 'Authenticated user email required' });
  }

  const requireApproval = process.env.TENANT_REGISTRATION_REQUIRES_APPROVAL !== 'false';
  const tenantStatus = requireApproval ? 'pending' : 'active';

  const isOneShot = billingPlan === 'one_shot' || billingPlan === 'onetime' || billingPlan === 'one-time';
  const planType = isOneShot ? 'one_shot' : 'monthly';
  const entStatus = isOneShot ? 'one_shot' : 'active';
  const singleRemaining = isOneShot ? 1 : 0;
  const planTier = isOneShot ? 'starter' : 'pro';

  try {
    const out = await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      const dup = await client.query(`SELECT id FROM tenants WHERE slug = $1 LIMIT 1`, [slug]);
      if (dup.rows.length) {
        const err = new Error('This subdomain is already taken');
        err.code = 'slug_taken';
        err.statusCode = 409;
        throw err;
      }

      const tIns = await client.query(
        `INSERT INTO tenants (name, slug, plan, status, owner_email, logo_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [name, slug, planTier, tenantStatus, ownerEmail, logoUrl]
      );
      const tenant = tIns.rows[0];
      const tid = String(tenant.id);

      const payoutSettings = {
        primary_rail: walletCurrency === 'NGN' ? 'paystack' : 'stripe',
        paystack_subaccount_code: '',
        flutterwave_subaccount_id: '',
        settlement_currency: walletCurrency,
        internal_notes: '',
      };
      await client.query(
        `INSERT INTO tenant_configs (tenant_id, tenant_name, logo_url, stripe_account_id, payout_settings)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [tid, name, logoUrl, stripeAccountId, JSON.stringify(payoutSettings)]
      );

      await client.query(
        `INSERT INTO tenant_entitlements (
           tenant_id, plan, status, max_teams_per_tournament, max_admins, is_active,
           plan_type, single_tournament_remaining
         ) VALUES ($1, $2, $3, 32, 5, TRUE, $4, $5)`,
        [tid, planTier, entStatus, planType, singleRemaining]
      );

      const w = await client.query(`SELECT id FROM tenant_wallets WHERE tenant_id = $1`, [tid]);
      if (!w.rowCount) {
        await client.query(`INSERT INTO tenant_wallets (tenant_id, balance, currency) VALUES ($1, 0, $2)`, [tid, walletCurrency]);
      }

      await client.query(
        `INSERT INTO user_tenants (user_id, tenant_id, role_in_tenant)
         VALUES ($1::uuid, $2, 'organizer')
         ON CONFLICT (user_id, tenant_id) DO UPDATE SET role_in_tenant = EXCLUDED.role_in_tenant`,
        [user.sub, tid]
      );

      return { tenant };
    });

    const { userRow, tm } = await fetchUserRowAndMemberships(user.sub);
    const token = userRow ? signToken(accessTokenPayload(userRow, tm)) : null;

    res.status(201).json({
      ...out.tenant,
      registration: {
        pending_approval: requireApproval,
        billing_plan: planType,
      },
      ...(token && userRow
        ? {
            token,
            user: formatUser(userRow, tm),
          }
        : {}),
    });
  } catch (e) {
    if (e.code === 'slug_taken') {
      return res.status(e.statusCode || 409).json({ error: e.message, code: e.code });
    }
    console.error('[tenant-registration]', e);
    res.status(500).json({ error: e.message || 'Registration failed' });
  }
});

export default router;
