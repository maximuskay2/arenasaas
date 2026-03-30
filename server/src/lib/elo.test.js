import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMatchElo, expectedScore, kFactorFromPrizePool, ELO_DEFAULT } from './elo.js';

test('expectedScore equal ratings', () => {
  assert.ok(Math.abs(expectedScore(1200, 1200) - 0.5) < 1e-9);
});

test('expectedScore favors higher', () => {
  assert.ok(expectedScore(1400, 1200) > 0.75);
});

test('kFactorFromPrizePool tiers', () => {
  assert.equal(kFactorFromPrizePool(0), 24);
  assert.equal(kFactorFromPrizePool(600), 28);
  assert.equal(kFactorFromPrizePool(3000), 32);
  assert.equal(kFactorFromPrizePool(12000), 40);
});

test('computeMatchElo favorite wins small delta', () => {
  const o = computeMatchElo(1400, 1200, 1, 32);
  assert.ok(o.newA > 1400 && o.newA < 1410);
  assert.ok(o.newB < 1200 && o.newB > 1185);
  assert.ok(o.deltaA + o.deltaB < 1);
});

test('computeMatchElo upset swings more', () => {
  const o = computeMatchElo(1200, 1400, 1, 32);
  assert.ok(o.deltaA > 20);
});

test('baseline default', () => {
  assert.equal(ELO_DEFAULT, 1200);
});
