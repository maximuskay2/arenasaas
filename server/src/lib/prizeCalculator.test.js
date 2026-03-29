import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  placementsFromStandingsRows,
  derivePlacements,
  findDoubleElimGrandFinalMatch,
  buildPrizeSummary,
  assertPrizeStructureSaveRules,
  roundMoneyMajor,
} from './prizeCalculator.js';

describe('placementsFromStandingsRows', () => {
  it('orders by points then goal difference', () => {
    const p = placementsFromStandingsRows([
      { team_id: 'a', points: 3, goals_for: 2, goals_against: 1, wins: 1 },
      { team_id: 'b', points: 6, goals_for: 1, goals_against: 0, wins: 2 },
    ]);
    assert.deepEqual(p, [
      { rank: 1, team_id: 'b' },
      { rank: 2, team_id: 'a' },
    ]);
  });
});

describe('derivePlacements league', () => {
  it('uses standings for swiss', () => {
    const rows = [{ team_id: 'x', points: 9, goals_for: 0, goals_against: 0, wins: 3 }];
    const out = derivePlacements([], { format: 'swiss', standingsRows: rows });
    assert.deepEqual(out, [{ rank: 1, team_id: 'x' }]);
  });
});

describe('roundMoneyMajor', () => {
  it('rounds to 2 decimal places', () => {
    assert.equal(roundMoneyMajor(1.234), 1.23);
    assert.equal(roundMoneyMajor(1.236), 1.24);
  });
});

describe('assertPrizeStructureSaveRules', () => {
  it('rejects percent sum over 100', () => {
    assert.throws(
      () =>
        assertPrizeStructureSaveRules({
          type: 'PERCENTAGE',
          ranks: [
            { rank: 1, percent: 60, badge_id: 'a' },
            { rank: 2, percent: 50, badge_id: 'b' },
          ],
        }),
      /max 100%/
    );
  });

  it('rejects duplicate ranks', () => {
    assert.throws(
      () =>
        assertPrizeStructureSaveRules({
          type: 'FIXED',
          ranks: [
            { rank: 1, payout: 10, badge_id: 'a' },
            { rank: 1, payout: 5, badge_id: 'b' },
          ],
        }),
      /Duplicate prize rank/
    );
  });
});

describe('buildPrizeSummary', () => {
  it('returns TBD mode when prize_disclosure_tbd', () => {
    const s = buildPrizeSummary({ prize_disclosure_tbd: true, currency: 'USD' });
    assert.equal(s.mode, 'tbd');
    assert.match(s.cardLine, /TBD/i);
  });
});

describe('derivePlacements forfeited league', () => {
  it('single elim: completed semi feeds third when final exists', () => {
    const matches = [
      { id: 's1', status: 'completed', round: 1, winner_id: 'A', team_a_id: 'A', team_b_id: 'X' },
      { id: 's2', status: 'forfeited', round: 1, winner_id: 'B', team_a_id: 'B', team_b_id: 'Y', score_a: 1, score_b: 0 },
      { id: 'f', status: 'completed', round: 2, winner_id: 'A', team_a_id: 'A', team_b_id: 'B', next_match_id: null },
    ];
    const out = derivePlacements(matches, { format: 'single_elimination' });
    assert.ok(out.find((x) => x.rank === 3));
  });
});

describe('double elimination', () => {
  it('prefers GF-Reset over GF when both completed', () => {
    const matches = [
      { status: 'completed', winner_id: 'w1', bracket_position: 'GF', round: 4, team_a_id: 'a', team_b_id: 'b' },
      {
        status: 'completed',
        winner_id: 'w2',
        bracket_position: 'GF-Reset',
        round: 5,
        team_a_id: 'a',
        team_b_id: 'b',
      },
    ];
    const g = findDoubleElimGrandFinalMatch(matches);
    assert.equal(String(g.bracket_position), 'GF-Reset');
  });

  it('derives 1–3 from GF and losers finals loser', () => {
    const matches = [
      {
        id: 'gf',
        status: 'completed',
        winner_id: 'T1',
        bracket_position: 'GF',
        round: 6,
        team_a_id: 'T1',
        team_b_id: 'T2',
        match_number: 99,
      },
      {
        id: 'lf',
        status: 'completed',
        winner_id: 'T2',
        bracket_position: 'L-R4-M1',
        round: 4,
        team_a_id: 'T2',
        team_b_id: 'T3',
        match_number: 50,
      },
    ];
    const out = derivePlacements(matches, { format: 'double_elimination' });
    assert.equal(out.find((x) => x.rank === 1)?.team_id, 'T1');
    assert.equal(out.find((x) => x.rank === 2)?.team_id, 'T2');
    assert.equal(out.find((x) => x.rank === 3)?.team_id, 'T3');
  });
});
