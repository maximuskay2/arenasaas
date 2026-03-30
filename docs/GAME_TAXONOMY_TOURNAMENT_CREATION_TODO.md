# Game Taxonomy (Platform → Genre → Title) + Tournament Creation — TODO

Goal: During tournament creation, an organizer/admin can select (or create) the **Platform → Genre → Game Title** so the platform supports both seeded mainstream games and niche/custom competitions.

---

## Requirements (Product)

### Three-tier taxonomy
- **Tier 1 — Platforms (hardware focus)**: Mobile, PC, Console (PlayStation/Xbox/Switch), VR, Handheld, Arcade
- **Tier 2 — Genres/Categories (logic focus)**:
  - Tactical FPS, MOBA, Battle Royale, Fighting (FGC), Sports Sim, Racing, Card/Strategy, Rhythm
  - Each genre stores **default roster size** (e.g., MOBA=5, Fighting=1)
- **Tier 3 — Game Titles (asset focus)**:
  - Stores concrete games (e.g., Valorant, MLBB)
  - Each title links to platform(s) + genre

### Smart seed list (foundational titles for 2026)
- **PC / Tactical FPS**: Valorant, CS2, Rainbow Six Siege
- **Mobile / MOBA**: MLBB, Honor of Kings, Wild Rift
- **PC/Console / Battle Royale**: Apex Legends, Fortnite, Warzone
- **Console / Fighting**: Tekken 8, SF6, Mortal Kombat 1
- **Console / Sports Sim**: EA FC 26, NBA 2K26, Rocket League
- **Mobile / Shooter**: PUBG Mobile, Free Fire, CODM
- **PC / MOBA**: League of Legends, Dota 2

### Creator “Logic Ladder” (tournament wizard UX)
- **Step A — Platform select**
- **Step B — Genre select (filtered by platform)**
- **Step C — Title select (filtered by platform+genre)**
- **Step D — Auto-configuration** from title defaults, e.g.:
  - recommended format / scoring mode
  - team roster size
  - optional validation rules (e.g. require in-game ID)

### Universal override (“Other/Custom”)
- If a title is not present, organizer selects **Other/Custom**
- Requires manual fields:
  - Custom title name
  - Manually set roster size
  - Manually select scoring mode (points vs bracket win)
- **Super Admin alert**: every time a custom game is created, notify/flag the Super Admin dashboard for review/verification

---

## Database / Schema — TODO

- [x] **Create tables (or extend existing schema)**
  - [x] `game_platforms` (seeded)
  - [x] `game_genres` (seeded; includes `default_roster_size`)
  - [x] `game_titles` (seeded + custom; includes assets + defaults)
  - [x] (optional) `game_title_platforms` (if a title can exist on multiple platforms)
- [x] **Tournament linkage**
  - [x] Add `tournaments.game_title_id` (preferred) and/or store a stable `game_title_key`
  - [x] Ensure existing tournament flows remain backwards compatible (null allowed for legacy rows)
- [x] **Custom titles**
  - [x] Store `game_titles.source` = `seeded|custom`
  - [x] Store `game_titles.created_by_user_id`, `created_by_tenant_id` (for audit + admin review)
  - [x] Store `game_titles.verified_at`, `verified_by` (platform verification)
- [x] **RLS / auth**
  - [x] Public reads allowed for seeded+verified titles
  - [x] Custom titles visible at least to the creating tenant (policy decision)
  - [x] Only platform admins can “verify” and promote to global availability

---

## Seed / Migration — TODO

- [x] **Seed migration** to populate:
  - [x] Platforms list
  - [x] Genres list + default roster sizes
  - [x] Foundational titles list
- [x] **Idempotency**: seeds should be re-runnable without duplicates (unique keys + upserts)

---

## Assets / Media — TODO

- [x] **Asset mapping**: every `game_titles` row should have:
  - [x] `banner_url` (high quality)
  - [x] `icon_url`
  - [x] fallback: if missing, use Genre icon
- [ ] Decide storage location for assets (and who can upload/curate them) — *URLs only in DB; upload pipeline TBD*

---

## Defaults / Inheritance — TODO

- [x] Implement `getGameDefaults(title_id)` utility:
  - returns recommended:
    - scoring mode (points vs bracket win)
    - roster size
    - suggested tournament format (single elim / league / BR points)
    - optional validation flags (require IGN / character ID, etc.)
- [x] Ensure the tournament wizard auto-fills from these defaults (but allows manual overrides)

---

## Tournament Create Wizard (UI/UX) — TODO

- [x] Add “Game” step (or upgrade existing game selection) to follow the **Logic Ladder**
  - [x] Platform dropdown (searchable)
  - [x] Genre dropdown filtered by platform (searchable)
  - [x] Title dropdown filtered by platform+genre (searchable + fuzzy search)
  - [x] “Other/Custom” path
- [x] Auto-populate:
  - [x] roster size
  - [x] format/scoring mode
  - [x] any validation requirements
- [x] Ensure saved tournament persists the selected title reference (ID/key)

---

## “Other/Custom” Protocol (UI + API) — TODO

- [x] UI: custom title form fields (name, roster size, scoring mode)
- [x] API: create custom `game_title` (scoped + auditable)
- [x] Flag for Super Admin review:
  - [x] Add an admin dashboard card/table for “Unverified custom games”
  - [x] Add ability to verify/promote and optionally attach assets

---

## Search / Performance — TODO

- [x] Use searchable selects with fuzzy search for large title catalogs *(client filter + `q` API param on titles)*
- [x] Add indexes for:
  - [x] `game_titles.name`
  - [x] `(platform_id, genre_id)` filters (or join table indexes)

---

## Acceptance Criteria — TODO

- [x] Organizer can create tournament and choose:
  - [x] platform → genre → title (seeded)
  - [x] or “Other/Custom” and fill required manual fields
- [x] Selecting a seeded title auto-configures roster size + scoring defaults
- [x] Guest/players see consistent game title on tournament pages *(via `game_title` + optional `game_title_id` linkage)*
- [x] Super Admin can see newly created custom titles and verify/promote them

---

## API summary (implementation)

- Public (optional auth for tenant-scoped custom visibility):  
  `GET /api/public/game-taxonomy/platforms`, `/genres`, `/titles`, `/defaults/:titleId`
- Authenticated:  
  `POST /api/v1/game-taxonomy/custom-titles`
- Platform admin:  
  `GET /api/system/custom-game-titles`, `PATCH /api/system/custom-game-titles/:id/verify`

Server helper: `server/src/lib/getGameDefaults.js` (`queryGameDefaultsById`, `mapGameDefaultsRow`).
