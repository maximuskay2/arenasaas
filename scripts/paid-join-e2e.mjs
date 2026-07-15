#!/usr/bin/env node
/**
 * Sprint A — paid tournament join E2E without real Stripe keys.
 * Flow: login → create PAID tournament → dev-simulate-entry → join with payment_proof → assert team.
 * Requires API + DB seeded (admin + organizer).
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
  return data;
}

async function main() {
  const admin = await login(process.env.DEV_ADMIN_EMAIL || 'admin@arena.local', process.env.DEV_ADMIN_PASSWORD || 'admin123');
  const player = await login(
    process.env.TEST_PLAYER_EMAIL || 'player1-demo@arena.local',
    process.env.DEMO_SEED_PASSWORD || 'demo123'
  );

  const tenants = (await jfetch('/api/v1/Tenant?slug=dev-league', {
    headers: { Authorization: `Bearer ${admin.token}` },
  })).data;
  const tid = Array.isArray(tenants) ? tenants[0]?.id : tenants?.id;
  if (!tid) throw new Error('dev-league not found');

  const fee = 5;
  const tour = await jfetch('/api/v1/Tournament', {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin.token}`, 'X-Tenant-ID': tid },
    body: {
      tenant_id: tid,
      name: `Paid join E2E ${Date.now()}`,
      format: 'single_elimination',
      status: 'registration_open',
      entry_type: 'PAID',
      entry_fee: fee,
      currency: 'USD',
      max_teams: 16,
      roster_size: 1,
      start_date: new Date().toISOString(),
    },
  });
  if (!tour.ok) throw new Error(`tournament create: ${JSON.stringify(tour.data)}`);
  const tournamentId = tour.data.id;

  const sim = await jfetch('/api/payments/dev-simulate-entry', {
    method: 'POST',
    headers: { Authorization: `Bearer ${player.token}` },
    body: {
      tournament_id: tournamentId,
      amount: fee,
      currency: 'USD',
      captain_email: player.user?.email || 'player1-demo@arena.local',
    },
  });
  if (!sim.ok || !sim.data?.reference) {
    throw new Error(`dev-simulate-entry: ${sim.status} ${JSON.stringify(sim.data)}`);
  }

  const join = await jfetch(`/api/tournaments/${tournamentId}/join`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${player.token}`,
      'Idempotency-Key': `paid-e2e-${Date.now()}`,
    },
    body: {
      mode: 'solo',
      captain_email: player.user?.email || 'player1-demo@arena.local',
      payment_proof: {
        provider: sim.data.provider || 'dev',
        reference: sim.data.reference,
      },
    },
  });
  if (!join.ok) throw new Error(`join failed: ${join.status} ${JSON.stringify(join.data)}`);
  if (!join.data?.team?.id) throw new Error(`join missing team: ${JSON.stringify(join.data)}`);

  // Same payment / captain must not create a second team
  const join2 = await jfetch(`/api/tournaments/${tournamentId}/join`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${player.token}`,
      'Idempotency-Key': `paid-e2e-replay-${Date.now()}`,
    },
    body: {
      mode: 'solo',
      captain_email: player.user?.email || 'player1-demo@arena.local',
      payment_proof: {
        provider: sim.data.provider || 'dev',
        reference: sim.data.reference,
      },
    },
  });
  if (join2.status !== 409) {
    throw new Error(`expected second join 409 already_registered/payment_already_used, got ${join2.status} ${JSON.stringify(join2.data)}`);
  }
  console.log(
    JSON.stringify({
      ok: true,
      tournament_id: tournamentId,
      reference: sim.data.reference,
      team_id: join.data.team.id,
      second_join_status: join2.status,
      second_join_code: join2.data?.code,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
