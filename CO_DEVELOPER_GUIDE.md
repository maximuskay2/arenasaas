# Co-developer guide: Arena-SaaS (multi-tenant esports platform)

This document is the **full onboarding instruction** for engineers joining the project. The **authoritative specification** with exact policies, SQL sketches, and gate definitions lives in:

**[`MASTER_IMPLEMENTATION_DIRECTIVE.md`](./MASTER_IMPLEMENTATION_DIRECTIVE.md)** (read that for implementation truth).

Use **this guide** to understand *why* things are shaped the way they are, *how* the pieces connect, and *what order* to build in. When in doubt, the master directive wins.

---

## 1. What we are building (one paragraph)

**Arena-SaaS** is a **B2B multi-tenant** platform: many independent **organizations (tenants)** run esports **tournaments** under their own **branding** (subdomain/custom domain). **Tenant Admins** pay the **platform** either a **monthly subscription** (unlimited tournaments) or a **one-time fee** (single tournament). **Players** pay **registration** fees that **credit the tenant’s wallet**; **Tenant Admins** **withdraw** to their bank after a **platform fee %** set by the **Platform Super Admin**. The **tournament engine** (brackets, check-in, scores) is **backend-owned** and **UI-agnostic**; **React** (web) and **Flutter** (mobile) are thin clients with **real-time** updates and strict **tenant isolation** in **PostgreSQL (RLS)**.

---

## 2. How to read the master directive

| Master § | Topic | You should know |
|----------|--------|-----------------|
| **§1** | Product principles | SaaS not single-site; engine decoupled from UI; two money lanes (SaaS vs registration). |
| **§2** | Stack | React + Tailwind + TanStack Query + NestJS + Postgres RLS + Redis + BullMQ + Socket.io + FCM + 3 payment providers. |
| **§3** | Multi-tenancy | `tenant_id` everywhere; **RLS**; **`SET LOCAL`** only (pool safety); routing by host. |
| **§4** | Auth & RBAC | Platform Super Admin vs Tenant Admin; onboarding & **entitlements** (monthly vs one-shot). |
| **§5** | Tournament engine | Formats; **version** column; check-in/forfeit **race** pattern; async bracket jobs. |
| **§6** | Game integration | OAuth (Steam/Riot/Discord); adapters for auto vs manual scores. |
| **§7** | Realtime & push | Socket rooms; FCM via **queue**, not API handlers. |
| **§8** | Money | `PaymentsAdapter`; ledger; wallet; withdrawals; legal gates for Paystack/Flutterwave holds. |
| **§9** | Services | Bounded contexts (auth, engine, payments, notifications, …). |
| **§10** | Infra | Docker Compose local; CI/CD; observability with `tenant_id` in logs. |
| **§11** | MVP pillars | Table of what “done” includes. |
| **§12** | Phases & **G1–G4** | **Mandatory gates** before treating money/concurrency as safe. |
| **§13** | UI/UX | Design tokens; glass aesthetic; dual bracket views; optimistic UI. |
| **§14** | Non-goals | Things we explicitly do not do without approval. |

---

## 3. Mental model: three layers of “who”

1. **Platform (you / Platform Super Admin)**  
   Runs the SaaS. Sets **`withdrawal_fee_percent`** (and optional fixed fee), pricing hooks for hosting products, cross-tenant tools, audits.

2. **Tenant (organization)**  
   Has **`tenant_id`**, **`tenant_config`** (branding), **`tenant_entitlements`** (can they create tournaments?), **`tenant_wallet`** (balance from registrations).

3. **Users inside a tenant**  
   **Tenant Admin**, Organizer, Referee, Caster, Player—scoped by **`user_tenants`** and RLS.

**Rule:** Almost every API call and DB query for tenant data must resolve **one** `tenant_id` and set **`SET LOCAL app.tenant_id`** in the **same transaction** as the query. See master **§3.1a**.

---

## 4. Money: two lanes (do not mix them up)

| Lane | Payer | Receiver / effect |
|------|--------|-------------------|
| **SaaS hosting** | Tenant Admin | **Platform** revenue. Unlocks **monthly unlimited** or **one tournament** (one-shot). Webhooks update **`tenant_entitlements`**. |
| **Tournament registration** | Participants | **Tenant wallet** credits (minus optional immediate platform rake, if you add it). |

**Withdrawals:** Tenant Admin requests payout → server computes **gross**, applies **Super Admin** **`withdrawal_fee_percent`** → **net** sent via payment provider transfer; ledger + audit. Master **§8.2–8.3**.

**Prize / completion payouts** from the **tournament engine** use **`releasePayout(tournamentId)`** (or equivalent)—**not** the same code path as wallet withdrawals, but **same adapter family** (no `if (stripe)` in the engine). Master **§8.1**.

---

## 5. Tournament creation gate (commercial)

Before **`POST /tournaments`** succeeds:

- **Monthly plan:** subscription must be **active** (define behavior for `past_due` / `canceled`).
- **One-shot plan:** **`single_tournament_remaining`** must be **≥ 1**; decrement when tournament is created (or when published—pick one rule and document it).

Master **§4.3**.

---

## 6. Non-negotiables (security & correctness)

### 6.1 Connection pool + RLS (G1)

- **Never** `SET app.tenant_id` session-wide on a pooled connection.
- **Always** `SET LOCAL app.tenant_id = …` inside a **transaction**.
- Ship an **adversarial CI test**: tenant A must never see tenant B’s match **even under pool churn**. Master **§3.1a**.

### 6.2 Check-in vs forfeit (G2 + G4)

- Use **`matches.version`** and a **single conditional `UPDATE`** so only one of check-in or forfeit wins.
- Forfeit jobs: **`processed_forfeit_jobs`** + **`idempotency_key`** so BullMQ redelivery does not double-apply. Master **§5.4**.

### 6.3 Payments (G3)

- Define **`PaymentsAdapter`** and **`payment_ledger`** before adapters.
- **Stripe** has native Connect/hold patterns; **Paystack/Flutterwave** need **application-level escrow** in the ledger—get **legal** sign-off on holding float. Master **§8.1**.

---

## 7. Recommended reading order (first week)

1. Master **§1–2** + this guide **§1–4** (context).  
2. Master **§3.1a** (RLS + pools)—implement or review first.  
3. Master **§4.2–4.3** (roles + entitlements).  
4. Master **§5.1, §5.3–5.4** (engine + races).  
5. Master **§8.1** (facade + escrow) then **§8.2–8.3** (wallet + withdrawals).  
6. Master **§7** + **§13** (realtime + UI contract).  
7. Master **§12.1** (G1–G4)—treat as release gates.

---

## 8. Tech stack at a glance (implementation)

| Area | Choice |
|------|--------|
| Web | React 18+, Vite, Tailwind, Framer Motion, TanStack Query, React Router or TanStack Router |
| Mobile | Flutter |
| API | NestJS (TypeScript) |
| DB | PostgreSQL + RLS |
| Cache / TTL / locks | Redis |
| Jobs | BullMQ or SQS |
| Realtime | Socket.io (rooms per tenant/tournament) |
| Push | FCM via **worker + queue** |
| Payments | Stripe Connect, Paystack, Flutterwave—**one facade**, multiple adapters |
| E2E | Playwright (multi-host / subdomain) |

---

## 9. UI contract (short)

- **No hard-coded brand colors**—tokens from **`tenant_config`** → CSS variables (web) / `ThemeData` (Flutter).  
- **Default logo:** `https://mails.bybata.com/logomail.png` when missing.  
- **Brackets:** desktop **pan/zoom** tree; mobile **round selector + vertical cards**.  
- **Match-ready:** `match:ready` event → web toast + mobile push / full-screen.  
- **Scores:** optimistic UI with **rollback** on dispute/server truth.  

Master **§13**.

---

## 10. MVP checklist (condensed from master §11)

- [ ] RLS + `SET LOCAL` + CI cross-tenant test  
- [ ] Tenant Admin signup + hosting plans + **enforce** on create tournament  
- [ ] Wallet credit on registration; withdrawal + **Super Admin** fee %  
- [ ] Single elim + version locking + idempotent scores  
- [ ] Socket.io bracket patches + FCM pipeline  
- [ ] Payments adapter + ledger + webhooks (legal OK for non-Stripe holds)  
- [ ] Audit log (scores + fee changes + withdrawals)  
- [ ] UI tokens + dual bracket + Playwright multi-tenant smoke  

---

## 11. When you disagree or find ambiguity

1. **Propose a change** in writing (ADR or PR description).  
2. **Update `MASTER_IMPLEMENTATION_DIRECTIVE.md`** if the decision is accepted—this guide does not replace it.  
3. **Never** “simplify” tenancy (session `SET`, skipping RLS tests, or branching payment providers inside the bracket engine) without explicit sign-off.

---

## 12. Document map

| File | Role |
|------|------|
| **`MASTER_IMPLEMENTATION_DIRECTIVE.md`** | Single source of truth for architecture, policies, SQL shapes, gates, and UI specs. |
| **`CO_DEVELOPER_GUIDE.md`** (this file) | Narrative onboarding, mental models, reading order, and pointers into the master directive. |

---

*End of co-developer guide. admin@arena.local / admin123 organizer@arena.local / organizer123*
