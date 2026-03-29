#!/usr/bin/env node
/**
 * Stress: concurrent INSERTs into payment_ledger with the same reference.
 * Expect exactly one row to win; others hit unique index idx_payment_ledger_reference_unique.
 *
 * Usage (from server/):
 *   DATABASE_URL=... node scripts/payout-ledger-idempotency-stress.js
 *
 * Env:
 *   CONCURRENCY — parallel clients (default 24)
 *   ROUNDS — repeats of the batch (default 3)
 */
import '../src/loadEnv.js';
import pg from 'pg';

const { Pool } = pg;

const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '24', 10) || 24);
const ROUNDS = Math.max(1, parseInt(process.env.ROUNDS || '3', 10) || 3);

async function main() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_ADMIN_URL;
  if (!url) {
    console.error('Set DATABASE_URL');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: CONCURRENCY + 2 });
  const ref = `stress_prize_ref:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const tenantId = `stress-tenant-${Date.now()}`;

  let wins = 0;
  let conflicts = 0;
  let errors = 0;

  for (let r = 0; r < ROUNDS; r++) {
    const batchRef = `${ref}:r${r}`;
    const tasks = Array.from({ length: CONCURRENCY }, () =>
      pool
        .query(
          `INSERT INTO payment_ledger (
             tenant_id, tournament_id, type, amount, amount_minor, currency, provider, held, reference, description, status
           ) VALUES ($1, NULL, 'prize_payout', 0.01, 1, 'USD', 'internal', FALSE, $2, 'stress idempotency', 'completed')
           ON CONFLICT (reference) WHERE (reference IS NOT NULL AND btrim(reference) <> '') DO NOTHING
           RETURNING id`,
          [tenantId, batchRef]
        )
        .then((res) => {
          if (res.rowCount) wins += 1;
          else conflicts += 1;
        })
        .catch((e) => {
          errors += 1;
          console.error('[stress row error]', e.code, e.message);
        })
    );
    await Promise.all(tasks);
  }

  await pool.query(`DELETE FROM payment_ledger WHERE reference LIKE $1`, [`${ref}%`]);

  await pool.end();

  const expectedWins = ROUNDS;
  const expectedConflicts = ROUNDS * (CONCURRENCY - 1);
  console.info(
    JSON.stringify(
      {
        reference_prefix: ref,
        concurrency: CONCURRENCY,
        rounds: ROUNDS,
        inserts_returned: wins,
        conflicts_or_noop: conflicts,
        errors,
        expected_inserts_returned: expectedWins,
        expected_noop: expectedConflicts,
        ok: errors === 0 && wins === expectedWins && conflicts === expectedConflicts,
      },
      null,
      2
    )
  );

  if (errors > 0 || wins !== expectedWins || conflicts !== expectedConflicts) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
