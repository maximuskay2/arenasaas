# Master directive vs this repo — implementation status

**Source:** [`MASTER_IMPLEMENTATION_DIRECTIVE.md`](./MASTER_IMPLEMENTATION_DIRECTIVE.md)  
**Purpose:** What already matches the directive, what diverges on purpose, and what is **still to build** so you can plan sprints.

**Stack note:** The directive names **NestJS**; this codebase uses **Express** + **generic CRUD** (`server/src/routes/crud.js`). That is an intentional simplification unless you migrate—behavioural requirements (RLS, money, concurrency) still apply.

---

## Production gates (§12.1) — strict order

| Gate | Directive requirement | This repo |
|------|----------------------|-----------|
| **G1 — RLS + pool** | `SET LOCAL` / transaction-scoped tenant context only; **adversarial cross-tenant test in CI** | **Done (script + CI).** `runWithRls` in `server/src/rls/transaction.js`. Adversarial script `scripts/g1-cross-tenant.mjs` runs on GitHub Actions after migrate + seed (`.github/workflows/ci.yml`). |
| **G2 — Check-in / forfeit** | `matches.version`; `UPDATE … WHERE version`; concurrent tests; check-in story | **Stronger.** Match PATCH: `expected_version` + optional **`expected_status`** → `UPDATE … WHERE id AND version [AND status]`; **409** `optimistic_lock` or **`state_conflict`**. UI + `automateMatch.js` + lock script pass both. **`POST /api/engine/forfeit`** idempotent; **`npm run worker:forfeit`** + optional **Redis** (`REDIS_URL`). |
| **G3 — Payments** | `PaymentsAdapter` + ledger; Stripe first; idempotent webhooks | **Stronger.** Stripe **`releasePayout`** → Connect **`transfers.create`** + ledger; **subscription** Checkout + **`customer.subscription.updated` / `deleted`** + **`invoice.paid`**; **Customer Portal** session. **Paystack** (`/api/paystack/initialize`, webhook) and **Flutterwave** (`/api/flutterwave/initialize`, webhook) share **`fulfillCheckoutMetadata`**. Web **`PaymentsAdapter`** calls initialize APIs (503 → dev confirm fallback). Configure **`PAYSTACK_SECRET_KEY`**, **`FLUTTERWAVE_SECRET_KEY`** + **`FLUTTERWAVE_SECRET_HASH`**. |
| **G4 — Forfeit idempotency** | `processed_forfeit_jobs` + replay test | **Done + worker.** Shared **`forfeitApply.js`**; **`npm run worker:forfeit --prefix server`** polls overdue **`check_in_open`** matches, optional **Redis `SET NX`** lock (`REDIS_URL`). Compose profile **`workers`** runs the same (`docker-compose.yml`). |

---

## MVP scope table (§11) — pillar by pillar

| Pillar | Status | Evidence / gap |
|--------|--------|----------------|
| **Tenancy** | **Mostly done** | RLS policies; `X-Tenant-ID` / slug; `tenant_configs`; white-label hooks. **`GET /api/public/tenant-by-host?host=`** + DB function **`arena_tenant_by_custom_host`**; client **`maxikay.public.tenantByHost`**. DNS / edge routing remains ops. |
| **Security CI** | **Partial (deeper)** | G1 + match-lock in CI; **Playwright**: smoke, organizer login, tournaments list, **tournament create → detail**, **`public-tenant-by-host.spec.js`** (404 + custom_domain resolution). **No** full multi-host browser matrix or deep tenant-switch UI flows yet. |
| **Auth** | **Partial** | **`user_tenants`** + RLS; **`/me`** returns **`tenant_memberships`** and **`tenant_id`** (first membership) for organizer context. Optional **`REFRESH_COOKIE_ENABLED`**: httpOnly cookie, **`POST /auth/refresh`**, **`POST /auth/logout`**, **`GET /auth/export-my-data`**. Client: **`credentials: 'include'`** + **401 → silent refresh once** (`arenaClient.js`). **`ENFORCE_USER_TENANTS`** still optional. |
| **Commercial (§4.3)** | **Partial** | **`POST /api/v1/Tournament`** (non-admin) checks **`tenant_entitlements`** and decrements **one_shot** in `crud.js`. Stripe **`saas_*`** checkout kinds update entitlements via webhook. Subscription SKU / proration / cancellation product rules beyond webhooks + portal **not** modeled. |
| **Wallet (§8.2–8.3)** | **Partial** | Tables + UI + Super Admin fee config; **full** adapter-driven payout semantics not fully verified end-to-end. |
| **Engine** | **Partial** | Single elim (and other formats in schema); **`bracketJobQueue.js`** in-process stub + **`/api/system/bracket-jobs*`** (platform admin); enqueue/drain write **`audit_logs`**. **No** BullMQ/SQS; **no** isolated engine service. |
| **Realtime** | **Partial** | **Socket.io** on API; **`emitMatchUpdated`** / **`emitMatchReady`**; client **`realtimeClient.js`** (dev connects to **`:3001`** to avoid Vite ws proxy noise) + **`Match.subscribe`**. |
| **Check-in** | **Partial (worker live)** | **`forfeitWorker.js`** + optional Redis; **`POST /api/engine/forfeit`** + **`processed_forfeit_jobs`**. |
| **Mobile** | **Not in repo** | **No** Flutter app; directive’s FCM + deep links + mobile bracket §13.4 unaddressed in code. |
| **Money (phased)** | **Partial** | Stripe Connect surfaces; **`payment_ledger`**: **`amount_minor`**, **`provider`**, **`held`**. Web Paystack/FW use real initialize when keys set. |
| **Integrity** | **Partial** | **`audit_logs`** on **platform config** (admin); **Super Admin system routes**: vault secrets, HWID bans, bracket job enqueue/drain, **FCM job enqueue/drain** (`server/src/routes/systemRoutes.js`). Not every tenant-level admin path audited (§8.4). |
| **Engagement** | **Not done** | Discord bot optional — not implemented. |
| **UI / UX (§13)** | **Partial** | React + Vite + TanStack Query + Tailwind + Framer Motion + bracket zoom-pan. **Vite `preview.proxy`** mirrors dev **`/api`** proxy for Playwright. **Token purity** / **SSR/prerender** (§13.3) partial. |

---

## Other sections (short)

| Section | Status |
|---------|--------|
| **§5 Formats** | Swiss / double elim / round robin — present in types/UI to varying degrees; **bracket job stub** only vs §5.5 async generators. |
| **§6 Game integration** | **`/api/oauth/:provider/start|callback`** returns **501** stubs (`server/src/routes/oauthStub.js`) — no Steam/Riot linking pipeline. |
| **§7 Notifications** | Email helpers exist; **in-process FCM job queue** + **`POST/GET /api/system/notification-jobs/fcm`** + drain calling **`fcmStub`** (`server/src/jobs/fcmNotificationQueue.js`). **No** Firebase Admin or Redis-backed worker yet. |
| **§8.5 Compliance** | Auth + public IP limits; **`apiWriteLimiter`** on **`/api/*`**. **`GET /auth/export-my-data`**. Expanded platform-admin **audit_logs**; full GDPR automation + tenant write auditing **not** complete. |
| **§9 Services** | Monolith Express, not decomposed services. |
| **§10 Infra** | Docker Compose Postgres+Redis; **`forfeit-worker`** (**`--profile workers`**). API does not auto-start workers. |

---

## Suggested implementation order (next work)

1. **Match-detail E2E** — score / check-in paths on a seeded or fixture match.  
2. **G3 hardening** — `releasePayout` Stripe Connect path; subscription lifecycle (cancel/renew) beyond fixed window.  
3. ~~**Silent refresh on 401**~~ — **Done** in `arenaClient.js` (`trySilentRefresh` + one retry).  
4. **Redis/BullMQ** — replace in-process **bracket** + **FCM** queues when scaling past one API instance.  
5. **Flutter + real FCM** — parallel track when web money + engine gates are stable.

---

## Local / CI commands

| Command | Purpose |
|---------|---------|
| `npm run test:g1` | Cross-tenant match isolation (needs API + DB + seed). |
| `npm run test:match-lock` | Concurrent match PATCH + forfeit idempotency. |
| `npm run playwright:install` | **Once per machine** after `npm ci` — downloads Playwright Chromium (without it, UI E2E fails: “Executable doesn't exist”). |
| `npm run build && npm run test:e2e` | Playwright (starts API + preview). **Organizer:** **`PLAYWRIGHT_ORG_EMAIL`** / **`PLAYWRIGHT_ORG_PASSWORD`**. **Admin (tenant-by-host test):** **`PLAYWRIGHT_ADMIN_EMAIL`** / **`PLAYWRIGHT_ADMIN_PASSWORD`**. **API base for `request` tests:** **`PLAYWRIGHT_API_URL`** (default `http://127.0.0.1:3001`). |

---

## Files to read first (when coding)

- `server/src/rls/transaction.js` — pool-safe RLS context  
- `server/src/routes/crud.js` — CRUD + tournament entitlement + match optimistic PATCH  
- `server/src/routes/engineRoutes.js` — idempotent forfeit  
- `server/src/routes/paymentsRoutes.js` — Stripe checkout + webhook  
- `src/pages/TournamentCreate.jsx` — mirror server rules  
- `MASTER_IMPLEMENTATION_DIRECTIVE.md` §5.4, §8.1, §12.1  

*Update this file when a gate or MVP row flips to done.*
