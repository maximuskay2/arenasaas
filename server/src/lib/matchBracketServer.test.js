import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advanceWinnerToNextMatch } from './matchBracketServer.js';

describe('advanceWinnerToNextMatch', () => {
  it('returns null when next_match_id missing', async () => {
    const out = await advanceWinnerToNextMatch(
      {},
      { next_match_id: '', winner_id: 'team1', winner_name: 'T1' }
    );
    assert.equal(out, null);
  });
});
