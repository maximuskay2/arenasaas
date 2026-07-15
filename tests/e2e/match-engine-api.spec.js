import { test, expect } from '@playwright/test';
import { API_URL, CREDS, apiLogin, getDevLeagueTenantId, seedMatchFixture } from './helpers/api.js';

test.describe('match engine API lifecycle', () => {
  test('check-in → force complete path + forfeit idempotency', async ({ request }) => {
    const admin = await apiLogin(request, CREDS.admin.email, CREDS.admin.password);
    const tenantId = await getDevLeagueTenantId(request, admin.token);
    const { match } = await seedMatchFixture(request, admin.token, tenantId);
    const headers = {
      Authorization: `Bearer ${admin.token}`,
      'X-Tenant-ID': tenantId,
      'Content-Type': 'application/json',
    };

    // Check-in both sides via optimistic PATCH
    const c1 = await request.patch(`${API_URL}/api/v1/Match/${match.id}`, {
      headers,
      data: {
        team_a_checked_in: true,
        status: 'check_in_open',
        expected_version: match.version ?? 1,
        expected_status: 'check_in_open',
      },
    });
    expect(c1.ok()).toBeTruthy();
    const afterA = await c1.json();

    const c2 = await request.patch(`${API_URL}/api/v1/Match/${afterA.id || match.id}`, {
      headers,
      data: {
        team_b_checked_in: true,
        status: 'checked_in',
        expected_version: afterA.version ?? 2,
        expected_status: afterA.status || 'check_in_open',
      },
    });
    expect(c2.ok()).toBeTruthy();
    const checked = await c2.json();
    expect(checked.team_a_checked_in).toBeTruthy();
    expect(checked.team_b_checked_in).toBeTruthy();

    // Organizer force complete
    const done = await request.patch(`${API_URL}/api/v1/Match/${match.id}`, {
      headers,
      data: {
        status: 'completed',
        score_a: 2,
        score_b: 0,
        winner_id: checked.team_a_id,
        winner_name: checked.team_a_name,
        expected_version: checked.version,
        expected_status: checked.status,
      },
    });
    expect(done.ok()).toBeTruthy();
    const final = await done.json();
    expect(final.status).toBe('completed');
  });

  test('forfeit endpoint is idempotent (G4)', async ({ request }) => {
    const admin = await apiLogin(request, CREDS.admin.email, CREDS.admin.password);
    const tenantId = await getDevLeagueTenantId(request, admin.token);
    const { match } = await seedMatchFixture(request, admin.token, tenantId);
    const headers = {
      Authorization: `Bearer ${admin.token}`,
      'X-Tenant-ID': tenantId,
      'Content-Type': 'application/json',
    };

    const body = {
      match_id: match.id,
      idempotency_key: `e2e-forfeit-${match.id}`,
      expected_version: match.version ?? 1,
      from_status: 'check_in_open',
      new_status: 'forfeited',
      patch: {
        winner_id: match.team_a_id,
        winner_name: match.team_a_name,
        notes: 'e2e forfeit',
      },
    };

    const r1 = await request.post(`${API_URL}/api/engine/forfeit`, { headers, data: body });
    expect(r1.ok()).toBeTruthy();
    const j1 = await r1.json();
    expect(j1.ok).toBeTruthy();

    const r2 = await request.post(`${API_URL}/api/engine/forfeit`, { headers, data: body });
    expect(r2.ok()).toBeTruthy();
    const j2 = await r2.json();
    expect(j2.duplicate).toBeTruthy();
  });

  test('paid join via dev-simulate-entry ledger', async ({ request }) => {
    const admin = await apiLogin(request, CREDS.admin.email, CREDS.admin.password);
    const player = await apiLogin(request, CREDS.player.email, CREDS.player.password);
    const tenantId = await getDevLeagueTenantId(request, admin.token);

    const tourRes = await request.post(`${API_URL}/api/v1/Tournament`, {
      headers: { Authorization: `Bearer ${admin.token}`, 'X-Tenant-ID': tenantId },
      data: {
        tenant_id: tenantId,
        name: `Paid E2E ${Date.now()}`,
        format: 'single_elimination',
        status: 'registration_open',
        entry_type: 'PAID',
        entry_fee: 3,
        currency: 'USD',
        max_teams: 32,
        roster_size: 1,
        start_date: new Date().toISOString(),
      },
    });
    expect(tourRes.ok()).toBeTruthy();
    const tour = await tourRes.json();

    const sim = await request.post(`${API_URL}/api/payments/dev-simulate-entry`, {
      headers: { Authorization: `Bearer ${player.token}` },
      data: {
        tournament_id: tour.id,
        amount: 3,
        currency: 'USD',
        captain_email: CREDS.player.email,
      },
    });
    expect(sim.ok()).toBeTruthy();
    const { reference, provider } = await sim.json();
    expect(reference).toBeTruthy();

    const join = await request.post(`${API_URL}/api/tournaments/${tour.id}/join`, {
      headers: {
        Authorization: `Bearer ${player.token}`,
        'Idempotency-Key': `pw-paid-${Date.now()}`,
      },
      data: {
        mode: 'solo',
        captain_email: CREDS.player.email,
        payment_proof: { provider: provider || 'dev', reference },
      },
    });
    expect(join.ok()).toBeTruthy();
    const body = await join.json();
    expect(body.team?.id).toBeTruthy();
  });

  test('oauth status endpoint responds', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/oauth/status`);
    expect(res.ok()).toBeTruthy();
    const j = await res.json();
    expect(Array.isArray(j.providers)).toBeTruthy();
  });
});
