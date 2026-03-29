# Hybrid Monetization & Registration — Implementation Spec

This document defines **Hybrid Payment & Registration** logic: tenant admins configure paid vs. free entry; players join via **Internal Wallet** or **Instant Checkout** (Stripe / Paystack / Flutterwave), with **SQL transaction** guarantees and UI patterns.

---

## 1. Tenant Admin: Tournament Creation Schema

### 1.1 Entity fields (`Tournament`)

| Field | Type | Rules |
|-------|------|--------|
| `entry_type` | Enum | `FREE` \| `PAID` |
| `entry_fee` | Decimal / Numeric | Required when `entry_type === 'PAID'`; must be `0` or ignored when `FREE` |
| `currency` | String (ISO) | Default from **tenant** context (e.g. wallet / `tenant_configs` / region → `USD`, `NGN`, …) |
| `payout_config` | JSON object | Split intent: **% (or fixed)** to **prize pool** vs **tenant profit**; stored server-side; never trust client-only breakdown for settlements |

### 1.2 Creation wizard — “Financial Configuration” step

- Collect `entry_type`, conditional `entry_fee`, inherit or override `currency`, and structured `payout_config` (validated server-side).
- **Validation:** Reject create/update if `PAID` and `entry_fee` is missing or ≤ 0 (unless product allows zero with gateway—default: require positive fee).
- Persist all fields in one API call; RLS must scope writes to the organizer’s tenant.

### 1.3 Admin UI pattern (reference)

Use a distinct **Financial Protocol** block (gamer aesthetic: glass / border / uppercase micro-labels):

- Toggle **FREE ENTRY** vs **PAID ENTRY**.
- If `PAID`, show numeric input for amount, currency display or selector bound to tenant default.

---

## 2. Player: Registration Entry Point & Pre-Flight

**Trigger:** User clicks **Join Tournament** (from discovery, tournament page, or modal entry).

### 2.1 Pre-flight (all types)

1. Resolve `tournament_id` server-side.
2. Load authoritative row: `entry_type`, `entry_fee`, `currency`, `status`, caps, deadlines.
3. Eligibility: linked user/team IDs, roster size vs game template, duplicate registration, tenant status if applicable.

### 2.2 Branch: `FREE`

1. Run eligibility checks.
2. In a **single DB transaction** (see §3): create **participant** (or team registration) and bump **`registered_teams` / `joined_count`** (whatever the schema uses) consistently.
3. Redirect client to **Match Lobby** (or tournament lobby) on success.

### 2.3 Branch: `PAID` — Payment Selection Overlay

Show overlay **only after** pre-flight passes (except balance/gateway, which are path-specific).

#### Path A — Internal Wallet (preferred)

1. **Server check:** `user_wallet.balance >= tournament.entry_fee` (same `currency`; convert only if product explicitly supports multi-currency wallet).
2. **On success (inside transaction §3):**
   - Debit `UserWallet` (row-level lock / `SELECT … FOR UPDATE`).
   - Insert **ledger** row: type `DEBIT`, category `TOURNAMENT_ENTRY`, amount, `tournament_id`, `user_id`, idempotency key.
   - Confirm participant + count increment.
3. **Fail:** Insufficient funds → message **Insufficient funds** + CTA **Fund wallet**.

#### Path B — Instant payment (Stripe / Paystack / Flutterwave)

1. **Server:** Create checkout session / payment intent with amount from **DB `entry_fee`**, not client body (see §5).
2. Client completes hosted checkout or embedded flow.
3. **Webhook:** On `payment_intent.succeeded` (or provider equivalent), in a transaction:
   - Verify signature, idempotency, amount, currency, metadata `tournament_id` + `user_id` (or team).
   - Create **participant** + increment count.
   - Insert **payment ledger** / audit row for reconciliation.

**Async note:** If participant cannot be created in webhook, retry with idempotency; never double-increment counts.

---

## 3. Database & Transaction Integrity

**Goal:** No **ghost registrations** (joined without paying) and no **lost payments** (paid without participant).

### 3.1 Atomic pattern (strict)

All of the following in **one** SQL transaction:

1. `BEGIN`.
2. Lock tournament row (`FOR UPDATE`) or use versioning to prevent over-capacity race.
3. **Paid + wallet:** verify balance, debit wallet, insert wallet ledger.
4. **Paid + instant:** webhook path creates participant only after confirmed payment (or use `pending` registration row + finalize in webhook).
5. Insert / update **participant** record (status `registered` or equivalent).
6. Increment **`registered_teams` / `joined_count`** (or derive from count query if schema prefers).
7. `COMMIT`. On any error, **`ROLLBACK`**.

### 3.2 Ordering guidance

- **Do not** trust “create participant first, pay later” without a **`pending_payment`** state and a cleanup job.
- Recommended: for wallet path, **debit + participant + increment** in one transaction.
- For card path: **payment record → webhook → participant + increment** with idempotency constraints (`UNIQUE (tournament_id, user_id)` or payment intent ID).

---

## 4. UI/UX — Gamer Aesthetic

### 4.1 Tenant admin — Financial Protocol block

- Container: `rounded-2xl`, low-opacity background, thin border.
- **FREE / PAID** as clear primary actions (button group).
- Paid: large height inputs, italic bold numerals, subtle border.

### 4.2 Player — Join modal / overlay

- Top strip: **Entry fee required** + amount (formatted with `currency`).
- **Primary card:** Pay from **Internal Wallet** — show micro-label, balance, hover border accent.
- **Secondary CTA:** **Instant checkout** (card/bank) — high-contrast primary button.
- Loading: disable primary actions and show spinner immediately on submit (**double-spend / double-click** prevention).

---

## 5. Security Checklist

| Item | Requirement |
|------|-------------|
| Double-submit | Disable **Join** / **Pay** and show loader on first click; optional server idempotency key per attempt |
| Fee source of truth | Always read `entry_fee` / `currency` / `entry_type` from **database** by `tournament_id` in payment & join handlers |
| Webhooks | Verify provider signatures; idempotent processing |
| Refunds / cancel window | **No player self-service cancellation after registration** — once a team row exists, the organizer does not expose “leave tournament” in product. Abandoning the join modal or checkout **before** `POST …/join` succeeds is allowed (no registration created). Refunds for mistaken card charges are **out of band** (support / provider), not an automated “cancel registration” flow. |
| Authorization | Join and wallet debit must enforce authenticated user and tenant-scoped RLS |

---

## 6. Schema mapping & canonical participant model

| Concept | This repo |
|---------|-----------|
| **Participant / registration** | A row in **`teams`** with `tournament_id`, `status` (e.g. `registered`), `captain_email`, and **`roster`** JSONB (solo: one slot; team: captain resolved from account + teammate emails / game IDs). There is **no** separate `tournament_participants` table. |
| **Capacity / count** | **`tournaments.registered_teams`** is maintained from `COUNT(teams)` for that tournament (updated on join). |
| **Player wallet** | **`user_wallets`** — `(user_id, currency)` unique; balance in **major units**; join creates a row at **0** if missing when debiting. |
| **Organizer revenue wallet** | **`tenant_wallets`** — per `tenant_id`; credited on entry payment **net of platform share** (see §9). |
| **Payment audit** | **`payment_ledger`** — `type` includes `entry_fee`, `platform_fee`, etc.; gateway + internal wallet paths write here. |

---

## 7. Implementation Phases (recommended)

1. **Schema + migration:** `entry_type`, validate `entry_fee` / `currency`, `payout_config` JSON.
2. **API:** Tournament create/update validation; join endpoint refactor with transactions.
3. **Wallet path:** balance check + debit + ledger + participant in one tx.
4. **Gateway path:** session creation from DB fee + webhook participant creation.
5. **UI:** Wizard step + join overlay; **pre-submit cancel** in join modal; **no post-registration cancel** (policy locked in §8).
6. **Platform share on entry:** `platform_config.entry_platform_fee_percent` — separate **`payment_ledger`** row `type = platform_fee`; organizer **`tenant_wallets`** credit = gross entry − cut (same txn as join / webhook fulfillment).

---

## 8. Locked product decisions (this deployment)

| Topic | Decision |
|-------|----------|
| **Cancel after registration** | **Not supported.** Players cannot withdraw or “unregister” from a tournament via the product after `POST …/join` succeeds. They may **abandon** the flow before submit (close modal / cancel checkout). |
| **Currency mismatch (wallet vs tournament)** | **No FX.** Internal wallet debit requires a **`user_wallets` row in the tournament’s `currency`**; otherwise the API returns insufficient / missing wallet. Instant checkout amounts are resolved **from the tournament row** when `tournament_id` is supplied. |
| **Tax / platform fee on entry** | **Separate ledger line:** `entry_platform_fee_percent` (default **5%** in seed) applies to **gross** entry amount; organizer receives **net** on `tenant_wallets`; platform accrual in `payment_ledger` as `platform_fee`. Sales/VAT is **out of scope** until a tax provider is integrated. |
| **Who pays (team events)** | **Captain** — wallet path requires authenticated user email to match `captain_email`; gateway verification matches payer to captain. Teammates do not split entry fee in-app. |

---

## 9. Implementation status (repo)

| Area | Status |
|------|--------|
| Schema | `tournaments.entry_type` (`FREE` \| `PAID`), `payout_config` JSONB; `user_wallets`; `payment_ledger` |
| Organizer UI | Tournament wizard **Financial protocol** step (free/paid, fee, split %) |
| Join API | `POST /api/tournaments/:id/join` — atomic `FOR UPDATE` tournament; PAID **wallet**: debit `user_wallets` + `entry_fee` ledger + **net** `tenant_wallets` + optional `platform_fee`; PAID **gateway**: `payment_proof` matches prior `entry_fee` ledger (verify endpoint / webhooks) |
| Stripe / Paystack / Flutterwave | **`tournament_id` path:** amount/currency from **DB** (Paystack & Flutterwave `/initialize` mirror Stripe hardening). |
| Platform fee | **`entryPlatformFeeSplit.js`** — used from **`checkoutFulfillment`** (webhooks / verify) and **`tournamentJoinRoutes`** (wallet join). |
| Player UI | Join modal: wallet vs instant; pre-submit **Cancel registration**; success copy states **no self-service cancel after join** |
| Dev seed | Test player **$250 USD** wallet; demo players + organizer get **0 USD** wallet rows |

*Last updated: platform fee split + policy doc + participant model.*
