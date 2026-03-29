#!/usr/bin/env bash
# Light load / smoke: hit public catalog and health (requires API running).
set -euo pipefail
BASE="${ARENA_LOAD_BASE:-http://127.0.0.1:3001}"
N="${ARENA_LOAD_ITERATIONS:-30}"

echo "GET $BASE/api/health x$N"
for i in $(seq 1 "$N"); do
  curl -sf "$BASE/api/health" >/dev/null
done

echo "GET $BASE/api/public/tournaments-catalog?limit=5 x$N"
for i in $(seq 1 "$N"); do
  curl -sf "$BASE/api/public/tournaments-catalog?limit=5" >/dev/null
done

echo "OK"
