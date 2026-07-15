/** Shared API helpers for Playwright request + lifecycle specs. */

export const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:3001';

export const CREDS = {
  admin: {
    email: process.env.PLAYWRIGHT_ADMIN_EMAIL || 'admin@arena.local',
    password: process.env.PLAYWRIGHT_ADMIN_PASSWORD || 'admin123',
  },
  organizer: {
    email: process.env.PLAYWRIGHT_ORG_EMAIL || 'organizer@arena.local',
    password: process.env.PLAYWRIGHT_ORG_PASSWORD || 'organizer123',
  },
  player: {
    email: process.env.PLAYWRIGHT_PLAYER_EMAIL || 'player1-demo@arena.local',
    password: process.env.PLAYWRIGHT_PLAYER_PASSWORD || 'demo123',
  },
};

/**
 * @param {import('@playwright/test').APIRequestContext} request
 */
export async function apiLogin(request, email, password) {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`login ${email}: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 */
export async function getDevLeagueTenantId(request, token) {
  const res = await request.get(`${API_URL}/api/v1/Tenant?slug=dev-league`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`tenant: ${res.status()}`);
  const data = await res.json();
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error('dev-league missing');
  return row.id;
}

/**
 * Create tournament + two teams + one check_in_open match for lifecycle tests.
 * @param {import('@playwright/test').APIRequestContext} request
 */
export async function seedMatchFixture(request, adminToken, tenantId) {
  const stamp = Date.now();
  const tourRes = await request.post(`${API_URL}/api/v1/Tournament`, {
    headers: { Authorization: `Bearer ${adminToken}`, 'X-Tenant-ID': tenantId },
    data: {
      tenant_id: tenantId,
      name: `E2E Match ${stamp}`,
      format: 'single_elimination',
      status: 'in_progress',
      max_teams: 4,
      roster_size: 1,
      start_date: new Date().toISOString(),
    },
  });
  if (!tourRes.ok()) throw new Error(`tournament: ${tourRes.status()} ${await tourRes.text()}`);
  const tour = await tourRes.json();

  const teamA = await request.post(`${API_URL}/api/v1/Team`, {
    headers: { Authorization: `Bearer ${adminToken}`, 'X-Tenant-ID': tenantId },
    data: {
      tenant_id: tenantId,
      tournament_id: tour.id,
      name: 'Alpha',
      tag: 'ALP',
      captain_email: CREDS.player.email,
      roster: [{ player_email: CREDS.player.email, player_name: 'P1' }],
    },
  });
  const teamB = await request.post(`${API_URL}/api/v1/Team`, {
    headers: { Authorization: `Bearer ${adminToken}`, 'X-Tenant-ID': tenantId },
    data: {
      tenant_id: tenantId,
      tournament_id: tour.id,
      name: 'Bravo',
      tag: 'BRV',
      captain_email: 'player2-demo@arena.local',
      roster: [{ player_email: 'player2-demo@arena.local', player_name: 'P2' }],
    },
  });
  if (!teamA.ok() || !teamB.ok()) {
    throw new Error(`teams: ${teamA.status()} ${teamB.status()}`);
  }
  const a = await teamA.json();
  const b = await teamB.json();

  const matchRes = await request.post(`${API_URL}/api/v1/Match`, {
    headers: { Authorization: `Bearer ${adminToken}`, 'X-Tenant-ID': tenantId },
    data: {
      tenant_id: tenantId,
      tournament_id: tour.id,
      round: 1,
      match_number: 1,
      status: 'check_in_open',
      version: 1,
      team_a_id: a.id,
      team_b_id: b.id,
      team_a_name: a.name,
      team_b_name: b.name,
      check_in_deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  });
  if (!matchRes.ok()) throw new Error(`match: ${matchRes.status()} ${await matchRes.text()}`);
  const match = await matchRes.json();
  return { tournament: tour, teamA: a, teamB: b, match, tenantId };
}
