#!/usr/bin/env node
/**
 * Light concurrency smoke: parallel GET /api/health (no auth).
 * Usage: node server/scripts/concurrent-health-load.js
 * Env: ARENA_LOAD_BASE (default http://127.0.0.1:3001), CONCURRENCY (default 20), ROUNDS (default 5)
 */
const base = process.env.ARENA_LOAD_BASE || 'http://127.0.0.1:3001';
const concurrency = Math.max(1, parseInt(process.env.CONCURRENCY || '20', 10) || 20);
const rounds = Math.max(1, parseInt(process.env.ROUNDS || '5', 10) || 5);

async function one() {
  const u = new URL('/api/health', base);
  const res = await fetch(u);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await res.json();
}

async function main() {
  const t0 = Date.now();
  for (let r = 0; r < rounds; r++) {
    await Promise.all(Array.from({ length: concurrency }, () => one()));
  }
  const ms = Date.now() - t0;
  console.log(`OK ${rounds} rounds × ${concurrency} parallel health checks in ${ms}ms (${base})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
