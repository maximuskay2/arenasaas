# Transaction Layer — Implementation TODO

This phase is the **Transaction Layer**: the platform facilitates competition end-to-end—discovery, creation, registration, payments, and match play. Use this checklist to track work; link PRs and ADRs as you go.

### Shipped in repo (baseline + extensions)

- **Discovery:** `GET /api/public/tournaments-catalog` and alias **`GET /api/public/tournaments`** (pagination, filters, in-memory TTL + **optional Redis** when `REDIS_URL` is set) + `/tournaments` marketplace UI. Catalog rows include **`roster_size`** (from `game_templates`). WebSocket `tournament:slots` invalidates catalog.
- **Join:** `POST /api/tournaments/:id/join` — single `runWithRls` transaction (no nested `BEGIN`), `FOR UPDATE`, **actual team `COUNT(*)`** for capacity, **`registered_teams` resynced** from count. **Idempotency:** `Idempotency-Key` header (or `idempotency_key` body) + `tournament_join_idempotency` table. **Paid:** verifies **`payment_ledger`** (`entry_fee`, `completed`, matching `reference`, amount, tenant, payer hint via `created_by` / `description`). **Solo / team** modes, **roster `game_id`** enforcement when roster size > 1. Post-commit: **`tournament:slots`**, FCM queue enqueue, in-app **`notifications`** (`tournament_registered`), join email **stub log**.
- **Routing:** Organizer list → `/league/tournaments`; `/discover` → `/tournaments`; `/tournaments/:id/lobby` player lobby.
- **Creator:** Wizard at `/tournaments/new` with **draft row after step 0**, **debounced PATCH autosave**, **banner file upload** via `/api/integrations/upload`.
- **Settings:** Payout rail copy + **platform entry fee %** from `platform_config`, **Stripe Connect** connection hint from `stripe_account_id`, **audit_logs** on **`payout_settings`** PATCH (`tenant_payout_settings_saved`).
- **Lobby:** Check-in window copy, **`match:updated`** subscription, team **eliminated / winner** copy, score CTA when applicable.
- **RLS:** `tr_sel` public directory read (re-apply via `npm run migrate --prefix server`).

### Still open (product / hardening)

- [ ] **Inline Stripe / Paystack / Flutterwave** PaymentIntent or charge **creation** inside the same HTTP handler as join (today: **ledger reference verification** after checkout or webhook writes the row).
- [ ] **Rank / region / ban** eligibility rules for join.
- [ ] **Production email** (SMTP/SendGrid) replacing stub logging.
- [x] **Server-driven Stripe Connect status** — `GET /api/payments/stripe-connect-status` (charges / payouts / onboarding flags; server-only Stripe API).

---

## Phase goals

- [x] **High-conversion Tournament Discovery** (`/tournaments` as global marketplace)
- [x] **Friction-free registration / join** (solo quick-join + team flow, idempotency)
- [x] **Creator wizard** for tenant admins (structured, no missed fields)
- [x] **Atomic join API** (SQL transaction + ledger verification when fee > 0)
- [x] **Match Lobby UI** (post–bracket-generation player experience)
- [x] **Payout settings** refined (platform fee visibility, audit, Connect copy)

---

## 1. Global discovery page (`/tournaments`)

### UI / UX

- [x] **Live status badges** — `getDiscoveryStatus` / pills (LIVE, REGISTERING, COMPLETED, …)
- [x] **Multi-tenant filters** — game, organizer, entry fee buckets
- [x] **Dynamic search** — debounced React Query + `arenaClient`
- [x] **Tournament cards** — prize, slots, Join CTA
- [x] **`getStatusColor` / styling** — `discoveryStatus.js` + card classes
- [x] **Join** — modal + auth gate

---

## 2. Tenant admin: tournament creator wizard

- [x] **Game selection** from `GameTemplate`
- [x] **Format / scheduling / prize & fees / branding**
- [x] **Draft autosave** — create draft after step 0, debounced PATCH
- [x] **Banner** — upload + URL
- [x] **Validation** per step; Finish creates/updates draft tournament

---

## 3. Player / team join flow

- [x] **Individual (1v1)** — `mode: solo` when `roster_size <= 1`
- [x] **Team** — captain + roster; **game IDs** per teammate when roster &gt; 1 (client + server)
- [x] **HWID ban** (optional `client_hwid` on join)
- [ ] **Rank / region** eligibility — rules TBD
- [x] **Paid entry** — ledger + `payment_proof` (reference + provider)
- [x] **FCM** enqueue on join (stub worker)
- [x] **Email** — structured stub / log path (`integrations` + server log)

---

## 4. Developer: join API & discovery (technical directive)

### Atomic join

- [x] Single transaction: `FOR UPDATE`, capacity from **team count**, insert team, sync `registered_teams`
- [x] **Payment** — verified against **`payment_ledger`** before insert when `entry_fee > 0`
- [x] **Idempotency** key
- [ ] **Same-request** card charge + join (provider-specific; use webhooks + ledger today)

### Discovery endpoint

- [x] **GET `/api/public/tournaments`** (alias) + catalog — pagination, filters
- [x] **Caching:** in-memory + optional **Redis**; invalidate on registration
- [x] **RLS** public catalog tournaments

### Real-time slots

- [x] **Socket.io** `tournament:slots` + discovery subscription

---

## 5. Match lobby UI (post–bracket generation)

- [x] **Route** `/tournaments/:id/lobby`
- [x] **Next match**, check-in window hint, bracket link
- [x] **`match:updated`** subscription
- [x] **Empty / eliminated / winner** states (team status + tournament completed)

---

## 6. Tenant admin: payout settings (Stripe / Paystack / Flutterwave)

- [x] **Settings UI** — rails, subaccount refs, **no secrets**
- [x] **Stripe Connect** — account id display + connection copy
- [x] **Platform fee** from `platform_config`
- [x] **Audit** — `audit_logs` on `payout_settings` save
- [x] **Live Connect status** from Stripe API (`stripe-connect-status` + Settings UI)

---

## Definition of done (phase)

- [x] Global `/tournaments` discovery is public, cached (memory + optional Redis), filterable
- [x] Wizard creates tournaments with scheduling + fees + banner + draft autosave
- [x] Join is transactional with **ledger-verified** payment when required; **idempotent**
- [x] Cards and lobby match design system; mobile-usable
- [x] Payout-related settings understandable per provider with no secret leakage

---

*Last updated: transaction layer — extended join, catalog, wizard, lobby, settings audit.*
