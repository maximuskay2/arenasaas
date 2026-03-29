/**
 * Prize pool math for tournaments: FIXED vs PERCENTAGE prize_structure JSON.
 * Money in major units (dollars), rounded to 2 decimals — avoid raw floats in callers.
 */

import { getEntryPlatformFeePercent, entryFeePlatformCut } from '../payments/entryPlatformFeeSplit.js';

export const PRIZE_TYPES = ['FIXED', 'PERCENTAGE'];

/** @param {unknown} v */
function num2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Build a stable summary for discovery/detail APIs.
 * @param {Record<string, unknown>} tournament — row with prize_structure, prize_pool, currency, entry_fee, entry_type, max_teams, registered_teams
 */
export function buildPrizeSummary(tournament) {
  const cur = String(tournament?.currency || 'USD').toUpperCase().slice(0, 8);
  const tbd = tournament?.prize_disclosure_tbd === true || tournament?.prize_disclosure_tbd === 'true';
  if (tbd) {
    return {
      mode: 'tbd',
      currency: cur,
      cardLine: 'Prize TBD / sponsor-provided',
      detailLines: ['Organizer will announce or provide prizes separately.'],
      structure: null,
    };
  }
  const ps = normalizePrizeStructure(tournament?.prize_structure);
  const prizePool = num2(tournament?.prize_pool);
  const entryFee = num2(tournament?.entry_fee);
  const maxTeams = Number(tournament?.max_teams) || 0;
  const registered = Number(tournament?.registered_teams) || 0;

  if (!ps || !ps.ranks?.length) {
    return {
      mode: 'unspecified',
      currency: cur,
      cardLine: prizePool > 0 ? `${cur} ${prizePool.toFixed(2)} pool` : 'Prizes announced by organizer',
      detailLines: [],
      structure: null,
    };
  }

  const type = ps.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED';
  if (type === 'FIXED') {
    const lines = ps.ranks
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((r) => `${ordinal(r.rank)} ${cur} ${num2(r.payout).toFixed(2)}`);
    const total = ps.ranks.reduce((s, r) => s + num2(r.payout), 0);
    return {
      mode: 'FIXED',
      currency: cur,
      cardLine: `${cur} ${total.toFixed(2)} guaranteed · ${lines[0] || 'see details'}`,
      detailLines: lines,
      structure: ps,
    };
  }

  const pctLine = ps.ranks
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((r) => `${ordinal(r.rank)} ${num2(r.percent)}%`)
    .join(' · ');
  const nTeams = maxTeams || registered || 0;
  const examplePot = nTeams > 0 && entryFee > 0 ? num2(nTeams * entryFee) : 0;
  let exampleNote = 'Scales with paid entries (net pot after platform fee at settlement)';
  if (examplePot > 0) {
    exampleNote = `Example gross at ${nTeams} teams × ${cur} ${entryFee.toFixed(2)} = ${cur} ${examplePot.toFixed(2)} (net at finalize)`;
  }
  return {
    mode: 'PERCENTAGE',
    currency: cur,
    cardLine: `${pctLine} of net pot · ${exampleNote}`,
    detailLines: [pctLine, exampleNote],
    structure: ps,
  };
}

function ordinal(n) {
  const r = Number(n);
  if (r === 1) return '1st';
  if (r === 2) return '2nd';
  if (r === 3) return '3rd';
  return `${r}th`;
}

/** @param {unknown} raw */
export function normalizePrizeStructure(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const type = String(o.type || 'FIXED').toUpperCase() === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED';
  const currency = String(o.currency || 'USD').toUpperCase().slice(0, 8);
  const ranksIn = Array.isArray(o.ranks) ? o.ranks : [];
  const ranks = ranksIn
    .map((r, i) => {
      if (!r || typeof r !== 'object') return null;
      const row = /** @type {Record<string, unknown>} */ (r);
      const rank = Number(row.rank) || i + 1;
      const payout = num2(row.payout);
      const percent = num2(row.percent ?? row.payout_percent);
      const badge_id = String(row.badge_id || `placement_${rank}`).slice(0, 120);
      if (type === 'PERCENTAGE') {
        return { rank, percent, badge_id };
      }
      return { rank, payout, badge_id };
    })
    .filter(Boolean);
  if (!ranks.length) return null;
  const participation_badge = o.participation_badge ? String(o.participation_badge).slice(0, 120) : null;
  return { type, currency, ranks, participation_badge };
}

/**
 * Validate prize_structure on tournament create/patch (ranks unique, % sum ≤ 100).
 * @param {unknown} raw
 */
export function assertPrizeStructureSaveRules(raw) {
  const ps = normalizePrizeStructure(raw);
  if (!ps) return;
  const seen = new Set();
  for (const r of ps.ranks) {
    if (seen.has(r.rank)) {
      throw Object.assign(new Error(`Duplicate prize rank ${r.rank}`), { statusCode: 400, code: 'prize_structure_duplicate_rank' });
    }
    seen.add(r.rank);
  }
  if (ps.type === 'PERCENTAGE') {
    const sum = ps.ranks.reduce((s, r) => s + num2(r.percent), 0);
    if (sum > 100.01) {
      throw Object.assign(new Error(`Percentage ranks sum to ${sum}% (max 100%)`), {
        statusCode: 400,
        code: 'prize_structure_percent_overflow',
      });
    }
  } else {
    for (const r of ps.ranks) {
      if (num2(r.payout) < 0) {
        throw Object.assign(new Error('Fixed payouts must be non-negative'), { statusCode: 400, code: 'prize_structure_negative' });
      }
    }
  }
}

/** Exported for unit tests (2-decimal major-unit rounding). */
export function roundMoneyMajor(v) {
  return num2(v);
}

/**
 * @param {object} opts
 * @param {import('pg').PoolClient} opts.client
 * @param {Record<string, unknown>} opts.tournament
 * @param {{ rank: number, team_id: string }[]} opts.placements
 */
export async function computeSettlementAmounts({ client, tournament, placements }) {
  const ps = normalizePrizeStructure(tournament?.prize_structure);
  if (!ps) throw Object.assign(new Error('Tournament has no prize_structure'), { statusCode: 400 });

  const currency = String(tournament.currency || 'USD').toUpperCase().slice(0, 8);
  const prizePoolCap = num2(tournament.prize_pool);
  const entryFee = num2(tournament.entry_fee);
  const entryType = String(tournament.entry_type || 'FREE').toUpperCase();
  const paidCount = Number(tournament.registered_teams) || 0;

  let netPot = 0;
  if (ps.type === 'PERCENTAGE') {
    if (entryType !== 'PAID' || entryFee <= 0) {
      throw Object.assign(new Error('Percentage prizes require PAID tournament with entry_fee'), { statusCode: 400 });
    }
    const gross = num2(paidCount * entryFee);
    const pct = await getEntryPlatformFeePercent(client);
    const cut = entryFeePlatformCut(gross, pct);
    netPot = num2(gross - cut);
  }

  const byRank = new Map(placements.map((p) => [p.rank, p.team_id]));

  const lines = [];
  let sum = 0;

  for (const r of ps.ranks.sort((a, b) => a.rank - b.rank)) {
    const teamId = byRank.get(r.rank);
    if (!teamId) continue;

    let amount = 0;
    if (ps.type === 'FIXED') {
      amount = num2(r.payout);
    } else {
      amount = num2((netPot * num2(r.percent)) / 100);
    }
    if (amount <= 0) continue;
    sum = num2(sum + amount);
    lines.push({ rank: r.rank, team_id: teamId, amount, currency, badge_id: r.badge_id });
  }

  if (ps.type === 'PERCENTAGE' && sum > netPot + 0.01) {
    throw Object.assign(new Error('Computed payouts exceed net entry pot'), { statusCode: 400 });
  }
  if (prizePoolCap > 0 && sum > prizePoolCap + 0.01) {
    throw Object.assign(new Error('Computed payouts exceed tournament prize_pool cap'), { statusCode: 400 });
  }

  return { lines, sum, netPot, currency: ps.currency || currency };
}

/**
 * Pick final match: completed, no next_match_id, prefer name containing Final.
 * @param {Array<Record<string, unknown>>} matches
 */
export function findFinalMatch(matches) {
  const completed = matches.filter((m) => m.status === 'completed');
  const terminals = completed.filter((m) => !m.next_match_id);
  if (!terminals.length) return null;
  const scored = terminals.map((m) => ({
    m,
    round: Number(m.round) || 0,
    isFinal: /final/i.test(String(m.bracket_position || '')),
  }));
  scored.sort((a, b) => (b.isFinal ? 1 : 0) - (a.isFinal ? 1 : 0) || b.round - a.round);
  return scored[0]?.m || null;
}

function normalizeFormat(format) {
  return String(format || 'single_elimination')
    .toLowerCase()
    .replace(/-/g, '_');
}

/**
 * Ordered placements from precomputed league standings rows (DB).
 * @param {Array<Record<string, unknown>>} rows
 * @returns {{ rank: number, team_id: string }[]}
 */
export function placementsFromStandingsRows(rows) {
  if (!rows?.length) return [];
  const sorted = [...rows].sort((a, b) => {
    const pa = Number(a.points) || 0;
    const pb = Number(b.points) || 0;
    if (pb !== pa) return pb - pa;
    const gfa = (Number(a.goals_for) || 0) - (Number(a.goals_against) || 0);
    const gfb = (Number(b.goals_for) || 0) - (Number(b.goals_against) || 0);
    if (gfb !== gfa) return gfb - gfa;
    const wa = Number(a.wins) || 0;
    const wb = Number(b.wins) || 0;
    if (wb !== wa) return wb - wa;
    return String(a.team_id).localeCompare(String(b.team_id));
  });
  return sorted.map((r, i) => ({ rank: i + 1, team_id: String(r.team_id) }));
}

/**
 * Grand final in double elim: prefer GF-Reset when completed; else GF.
 * @param {Array<Record<string, unknown>>} matches
 */
export function findDoubleElimGrandFinalMatch(matches) {
  const done = matches.filter((m) => m.status === 'completed' && m.winner_id);
  const reset = done.find((m) => String(m.bracket_position || '') === 'GF-Reset');
  if (reset) return reset;
  const gf = done.find((m) => String(m.bracket_position || '') === 'GF');
  return gf || null;
}

/**
 * 3rd place: loser of the deepest completed losers-bracket match below the GF round (losers finals).
 * @param {Array<Record<string, unknown>>} matches
 * @param {Record<string, unknown>} grandFinal
 * @param {string} firstId
 * @param {string} secondId
 */
export function doubleElimThirdPlaceTeamId(matches, grandFinal, firstId, secondId) {
  const gfRound = Number(grandFinal?.round) || 0;
  const losers = matches.filter(
    (m) =>
      m.status === 'completed' &&
      m.winner_id &&
      /^L-R\d+/i.test(String(m.bracket_position || '')) &&
      (Number(m.round) || 0) < gfRound
  );
  if (!losers.length) return null;
  const maxR = Math.max(...losers.map((m) => Number(m.round) || 0));
  const tier = losers.filter((m) => (Number(m.round) || 0) === maxR);
  tier.sort((a, b) => (Number(b.match_number) || 0) - (Number(a.match_number) || 0));
  const lm = tier[0];
  if (!lm) return null;
  const w = String(lm.winner_id || '');
  const loser = w === String(lm.team_a_id || '') ? String(lm.team_b_id || '') : String(lm.team_a_id || '');
  if (!loser || loser === firstId || loser === secondId) return loser || null;
  return loser;
}

function deriveSingleEliminationPlacements(matches) {
  const finalM = findFinalMatch(matches);
  if (!finalM?.winner_id) return [];

  const w1 = String(finalM.winner_id);
  const loser =
    w1 === String(finalM.team_a_id || '') ? String(finalM.team_b_id || '') : String(finalM.team_a_id || '');
  const out = [
    { rank: 1, team_id: w1 },
    { rank: 2, team_id: loser },
  ];

  const finalRound = Number(finalM.round) || 0;
  if (finalRound < 2) return out;

  const semis = matches.filter(
    (m) => m.status === 'completed' && Number(m.round) === finalRound - 1 && m.id !== finalM.id
  );
  const finalists = new Set([String(finalM.team_a_id), String(finalM.team_b_id)]);
  for (const sm of semis) {
    const wa = String(sm.winner_id || '');
    const la =
      wa === String(sm.team_a_id || '') ? String(sm.team_b_id || '') : String(sm.team_a_id || '');
    if (la && !finalists.has(la)) {
      out.push({ rank: 3, team_id: la });
      break;
    }
  }

  return out;
}

function deriveDoubleEliminationPlacements(matches) {
  const grand = findDoubleElimGrandFinalMatch(matches);
  if (!grand?.winner_id) return deriveSingleEliminationPlacements(matches);

  const w1 = String(grand.winner_id);
  const second =
    w1 === String(grand.team_a_id || '') ? String(grand.team_b_id || '') : String(grand.team_a_id || '');
  const out = [
    { rank: 1, team_id: w1 },
    { rank: 2, team_id: second },
  ];
  const third = doubleElimThirdPlaceTeamId(matches, grand, w1, second);
  if (third) out.push({ rank: 3, team_id: third });
  return out;
}

/**
 * Final ranks for prize settlement.
 * @param {Array<Record<string, unknown>>} matches
 * @param {{ format?: string, standingsRows?: Array<Record<string, unknown>> }} [options]
 */
export function derivePlacements(matches, options = {}) {
  const fmt = normalizeFormat(options.format);
  if (fmt === 'round_robin' || fmt === 'swiss') {
    return placementsFromStandingsRows(options.standingsRows || []);
  }
  if (fmt === 'double_elimination') {
    return deriveDoubleEliminationPlacements(matches);
  }
  return deriveSingleEliminationPlacements(matches);
}
