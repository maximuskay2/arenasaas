# Implementation status — Central Station (platform “God view”)

**Release baseline:** Central Station blueprint items below are **finalised for this repository** as of **2026-03-27**. Anything listed under [Optional future work](#optional-future-work-not-in-this-codebase) is intentionally out of scope unless you add it later.

## Database migrations

From the **repository root**:

```bash
npm run migrate
```

This runs `server/src/migrate.js` (applies `src/db/schema.sql`, idempotent `ALTER`s, and `server/src/rls/002_rls.sql`). Requires PostgreSQL reachable via `DATABASE_URL` / `DATABASE_ADMIN_URL` (see `server/.env.example`).

---

## Terminology (important)

| Blueprint wording | In this repo |
|-------------------|--------------|
| **Super Admin** (platform owner) | User `role: 'admin'` — **Central Station** UI: `src/pages/SystemAdmin.jsx`, route **`/central-station`** (and `admin.*` host behaviour in `src/App.jsx`). |
| **Tenant Admin / league admin** | User `role: 'super_admin'` (and related) — **League command post**: `src/pages/SuperAdmin.jsx`, scoped to one tenant. |

APIs under **`/api/system/*`** require **`role === 'admin'`** (see `server/src/routes/systemRoutes.js`).

---

## 1. Global Command Dashboard (“Pulse”)

| Item | Status | Notes |
|------|--------|--------|
| Active tenants count | **Done** | Counted in Pulse / read-replica pulse. |
| Total concurrent players | **Done (proxy)** | **Roster count** in `in_progress` tournaments across tenants — not socket/session concurrency (see [future work](#optional-future-work-not-in-this-codebase)). |
| Revenue snapshot (platform commission) | **Done** | Ledger `platform_fee` when present; otherwise estimated from entry fees × `entry_platform_fee_percent`. |
| System health — API + DB | **Done** | `/api/health` (includes DB latency). |
| System health — tournament engine | **Done** | `GET /api/system/pulse-readonly`: `engine_query_ms`, `engine_active_bracket_rows` (DB bracket query). Separate worker metrics are [future work](#optional-future-work-not-in-this-codebase). |

---

## 2. Tenant management & oversight

| Item | Status | Notes |
|------|--------|--------|
| Searchable tenant directory | **Done** | |
| Subscription / plan control | **Done** | |
| Freeze for ToS (suspend tenant) | **Done** | `suspended` ↔ `active` on `tenants`. |
| Impersonation (support as tenant context) | **Done** | `impersonate_tenant_id` flow. |
| White-label review (logos / branding) | **Done** | Gallery from `TenantConfig`. |

---

## 3. Global security & integrity

| Item | Status | Notes |
|------|--------|--------|
| Global ban list (email / user) | **Done** | Email suspension notice via integration; optional when HWID-only ban. |
| HWID platform-wide ban | **Done** | `platform_hwid_bans`, `is_hwid_platform_banned()`, `/api/system/hwid-bans`, Central Station UI; auth checks `client_hwid` / `hwid` on login, register, MFA completion (`src/lib/clientHwid.js`). |
| Dispute escalation + match evidence | **Done** | Disputed `MatchReport` queue and rulings. |
| Audit log explorer | **Done** | `AuditLog` listing (breadth depends on which actions write rows). |

---

## 4. Tournament infrastructure control

| Item | Status | Notes |
|------|--------|--------|
| Game API hub (Riot / Steam / Ubisoft keys) | **Done** | `platform_integration_secrets` + `SECRETS_MASTER_KEY`. |
| Manual reporting mode (platform-wide) | **Done** | `platform_config.manual_reporting_mode` + `platformGate`. |
| Platform maintenance | **Done** | `platform_maintenance`; non-admin API 503. |
| Per-tenant maintenance | **Done** | `tenants.maintenance_mode` + `X-Tenant-ID`. |
| Template builder (default blueprints) | **Done** | Central Station CRUD on `GameTemplate` (platform admin RLS). |

---

## 5. Financial terminal

| Item | Status | Notes |
|------|--------|--------|
| Escrow monitor (Stripe Connect) | **Done** | When `STRIPE_SECRET_KEY` is set; plus internal wallet/prize proxy figures. |
| Payout queue (approve / flag / compliance flags) | **Done** | Withdrawals and large prizes: `aml_status` on `withdrawal_requests` and `prize_payments` (`none` · `review` · `cleared` · `sar_flagged`) + Central Station actions. **Not** automated regulatory AML/KYC/SAR filing ([future work](#optional-future-work-not-in-this-codebase)). |
| Global commission slider | **Done** | `entry_platform_fee_percent` in `platform_config`. |

---

## 6. Technical design requirements

| Item | Status | Notes |
|------|--------|--------|
| Non-obvious URL | **Done** | **`/central-station`**; private host/DNS is deployment ops. |
| MFA for platform admins | **Done (TOTP)** | Authenticator app + optional `MFA_REQUIRED_FOR_ADMIN=true`. **WebAuthn / passkeys:** [future work](#optional-future-work-not-in-this-codebase). |
| MFA for tenant `super_admin` | **Done (TOTP)** | Same pattern + optional `MFA_REQUIRED_FOR_SUPER_ADMIN=true`. |
| Read replica for heavy analytics | **Done** | `DATABASE_READ_REPLICA_URL` + `GET /api/system/pulse-readonly` (falls back to primary). |
| Admin IP allowlist | **Done** | `ADMIN_IP_ALLOWLIST` in `server/src/middleware/platformGate.js`. |

---

## Capability matrix (blueprint vs implementation)

| Area | Platform admin (`admin` / Central Station) | Tenant admin (`super_admin` / League command post) |
|------|---------------------------------------------|------------------------------------------------------|
| User management | Email notice + persisted **HWID** bans (when client sends `client_hwid`) | Kick/ban within league scope |
| Branding | Can override tenant CSS (Security tab) | Own tenant branding |
| Financials | All-tenant revenue / escrow / commission + **aml_status** on payouts | Own tenant payouts |
| System | Platform + per-tenant maintenance, manual reporting | Lighter controls; platform toggles in Central Station |

---

## Optional future work (not in this codebase)

These are **not** gaps in the checklist above; they are **extensions** if you need parity with a full enterprise stack:

1. **True concurrent players** — real-time presence (WebSockets / Redis) or game client heartbeats, instead of roster-in-live-tournament proxy.
2. **Tournament worker metrics** — Prometheus (or similar) from a bracket/job service, not only DB pulse timing.
3. **WebAuthn / FIDO2 / passkeys** — second factor alongside or instead of TOTP (`@simplewebauthn/server` + credential storage).
4. **Regulatory AML programme** — KYC vendors, automated sanctions screening, SAR workflows beyond in-app `aml_status` labels.
5. **Production HWID** — replace browser `localStorage` device id with your anti-cheat or attested client SDK.

---

## Quick reference (files)

- **UI:** `src/pages/SystemAdmin.jsx`, `src/App.jsx`, `src/lib/routingLogic.js`, `src/lib/clientHwid.js`
- **API:** `server/src/routes/systemRoutes.js`, `server/src/middleware/platformGate.js`, `server/src/routes/publicStatus.js`, `server/src/routes/auth.js`, `server/src/hwidCheck.js`
- **Env:** `server/.env.example` (`ADMIN_IP_ALLOWLIST`, `MFA_REQUIRED_FOR_*`, `SECRETS_MASTER_KEY`, `DATABASE_READ_REPLICA_URL`, `STRIPE_SECRET_KEY`)
