import test from 'node:test';
import assert from 'node:assert/strict';
import { runDiscoveryDashboardQueries } from './discoveryDashboard.js';

test('runDiscoveryDashboardQueries returns shaped payload from empty DB', async () => {
  const client = {
    query: async (sql) => {
      if (String(sql).includes('COUNT(DISTINCT lower(trim(ps.player_email)))')) {
        return {
          rows: [
            {
              tournaments: 0,
              matches: 0,
              teams: 0,
              players: 0,
              games: 0,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const out = await runDiscoveryDashboardQueries(client);
  assert.equal(out.stats.tournaments, 0);
  assert.ok(Array.isArray(out.recent_tournaments));
  assert.ok(Array.isArray(out.live_matches));
  assert.equal(out.top_organizations.length, 0);
});
