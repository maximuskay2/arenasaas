/**
 * Ensures dev-league + one login player, member link, open tournament, and team DEVTEST1.
 * See seed.js header for TEST_PLAYER_* env vars.
 */
import './loadEnv.js';

process.env.SEED_TEST_PLAYER = 'true';

const { runOptionalApiSeeds } = await import('./seed.js');

try {
  const r = await runOptionalApiSeeds({ force: false });
  if (r.skipped) {
    console.log('[seed:test-player] skipped (set DATABASE_URL / admin pool)');
  } else {
    console.log('[seed:test-player]', r.summary.join(' · '));
  }
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
