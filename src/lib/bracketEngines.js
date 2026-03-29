/**
 * Bracket generation engines for all supported tournament formats.
 * Each function returns an array of match objects ready for bulkCreate.
 */

// ─── Single Elimination ───────────────────────────────────────────────────────
export function generateSingleElimination(teams, tournamentId, tenantId) {
  const teamList = [...teams];
  const numRounds = Math.ceil(Math.log2(teamList.length));
  const bracketSize = Math.pow(2, numRounds);
  while (teamList.length < bracketSize) teamList.push(null);

  const matches = [];
  let matchNumber = 1;

  for (let i = 0; i < bracketSize / 2; i++) {
    const teamA = teamList[i];
    const teamB = teamList[bracketSize - 1 - i];
    matches.push(_makeMatch(tournamentId, tenantId, 1, matchNumber++, `W-R1-M${i + 1}`, teamA, teamB));
  }

  for (let round = 2; round <= numRounds; round++) {
    const count = bracketSize / Math.pow(2, round);
    for (let i = 0; i < count; i++) {
      const label = round === numRounds ? "Finals" : `R${round}`;
      matches.push(_makeTBD(tournamentId, tenantId, round, matchNumber++, `W-${label}-M${i + 1}`));
    }
  }
  return matches;
}

// ─── Double Elimination ───────────────────────────────────────────────────────
export function generateDoubleElimination(teams, tournamentId, tenantId) {
  const winners = generateSingleElimination(teams, tournamentId, tenantId);
  const numRounds = Math.ceil(Math.log2(teams.length));
  const losers = [];
  let matchNumber = winners.length + 1;

  // Losers bracket: 2*(numRounds-1) rounds
  for (let round = 1; round <= numRounds * 2 - 2; round++) {
    const count = Math.max(1, Math.floor(teams.length / Math.pow(2, Math.ceil(round / 2) + 1)));
    for (let i = 0; i < count; i++) {
      losers.push(_makeTBD(tournamentId, tenantId, round, matchNumber++, `L-R${round}-M${i + 1}`));
    }
  }
  // Grand Final
  losers.push(_makeTBD(tournamentId, tenantId, numRounds * 2, matchNumber++, "GF"));
  // Grand Final reset (if losers bracket winner wins)
  losers.push(_makeTBD(tournamentId, tenantId, numRounds * 2 + 1, matchNumber++, "GF-Reset"));

  return [...winners, ...losers];
}

// ─── Round Robin ─────────────────────────────────────────────────────────────
export function generateRoundRobin(teams, tournamentId, tenantId) {
  const matches = [];
  let matchNumber = 1;

  // All pairs, assign to rounds using round-robin scheduling
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const round = Math.floor(matchNumber / Math.ceil(teams.length / 2)) + 1;
      matches.push(_makeMatch(tournamentId, tenantId, round, matchNumber++, `RR-M${matchNumber}`, teams[i], teams[j]));
    }
  }
  return matches;
}

// ─── Swiss ───────────────────────────────────────────────────────────────────
export function generateSwiss(teams, tournamentId, tenantId) {
  const numRounds = Math.ceil(Math.log2(teams.length));
  const matches = [];
  let matchNumber = 1;

  // Round 1: random pairings
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    matches.push(_makeMatch(tournamentId, tenantId, 1, matchNumber++, `SW-R1-M${Math.ceil((i + 2) / 2)}`, shuffled[i], shuffled[i + 1]));
  }

  // Rounds 2+: TBD (pairings determined after standings)
  for (let round = 2; round <= numRounds; round++) {
    const count = Math.floor(teams.length / 2);
    for (let i = 0; i < count; i++) {
      matches.push(_makeTBD(tournamentId, tenantId, round, matchNumber++, `SW-R${round}-M${i + 1}`));
    }
  }
  return matches;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _makeMatch(tournamentId, tenantId, round, matchNumber, position, teamA, teamB) {
  const isBye = !teamA || !teamB;
  return {
    tournament_id: tournamentId,
    ...(tenantId ? { tenant_id: tenantId } : {}),
    round,
    match_number: matchNumber,
    bracket_position: position,
    team_a_id: teamA?.id || "",
    team_a_name: teamA?.name || "BYE",
    team_b_id: teamB?.id || "",
    team_b_name: teamB?.name || "BYE",
    status: isBye ? "completed" : "pending",
    winner_id: isBye ? (teamA?.id || teamB?.id || "") : "",
    winner_name: isBye ? (teamA?.name || teamB?.name || "") : "",
    score_a: 0,
    score_b: 0,
    version: 1,
  };
}

function _makeTBD(tournamentId, tenantId, round, matchNumber, position) {
  return {
    tournament_id: tournamentId,
    ...(tenantId ? { tenant_id: tenantId } : {}),
    round,
    match_number: matchNumber,
    bracket_position: position,
    team_a_id: "",
    team_a_name: "TBD",
    team_b_id: "",
    team_b_name: "TBD",
    status: "pending",
    score_a: 0,
    score_b: 0,
    version: 1,
  };
}