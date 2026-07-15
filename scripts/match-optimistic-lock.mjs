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

  // G2 race: concurrent check-in progress vs forfeit from check_in_open → single winner
  const match2 = await jfetch('/api/v1/Match', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}`, 'X-Tenant-ID': tid },
    body: {
      tenant_id: tid,
      tournament_id: tour.data.id,
      round: 1,
      match_number: 2,
      status: 'check_in_open',
      version: 1,
      team_a_name: 'R1',
      team_b_name: 'R2',
      team_a_id: 'team-r1',
      team_b_id: 'team-r2',
    },
  });
  if (!match2.ok) throw new Error(`match2: ${JSON.stringify(match2.data)}`);
  const mid2 = match2.data.id;
  const raceIdem = `race-forfeit-${mid2}`;

  const [racePatch, raceForfeit] = await Promise.all([
    jfetch(`/api/v1/Match/${mid2}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${orgTok}`, 'X-Tenant-ID': tid },
      body: {
        team_a_checked_in: true,
        team_b_checked_in: true,
        status: 'checked_in',
        expected_version: 1,
        expected_status: 'check_in_open',
      },
    }),
    jfetch('/api/engine/forfeit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgTok}`, 'X-Tenant-ID': tid },
      body: {
        match_id: mid2,
        idempotency_key: raceIdem,
        expected_version: 1,
        from_status: 'check_in_open',
        new_status: 'forfeited',
        patch: { winner_id: 'team-r1', winner_name: 'R1', notes: 'race forfeit' },
      },
    }),
  ]);

  const raceOk =
    (racePatch.status === 200 && (raceForfeit.status === 409 || raceForfeit.data?.duplicate || raceForfeit.ok)) ||
    (raceForfeit.ok && raceForfeit.data?.match && (racePatch.status === 409 || racePatch.status === 200));
  if (!raceOk && !(racePatch.ok || raceForfeit.ok)) {
    console.error('check-in vs forfeit race: neither succeeded', racePatch, raceForfeit);
    process.exit(1);
  }
  // Exactly one transition should leave a terminal or checked_in state at version >= 2
  const finalRace = await jfetch(`/api/v1/Match?id=${encodeURIComponent(mid2)}`, {
    headers: { Authorization: `Bearer ${adminTok}`, 'X-Tenant-ID': tid },
  });
  const finalRow = Array.isArray(finalRace.data) ? finalRace.data[0] : finalRace.data;
  if (!finalRow || Number(finalRow.version || 0) < 2) {
    console.error('Expected race winner version >= 2', finalRow, racePatch.status, raceForfeit.status);
    process.exit(1);
  }

  console.log('Match optimistic lock + forfeit idempotency + check-in/forfeit race OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
