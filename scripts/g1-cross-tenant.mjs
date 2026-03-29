#!/usr/bin/env node
/**
 * G1 adversarial check (MASTER_IMPLEMENTATION_DIRECTIVE §3.1a):
 * Tenant A must never see tenant B's match rows when using pooled API + RLS.
 *
 * Requires: API running (e.g. npm run dev:api), DB migrated + seeded dev users
 * (SEED_DEV_USER=true or npm run seed).
 *
 * Usage: API_URL=http://localhost:3001 node scripts/g1-cross-tenant.mjs
 */
const API = process.env.API_URL || 'http://127.0.0.1:3001';

async function jfetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: r.ok, status: r.status, data };
}

async function login(email, password) {
  const { ok, data } = await jfetch('/api/auth/login', { method: 'POST', body: { email, password } });
  if (!ok || !data?.token) throw new Error(`login failed: ${JSON.stringify(data)}`);
  return data.token;
}

async function main() {
  const adminEmail = process.env.DEV_ADMIN_EMAIL || 'admin@arena.local';
  const adminPass = process.env.DEV_ADMIN_PASSWORD || 'admin123';
  const orgEmail = process.env.DEV_ORGANIZER_EMAIL || 'organizer@arena.local';
  const orgPass = process.env.DEV_ORGANIZER_PASSWORD || 'organizer123';

  const adminTok = await login(adminEmail, adminPass);
  const orgTok = await login(orgEmail, orgPass);

  const tenantsA = (await jfetch('/api/v1/Tenant?slug=dev-league')).data;
  const tenantAId = Array.isArray(tenantsA) ? tenantsA[0]?.id : null;
  if (!tenantAId) throw new Error('Could not resolve dev-league tenant id');

  const slugB = `iso-${Date.now()}`;
  const tB = await jfetch('/api/v1/Tenant', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}` },
    body: {
      name: `Isolation ${slugB}`,
      slug: slugB,
      plan: 'pro',
      status: 'active',
      owner_email: 'iso@example.com',
    },
  });
  if (!tB.ok) throw new Error(`create tenant B failed: ${JSON.stringify(tB.data)}`);
  const tenantBId = tB.data.id;

  await jfetch('/api/v1/TenantEntitlement', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}` },
    body: {
      tenant_id: tenantBId,
      plan: 'pro',
      status: 'active',
      is_active: true,
      plan_type: 'monthly',
      single_tournament_remaining: 0,
      max_teams_per_tournament: 8,
      max_admins: 2,
    },
  }).catch(() => {});

  const tour = await jfetch('/api/v1/Tournament', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}`, 'X-Tenant-ID': tenantBId },
    body: {
      tenant_id: tenantBId,
      name: 'ISO Tournament',
      format: 'single_elimination',
      status: 'draft',
      max_teams: 4,
      start_date: new Date().toISOString(),
    },
  });
  if (!tour.ok) throw new Error(`create tournament: ${JSON.stringify(tour.data)}`);

  const match = await jfetch('/api/v1/Match', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}`, 'X-Tenant-ID': tenantBId },
    body: {
      tenant_id: tenantBId,
      tournament_id: tour.data.id,
      round: 1,
      match_number: 99,
      status: 'check_in_open',
      team_a_name: 'A',
      team_b_name: 'B',
    },
  });
  if (!match.ok) throw new Error(`create match: ${JSON.stringify(match.data)}`);
  const bMatchId = match.data.id;

  const leak = await jfetch(`/api/v1/Match?id=${bMatchId}&limit=5`, {
    headers: { Authorization: `Bearer ${orgTok}`, 'X-Tenant-ID': tenantAId },
  });
  if (!leak.ok) throw new Error(`list failed: ${JSON.stringify(leak.data)}`);
  const rows = Array.isArray(leak.data) ? leak.data : [];
  if (rows.length !== 0) {
    console.error('FAIL: tenant A received tenant B match row(s)', rows);
    process.exit(1);
  }

  const flood = await Promise.all(
    Array.from({ length: 24 }, () =>
      jfetch(`/api/v1/Match?id=${bMatchId}&limit=5`, {
        headers: { Authorization: `Bearer ${orgTok}`, 'X-Tenant-ID': tenantAId },
      })
    )
  );
  if (flood.some((x) => !x.ok)) throw new Error('flood request failed');
  if (flood.some((x) => (Array.isArray(x.data) ? x.data.length : 0) > 0)) {
    console.error('FAIL: leak under concurrent GETs');
    process.exit(1);
  }

  console.log('G1 cross-tenant isolation OK (no leak, flood clean).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
