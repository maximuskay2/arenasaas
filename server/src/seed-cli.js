/**
 * One-shot: apply all optional API seeds (ignores SEED_* env gates).
 * Includes platform dev admin, reference data, and dev tenant + organizer — see seed.js header for logins.
 * Usage: npm run seed   (from server/)
 */
import './loadEnv.js';
import { runOptionalApiSeeds } from './seed.js';

try {
  const r = await runOptionalApiSeeds({ force: true });
  if (r.skipped) {
    console.log('[seed] skipped (unexpected with force)');
  } else {
    console.log('[seed]', r.summary.join(' · '));
  }
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
