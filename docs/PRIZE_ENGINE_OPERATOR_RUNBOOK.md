# Prize engine & match resolution — operator runbook

How payouts run after **Finalize tournament**, how to debug failures, and where money is recorded.

## Architecture (short)

1. **Tenant staff** calls **Finalize** from the tournament UI (or `POST /api/match-engine/tournaments/:id/finalize` with `X-Tenant-ID` and auth).
2. The API checks: all matches terminal (`completed` / `forfeited` / `no_show`), no `under_dispute` matches, no `match_reports` with `status = 'disputed'`, then runs **prize validation** (`computeSettlementAmounts` in `server/src/lib/prizeCalculator.js`).
3. If there is no usable `prize_structure`, the tournament is marked completed and `payout_job_status` is set to `completed` (job skipped).
4. Otherwise the row is updated to `payout_job_status = 'queued'` and a job is enqueued via `server/src/jobs/prizePayoutQueue.js`:
   - **If `REDIS_URL` is set:** BullMQ worker in `server/src/jobs/prizePayoutBullmq.js` (started from `server/src/index.js`).
   - **Otherwise:** in-process drain of the same queue module.

## `payout_job_status` values

| Value       | Meaning |
|------------|---------|
| `idle`     | Default; not finalized or legacy row. |
| `queued`   | Finalize succeeded; job waiting or in Redis. |
| `running`  | Worker picked up the tournament. |
| `completed`| Payout worker finished (or skipped with no structure). |
| `failed`   | Worker hit an error (see server logs). |

**Read status:** `GET /api/match-engine/tournaments/:id/finalize-status` (auth + tenant header). The admin **Tournament detail** page also surfaces `payout_job_status` when the tournament is completed.

## Idempotency & double-pay prevention

- Each placement line uses a deterministic **`payment_ledger.reference`**: `prize_payout:{tournament_id}:{rank}:{user_id}`.
- DB: **partial unique index** `idx_payment_ledger_reference_unique` on `(reference)` where `reference` is non-null and non-blank.
- Worker: **`INSERT … ON CONFLICT (reference) WHERE (reference IS NOT NULL AND btrim(reference) <> '') DO NOTHING RETURNING id`** — only if a row is returned does it credit the wallet and continue (see `server/src/lib/prizePayoutProcessor.js`).
- **`user_accolades`** uses `ON CONFLICT (user_id, tournament_id, rank) DO NOTHING`.

**Stress test:** from `server/`, `npm run stress:payout-ledger` runs concurrent inserts with the same reference (env: `CONCURRENCY`, `ROUNDS`). Use **`DATABASE_ADMIN_URL`** or a superuser URL if **`arena_app`** is blocked by RLS on `payment_ledger`.

## Logs to read

- **Structured settlement:** `[prizePayout] settlement` JSON in `server/src/lib/prizePayoutProcessor.js` (tournament id, tenant id, line count, sum, net pot).
- **BullMQ failures:** `[prizePayout BullMQ] job failed` includes `jobId`, `tournament_id`, `tenant_id` (`server/src/jobs/prizePayoutBullmq.js`).
- **Audit trail:** `audit_logs` with `action = 'prize_credit'` for each wallet credit (system actor).

## Retry after `failed`

1. **Fix the cause** (bad `prize_structure`, missing captains / users, validation errors — see calculator error message in logs).
2. **Finalize again:** `POST /api/match-engine/tournaments/:id/finalize` is **not** blocked when `payout_job_status` is `failed` (only `queued` / `running` / `completed` block a repeat finalize). After fixing data, run **Finalize tournament** again from the UI or API; it re-validates, sets `payout_job_status` to `queued`, and enqueues a new job. Already-paid lines are skipped via `payment_ledger.reference` idempotency.

**One-off enqueue** (e.g. worker-only recovery), from the `server` directory:

```bash
node -e "
import('./src/jobs/prizePayoutQueue.js').then(m =>
  m.enqueuePrizePayoutJob({ tournament_id: 'TOURNAMENT_ID', tenant_id: 'TENANT_ID' })
).then(() => console.log('enqueued')).catch(e => console.error(e));
"
```

Ensure `.env` / `REDIS_URL` matches the environment where the BullMQ worker runs.

## Migrations

Apply via `npm run migrate` in `server/`. Relevant objects include: `payment_ledger` partial unique index on **`reference`**; **`users.achievements`**; **`withdrawal_requests.beneficiary_user_id`**; trigger **`sync_user_achievements_mirror`** on **`user_accolades`**; RLS **`wr_ins`** on **`withdrawal_requests`** (player self-insert path). If the unique index fails to create, deduplicate conflicting **`payment_ledger.reference`** values first.

## KYC gate (withdrawals)

Logic lives in **`server/src/lib/prizePayoutKyc.js`**. `GET /api/auth/me/prize-payout-kyc` returns **`kyc_mode`**: **`per_currency`** or **`fx_base`**, plus **`totals_by_currency`**, **`thresholds_by_currency`**, and (in FX mode) **`ytd_prize_equiv_base`**, **`threshold_base`**, **`fx_base_currency`**.

### Mode A — Per-currency thresholds (default)

Each currency is checked independently (no conversion).

- **`PRIZE_KYC_THRESHOLD_USD`** — default **600**; **`0`** disables USD.
- **`PRIZE_KYC_THRESHOLD_NGN`** — default **₦1,000,000** when unset; **`0`** disables NGN.
- **`PRIZE_KYC_THRESHOLDS_JSON`** — optional merge/override, e.g. `{"EUR":500,"GBP":400,"CAD":800}`. Keys are uppercased. Values **override** the same key from USD/NGN env if present. Only currencies with threshold **&gt; 0** apply.

Example — add EUR/GBP only, turn off USD/NGN:

`PRIZE_KYC_THRESHOLD_USD=0` `PRIZE_KYC_THRESHOLD_NGN=0` `PRIZE_KYC_THRESHOLDS_JSON={"EUR":500,"GBP":400}`

### Mode B — Single cap in one “base” currency (FX)

When **all** of the following are set, **Mode A thresholds are ignored** for the gate:

- **`PRIZE_KYC_FX_BASE_CURRENCY`** — e.g. `USD`
- **`PRIZE_KYC_THRESHOLD_BASE`** — one number in that base (e.g. `600`)
- **`PRIZE_KYC_FX_RATES_JSON`** — **units of base per 1 unit of foreign currency**, e.g. `{"NGN":0.00062,"EUR":1.08}` means 1 NGN → 0.00062 USD, 1 EUR → 1.08 USD.

The base currency does not need a rate (implicit **1**). **Currencies missing from the JSON are not converted** (their prize totals do not add to the base sum — add a rate for every currency you pay prizes in, or they are excluded).

Refresh rates periodically (cron + env reload, or inject at deploy). Live FX APIs (Open Exchange Rates, ECB, etc.) are a product choice: this codebase only reads static env JSON.

### Enforcement & clearing

- **Enforcement:** `POST /api/auth/me/withdrawal-request` and matching **CRUD** paths call **`assertPrizeWithdrawalKycAllowed`**.
- **Clearing:** set **`users.kyc_cleared`** once identity is verified.

## Platform finalize override

- **`POST /api/match-engine/tournaments/:id/finalize`** with body **`{ "finalize_override": true }`** ( **`admin`** or **`super_admin`** JWT only).
- Skips: all-matches-terminal, **`under_dispute`** matches, open **`disputed`** **`match_reports`**.
- Still runs **prize structure / settlement** validation before enqueueing payouts.
- Writes **`audit_logs`** with **`action = 'finalize_override'`**.
- Response includes **`finalize_override_applied`**: boolean.

## Achievements mirror (`users.achievements`)

- **`user_accolades`** remains canonical.
- **`users.achievements`** is a JSONB array appended by trigger **`sync_user_achievements_mirror`** on **`user_accolades` INSERT** (SECURITY DEFINER).
- **`GET /api/auth/me`** includes **`achievements`** for convenience.

## Related code paths

| Area | Path |
|------|------|
| Report / dispute / finalize | `server/src/routes/matchEngineRoutes.js` |
| Prize math & save validation | `server/src/lib/prizeCalculator.js` |
| Payout execution | `server/src/lib/prizePayoutProcessor.js` |
| Queue | `server/src/jobs/prizePayoutQueue.js`, `prizePayoutBullmq.js` |
| KYC helpers | `server/src/lib/prizePayoutKyc.js` |
| Staff dispute email/internal notify | `server/src/lib/tenantStaffNotifications.js` |
| Directive ↔ DB status labels | `src/constants/matchLifecycle.js` |
| Player accolades API | `GET /api/auth/me/accolades` in `server/src/routes/auth.js` |
| Player withdrawal request | `POST /api/auth/me/withdrawal-request` in `server/src/routes/auth.js` |

## Rounding

Monetary rounding in JS uses **2 decimal major units** via `num2` / `roundMoneyMajor` in `prizeCalculator.js` (not banker's rounding — see unit tests).
