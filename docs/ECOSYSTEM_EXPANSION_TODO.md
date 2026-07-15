# GridCore Ecosystem Expansion — Developer TODO

**Blueprint:** Move the platform from a tournament organizer to a high-traffic e-sports destination.

**Design:** Keep the existing dark, high-contrast, “gamer-grade” UI; new surfaces should match current layouts (panels, borders, typography).

**Suggested build order:** Elo → Match Center → Career Archives → Pick’Em (see bottom).

**Status:** Items in §§1–4 are **shipped** in-repo. §5 depth largely shipped: `elo_tier` + K max, multi-stream table/API/UI, player Elo + rankings tab, richer match feed types + Discord webhook. Bracket-tree Pick’Em UI remains optional polish.

---

## 5. Phase 2 — optional product depth (backlog)

Formalizes “remaining” enhancements: richer tickers, explicit Elo tier, bracket-shaped Pick’Em, player-level Elo, multi-stream. Each row is self-contained; build order is suggested, not mandatory.

| Track | Goal | Scope / acceptance | Primary touchpoints |
|-------|------|--------------------|---------------------|
| **Richer match tickers** | Game-specific or narrative feed beyond score/bracket. | Define a small **event schema** (`type`, `headline`, `body`, optional `actor_team_id`, `payload` JSON). Emit via `emitMatchCenterFeed` from: manual organizer buttons, `match_reports` notes, or future integration webhooks. UI: `MatchLive.jsx` renders `payload` hints (icons, optional color by `type`). | `server/src/realtime.js`, `matchEngineRoutes.js`, `src/pages/MatchLive.jsx` |
| **`elo_tier` (persisted weight)** | Decouple K from prize money (community cups with small pools but high prestige). | Add nullable **`tournaments.elo_tier`** (e.g. `community` / `regional` / `premier` / `major`) or integer **1–4**; **`kFactorFromTournament(row)`** = max or override of `kFactorFromPrizePool` and tier map. Migrate + admin UI on tournament create/edit. | `schema.sql`, `migrate.js`, `server/src/lib/elo.js`, `matchEloHook.js`, `TournamentCreate` / detail |
| **Bracket-shaped Pick’Em** | Predictions feel like the real bracket, not a flat match list. | Reuse **`BracketView`** (read-only) or a slim tree: propagate picks (winner of match A → feeds next slot); **server** validates acyclic picks vs `matches.next_match_id`. Storage can stay **`bracket_picks` map** (`matchId → teamId`); add **validation endpoint** or stricter PUT checks. | `TournamentPickEm.jsx`, `BracketView.jsx`, `matchEngineRoutes.js` (pickem PUT) |
| **Player Elo** | Solo ladders / 1v1 prestige separate from teams. | New **`player_elo_links`** + **`elo_entities`** rows **or** `entity_type` on `elo_entities` (`team` \| `user`). Hook **after** authoritative 1v1 match (or allocate team delta to roster — product choice). **`/rankings`** filter or tab; RLS for history. | `schema.sql`, `002_rls.sql`, `matchEloHook.js`, `tournamentCatalogRoutes.js`, UI |
| **Multi-stream model** | Main + co-stream, per-language, or map VODs. | Table **`tournament_streams`** (`tournament_id`, `match_id` nullable, `label`, `stream_url`, `provider`, `sort_order`, `is_primary`). **Watch** API: ordered list; **`MatchLive`** primary + “More broadcasts” list or tabs. | `schema.sql`, `tournamentCatalogRoutes.js` `/match/:id/watch`, `MatchLive.jsx` |

**Suggested priority (impact vs effort):** `elo_tier` → richer tickers → bracket Pick’Em UI → multi-stream → player Elo (largest schema + product design surface).

---

## 1. Integrated Match Center (streaming & real-time ticker)

**Goal:** Keep fans on-platform during live matches.

| Item | Done |
|------|------|
| Add route **`/match/:id/live`** (or tenant-scoped equivalent if routing is prefixed). | [x] Alias **`/match/:matchId/live`** alongside **`/matches/:matchId/live`** (`App.jsx`, `MatchLive.jsx` params). |
| **Dual pane:** Left — embedded stream (Twitch / YouTube via `react-player` or iframe APIs). Right — **real-time event log** (Socket.io), “kill feed” style. | [x] `src/pages/MatchLive.jsx` + `GET /api/catalog/match/:id/watch` (`tournamentCatalogRoutes.js`). |
| **Ticker events:** On match report submit and bracket updates, emit structured events (e.g. *“Team X captured Point A”*, *“Match point”*). Wire server → room for `matchId`. | [x] `emitMatchCenterFeed` in `server/src/realtime.js`, wired from `matchEngineRoutes` (score / dispute / bracket) and `engineRoutes` (forfeit). Bracket advance also emits to **`match:live:{nextMatchId}`** so the next match’s watchers see slot fills. |
| **Data model / API:** Use or extend **`tournament_streams`** (and match stream URL resolution) for embed source. | [x] **Resolved without separate table:** `tournaments.stream_url` and `matches.stream_url` (`schema.sql`); watch endpoint prefers match URL then tournament URL. |
| **Cinematic mode:** Toggle hides sidebar / chrome; focus stream + live chat (reuse match chat room if applicable). | [x] `MatchLive.jsx` cinematic layout; lobby chat via `joinMatchLobbyRoom` / `subscribeMatchLobbyChat`. |

---

## 2. Global Elo power rankings (“prestige engine”)

**Goal:** Cross-tournament leaderboard with meaningful ratings.

| Item | Done |
|------|------|
| **Algorithm:** Standard Elo updates: \(R_a' = R_a + K(S_a - E_a)\). Base rating (~1200). Expected score from rating difference. | [x] `server/src/lib/elo.js` + `applyMatchEloUpdate` (`matchEloHook.js`). |
| **K-factor:** Derive from tournament tier / prize pool / configured “weight” (e.g. Pro $10k > free community cup). Persist tier on tournament or template. | [x] **Prize pool tiers** in `kFactorFromPrizePool`; optional dedicated `elo_tier` column is a future enhancement. |
| **Storage:** **`team_ratings_history`** (and current rating on `teams` or latest row) + migration + RLS as needed. | [x] `elo_entities`, `team_elo_links`, `team_ratings_history`, `teams.elo`; RLS in `002_rls.sql`. |
| **Worker / hook:** **Post-match calculation** after authoritative result (same path as bracket finalize / match approved). Idempotent per match. | [x] `matchEngineRoutes` resolve + dispute resolve; `engineRoutes` forfeit; duplicates guarded in hook. |
| **Route:** **`/rankings`** — global team table with **trend indicators** (e.g. green up vs recent window). | [x] **`/rankings`** → `PowerRankings.jsx`; **`GET /api/catalog/power-rankings`**. |
| **Badges:** Top 10 globally auto-get **“Apex Tier”** (badge flag or computed rank band on team profile). | [x] `apex_tier` in catalog responses; `PowerRankings` + public team profile API. |
| **Spec check:** Formalize Elo for multi-format (Bo1/Bo3, team vs team only vs future 1v1) — optional follow-up doc or shared lib tests. | [x] See **`docs/ELO_HOOK_SPEC.md`**; `server/src/lib/elo.test.js`. |

---

## 3. Wiki-style career archives (recruitment)

**Goal:** Durable, trustworthy history; no hard-delete of finished competitive data.

| Item | Done |
|------|------|
| **Archival model:** Finished tournaments → **`archives`** (or archival flag + snapshot tables); **no hard delete** of concluded events. Migration + conclusion hook. | [x] **`tournament_archives`** + `insertTournamentArchive` on finalize (`tournamentArchive.js`, `matchEngineRoutes`). CRUD blocks delete for **`status === 'completed'`** (`crud.js`). |
| **Player profile — timeline:** Vertical timeline of major events (tournament placements, wins, milestones) across tenants (respect RLS / public visibility rules). | [x] `GET /api/catalog/player-career` + merged timeline on **`PlayerProfile.jsx`** (accolades + archive milestones). |
| **Aggregates:** **Total career earnings**, **most played game** (title/genre), **win rate** (define numerators/denominators clearly). | [x] Same `player-career` endpoint (`payment_ledger`, `player_stats` aggregates). |
| **UI:** “Professional gamer resume” — high-density stat blocks; align with existing profile page patterns. | [x] Career résumé cards + timeline on `PlayerProfile.jsx`. |
| **Integration note:** Table hints mention **`player_achievements`** / accolades — align with existing `user_accolades` or extend consistently. | [x] Timeline uses **`user_accolades`**; mirror on `users.achievements` via trigger (`schema.sql`). |

---

## 4. Pick’Em predictor (engagement)

**Goal:** Casual engagement + rewards before play starts.

| Item | Done |
|------|------|
| **Window:** Active when tournament is **`registration_closed`** and **not yet** **`in_progress`** (exact state machine aligned with your `tournaments.status` values). | [x] **`GET/PUT .../pickem`** (`matchEngineRoutes.js`); lock when status → **`in_progress`** (`crud.js` mass `locked`). |
| **Storage:** **`user_predictions`** — per user, per tournament, bracket path (quarters / semis / finals picks). | [x] Table + API + `TournamentPickEm.jsx` tab on `TournamentDetail.jsx`. |
| **Lock:** Predictions immutable after cutoff or when phase flips to `in_progress`. | [x] `locked` column + server checks. |
| **Scoring:** **Bracket state comparator** vs actual results; award **profile XP** and/or **internal wallet** currency (reuse ledger if present). | [x] **`pickemScore.js`** on finalize: XP + **`user_wallets`** top-up; includes **`forfeited` / `no_show`** with `winner_id`. |
| **Leaderboard:** **Top predictors** per event. | [x] Pick’Em GET returns **`leaderboard`**. |
| **UI:** Interactive bracket — click team to advance pick; **glowing blue** (or primary accent) selected state. Accessible focus states. | [x] `TournamentPickEm.jsx` (glow + **`aria-pressed`** + focus ring). |

---

## Integrated data architecture (reference)

| Feature | Primary tables (target) | Service / logic |
|---------|-------------------------|-----------------|
| Live streaming | `tournaments.stream_url`, `matches.stream_url` | Watch meta + `MatchLive` |
| Elo | `team_ratings_history`, `elo_entities`, `teams.elo` | Post-match hook |
| Career archives | `tournament_archives` + `user_accolades` | Finalize hook + `player-career` |
| Pick’Em | `user_predictions` | Bracket comparator + rewards |

---

## Implementation priority (from blueprint)

1. **Elo rankings** — competitive value on every match.  
2. **Match center** — sponsor / retention impact.  
3. **Career archives** — SEO and long-term data asset.  
4. **Pick’Em** — best once viewer volume is meaningful.

---

## Open question (product / math)

- [x] Draft **Elo calculation hook** spec for **multi-game types** (team formats, draws, forfeits, Swiss vs bracket) so implementation is deterministic and test-covered. → **`docs/ELO_HOOK_SPEC.md`**
- [ ] **Phase 2 Elo extensions** (`elo_tier`, player entities) — scoped in **`docs/ELO_HOOK_SPEC.md`** and §5 above; implement when product locks tier mapping and 1v1 rules.
