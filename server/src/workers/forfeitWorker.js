#!/usr/bin/env node
/**
 * Polls overdue check-in matches; applies auto-forfeit with Redis distributed lock (optional).
 * Env: DATABASE_URL / DATABASE_RUNTIME_URL (same as API), REDIS_URL optional.
 * Run: node src/workers/forfeitWorker.js   or  npm run worker:forfeit --prefix server
 * Or set FORFEIT_WORKER=1 on the API process (single-instance always-on).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import '../loadEnv.js';
import { createClient } from 'redis';
import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';
import { applyForfeitTransition } from '../forfeitApply.js';
import { emitMatchUpdated, emitMatchCenterFeed } from '../realtime.js';
import { recomputeLeagueStandings } from '../lib/leagueStandings.js';
import { applyMatchEloUpdate } from '../lib/matchEloHook.js';

const POLL_MS = Number(process.env.FORFEIT_WORKER_POLL_MS || 15_000);
const LOCK_TTL_SEC = Number(process.env.FORFEIT_LOCK_TTL_SEC || 90);
const PREFIX = process.env.FORFEIT_REDIS_PREFIX || 'arena:forfeit';

let redis = null;
let started = false;
let intervalHandle = null;

async function acquireLock(matchId) {
  if (!redis) return true;
  const key = `${PREFIX}:lock:${matchId}`;
  const ok = await redis.set(key, '1', { NX: true, EX: LOCK_TTL_SEC });
  return ok === 'OK';
}

async function postForfeitSideEffects(client, match, tenantId) {
  const m = match;
  if (!m) return;
  const terminal = ['completed', 'forfeited', 'no_show'].includes(String(m.status || ''));
  if (terminal && m.winner_id && m.team_a_id && m.team_b_id) {
    try {
      await applyMatchEloUpdate(client, m);
    } catch (e) {
      console.error('[forfeit-worker] elo', e);
    }
  }
  if (terminal && m.tournament_id) {
    try {
      const { rows: tr } = await client.query(
        `SELECT format FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
        [String(m.tournament_id), tenantId]
      );
      await recomputeLeagueStandings(client, String(m.tournament_id), tenantId, String(tr[0]?.format || ''));
    } catch (e) {
      console.error('[forfeit-worker] league standings', e);
    }
  }
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
    const row = await runWithRls(pool, { isPlatformAdmin: true, tenantId }, async (client) => {
      const out = await applyForfeitTransition(client, params);
      if (out?.match && !out.duplicate) {
        await postForfeitSideEffects(client, out.match, tenantId);
      }
      return out;
    });
    if (row?.match) {
      emitMatchUpdated(row.match);
      const m = row.match;
      if (m.winner_id && !row.duplicate) {
        emitMatchCenterFeed(String(m.id), {
          type: 'result',
          headline: `${m.winner_name || 'Winner'} wins`,
          body: `Match resolved (${String(m.status)}) via auto-forfeit worker`,
          matchId: String(m.id),
        });
      }
    }
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

export async function tick() {
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

/**
 * Start the poller (idempotent). Safe to call from API when FORFEIT_WORKER=1.
 */
export async function startForfeitWorker() {
  if (started) return;
  started = true;
  if (process.env.REDIS_URL) {
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', (err) => console.error('[forfeit-worker] redis', err));
    await redis.connect();
  }
  console.info(
    `[forfeit-worker] poll ${POLL_MS}ms redis=${redis ? process.env.REDIS_URL : 'off'}`
  );
  await tick();
  intervalHandle = setInterval(tick, POLL_MS);
  if (intervalHandle.unref) intervalHandle.unref();
}

const __filename = fileURLToPath(import.meta.url);
const isMain = path.resolve(process.argv[1] || '') === __filename;

async function main() {
  await startForfeitWorker();
}

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
