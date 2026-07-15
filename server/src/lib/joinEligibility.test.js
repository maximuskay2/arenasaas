import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateJoinEligibility, normalizeRegion, parseAllowedRegions } from './joinEligibility.js';

describe('joinEligibility', () => {
  it('normalizes region aliases', () => {
    assert.equal(normalizeRegion('NA'), 'us');
    assert.equal(normalizeRegion('EU'), 'eu');
    assert.equal(normalizeRegion('global'), 'global');
  });

  it('parses allowed regions', () => {
    assert.deepEqual(parseAllowedRegions('us, eu'), ['us', 'eu']);
    assert.deepEqual(parseAllowedRegions(['NA', 'ASIA']), ['us', 'asia']);
  });

  it('allows join when no restrictions', () => {
    const r = evaluateJoinEligibility({}, { userRegion: 'eu', hasGameHandle: false });
    assert.equal(r.ok, true);
  });

  it('blocks region mismatch', () => {
    const r = evaluateJoinEligibility(
      { allowed_regions: ['us', 'eu'] },
      { userRegion: 'asia', hasGameHandle: true }
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'region_restricted');
  });

  it('blocks low elo', () => {
    const r = evaluateJoinEligibility(
      { min_team_elo: 1400 },
      { userRegion: 'global', teamElo: 1200, hasGameHandle: true }
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'min_elo');
  });

  it('requires game handle when flagged', () => {
    const r = evaluateJoinEligibility(
      { require_game_handle: true },
      { userRegion: 'global', hasGameHandle: false }
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'game_handle_required');
  });
});
