/**
 * Cumulative prize_payout vs KYC gate for withdrawals.
 *
 * --- Per-currency mode (default) ---
 * - PRIZE_KYC_THRESHOLD_USD (default 600; 0 = off)
 * - PRIZE_KYC_THRESHOLD_NGN (default 1_000_000 when unset; 0 = off)
 * - PRIZE_KYC_THRESHOLDS_JSON — merge/override, e.g. {"EUR":500,"GBP":400,"CAD":800}
 *   Keys = ISO-ish currency codes (uppercased). Merged on top of USD/NGN env; same key in JSON wins.
 *   Threshold 0 in JSON removes that currency if you override a default.
 *
 * --- FX → single base mode (optional) ---
 * When all of the following are set, per-currency thresholds above are ignored for the gate:
 * - PRIZE_KYC_FX_BASE_CURRENCY — e.g. USD
 * - PRIZE_KYC_THRESHOLD_BASE — one number in that base (e.g. 600)
 * - PRIZE_KYC_FX_RATES_JSON — units of BASE per 1 unit of OTHER currency, e.g. {"NGN":0.00062,"EUR":1.08}
 *   Base currency need not appear in JSON (treated as 1). Currencies missing from JSON are skipped (not
 *   converted — add them explicitly or they won’t count toward the cap).
 */

export function prizeKycThresholdUsd() {
  const n = Number(process.env.PRIZE_KYC_THRESHOLD_USD);
  if (n === 0) return 0;
  return Number.isFinite(n) && n > 0 ? n : 600;
}

export function prizeKycThresholdNgn() {
  const raw = process.env.PRIZE_KYC_THRESHOLD_NGN;
  if (raw === '0') return 0;
  if (raw === undefined || raw === null || String(raw).trim() === '') return 1_000_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 1_000_000;
  return n === 0 ? 0 : n;
}

function parseThresholdsJson() {
  const raw = process.env.PRIZE_KYC_THRESHOLDS_JSON;
  if (!raw || !String(raw).trim()) return {};
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      const cur = String(k).toUpperCase().trim().slice(0, 8);
      const n = Number(v);
      if (cur && Number.isFinite(n) && n >= 0) out[cur] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** @returns {Record<string, number>} only currencies with threshold > 0 */
export function buildPerCurrencyThresholdMap() {
  const m = {
    USD: prizeKycThresholdUsd(),
    NGN: prizeKycThresholdNgn(),
  };
  const extra = parseThresholdsJson();
  for (const [k, v] of Object.entries(extra)) {
    m[k] = v;
  }
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (v > 0) out[k] = v;
  }
  return out;
}

export function useFxBaseKycMode() {
  const base = String(process.env.PRIZE_KYC_FX_BASE_CURRENCY || '')
    .trim()
    .toUpperCase()
    .slice(0, 8);
  const tb = Number(process.env.PRIZE_KYC_THRESHOLD_BASE);
  return base.length >= 3 && Number.isFinite(tb) && tb > 0;
}

export function prizeKycFxBaseCurrency() {
  return String(process.env.PRIZE_KYC_FX_BASE_CURRENCY || '')
    .trim()
    .toUpperCase()
    .slice(0, 8);
}

export function prizeKycThresholdBase() {
  const tb = Number(process.env.PRIZE_KYC_THRESHOLD_BASE);
  return Number.isFinite(tb) && tb > 0 ? tb : 0;
}

function parseFxRatesJson() {
  const raw = process.env.PRIZE_KYC_FX_RATES_JSON;
  if (!raw || !String(raw).trim()) return {};
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      const cur = String(k).toUpperCase().trim().slice(0, 8);
      const n = Number(v);
      if (cur && Number.isFinite(n) && n >= 0) out[cur] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Sum ledger amounts into base currency using rates[currency] = base_units per 1 unit of currency.
 * Base row uses 1. Currencies not in `rates` contribute 0 (documented — add rate or they are ignored).
 */
export function sumPrizePayoutsInBase(totalsByCurrency, baseCurrency, rates) {
  const base = String(baseCurrency || '').toUpperCase();
  let total = 0;
  for (const [curRaw, amtRaw] of Object.entries(totalsByCurrency)) {
    const cur = String(curRaw).toUpperCase();
    const amt = Number(amtRaw);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    if (cur === base) {
      total += amt;
      continue;
    }
    const r = rates[cur];
    if (r == null || !Number.isFinite(Number(r))) continue;
    total += amt * Number(r);
  }
  return total;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
export async function fetchPrizePayoutTotalsByCurrency(client, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return {};
  const { rows } = await client.query(
    `SELECT upper(trim(currency)) AS currency, COALESCE(SUM(amount), 0)::numeric AS total
     FROM payment_ledger
     WHERE type = 'prize_payout' AND status = 'completed' AND beneficiary_user_id = $1::uuid
     GROUP BY upper(trim(currency))`,
    [uid]
  );
  const out = {};
  for (const r of rows) {
    const c = String(r.currency || '').toUpperCase();
    if (c) out[c] = Number(r.total || 0);
  }
  return out;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
export async function fetchPrizePayoutKycState(client, userId) {
  const uid = String(userId || '').trim();
  if (!uid) {
    return { kyc_cleared: false, totals_by_currency: {}, ytd_prize_payout_usd: 0, ytd_prize_payout_ngn: 0 };
  }
  const u = await client.query(`SELECT kyc_cleared FROM users WHERE id = $1::uuid`, [uid]);
  const totals = await fetchPrizePayoutTotalsByCurrency(client, uid);
  return {
    kyc_cleared: u.rows[0]?.kyc_cleared === true,
    totals_by_currency: totals,
    ytd_prize_payout_usd: totals.USD ?? 0,
    ytd_prize_payout_ngn: totals.NGN ?? 0,
  };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
export async function fetchPrizePayoutKycPayload(client, userId) {
  const row = await fetchPrizePayoutKycState(client, userId);
  const threshold_usd = prizeKycThresholdUsd();
  const threshold_ngn = prizeKycThresholdNgn();
  const thresholdsByCurrency = buildPerCurrencyThresholdMap();
  let withdrawal_kyc_required = false;
  let kyc_mode = 'per_currency';
  let ytd_prize_equiv_base = null;
  let threshold_base = null;
  let fx_base_currency = null;

  if (useFxBaseKycMode()) {
    kyc_mode = 'fx_base';
    fx_base_currency = prizeKycFxBaseCurrency();
    threshold_base = prizeKycThresholdBase();
    const rates = parseFxRatesJson();
    ytd_prize_equiv_base = sumPrizePayoutsInBase(row.totals_by_currency, fx_base_currency, rates);
    withdrawal_kyc_required =
      !row.kyc_cleared && ytd_prize_equiv_base >= threshold_base;
  } else {
    withdrawal_kyc_required = !row.kyc_cleared;
    if (withdrawal_kyc_required) {
      withdrawal_kyc_required = Object.entries(thresholdsByCurrency).some(
        ([cur, t]) => (row.totals_by_currency[cur] ?? 0) >= t
      );
    }
  }

  return {
    ...row,
    threshold_usd,
    threshold_ngn,
    thresholds_by_currency: thresholdsByCurrency,
    kyc_mode,
    fx_base_currency,
    ytd_prize_equiv_base,
    threshold_base,
    fx_non_base_rate_count: useFxBaseKycMode() ? Object.keys(parseFxRatesJson()).length : null,
    withdrawal_kyc_required,
  };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 */
export async function assertPrizeWithdrawalKycAllowed(client, userId) {
  const p = await fetchPrizePayoutKycPayload(client, userId);
  if (!p.withdrawal_kyc_required) return;

  let detail = '';
  if (p.kyc_mode === 'fx_base' && p.fx_base_currency && p.ytd_prize_equiv_base != null && p.threshold_base != null) {
    detail = `≈ ${p.fx_base_currency} ${p.ytd_prize_equiv_base.toFixed(2)} equivalent (threshold ${p.fx_base_currency} ${p.threshold_base})`;
  } else {
    const parts = [];
    for (const [cur, t] of Object.entries(p.thresholds_by_currency || {})) {
      const got = p.totals_by_currency[cur] ?? 0;
      if (got >= t) parts.push(`${cur} ${got.toFixed(2)} (threshold ${t})`);
    }
    detail = parts.length ? parts.join('; ') : 'threshold exceeded';
  }

  const err = new Error(
    `Identity verification (KYC) is required before withdrawal: cumulative prize credits — ${detail}. Contact support after completing KYC.`
  );
  err.statusCode = 403;
  err.code = 'withdrawal_kyc_required';
  throw err;
}
