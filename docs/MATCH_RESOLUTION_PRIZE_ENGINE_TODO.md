# Match Resolution & Prize Distribution Engine — Implementation TODO

Technical directive tracker: **dual-verification match results**, **bracket/league progression**, **tenant-admin finalization**, **wallet credits + badges**, **async prize worker**, and **player-visible prize disclosure** from tournament creation through discovery and detail.  
Integrity first: money and competitive status must be auditable and idempotent.

**Related schema today:** `matches`, `match_reports`, `tournaments` (`prize_pool`, `payout_config`, `prize_structure`, `prize_disclosure_tbd`, `finalized_at`, `payout_job_status`), `user_wallets`, `payment_ledger` (`type` includes `prize_payout`), `feed_posts`, `user_accolades`, `tournament_league_standings`, `audit_log` (via server patterns).  
**Transport:** Prize jobs use `server/src/jobs/prizePayoutQueue.js` — **BullMQ + Redis** when `REDIS_URL` is set, otherwise in-process drain; FCM uses `fcmNotificationQueue.js` (stub / extensible).

**Implementation status:** Phases 0–6 are implemented in this repo (see paths in [`PRIZE_ENGINE_OPERATOR_RUNBOOK.md`](./PRIZE_ENGINE_OPERATOR_RUNBOOK.md)). Checklists below are marked `[x]` when shipped; a few **optional / policy** items remain `[ ]`.

---

## Prize Distribution Model (trust, liability, automation)

A clear **Prize Distribution Model** builds player trust and automates **tenant financial liability** vs **entry-fee-backed pots**. Implement alongside Phases 3–5.

### 1. Tenant admin: prize configuration (creation wizard)

- [x] **Two payout modes** (admin selects per tournament):
  - **Guaranteed (fixed amounts):** Admin sets exact payouts per rank (e.g. 1st $500, 2nd $200). **Tenant is liable** for this total regardless of entry fees collected.
  - **Dynamic (percentage of pot):** Admin sets **percentages** of the net entry pool (e.g. 1st 60%, 2nd 30%, 3rd 10%). Protects tenant if registration is light; amounts scale with `(joined × entry_fee) − platform commission`.
- [x] **Wizard step “Prize structure”** (in **Tournament Create** / edit flow) is where the admin **defines the winning prize pool for players** — not only `prize_pool` headline number but the **per-rank structure** (fixed $ or % split). This is set **before or when publishing** the tournament so entrants know what they are playing for.
- [x] **Required for transparency:** treat prize disclosure as part of tournament metadata: if the org offers cash/prizes, the wizard should require either a declared structure or an explicit “prize TBD / sponsor-provided” flag (product decision — document).
- [x] Persist a single JSON document (see schema below). Validate on save: non-negative amounts/percentages, ranks unique, percentages sum to ≤ 100% (or exactly 100% — document rule).

### 2. `prize_structure` distribution schema (stored on tournament)

```json
{
  "type": "FIXED",
  "currency": "USD",
  "ranks": [
    { "rank": 1, "payout": 1000, "badge_id": "gold_champion_2026" },
    { "rank": 2, "payout": 500, "badge_id": "silver_finalist" },
    { "rank": 3, "payout": 100, "badge_id": "bronze_competitor" }
  ],
  "participation_badge": "arena_vanguard_badge"
}
```

- [x] For **`type: "PERCENTAGE"`**, represent ranks with `percent` (or `payout_percent`) instead of literal `payout`; **final dollar amounts** are computed only at settlement (see Prize Calculator).
- [x] **`participation_badge`:** optional badge minted for all checked-in / completed participants (policy TBD — idempotent).

### 3. Prize Calculator service (server module)

Run **when the last outcome is known** (grand finals reported + bracket resolved) and again **inside the finalize worker** so numbers are reproducible and logged.

**Algorithm:**

1. **Pot calculation**
   - If structure is **percentage-based:**  
     `total_pot = (registered_or_paid_count × entry_fee) − platform_commission`  
     (reuse existing platform fee / ledger rules; use same rounding policy as checkout.)
   - If **fixed:** pot validation is **tenant liability** — ensure configured fixed totals are ≤ optional cap or require admin acknowledgment in UI.
2. **Rank assignment** (single/double elim defaults):
   - **Rank 1:** grand finals **winner**
   - **Rank 2:** grand finals **loser**
   - **Rank 3:** loser of semi-finals / consolation / bronze match (define per `tournaments.format`; document double-elim path)
3. **Validation**
   - Sum of **resolved dollar payouts** must not exceed `prize_pool` (if used as cap) **and** must not exceed **dynamic pot** when in percentage mode.
   - Reject finalize with explicit error if validation fails (admin must adjust structure or registrations).

- [x] **Unit tests:** fixed vs percentage, rounding (bankers vs floor), edge cases (byes, forfeits, co-champions if ever allowed).

### 4. Atomic finalize routine (admin “Finalize tournament” → worker)

Single logical transaction per tournament payout batch (worker may chunk users, but each credit must be idempotent):

1. **Wallet credit:** For each rank in `prize_structure`, resolve **payee** (`user_id` or **team captain** — document default; optional future: split roster).
   - Use **decimal / numeric (e.g. 12,2)** in DB; **never float** in JS for money — use integer cents in code or a money lib, persist as `NUMERIC`.
2. **`payment_ledger`:** Insert row `type: prize_payout` (DB may store lowercase `prize_payout` — match existing CHECK), `tournament_id`, amount, currency, description for **tax / audit**.
3. **Badge minting:** Attach `badge_id` + metadata to persistent storage:
   - **Option A:** `users.achievements` JSONB array (if added) — `{ tournament_name, date, rank, badge_id, … }`
   - **Option B:** normalized `user_accolades` (Phase 5) — preferred for querying and RLS
   - Ensure **idempotent** upsert per `(user_id, tournament_id, rank)`.
4. **Community feed:** Auto-create `feed_posts` (or equivalent) e.g. *“Victory Achieved! [User] claimed 1st place in [Tournament Name]!”* — tenant-scoped, rate-limit duplicates.

- [x] **Participation badge:** if enabled, batch mint after placement badges (separate idempotency key).

### 5. Player-facing disclosure (discovery + tournament detail)

Anything configured in **§1–2** must be **readable by public/list APIs** (respecting RLS / tenant public site rules) so prospects can compare events before registering.

- [x] **API / CRUD:** tournament list and `GET` by id return **`prize_pool`**, **`currency`**, **`entry_fee`**, **`entry_type`**, and **`prize_structure`** (or derived **`prize_summary`** object built server-side for stable UI shape — optional but recommended for % models).
- [x] **Tournament Discovery** (`TournamentDiscovery.jsx` and any card/list component): show a compact **prize line** on each card, e.g. *“$1,000 guaranteed · 1st $600”*, or *“60% / 30% / 10% of net pot”* + currency; if percentage-only, show **example at max teams** or “scales with entries” copy.
- [x] **Tournament Detail** (`TournamentDetail.jsx`): dedicated **“Prize pool & placements”** section — full breakdown (ranks, amounts or %, badges if you want hype), link to entry fee and format; match visual hierarchy with existing tournament meta.
- [x] **Consistency:** copy and numbers on discovery cards must match detail page (same formatter utility on client or server-provided `prize_summary`).
- [x] **Edge cases:** draft tournaments hidden from public lists as today; when `prize_structure` empty, show neutral copy (“Prizes announced by organizer”) if allowed.

---

## Phase 0 — Product & data alignment

- [x] **Document status mapping** from directive → DB enums (avoid silent drift).
  - Directive: `SCHEDULED` → `READY` → `REPORTING` → `VERIFYING` → `COMPLETED` (+ `DISPUTED`).
  - Current `matches.status`: `pending`, `check_in_open`, `checked_in`, `in_progress`, `under_dispute`, `completed`, `forfeited`, `no_show`.
  - **Decision:** either extend `matches.status` CHECK with new values **or** map directive labels to existing values in code + a single source-of-truth enum in shared constants.
- [x] **Add `pov_link` (or store in `match_reports.notes` / JSON)** for optional Match POV URL on submissions.
- [x] **Per-team submission identity:** ensure reports can be attributed to **team_id** (and captain eligibility), not only `submitted_by` user — may require migration on `match_reports`.
- [x] **Idempotency keys** for finalize + wallet credits (e.g. `tournament_id` + `placement` + `user_id`) to prevent double payout on retries.
- [x] **Migration:** `tournaments.prize_structure` JSONB (nullable; default `{}` or null) **or** extend `payout_config` with `{ "schema_version": 2, ... }` so older tournaments keep working.

---

## Phase 1 — Player reporting (Match Lobby “Result Submission Portal”)

- [x] **API: submit result** — e.g. `POST /api/matches/:matchId/report-result` (auth + team membership check).
  - Body: `score_a`, `score_b`, `screenshot` (multipart or presigned URL flow), optional `pov_link`.
  - Persist row in `match_reports` (`screenshot_urls`, scores, `status: pending`).
  - Transition match toward **REPORTING / VERIFYING** per state machine.
- [x] **API: list reports for match** (players see opponent submission state where policy allows).
- [x] **Auto-resolution rule:** when **two submissions** from opposing sides report the **same ordered pair** `(score_a, score_b)` (consistent with match `team_a` / `team_b` orientation):
  - Set `matches.score_a` / `score_b`, `winner_id`, `status: completed` (or mapped value).
  - Mark related `match_reports` approved (or add system-approved flag).
  - Emit **`MATCH_COMPLETED`** internally (function call + optional Socket.io), see Phase 2.
- [x] **Conflict rule:** opposing scores (e.g. 2–1 vs 1–2) → `matches.status: under_dispute` (or `DISPUTED`), block bracket advancement for this branch, set `match_reports.status: disputed` as appropriate.
- [x] **UI:** Match Lobby panel matching directive layout (scores, screenshot upload, POV, “Transmit Results”) — reuse existing `MatchLobby` patterns and design tokens.

---

## Phase 2 — Bracket & standings (listeners)

- [x] **Single / double elimination:** on `MATCH_COMPLETED`, write `winner_id` into `next_match_id` slot (`team_a_id` / `team_b_id` per bracket node rules). Reuse or extend existing bracket generation/update code paths.
- [x] **Block advancement** if match or any upstream branch is disputed (per directive).
- [x] **Round robin / league:** update standings (new table `league_standings` or materialized view + migration, or JSON on tournament — **pick one** and document).
  - Win: **+3**, draw: **+1** (configurable later).
- [x] **Tests:** bracket edge cases (bye, double elim losers), and “no advance when disputed”.

---

## Phase 3 — Tournament conclusion & integrity

- [x] **Detect “grand finals” complete** — final bracket node `completed` (format-specific).
- [x] **Integrity check helper** (server):
  1. All bracket matches `completed` (or allowed exceptions: forfeited/no_show per rules).
  2. No open disputes (`under_dispute` / pending disputed reports).
- [x] **If disputes exist:** tournament stays not financially finalized; **Tenant Admin** must resolve disputes first.
- [x] **Admin CTA:** **“Finalize tournament”** only when integrity checks pass (no open disputes, all matches terminal).
- [x] **Platform finalize override:** `POST /api/match-engine/tournaments/:id/finalize` with JSON **`{ "finalize_override": true }`** — **`admin`** or **`super_admin`** only; skips “all matches terminal” + dispute checks; **prize validation** still runs; **`audit_logs`** row `finalize_override`. UI: **Tournament detail** → “Finalize (platform override)” when the normal finalize button is hidden.
- [x] **`POST /api/tournaments/:id/finalize`**
  - AuthZ: tenant admin / super_admin as per existing RLS patterns.
  - Validates integrity checks **and** Prize Calculator outputs (pot vs sum of payouts).
  - Sets `tournaments.status: completed` (and optional `finalized_at` column).
  - **Does not** run long wallet work inline — enqueue **prize worker job** (Phase 4) with snapshot of calculated amounts (or reproducible inputs only — document).

---

## Phase 4 — Prize worker (async, no frontend timeout)

- [x] **Choose transport:** BullMQ + Redis **or** DB-backed job table + cron worker — align with existing `bracketJobQueue` / `fcmNotificationQueue` evolution (`.env` already mentions Redis).
- [x] **Implement `PrizeCalculator` module** (see **Prize Distribution Model §3**) — invoked from worker; log inputs/outputs for disputes.
- [x] **Worker job:** `processTournamentPayouts(tournamentId)` idempotent.
  1. Load `prize_structure`, `prize_pool`, `currency`, `entry_fee`, `entry_type`, paid/registered counts, platform commission rules.
  2. Run **rank assignment** from bracket state (grand finals winner/loser, 3rd place rule).
  3. Compute per-rank **dollar amounts** (fixed vs percentage); **validate** totals vs pot / `prize_pool`.
  4. For each credit:
     - `BEGIN` transaction.
     - `SELECT … FROM user_wallets WHERE user_id = $1 AND currency = $2 FOR UPDATE`.
     - Increment `balance`; insert `payment_ledger` row (`type: prize_payout`, `tournament_id`, amount, description).
     - Insert **audit** entry: `[System] Credited $X to User … (Winner of Tournament Y)`.
     - `COMMIT`.
  5. **Badge minting** + **feed post** per **Prize Distribution Model §4** (after successful credits).
  6. On failure: retry with backoff; dead-letter after N attempts; alert ops.
- [x] **FCM / push:** enqueue notification — *“Victory Confirmed! $X has been credited to your vault.”* (reuse `enqueueFcmNotificationJob` pattern).
- [x] **Expose job status** (optional): admin UI “Payout job: queued / running / done / failed”.

---

## Phase 5 — Accolades (badges) & profile “Trophy Case” (ESCharts-style)

- [x] **Migration: `user_accolades` (or `tournament_accolades`)**  
  Columns (minimum): `id`, `user_id`, `badge_id` / `badge_slug`, `tournament_id`, `tournament_title` (denormalized ok), `rank` (1, 2, 3…), `final_opponent_team_id` / `metadata` JSONB (who they beat in finals, bracket path), `created_date`.
- [x] **Optional `users.achievements` JSONB** mirror — column + **`sync_user_achievements_mirror`** trigger on **`user_accolades` INSERT** (append-only denormalized entries). Canonical data remains **`user_accolades`**; **`GET /api/auth/me`** includes **`achievements`** for quick reads.
- [x] **Worker step:** after successful wallet lines, insert accolade rows / achievements from `prize_structure.ranks[].badge_id` + metadata `{ tournament_name, date, rank }` (idempotent upsert on `(user_id, tournament_id, rank)`).
- [x] **API:** `GET /api/auth/me/accolades` or public profile subset.
- [x] **UI — Trophy Case / Trophy Room** on player profile:
  - **Gold (1st):** strong glow + animated **shine** (CSS or Lottie).
  - **Silver (2nd):** sleek chrome aesthetic.
  - **Badges as assets:** UUID or slug → SVG library; optional **Lottie** on award / inspect.
  - **Hover / inspect:** “Path to victory” — teams beaten, finals opponent (from `metadata`).
- [x] **Tie-in:** player hub / profile surfaces — trophy case in `PlayerHubHome.jsx` (accolades API); extend `PlayerProfile` routes if you split public vs private.

---

## Phase 5b — Admin UI: Prize Builder (tournament creation)

- [x] Integrate into **`TournamentCreate`** (and tournament edit, if supported) so **prize definition is part of the same flow** as format, dates, and entry fee — not a hidden admin-only screen after the fact.
- [x] **Preview as players see it:** inline mock of **discovery card line** + **detail section** so admins verify disclosure before save/publish.
- [x] Dynamic **“Add rank”** rows: rank label, amount **or** % (based on `type`), badge selector (from curated list / registry table).
- [x] Toggle **Fixed vs Percentage** (and optional **Guaranteed** copy for liability warning).
- [x] Live preview: estimated payouts if N teams register (read-only estimate).

```jsx
<div className="space-y-4 p-6 rounded-[2rem] bg-white/5 border border-white/10">
  <h3 className="text-sm font-black uppercase italic text-primary">Prize Allocation</h3>

  <div className="space-y-2">
    {prizeRanks.map((r, i) => (
      <div key={i} className="flex gap-3 items-center bg-black/40 p-3 rounded-xl">
        <span className="font-black italic text-slate-500 w-8">{i + 1}ST</span>
        <Input placeholder="Amount" type="number" className="bg-transparent border-white/10" />
        <Select defaultValue="gold_badge">
          <SelectTrigger className="w-40 bg-transparent border-white/10">Badge</SelectTrigger>
        </Select>
      </div>
    ))}
    <Button variant="ghost" onClick={addRank} className="text-[10px] font-black uppercase italic text-slate-500 hover:text-white">
      + Add Payout Rank
    </Button>
  </div>
</div>
```

---

## Phase 5c — Discovery & tournament detail (player-facing)

Implements **Prize Distribution Model §5** in the product shell players actually use.

- [x] **Shared formatter:** `formatPrizeForCard(tournament)` / `formatPrizeForDetail(tournament)` (or consume API `prize_summary`) — one source of truth for list vs detail.
- [x] **Discovery list/grid:** badge or subline for prize; respect mobile truncation with “tap for details”.
- [x] **Tournament detail:** expandable or always-visible **Prize pool & placements** block; optional tie-in to `Tournament.jsonc` / entity schema for codegen if used.
- [x] **Accessibility:** don’t rely on color alone for “gold/silver” prize tiers; include text labels.

---

## Phase 6 — Admin dispute resolution

- [x] **Tenant admin UI:** queue of disputed matches; pick winner or enter authoritative score.
- [x] **API:** `PATCH /api/matches/:id/resolve-dispute` — sets final scores, clears dispute, emits `MATCH_COMPLETED` if appropriate.
- [x] **Notifications:** alert tenant admins on dispute (email/in-app/FCM — pick minimum viable).

---

## Phase 7 — QA & compliance checklist

- [x] **RLS:** all new routes respect tenant boundaries (`tenant_id` on tournament/match).
- [x] **Replay attacks:** finalize + worker jobs cannot double-pay (unique constraints + idempotency).
- [x] **AML / tax:** prizes land in **internal wallet** only; outbound remains **withdrawal** flow (already aligned with `withdrawal_requests` / AML fields).
- [x] **KYC / reporting threshold (example):** cumulative completed **`prize_payout`** per currency on ledger (**`beneficiary_user_id`**): **USD** vs **`PRIZE_KYC_THRESHOLD_USD`** (default **600**, set **`0`** to disable); **NGN** vs **`PRIZE_KYC_THRESHOLD_NGN`** (default **₦1,000,000** when unset, **`0`** to disable). Other currencies / FX conversion are out of scope until product defines rates. `GET /api/auth/me/prize-payout-kyc` returns `ytd_prize_payout_usd`, `ytd_prize_payout_ngn`, `threshold_ngn`, `withdrawal_kyc_required`. **`POST /api/auth/me/withdrawal-request`** and matching **CRUD** paths call **`assertPrizeWithdrawalKycAllowed`**. Staff clears gate via **`users.kyc_cleared`**.
- [x] **Load / idempotency stress:** `server/scripts/payout-ledger-idempotency-stress.js` (npm `stress:payout-ledger`) hammers concurrent `payment_ledger` inserts with the same `reference`; expects one `RETURNING` per round. Use **`DATABASE_ADMIN_URL`** or DB owner if RLS blocks `arena_app`. Health-only load remains `server/scripts/concurrent-health-load.js`.
- [x] **Docs:** update operator runbook (how to retry failed payout job, how to interpret audit logs).

---

## Summary table (developer quick reference)

| Feature | Requirement | Suggestion |
| :--- | :--- | :--- |
| **Prize type** | Fixed **or** % of net entry pot | Default **fixed** for high-tier pro leagues; **percentage** for scalable amateur events. |
| **Internal wallet** | Decimal-safe money | **Never float** — `NUMERIC(12,2)` in DB; integers (cents) or decimal lib in app code. |
| **Badges** | Stable id → visual asset | UUID/slug map to SVG library; **Lottie** for premium award/inspect moments. |
| **Tax / KYC** | Auditable ledger + compliance gates | Block or flag **withdrawal** when winnings exceed policy threshold (e.g. $600 US example); ledger row per `prize_payout`. |

---

## Quick reference — suggested new/updated endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/match-engine/matches/:matchId/report-result` | Player/captain dual submission |
| `GET` | `/api/match-engine/matches/:matchId/reports` | Submissions + status |
| `PATCH` | `/api/match-engine/matches/:matchId/resolve-dispute` | Admin authoritative resolution |
| `POST` | `/api/match-engine/tournaments/:id/finalize` | Body optional `{ "finalize_override": true }` (platform **admin** / **super_admin** only) |
| `GET` | `/api/match-engine/tournaments/:id/finalize-status` | Job / integrity status |

*(Existing `GET` list/filter and `GET` tournament by id should **include** `prize_structure` / `prize_summary` for discovery + detail — no separate endpoint required unless you split public vs admin fields.)*

---

## UI snippet (directive reference)

Place in Match Lobby when status allows reporting; wire to Phase 1 API and upload handling:

```jsx
<div className="p-8 rounded-[2rem] bg-white/5 border border-primary/20 backdrop-blur-xl">
  <h2 className="text-xl font-black uppercase italic text-primary mb-4">Submit Intelligence</h2>
  {/* score inputs, upload, POV, submit — see Phase 1 */}
</div>
```

---

*Last updated: 2026-03 — implementation tracked vs repo; operator runbook added; API paths corrected to `/api/match-engine/…`.*
