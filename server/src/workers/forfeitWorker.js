#!/usr/bin/env node
/**
 * Polls overdue check-in matches; applies auto-forfeit with Redis distributed lock (optional).
 * Env: DATABASE_URL / DATABASE_RUNTIME_URL (same as API), REDIS_URL optional (redis://localhost:6379).
 * Run: node src/workers/forfeitWorker.js   or  npm run worker:forfeit --prefix server
 */
import path from 'path';
import { fileURLToPath } from 'url';
import '../loadEnv.js';
import { createClient } from 'redis';
import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';
import { applyForfeitTransition } from '../forfeitApply.js';
import { emitMatchUpdated } from '../realtime.js';

const POLL_MS = Number(process.env.FORFEIT_WORKER_POLL_MS || 15_000);
const LOCK_TTL_SEC = Number(process.env.FORFEIT_LOCK_TTL_SEC || 90);
const PREFIX = process.env.FORFEIT_REDIS_PREFIX || 'arena:forfeit';

let redis = null;

async function acquireLock(matchId) {
  if (!redis) return true;
  const key = `${PREFIX}:lock:${matchId}`;
  const ok = await redis.set(key, '1', { NX: true, EX: LOCK_TTL_SEC });
  return ok === 'OK';
}

async function processMatch(match) {
  const lockOk = await acquireLock(match.id);
  if (!lockOk) return;

  const deadline = match.check_in_deadline ? new Date(match.check_in_deadline) : null;
  if (!deadline || deadline > new Date()) return;
  if (match.status !== 'check_in_open') return;

  const tenantId = String(match.tenant_id || '');
  const idemBase = `worker:auto-forfeit:${match.id}:${deadline.toISOString()}`;

  const tryTransition = async (params) => {
    const row = await runWithRls(pool, { isPlatformAdmin: true, tenantId }, async (client) =>
      applyForfeitTransition(client, params)
    );
    if (row?.match) emitMatchUpdated(row.match);
    return row;
  };

  if (match.team_a_checked_in && !match.team_b_checked_in) {
    await tryTransition({
      idempotencyKey: `${idemBase}:b-no-show`,
      matchId: match.id,
      tenantId,
      expectedVersion: match.version ?? 1,
      fromStatus: 'check_in_open',
      newStatus: 'forfeited',
      patch: {
        winner_id: match.team_a_id,
        winner_name: match.team_a_name,
        notes: 'Team B failed check-in (worker)',
      },
    });
    return;
  }

  if (match.team_b_checked_in && !match.team_a_checked_in) {
    await tryTransition({
      idempotencyKey: `${idemBase}:a-no-show`,
      matchId: match.id,
      tenantId,
      expectedVersion: match.version ?? 1,
      fromStatus: 'check_in_open',
      newStatus: 'forfeited',
      patch: {
        winner_id: match.team_b_id,
        winner_name: match.team_b_name,
        notes: 'Team A failed check-in (worker)',
      },
    });
    return;
  }

  if (!match.team_a_checked_in && !match.team_b_checked_in) {
    await tryTransition({
      idempotencyKey: `${idemBase}:double-no-show`,
      matchId: match.id,
      tenantId,
      expectedVersion: match.version ?? 1,
      fromStatus: 'check_in_open',
      newStatus: 'no_show',
      patch: { notes: 'Neither team checked in (worker)' },
    });
  }
}

async function tick() {
  try {
    const { rows } = await runWithRls(pool, { isPlatformAdmin: true }, async (client) =>
      client.query(
        `SELECT * FROM matches
         WHERE status = 'check_in_open'
           AND check_in_deadline IS NOT NULL
           AND check_in_deadline < NOW()
         LIMIT 50`
      )
    );
    for (const m of rows) {
      await processMatch(m);
    }
  } catch (e) {
    console.error('[forfeit-worker] tick', e);
  }
}

const __filename = fileURLToPath(import.meta.url);
const isMain = path.resolve(process.argv[1] || '') === __filename;

async function main() {
  if (process.env.REDIS_URL) {
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', (err) => console.error('[forfeit-worker] redis', err));
    await redis.connect();
  }
  console.info(
    `[forfeit-worker] poll ${POLL_MS}ms redis=${redis ? process.env.REDIS_URL : 'off'}`
  );
  await tick();
  setInterval(tick, POLL_MS);
}

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
