# Master implementation directive: multi-tenant esports competition platform (web + mobile)

**Project codename:** Arena-SaaS  
**Audience:** Lead engineer / architecture owner  
**Scope:** B2B SaaS for organizations (“tenants”) running esports competitions—public web presence, organizer tooling, player experience, and a mobile “second screen” for live engagement.

This document merges three inputs into one authoritative spec: **tenant isolation & white-label**, **mobile ecosystem (Flutter, push, deep links)**, **production roadmap (services, scaling, compliance)**, and **a unified “gamer-first” UI system** (design tokens, web + Flutter, realtime UX). It also encodes **mandatory correctness gates** (connection-pool RLS, check-in/forfeit races, payment escrow semantics) so production cannot regress on security or money.

---

## 1. Product principles

1. **SaaS provider, not a single site** — hundreds of tenants; **zero cross-tenant data leakage**.
2. **Tournament engine is UI-agnostic** — pure logic + state machine; clients (**React** web shell, **Flutter** mobile) are thin.
3. **No game logic in the core** — use a **Game Template** system (metadata: roster size, map pool, rules JSON, scoring mode).
4. **Web for discovery & SEO**; **mobile for urgency** (check-in, alerts, live bracket, LAN QR).
5. **Money moves only through compliant flows** — **Stripe Connect**, **Paystack**, and **Flutterwave** behind a single payments abstraction; **platform SaaS billing** (tenant subscriptions / one-shot hosting fees) is separate from **participant registration** revenue that credits each tenant’s **wallet**; provider-specific KYC/onboarding + audit trail.

---

## 2. System architecture (reference stack)

| Layer | Technology | Role |
|--------|------------|------|
| **Web** | **React 18+** + **Tailwind CSS** + **Framer Motion** (e.g. **Vite** bundle, **React Router** or **TanStack Router**) | SPA-first; **SEO** via prerender/SSR where needed (see **§13.3**), subdomain/host-based tenant routing, motion-heavy bracket and lobby UX |
| **Web data** | **TanStack Query** | Server state, caching, background refetch, stale-while-revalidate for brackets |
| **Mobile** | **Flutter** (recommended for 2026) | Native **60fps**-class UI for bracket animations and white-label themes |
| **E2E tests** | **Playwright** | Multi-tenant routing (multiple hosts/subdomains), critical flows |
| **API** | **NestJS** (Node/TS), service boundaries | Multi-tenant APIs, orchestration |
| **Hot paths (optional later)** | **Go** (or dedicated workers) | Heavy bracket math / batch operations if Node becomes a bottleneck |
| **DB** | **PostgreSQL + RLS** | Shared DB, strict `tenant_id` isolation |
| **Cache / coord.** | **Redis** | Sessions, standings, distributed locks, check-in TTL |
| **Jobs** | **BullMQ** (Node) or **SQS** | Bracket generation, emails, push fan-out |
| **Realtime** | **WebSockets** (e.g. Socket.io) | Live bracket, match rooms, optional **MQTT** for constrained clients |
| **Push** | **Firebase Cloud Messaging (FCM)** | Match-ready, check-in, forfeit warnings |
| **Payments** | **Stripe Connect**, **Paystack**, **Flutterwave** | Participant registration, **tenant wallet** credits, **withdrawals** (after Super Admin–configured fee), **SaaS subscription / one-shot hosting** checkout; facade + webhooks |
| **Media (phase)** | **Mux** or **AWS IVS** | Low-latency broadcasts / embeds |
| **Edge** | **Cloudflare Pages** / **Netlify** / **S3+CloudFront** / **Vercel** (static **React** build) | Global CDN for web assets; optional edge middleware for host-based tenant hints |
| **Compute** | **Docker + Kubernetes** | API/worker scale bursts |

**Internal comms:** HTTP/REST or **gRPC** between services where helpful; WebSockets stay at the edge/API gateway pattern.

---

## 3. Multi-tenancy (non-negotiable)

### 3.1 Data model & isolation

- Every domain table carries **`tenant_id`** (users/teams/matches/etc., including join tables as appropriate).
- Enforce isolation with **PostgreSQL Row-Level Security (RLS)**; policies compare row `tenant_id` to **`current_setting('app.tenant_id', true)::uuid`** (or equivalent). The app must set this with **`SET LOCAL`** inside each transaction (see **§3.1a**).
- Prefer **composite uniqueness** where it matters, e.g. **`(id, tenant_id)`** or unique constraints scoped by `tenant_id`, so IDs cannot collide across tenants in unsafe ways.

### 3.1a RLS and connection pools (non-negotiable)

**Risk:** With **PgBouncer / NestJS / any pool**, a **session-scoped** `SET app.tenant_id = …` on a reused connection **leaks tenant context** into the next request on that connection → critical data breach.

**Rule**

- **Never** use session-scoped `SET` for tenant context in a pooled environment.
- **Always** use **`SET LOCAL app.tenant_id = ?` inside an explicit database transaction.** `SET LOCAL` is scoped to the **current transaction only** and is cleared on **commit or rollback**, so the next checkout from the pool cannot inherit the value.

**Implementation pattern**

- Resolve `tenant_id` in middleware (subdomain / `X-Tenant-ID` / etc.), then run all ORM/queries for that request through a path that executes `SET LOCAL` at transaction start.
- For **short API handlers**, a single request-scoped transaction can wrap DB work and attach the scoped `EntityManager` (or query runner) to `req`.
- For handlers that call **slow external I/O**, **do not** hold one DB transaction open for the whole request—use a small helper **`withTenantTransaction(tenantId, fn)`** that opens a transaction, runs `SET LOCAL`, executes only the DB `fn`, commits—repeat per unit of work. Same pool-safety guarantee without pinning connections for seconds.

**RLS policy shape (example)**

```sql
CREATE POLICY tenant_isolation ON matches
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

(`SET LOCAL` must run in the same transaction as the queries the policy protects.)

**Sprint 0 adversarial test (required in CI)**

- Concurrent requests for **tenant A** and **tenant B** on a **small pool**; tenant A must **never** read tenant B’s rows. Example: flood `GET /matches` as A, then `GET /matches/{id}` for an id that exists only in B → expect **404** (or empty), **never 200** with B’s payload.
- **A 200 here is a security incident**—this test must run on every CI build and block merge on failure.

### 3.2 Tenant resolution (routing)

- **Middleware** resolves tenant from:
  - **Host/subdomain:** `{tenant}.platform.com`, or  
  - **Custom domain / CNAME**, or  
  - **Header fallback** for APIs/tools: `X-Tenant-ID` (only when host resolution is impossible—document abuse controls).
- Every authenticated request must end with a **single resolved `tenant_id`** used for RLS + authorization.

### 3.3 White-label (`tenant_configs`)

On app load (web shell + mobile), fetch **`tenant_configs`** JSON, including:

- Primary/secondary colors → **design tokens** only (see **§13**): **CSS custom properties** on web, **`ThemeData`** / token map on Flutter—**no hard-coded hex** in components.
- Logo + favicon URLs. **Default placeholder:** `https://mails.bybata.com/logomail.png` (navbar, splash, **loading skeletons** until config loads).
- Custom domain mapping and display name.

**Mobile tenant context:** support **invite code**, **league QR**, or deep link host → fetch branding and **re-skin** without a separate app binary.

---

## 4. Domain model, auth, and RBAC

### 4.1 Users and membership

- **Global user** can belong to **many tenants** via **`user_tenants`** (many-to-many) with **per-tenant role**.

### 4.2 Roles (baseline)

- **Platform Super Admin** — operates the **multi-tenant SaaS**: configures **global platform settings** (e.g. **withdrawal fee percentage** applied when **Tenant Admins** cash out wallet balances), subscription/one-shot **product pricing** hooks, cross-tenant support, compliance exports. **Not** scoped by `tenant_id` for platform actions; uses a separate **platform admin** auth realm with full audit.
- **Tenant Admin** — first user who **registers the organization** (or is invited as owner): completes **hosting plan** purchase (**§4.3**), manages **tenant wallet** and **withdrawal requests**, billing profile, white-label config, and delegates staff. Subject to **RLS** as that tenant’s admin.
- **Tournament Organizer** — creates/manages tournaments **within** entitlement limits (often same person as Tenant Admin).
- **Referee** (scores, disputes)
- **Caster** (stream keys / broadcast hooks)
- **Player / Team Captain** (roster, registrations)

### 4.3 Tenant onboarding, hosting plans, and entitlements

**Target workflow**

1. **Tenant Admin** creates an account and **registers a new tenant** (organization).
2. **Plan selection** (checkout before full hosting unlock):
   - **Monthly subscription** — recurring fee to host **unlimited** tournaments while the subscription is **active** (past_due / canceled states gate creation per your billing rules).
   - **One-time hosting fee** — single payment to host **exactly one** tournament (one active or “slot consumed” entitlement; no further tournament creation until they upgrade to monthly or purchase another one-shot slot if you offer multiples as SKUs later).
3. After successful payment, **entitlements** update in Postgres; **create tournament** APIs **must** verify entitlement **before** persisting a new tournament row.

**Enforcement**

- Store **`tenant_entitlements`** (or columns on `tenants`): e.g. `hosting_plan` (`monthly_unlimited` | `single_tournament`), `subscription_status`, `subscription_period_end`, `single_tournament_remaining` (0 or 1), `subscription_provider_ref`.
- **`POST /tournaments` (and equivalents):** transactional check — if `monthly_unlimited` and subscription not active → **402/403** with clear UX; if `single_tournament` and `single_tournament_remaining < 1` → reject.
- **Idempotent webhooks** from payment providers update entitlements (same pattern as **`payment_ledger`**).

**UI**

- React **Tenant Admin** onboarding wizard: account → org details → **choose plan** → payment → dashboard.
- Show **current plan**, renewal date, and **tournaments used / allowed** for one-shot plans.

### 4.4 Tenant-aware auth (Sprint 0)

- Login/register flows bind the session to **org context** after tenant resolution.
- **Web:** JWT short-lived + refresh; prefer **HTTP-only cookies** for web where feasible.
- **Mobile + web same identity:** **same JWT contract** (issuer, claims include `sub`, tenant scope / membership) so users switch devices seamlessly.

---

## 5. Tournament engine (“stateless brain”)

### 5.1 Responsibilities

- Bracket **generation** (async, heavy).
- Match **state machine** and **progression rules**.
- **Idempotent** score ingestion and **optimistic locking** on all transitions that can race (scores, check-in, forfeit, bracket advance). Every hot row (e.g. `matches`) carries a **`version`** (integer, incremented only on successful `UPDATE`).

### 5.2 Formats

Implement generators for:

- Single elimination  
- Double elimination  
- Round robin (groups)  
- Swiss  

Seeding: manual, by rank, random.

### 5.3 Match state machine (example)

Use an explicit state machine (e.g. **XState** in TS, or equivalent). Include an explicit **check-in window** state so check-in and forfeit compete on one predicate:

`Pending → Check_In_Open → Checked_In → In_Progress → Under_Dispute → Completed`  
(aliases like `check_in_open` / `CHECK_IN_OPEN` must match the DB `status` value used in locking `WHERE` clauses; extend with `Forfeited`, `No_Show` as needed.)

### 5.4 Check-in, forfeit, and races (non-negotiable)

**Risk:** At **T=0** a player checks in; at **T=1** the forfeit worker runs. Both read `status = check_in_open`, `version = N`, and both write → **double transition** or wrong terminal state.

**Single write pattern (check-in handler and forfeit worker both use this)**

- One **`UPDATE`** that moves from the expected state and bumps `version` only if `version` and `status` still match:

```sql
UPDATE matches
SET    status = $new_status,
       version = version + 1,
       updated_at = now()
WHERE  id = $match_id
  AND  version = $expected_version
  AND  status = 'check_in_open'  -- or your canonical enum value
  AND  tenant_id = $tenant_id;    -- belt-and-suspenders beside RLS
```

- **`rowsAffected === 0`** → another writer won; treat as **idempotent no-op** or re-read and branch—**never** assume success.

**Forfeit job idempotency**

- Job payload includes **`idempotency_key`** (e.g. `match_id:round:forfeit`).
- Before running the `UPDATE`, insert or check **`processed_forfeit_jobs`** (unique on `idempotency_key`). If already processed, **ack and exit**—safe under BullMQ/SQS **at-least-once** delivery.

**Redis TTL** still schedules the job; **Postgres** is the source of truth for who won the race.

**WebSocket** presence is non-authoritative.

**Required test**

- Concurrent `checkIn(matchId)` and `triggerForfeit(matchId, expectedVersion)` → final row has **exactly one** successor state (`checked_in` or `forfeited`), **`version` incremented exactly once** from the starting value (e.g. `1 → 2`). No double bump.

**Required test (forfeit worker)**

- Deliver the **same** forfeit job payload **5×** → match row updated **at most once**; subsequent deliveries no-op via `processed_forfeit_jobs` (or equivalent).

### 5.5 Async bracket generation

- **Never** generate large brackets (e.g. 1024 players) on the request thread.
- Queue job (**BullMQ/SQS**); worker persists structure; notify via WebSocket when ready.

---

## 6. Game integration & integrity

### 6.1 Identity linking (anti-smurf)

- **OAuth2** for **Steam, Riot ID, Discord**; linking required (configurable per tournament) before join.

### 6.2 Score ingestion (adapter pattern)

- **Tier 1 — Automatic:** webhooks from Riot/Valve/etc. → verify signatures → normalize to internal “match result” events.
- **Tier 2 — Manual:** screenshot/CSV upload → **referee** approve/reject → audit entry.

### 6.3 Mobile signals (high-stakes)

- **Device attestation / fingerprinting** policy: document legally; limit to **fraud prevention** (TOU). Use platform-supported APIs; avoid brittle HWID-only bans as sole authority.
- **Biometrics (Face ID / Touch ID)** as **UX gate** for sensitive in-app actions (e.g. confirming payout destination), not as crypto proof—pair with the active payment provider’s verification / account rules (Stripe, Paystack, or Flutterwave).

---

## 7. Real-time, chat, and notifications

### 7.1 WebSockets (web + mobile)

- **Socket.io** (or equivalent) rooms keyed by **`tenant_room`** + tournament/match channels.
- On persisted match update, push **partial bracket patch** to subscribers.
- Domain events such as **`match:ready`** (or `MATCH_READY`) drive the **match-ready takeover** UX on web and mobile—see **§13.5**.

### 7.2 Push notification worker (mandatory for mobile)

- **Do not** send FCM from request handlers at scale.
- Tournament engine emits domain events (`MATCH_READY`, `CHECK_IN_OPEN`, `FORFEIT_IMMINENT`) → **queue** → **Push worker** loads device **FCM tokens**, sends batches, handles failures/retries.

### 7.3 Mobile UX targets

- Push **~15 minutes** before match; **one-tap check-in** from notification/deep link.
- **Bracket UX** follows **§13.4**: mobile uses **round selector + vertical match cards** (not only a wide tree); optional zoomable detail where it aids clarity.
- **Digital player ID:** QR for LAN check-in.
- **Match-room chat** (players + refs); moderate per tenant rules.

### 7.4 Deep linking

- **Universal Links (iOS)** + **App Links (Android)** so `https://{tenant}.platform.com/match/{id}` opens the app when installed, web otherwise.

---

## 8. Financial & legal

### 8.1 Payment gateways (multi-provider) and escrow semantics

**Structural rule (most important):** The **tournament engine** calls **`paymentsService.releasePayout(tournamentId)`** (or equivalent) only for **prize / tournament-completion** payouts defined by the engine. It **never** branches on `stripe` vs `paystack` vs `flutterwave`. **Tenant wallet** credits, **SaaS subscription** checkout, and **Tenant Admin withdrawals** (**§8.2–8.3**) use the same facade family (`PaymentsService` / adapters) but **separate** orchestration modules—**never** embed provider switches in the bracket engine. All provider differences live inside **adapters**.

**Define the facade before adapters**

Implement a typed **`PaymentsAdapter`** (names may vary; behavior must not):

- `createIntent(params)` → provider checkout / authorization
- `capture(intentId)` / `refund(intentId, amount)` as needed
- **`releasePayout(tournamentId)`** — **critical:** maps “tournament completed, release escrow” to the correct provider API
- `onboardMerchant(tenantId)` → onboarding URL or state
- `verifyWebhook(payload, signature)` → boolean; handlers idempotent by provider event id

**Escrow semantic gap (must be explicit)**

| Provider | Escrow “hold” |
|----------|----------------|
| **Stripe Connect** | Native marketplace/hold patterns (e.g. destination charges, transfer groups)—use Stripe’s documented primitives. |
| **Paystack / Flutterwave** | **No** first-class equivalent to Connect’s hold in all cases; **application-level escrow is mandatory**: money may sit in the **platform’s** balance while **`payment_ledger`** (below) tracks **`held`** vs **`released`**. **`releasePayout`** performs the **transfer** (Paystack Transfer API, Flutterwave transfer/subaccount payout, etc.) when the tournament state allows it. |

**Ledger table (authoritative for reconciliation and non-Stripe escrow)**

Ship a real schema (adjust names to your migrations); conceptually:

```sql
CREATE TABLE payment_ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  tournament_id    uuid NOT NULL,
  provider         text NOT NULL CHECK (provider IN ('stripe','paystack','flutterwave')),
  provider_ref     text NOT NULL,
  idempotency_key  text UNIQUE NOT NULL,
  amount_minor     bigint NOT NULL,
  currency         char(3) NOT NULL,
  status           text NOT NULL,  -- collected | held | released | refunded | failed
  escrow_held_at   timestamptz,
  released_at      timestamptz,
  created_at       timestamptz DEFAULT now()
);
```

- Amounts **always** in **minor units**; one row per logical movement where helpful; webhook handlers **upsert** by `idempotency_key` / provider ref.

**Adapter behavior sketch**

- **StripeAdapter `releasePayout`:** use Connect **transfers** / transfer groups tied to `tournamentId`, per Stripe docs.
- **PaystackAdapter `releasePayout`:** initiate **Transfer** from **platform balance** to tenant **recipient code** (or split flow you validated)—`provider_ref` = transfer code.
- **FlutterwaveAdapter `releasePayout`:** same idea—transfer or subaccount payout; reconcile to `payment_ledger`.

**Legal gate (before payment code ships)**

- Obtain **written legal confirmation** that **holding** collected entry fees on the **platform** Paystack/Flutterwave balance (vs immediate disbursement to organizers) is **permitted** under **each provider’s ToS** and in **each jurisdiction** you operate. Stripe Connect’s model is explicit; **Paystack and Flutterwave may restrict hold duration or commingling**—this determines whether the ledger + float model is viable; it is **not** an engineering-only decision.

**Routing / configuration**

- **Per-tenant or per-tournament:** `payment_provider` (`stripe` | `paystack` | `flutterwave`) plus currency and settlement rules.
- **Default strategy:** Stripe Connect where Connect fits; **Paystack** / **Flutterwave** for local rails (**NGN, GHS, KES, ZAR**, etc.).

**Provider-specific**

- **Stripe:** Connect onboarding / KYC before paid entry; application fees per Connect.
- **Paystack / Flutterwave:** verify **webhooks**; **split / subaccount / transfer** as designed; tenant verification before receiving settlements.
- Refunds, chargebacks, and failed transfers update tournament state **only** via audited payment events + ledger.

**Clients**

- **Web / React:** provider checkout (hosted page, Elements, or redirect) per docs—keep secrets server-side via NestJS.
- **Mobile (Flutter):** **Stripe** SDK where Stripe; **Paystack** / **Flutterwave** via supported plugins or **WebView + return URL**—secrets and capture **server-side**.

### 8.2 Tenant wallet, registration revenue, and SaaS hosting billing

**Two money lanes (do not conflate)**

| Lane | Who pays | Purpose |
|------|----------|---------|
| **SaaS hosting** | **Tenant Admin** | **Monthly subscription** (unlimited tournaments) or **one-time fee** (single tournament slot)—**platform** revenue; maps to products in Stripe/Paystack/Flutterwave. |
| **Tournament registration** | **Participants** | Entry fees for tournaments the tenant created; net amounts **credit the tenant’s wallet** (per your split rules below). |

**Tenant wallet (internal ledger + optional provider balance mirror)**

- Each tenant has a **`tenant_wallet`** (or equivalent): **`balance_minor`**, **`currency`**, **`tenant_id`**, timestamps.
- When a **participant** completes **registration payment** for a tournament, after provider capture and webhook confirmation:
  - Record rows in **`payment_ledger`** (or a dedicated **`tenant_wallet_ledger`**) with type **`registration_credit`**, `tournament_id`, `amount_minor`, `provider_ref`, idempotency.
  - **Credit** `tenant_wallet.balance_minor` in the **same** idempotent transaction as the ledger append.
- Optional: immediate **small platform rake** on registration (fixed or %) can be modeled as a **split line**—only the **tenant’s share** credits the wallet; the rest is **platform revenue** (separate ledger lines). If you start with **100% to tenant wallet** until withdrawal, document that; the **withdrawal fee** (below) still captures platform take at cash-out.

**SaaS checkout**

- **Tenant Admin** purchases **monthly** or **one-shot** hosting via the same **`PaymentsAdapter`** or a sibling **`BillingAdapter`**; webhooks set **`tenant_entitlements`** (**§4.3**).

### 8.3 Withdrawals, Super Admin fee, and payouts to Tenant Admin

**Model**

- **Tenant Admin** requests a **withdrawal** from **`tenant_wallet`** to their **connected** payout destination (same Connect/recipient setup as today’s organizer onboarding).
- **Platform Super Admin** defines a **withdrawal fee** expressed as **`withdrawal_fee_percent`** (and optionally a **fixed minor fee**) in **`platform_settings`** (single row or versioned config table)—**not** per tenant unless you extend later.

**Execution (server-side only)**

1. Validate **KYC/payout method** is active for that tenant.
2. Compute **`gross`** = requested amount (≤ available balance); **`platform_fee`** = floor/round per currency rules from **`withdrawal_fee_percent`**; **`net_to_tenant`** = **`gross − platform_fee`** (and minus fixed fee if any).
3. **Debit** `tenant_wallet` and append **ledger** lines: **`withdrawal_debit`**, **`platform_fee`**, with **`idempotency_key`** per withdrawal request.
4. Initiate **provider transfer** of **`net_to_tenant`** to the tenant’s bank/recipient via **`PaymentsAdapter`** (reuse transfer APIs from **§8.1**). **`platform_fee`** remains on the **platform** side of the provider account (or internal platform ledger).
5. **Audit:** `tenant_admin_id`, amounts, applied **`withdrawal_fee_percent`** snapshot, provider refs.

**Rules**

- **Tenant Admins** cannot change **`withdrawal_fee_percent`**; only **Platform Super Admin** (with audit).
- Refund/chargeback flows on **registration** payments may require **wallet clawback**—design ledger entries as **adjustments** with dispute state.

### 8.4 Audit log

- Append-only **audit** for admin/ref actions, e.g.  
  `[timestamp] admin_id=X tenant_id=T changed match_id=M score 0–1 → 1–1 reason=…`
- Log **Platform Super Admin** changes to **`withdrawal_fee_percent`** / pricing and **Tenant Admin** **withdrawal** requests with fee breakdown.

### 8.5 Compliance hooks

- **GDPR/COPPA:** age gating, parental flows where required, deletion/export.
- **Tax / reporting:** **Stripe Tax** where Stripe is used; local **VAT/WHT** and settlement reporting for **Paystack** / **Flutterwave** jurisdictions—validate with counsel; unify reporting in the platform admin where possible.
- **Rate limiting:** per-tenant and per-IP; idempotency keys on score/report endpoints.

---

## 9. Service decomposition (target shape)

Loosely coupled services (monorepo OK initially, boundaries clear):

1. **Auth / tenants** — identity, memberships, tenant resolution  
2. **Tournament engine** — brackets, progression, check-in TTL orchestration  
3. **Integrations** — OAuth, game webhooks, adapters  
4. **Payments & billing** — `PaymentsAdapter` facade, **`payment_ledger`**, **`tenant_wallet`** / **`tenant_wallet_ledger`**, **SaaS plan** checkout webhooks, **withdrawal** + **`platform_settings.withdrawal_fee_percent`**; Stripe + Paystack + Flutterwave; **legal sign-off** on non-Stripe float/hold before launch  
5. **Notifications** — email, Discord bot, **FCM** worker  
6. **Media** — streams, VOD hooks (phase 2+)  

**Platform admin:** internal console (SSO) for **Platform Super Admin**: **`withdrawal_fee_percent`** (and optional fixed fee), SaaS product/price references, cross-tenant read, **impersonation** (audited), break-glass for corrupt bracket state.

---

## 10. Infrastructure & delivery

- **Local:** Docker Compose mirroring Redis, Postgres, workers, mock FCM.
- **CI/CD:** GitHub Actions / GitLab CI — test, lint, migrate, deploy.
- **Observability:** metrics (e.g. Prometheus/Grafana or Datadog), structured logs **with `tenant_id`**, tracing on critical paths.
- **DB scaling path:** start RLS; later **read replicas**; optionally **Citus** or **DB-per-tenant** for premium isolation.

---

## 11. MVP scope (merged)

| Pillar | Must ship |
|--------|-----------|
| **Tenancy** | RLS + **`SET LOCAL`** per transaction (no session `SET` under pool) + subdomain/CNAME + `tenant_configs` |
| **Security CI** | Adversarial **cross-tenant pool test** on every build (§3.1a) |
| **Auth** | Global user + `user_tenants` + JWT parity web/mobile; **Tenant Admin** signup + **Platform Super Admin** realm |
| **Commercial** | **§4.3:** monthly vs **one-shot** hosting entitlements; enforce before **create tournament** |
| **Wallet** | **§8.2–8.3:** registration → **tenant wallet** credit; **withdrawal** with Super Admin **fee %** + audit |
| **Engine** | Single elim + **`matches.version`** optimistic locking + idempotent scores + async generation job |
| **Realtime** | WebSocket bracket updates + room model |
| **Check-in** | Redis TTL + forfeit worker + **`processed_forfeit_jobs`** + concurrent + replay tests (§5.4) |
| **Mobile** | Flutter auth, FCM pipeline, deep links, zoomable bracket v1 |
| **Money (phased)** | **`PaymentsAdapter`** + **`payment_ledger`** + wallet tables; **SaaS + registration** + **withdrawals**; Stripe Connect; Paystack/Flutterwave with **app-level escrow** + **legal** OK on holding float; webhooks |
| **Integrity** | Audit log + manual evidence path |
| **Engagement** | Discord bot (optional but in MVP table from roadmap—schedule post–first paid event if scope tight) |
| **UI / UX** | **§13:** token-driven theming, glass-gamer surfaces, **dual-view bracket** (desktop pan/zoom + mobile round list), **match-ready** + **optimistic score** flows, **Playwright** multi-host E2E |

---

## 12. Phased plan (practical)

### 12.1 Production foundation gates (strict order)

Do **not** start the next gate until the current one has **passing tests** on `main` (or your release branch). These four gates close the gap between “features exist” and **production-safe** tenancy, concurrency, and money.

| Gate | Deliverable | Block merge if |
|------|-------------|----------------|
| **G1 — RLS + pool** | `SET LOCAL app.tenant_id` inside transactions only; adversarial cross-tenant test under pool pressure; **CI job required** | Test fails or session-scoped `SET` remains in code paths |
| **G2 — Check-in / forfeit** | `matches.version`; single `UPDATE … WHERE version AND status` pattern; concurrent check-in vs forfeit test; **`version` bumps exactly once** | Double transition or flaky races |
| **G3 — Payments** | `PaymentsAdapter` interface + `payment_ledger` migration; **legal sign-off** on Paystack/Flutterwave hold/float; **StripeAdapter** first; **PaystackAdapter** + sandbox **`releasePayout`** test; **FlutterwaveAdapter** + sandbox **`releasePayout`** when operating in Flutterwave corridors | Engine branches on provider; ledger missing; no legal clearance for float model |
| **G4 — Forfeit idempotency** | `processed_forfeit_jobs` (or equivalent); job `idempotency_key`; test: **same job delivered 5×** → **≤1** match update | Duplicate updates on replay |

After **G1–G4** are green, continue with product sprints below.

### 12.2 Sprint 0 (prove the pillars)

1. **Complete G1** before other tenancy-sensitive features.  
2. Tenant-aware auth (user ↔ org).  
3. **4-team single elim** in DB + advance winner via API + WebSocket update (use optimistic locking where applicable).  
4. White-label: change color in DB → subdomain UI updates (web); mobile loads same config via invite/deeplink.  
5. **Notification pipeline:** Firebase project + queue-driven test “Match Ready” to device.  
6. **Complete G2 and G4** as soon as check-in/forfeit exists (may overlap Sprint 0 end / Phase 1 start).  
7. **Complete G3** before charging real money in any environment.

**Phase 1 — Foundation (weeks 1–4)**  
Organizer dashboard skeleton, engine v1, basic player portal—**assuming G1** is already enforced in the data layer.

**Phase 2 — Core (weeks 5–10)**  
Additional formats, chat, check-in polish, Discord notifications (if prioritized), roster mgmt.

**Phase 3 — Monetization & scale (weeks 11–14)**  
Payment gateways (**Stripe Connect**, **Paystack**, **Flutterwave**) with facade + verified webhooks; **tenant hosting plans**, **wallet**, **withdrawals** + **Super Admin** fee settings; custom domains, K8s workers for burst.

**Phase 4 — Compliance & polish (weeks 15–18)**  
Audit completeness, anti-abuse tuning, legal review, admin break-glass.

Effort expectation: **a large share of engineering** (~60%) on **tournament engine correctness**, **concurrency**, and **real-time consistency**.

---

## 13. User interface and experience (web + mobile)

**Intent:** The product must feel **purpose-built for competitors and fans**—fast, legible under pressure, and **white-label correct** on every tenant. Visual polish supports retention; it does not replace **§3** (RLS) or **§5** (locking).

### 13.1 Unified design token system

- **No raw hex in feature components.** All color, radius, spacing, and typography scales flow from **tokens** that default in code but are **overridden at runtime** from `tenant_config` (after fetch).
- **Web:** map tenant fields to **CSS custom properties** on **`:root`** (or a scoped wrapper per layout), e.g. `--color-primary`, `--color-surface`, `--font-display`.
- **Flutter:** map the same keys to `ThemeData` / `ColorScheme` / text styles in a **`TenantTheme`** builder.
- **Accessibility:** token-driven contrast checks for primary-on-surface (WCAG AA minimum for body; aim higher for critical CTAs).

### 13.2 “Glass-gamer” surface language (web primary; Flutter equivalent)

- **Glass cards:** `backdrop-filter: blur(16px)` with a **semi-transparent** overlay (e.g. **~10%** white or black depending on theme mode) for elevated surfaces (match cards, modals).
- **Active match accent:** subtle **glow** using tenant primary, e.g. `box-shadow: 0 0 20px var(--color-primary)` (or Flutter `BoxShadow` with primary at low alpha)—use for **in-progress** or **your next match** emphasis, not every node.
- **Motion:** use **Framer Motion** (web) and Flutter’s animation APIs for bracket transitions; keep durations short (**150–300ms**) so realtime updates feel instant, not flashy.

### 13.3 Multi-tenant theme injection (React + Tailwind)

1. **Host resolution:** derive tenant from **`window.location.host`** (SPA) or from **reverse-proxy / CDN** headers (`Host`, optional `X-Tenant-Slug`) passed to the app bootstrap. **React Router** (or **TanStack Router**) loaders/guards should require a resolved tenant before protected routes render.
2. **Config fetch:** on app init (and on tenant switch), call the **NestJS** API (or BFF) for **`tenant_config`**; cache in **TanStack Query** with key **`['tenant', tenantId]`**.
3. **First paint / FOUC:** inject critical CSS variables as early as possible—e.g. a blocking inline `<style>` in **`index.html`** with defaults, then overwrite from the first successful **`tenant_config`** response; or use **optional SSR / prerender** (Vite SSR, **ReactDOMServer** shell, or prerender service) for public tournament URLs so `:root` tokens and `<title>`/meta are correct before hydrate.
4. **Client:** a **ThemeProvider** (React context) writes **`document.documentElement`** style (or a wrapper `div`) so **Tailwind** arbitrary values and `var(--*)` stay in sync; reconcile when preview/invite switches tenant.

Example shape (values come from DB, not literals in repo):

```css
/* Injected from tenant_config — example keys only */
:root {
  --color-primary: #ff4655;
  --color-secondary: #0f1923;
  --font-display: "Orbitron", system-ui, sans-serif;
}
```

**Tailwind:** map tokens via `theme.extend` using `var(--color-primary)` or use CSS variables in arbitrary values so utilities stay tenant-aware.

### 13.4 Responsive bracket strategy (dual-view)

Brackets **must not** rely on a single horizontal tree on small viewports.

| Context | Pattern |
|---------|---------|
| **Desktop / tablet (landscape)** | Interactive **SVG or Canvas** bracket with **pan/zoom** (e.g. **react-zoom-pan-pinch** or equivalent). |
| **Mobile** | **Grouped list UX:** a **round selector** (Round 1, Quarter-finals, Semi-finals, Finals) filters a **vertical list** of **match cards** (teams, scores, status, CTA). |

Both views consume the **same** bracket API and **Socket.io** patch stream.

### 13.5 Real-time UX: “match-ready” and optimistic scores

**Match-ready takeover**

- **Backend:** emit **`match:ready`** (or namespaced equivalent) on the tournament/match room when a match is callable (lobby open, check-in window, etc.).
- **Web:** **toast** (or inline banner) with primary CTA **Join lobby** / **Open match**; respect tenant tokens.
- **Mobile:** **high-priority** FCM payload + **full-screen in-app** sheet when foregrounded; **one-tap check-in** from notification action (**§7**).

**Optimistic UI for reported scores**

- On **player-submitted** score, **immediately** advance the bracket UI locally and mark the node **pending verification** (spinner / badge).
- On **server confirmation** or **`match:updated`**, reconcile; on **dispute** or conflicting payload, **rollback** the local bracket animation/state to server truth with a clear message (“Opponent disputed” / “Score updated by referee”).
- TanStack Query: use **optimistic updates** + **`onError` rollback** for mutations; websockets invalidate or patch the same query keys.

### 13.6 Frontend stack summary (UI layer)

| Concern | Choice |
|---------|--------|
| Web framework | **React 18+** + **Vite** (or equivalent); **React Router** or **TanStack Router** |
| Styling | **Tailwind CSS** + CSS variables from tokens |
| Motion | **Framer Motion** (web); Flutter implicit |
| Server state | **TanStack Query** |
| Realtime | **Socket.io** client (align events with **§7**); backend may use **Redis** pub/sub or streams internally for fan-out—clients stay on Socket.io |
| E2E | **Playwright** — multiple **baseURLs** or hosts for subdomain tenants |

### 13.7 Lead developer checklist (UI, assets, and abuse)

- [ ] **Tenant isolation:** every **SQL** path uses `tenant_id` / RLS as in **§3** (UI must not leak IDs across tenants in caches—key React Query by `tenantId`).
- [ ] **Asset fallback:** if `tenant_logo` (or equivalent) is null, use **`https://mails.bybata.com/logomail.png`** in navbar, favicon placeholder, and skeleton states.
- [ ] **Touch targets:** interactive controls on mobile **≥ 44×44 px** (Flutter: `minimumTapTargetSize`; web: min height/width + padding).
- [ ] **Audit log:** every **manual** score override in admin/ref UI triggers backend audit with **admin user id** (**§8.4**).
- [ ] **Rate limiting:** **report-score** and noisy public endpoints rate-limited per IP and per tenant (**§8.5**).

---

## 14. Explicit non-goals (unless later approved)

- Hard-coding one title’s rules inside the engine.  
- Synchronous mega-bracket API.  
- FCM sends without a **dedicated worker + queue**.  
- **Session-scoped** `SET app.tenant_id` (or equivalent) on pooled connections—**forbidden**; use **`SET LOCAL`** in a transaction only.  
- **Hard-coded brand colors** in shared components—**forbidden**; use **§13** tokens only.

---

*End of document.*
