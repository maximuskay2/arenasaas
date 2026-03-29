#!/usr/bin/env node
/**
 * G2-style check: two concurrent PATCHes with the same expected_version → exactly one succeeds (409 on the other).
 * Also exercises POST /api/engine/forfeit idempotency (G4): same idempotency_key twice → duplicate: true.
 *
 * Requires API + DB seeded (dev-league, organizer, admin).
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
  const adminTok = await login(process.env.DEV_ADMIN_EMAIL || 'admin@arena.local', process.env.DEV_ADMIN_PASSWORD || 'admin123');
  const orgTok = await login(
    process.env.DEV_ORGANIZER_EMAIL || 'organizer@arena.local',
    process.env.DEV_ORGANIZER_PASSWORD || 'organizer123'
  );

  const tenants = (await jfetch('/api/v1/Tenant?slug=dev-league')).data;
  const tid = Array.isArray(tenants) ? tenants[0]?.id : null;
  if (!tid) throw new Error('dev-league not found');

  const tour = await jfetch('/api/v1/Tournament', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}`, 'X-Tenant-ID': tid },
    body: {
      tenant_id: tid,
      name: `Lock test ${Date.now()}`,
      format: 'single_elimination',
      status: 'draft',
      max_teams: 4,
      start_date: new Date().toISOString(),
    },
  });
  if (!tour.ok) throw new Error(`tournament: ${JSON.stringify(tour.data)}`);

  const match = await jfetch('/api/v1/Match', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}`, 'X-Tenant-ID': tid },
    body: {
      tenant_id: tid,
      tournament_id: tour.data.id,
      round: 1,
      match_number: 1,
      status: 'check_in_open',
      version: 1,
      team_a_name: 'T1',
      team_b_name: 'T2',
    },
  });
  if (!match.ok) throw new Error(`match: ${JSON.stringify(match.data)}`);
  const mid = match.data.id;

  const patch = {
    status: 'in_progress',
    expected_version: 1,
    expected_status: 'check_in_open',
  };

  const [a, b] = await Promise.all([
    jfetch(`/api/v1/Match/${mid}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${orgTok}`, 'X-Tenant-ID': tid },
      body: patch,
    }),
    jfetch(`/api/v1/Match/${mid}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${orgTok}`, 'X-Tenant-ID': tid },
      body: patch,
    }),
  ]);

  const statuses = [a.status, b.status].sort();
  if (!(statuses.includes(200) && statuses.includes(409))) {
    console.error('Expected one 200 and one 409, got', a.status, b.status, a.data, b.data);
    process.exit(1);
  }

  const winner = a.status === 200 ? a : b;
  const v2 = winner.data?.version;
  if (v2 !== 2) {
    console.error('Expected winning row version 2, got', winner.data);
    process.exit(1);
  }

  const idem = `test-forfeit-${Date.now()}`;
  const ffBody = {
    match_id: mid,
    idempotency_key: idem,
    expected_version: v2,
    from_status: 'in_progress',
    new_status: 'forfeited',
    patch: { notes: 'lock test forfeit' },
  };
  const f1 = await jfetch('/api/engine/forfeit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${orgTok}`, 'X-Tenant-ID': tid },
    body: ffBody,
  });
  const f2 = await jfetch('/api/engine/forfeit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${orgTok}`, 'X-Tenant-ID': tid },
    body: ffBody,
  });
  if (!f1.ok || !f2.ok) {
    console.error('forfeit requests failed', f1, f2);
    process.exit(1);
  }
  if (!f2.data?.duplicate) {
    console.error('Expected second forfeit to be duplicate', f2.data);
    process.exit(1);
  }

  console.log('Match optimistic lock + forfeit idempotency OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
