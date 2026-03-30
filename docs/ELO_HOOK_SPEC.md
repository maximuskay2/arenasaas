# Elo post-match hook — deterministic spec

This documents behavior implemented in `server/src/lib/matchEloHook.js`, `server/src/lib/elo.js`, and call sites (`matchEngineRoutes`, `engineRoutes` forfeit).

## Scope (current product)

- **Entities:** One Elo rating per **team**, backed by `elo_entities` and `team_elo_links`. Head-to-head is always **two teams** with a **single binary winner** (no draw stored as terminal).
- **When it runs:** After a match reaches a terminal status with a valid `winner_id` that equals either `team_a_id` or `team_b_id`: `completed`, `forfeited`, or `no_show`.
- **Idempotency:** At most one history row per `(match_id, elo_entity_id)`; duplicate completes are skipped via `team_ratings_history`.

## Algorithm

- Base rating **1200** (`ELO_DEFAULT`).
- Expected score: \(E_a = 1 / (1 + 10^{(R_b - R_a)/400})\).
- Update: \(R'_a = R_a + K (S_a - E_a)\), \(S_a \in \{0,1\}\). Same for B with \(S_b = 1 - S_a\).
- Ratings rounded to **two decimal places**; deltas stored in `team_ratings_history`.

## K-factor (tournament “weight”)

- Derived from **`tournaments.prize_pool`** (`kFactorFromPrizePool` in `elo.js`): higher pools → higher K (24 / 28 / 32 / 40). This is the persisted stand-in for “tier” until a dedicated column exists.
- Invalid or missing pool defaults to **24**.

### Optional: `elo_tier` (Phase 2 — not implemented)

When **`tournaments.elo_tier`** (or template default) exists:

- Map tier → **K_floor** (or fixed K): e.g. `community=24`, `regional=28`, `premier=32`, `major=40`.
- **Resolution rule (deterministic):** `K = max(K_from_prize_pool, K_from_elo_tier)` so small-pool majors still move ratings meaningfully; **or** `K = K_from_elo_tier` when tier is set (ignore pool) — pick one in product and document it in `elo.js`.
- **`applyMatchEloUpdate`** loads tournament row once; no extra round-trips.

## Multi-format notes

| Format | Behavior |
|--------|----------|
| Single / double elimination | One Elo update per **terminal bracket match** (map / series as modeled — today one row per `matches` terminal outcome). |
| Swiss / round robin | Same hook: each **completed** `matches` row with a winner triggers one update for the two teams in that row. |
| Draws | Not supported as terminal for Elo in this hook; disputes require a chosen winner before completion. |
| Forfeits / no-show | Treated like any terminal outcome if `winner_id` is set; **G4 forfeit** path calls the same `applyMatchEloUpdate`. |
| Best-of series | If the product stores **one match row per game**, each game can update Elo (current schema). If a single row represents the whole series, one update applies. |

## Future: player-level Elo (Phase 2 — not implemented)

- **Entity model:** Either extend **`elo_entities`** with `entity_kind TEXT CHECK (entity_kind IN ('team','user'))` + `user_id` nullable, or parallel **`player_elo_links`** (`user_id` → `elo_entity_id`) mirroring `team_elo_links`.
- **When to update:** Only for formats where **`matches`** represent **1v1** (both slots are individual competitors) **or** a separate **`match_participants`** table records per-player outcome — avoid double-counting team + player on the same result until product rules are defined.
- **History:** Reuse **`team_ratings_history`** shape (**rename in migrations** only if you want clarity — otherwise new table `player_ratings_history` with same columns) for idempotency keyed by `(match_id, elo_entity_id)`.
- **API/UI:** Filter or tab on **`GET /api/catalog/power-rankings`**; profile widget for linked user.

## Future (ambiguous multi-team)

- True **FFA** or **multi-team** single match: needs a different update rule (e.g. partial credit per placement) — **out of scope** for current binary Elo hook.

## Tests

- `server/src/lib/elo.test.js` — math and K tiers.
