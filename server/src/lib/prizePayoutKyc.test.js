import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  prizeKycThresholdUsd,
  prizeKycThresholdNgn,
  buildPerCurrencyThresholdMap,
  sumPrizePayoutsInBase,
  fetchPrizePayoutKycPayload,
  assertPrizeWithdrawalKycAllowed,
} from './prizePayoutKyc.js';

function mockClient(rows) {
  return {
    query: mock.fn(async (sql, params) => {
      if (String(sql).includes('kyc_cleared')) {
        return { rows: [rows.kyc] };
      }
      if (String(sql).includes('GROUP BY')) {
        if (params?.[0]) assert.equal(typeof params[0], 'string');
        return { rows: rows.ledgerGrouped || [] };
      }
      return { rows: [] };
    }),
  };
}

describe('prizeKycThresholdUsd', () => {
  it('defaults to 600', () => {
    const prev = process.env.PRIZE_KYC_THRESHOLD_USD;
    delete process.env.PRIZE_KYC_THRESHOLD_USD;
    assert.equal(prizeKycThresholdUsd(), 600);
    if (prev !== undefined) process.env.PRIZE_KYC_THRESHOLD_USD = prev;
  });

  it('0 disables USD arm', () => {
    const prev = process.env.PRIZE_KYC_THRESHOLD_USD;
    process.env.PRIZE_KYC_THRESHOLD_USD = '0';
    assert.equal(prizeKycThresholdUsd(), 0);
    if (prev !== undefined) process.env.PRIZE_KYC_THRESHOLD_USD = prev;
    else delete process.env.PRIZE_KYC_THRESHOLD_USD;
  });
});

describe('prizeKycThresholdNgn', () => {
  it('0 disables NGN arm', () => {
    const prev = process.env.PRIZE_KYC_THRESHOLD_NGN;
    process.env.PRIZE_KYC_THRESHOLD_NGN = '0';
    assert.equal(prizeKycThresholdNgn(), 0);
    if (prev !== undefined) process.env.PRIZE_KYC_THRESHOLD_NGN = prev;
    else delete process.env.PRIZE_KYC_THRESHOLD_NGN;
  });
});

describe('buildPerCurrencyThresholdMap + JSON', () => {
  it('merges PRIZE_KYC_THRESHOLDS_JSON', () => {
    const prevU = process.env.PRIZE_KYC_THRESHOLD_USD;
    const prevN = process.env.PRIZE_KYC_THRESHOLD_NGN;
    const prevJ = process.env.PRIZE_KYC_THRESHOLDS_JSON;
    process.env.PRIZE_KYC_THRESHOLD_USD = '0';
    process.env.PRIZE_KYC_THRESHOLD_NGN = '0';
    process.env.PRIZE_KYC_THRESHOLDS_JSON = '{"EUR":500,"GBP":400}';
    const m = buildPerCurrencyThresholdMap();
    if (prevU !== undefined) process.env.PRIZE_KYC_THRESHOLD_USD = prevU;
    else delete process.env.PRIZE_KYC_THRESHOLD_USD;
    if (prevN !== undefined) process.env.PRIZE_KYC_THRESHOLD_NGN = prevN;
    else delete process.env.PRIZE_KYC_THRESHOLD_NGN;
    if (prevJ !== undefined) process.env.PRIZE_KYC_THRESHOLDS_JSON = prevJ;
    else delete process.env.PRIZE_KYC_THRESHOLDS_JSON;
    assert.equal(m.EUR, 500);
    assert.equal(m.GBP, 400);
    assert.equal(m.USD, undefined);
  });
});

describe('sumPrizePayoutsInBase', () => {
  it('converts with rates (base per 1 unit foreign)', () => {
    const t = sumPrizePayoutsInBase({ USD: 100, NGN: 1_000_000 }, 'USD', { NGN: 0.00062 });
    assert.ok(Math.abs(t - (100 + 620)) < 1);
  });
});

describe('fetchPrizePayoutKycPayload', () => {
  it('per-currency: USD over threshold', async () => {
    const client = mockClient({
      kyc: { kyc_cleared: false },
      ledgerGrouped: [
        { currency: 'USD', total: '700' },
        { currency: 'NGN', total: '0' },
      ],
    });
    const prevU = process.env.PRIZE_KYC_THRESHOLD_USD;
    const prevN = process.env.PRIZE_KYC_THRESHOLD_NGN;
    const prevJ = process.env.PRIZE_KYC_THRESHOLDS_JSON;
    const prevFx = process.env.PRIZE_KYC_FX_BASE_CURRENCY;
    const prevTb = process.env.PRIZE_KYC_THRESHOLD_BASE;
    delete process.env.PRIZE_KYC_FX_BASE_CURRENCY;
    delete process.env.PRIZE_KYC_THRESHOLD_BASE;
    delete process.env.PRIZE_KYC_THRESHOLDS_JSON;
    process.env.PRIZE_KYC_THRESHOLD_USD = '600';
    process.env.PRIZE_KYC_THRESHOLD_NGN = '0';
    const p = await fetchPrizePayoutKycPayload(client, 'user-1');
    if (prevU !== undefined) process.env.PRIZE_KYC_THRESHOLD_USD = prevU;
    else delete process.env.PRIZE_KYC_THRESHOLD_USD;
    if (prevN !== undefined) process.env.PRIZE_KYC_THRESHOLD_NGN = prevN;
    else delete process.env.PRIZE_KYC_THRESHOLD_NGN;
    if (prevJ !== undefined) process.env.PRIZE_KYC_THRESHOLDS_JSON = prevJ;
    else delete process.env.PRIZE_KYC_THRESHOLDS_JSON;
    if (prevFx !== undefined) process.env.PRIZE_KYC_FX_BASE_CURRENCY = prevFx;
    else delete process.env.PRIZE_KYC_FX_BASE_CURRENCY;
    if (prevTb !== undefined) process.env.PRIZE_KYC_THRESHOLD_BASE = prevTb;
    else delete process.env.PRIZE_KYC_THRESHOLD_BASE;
    assert.equal(p.kyc_mode, 'per_currency');
    assert.equal(p.withdrawal_kyc_required, true);
    assert.equal(p.ytd_prize_payout_usd, 700);
  });

  it('fx_base: sums to base and compares threshold', async () => {
    const client = mockClient({
      kyc: { kyc_cleared: false },
      ledgerGrouped: [
        { currency: 'USD', total: '100' },
        { currency: 'NGN', total: '1000000' },
      ],
    });
    const prevU = process.env.PRIZE_KYC_THRESHOLD_USD;
    const prevN = process.env.PRIZE_KYC_THRESHOLD_NGN;
    const prevFx = process.env.PRIZE_KYC_FX_BASE_CURRENCY;
    const prevTb = process.env.PRIZE_KYC_THRESHOLD_BASE;
    const prevR = process.env.PRIZE_KYC_FX_RATES_JSON;
    process.env.PRIZE_KYC_FX_BASE_CURRENCY = 'USD';
    process.env.PRIZE_KYC_THRESHOLD_BASE = '600';
    process.env.PRIZE_KYC_FX_RATES_JSON = '{"NGN":0.00062}';
    delete process.env.PRIZE_KYC_THRESHOLD_USD;
    delete process.env.PRIZE_KYC_THRESHOLD_NGN;
    const p = await fetchPrizePayoutKycPayload(client, 'fx-user');
    if (prevU !== undefined) process.env.PRIZE_KYC_THRESHOLD_USD = prevU;
    else delete process.env.PRIZE_KYC_THRESHOLD_USD;
    if (prevN !== undefined) process.env.PRIZE_KYC_THRESHOLD_NGN = prevN;
    else delete process.env.PRIZE_KYC_THRESHOLD_NGN;
    if (prevFx !== undefined) process.env.PRIZE_KYC_FX_BASE_CURRENCY = prevFx;
    else delete process.env.PRIZE_KYC_FX_BASE_CURRENCY;
    if (prevTb !== undefined) process.env.PRIZE_KYC_THRESHOLD_BASE = prevTb;
    else delete process.env.PRIZE_KYC_THRESHOLD_BASE;
    if (prevR !== undefined) process.env.PRIZE_KYC_FX_RATES_JSON = prevR;
    else delete process.env.PRIZE_KYC_FX_RATES_JSON;
    assert.equal(p.kyc_mode, 'fx_base');
    assert.equal(p.withdrawal_kyc_required, true);
    assert.ok((p.ytd_prize_equiv_base ?? 0) > 600);
  });

  it('cleared users are not blocked', async () => {
    const client = mockClient({
      kyc: { kyc_cleared: true },
      ledgerGrouped: [{ currency: 'USD', total: '9000' }],
    });
    const p = await fetchPrizePayoutKycPayload(client, 'user-2');
    assert.equal(p.withdrawal_kyc_required, false);
  });
});

describe('assertPrizeWithdrawalKycAllowed', () => {
  it('throws 403 when KYC required', async () => {
    const prevU = process.env.PRIZE_KYC_THRESHOLD_USD;
    const prevN = process.env.PRIZE_KYC_THRESHOLD_NGN;
    const prevFx = process.env.PRIZE_KYC_FX_BASE_CURRENCY;
    const prevTb = process.env.PRIZE_KYC_THRESHOLD_BASE;
    process.env.PRIZE_KYC_THRESHOLD_USD = '600';
    process.env.PRIZE_KYC_THRESHOLD_NGN = '0';
    delete process.env.PRIZE_KYC_FX_BASE_CURRENCY;
    delete process.env.PRIZE_KYC_THRESHOLD_BASE;
    const client = mockClient({
      kyc: { kyc_cleared: false },
      ledgerGrouped: [{ currency: 'USD', total: '800' }],
    });
    try {
      await assert.rejects(
        () => assertPrizeWithdrawalKycAllowed(client, 'u'),
        (e) => e.statusCode === 403 && e.code === 'withdrawal_kyc_required'
      );
    } finally {
      if (prevU !== undefined) process.env.PRIZE_KYC_THRESHOLD_USD = prevU;
      else delete process.env.PRIZE_KYC_THRESHOLD_USD;
      if (prevN !== undefined) process.env.PRIZE_KYC_THRESHOLD_NGN = prevN;
      else delete process.env.PRIZE_KYC_THRESHOLD_NGN;
      if (prevFx !== undefined) process.env.PRIZE_KYC_FX_BASE_CURRENCY = prevFx;
      else delete process.env.PRIZE_KYC_FX_BASE_CURRENCY;
      if (prevTb !== undefined) process.env.PRIZE_KYC_THRESHOLD_BASE = prevTb;
      else delete process.env.PRIZE_KYC_THRESHOLD_BASE;
    }
  });
});
