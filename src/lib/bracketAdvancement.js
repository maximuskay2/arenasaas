import { maxikay } from "@/api/maxikayClient";

/**
 * After bracket matches are created, link each match's next_match_id
 * so the winner can be auto-advanced.
 *
 * Works for single-elimination and winners bracket of double-elimination:
 * matches are numbered sequentially; within a round, match i advances to
 * floor(i/2) in the next round (0-indexed), occupying slot A (even) or B (odd).
 */
export async function linkBracketMatches(tournamentId) {
  const allMatches = await maxikay.entities.Match.filter(
    { tournament_id: tournamentId },
    "match_number",
    500
  );

  // Group winners-bracket matches by round (bracket positions starting with W- or Finals/Semis)
  const wMatches = allMatches.filter(
    (m) =>
      m.bracket_position?.startsWith("W-") ||
      m.bracket_position === "Finals" ||
      m.bracket_position?.startsWith("W-Finals")
  );

  const rounds = {};
  wMatches.forEach((m) => {
    const r = m.round;
    if (!rounds[r]) rounds[r] = [];
    rounds[r].push(m);
  });

  const roundNums = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b);

  const updates = [];

  for (let ri = 0; ri < roundNums.length - 1; ri++) {
    const currentRound = rounds[roundNums[ri]].sort(
      (a, b) => a.match_number - b.match_number
    );
    const nextRound = rounds[roundNums[ri + 1]].sort(
      (a, b) => a.match_number - b.match_number
    );

    currentRound.forEach((match, idx) => {
      const nextIdx = Math.floor(idx / 2);
      const nextMatch = nextRound[nextIdx];
      if (nextMatch) {
        updates.push(
          maxikay.entities.Match.update(match.id, {
            next_match_id: nextMatch.id,
            expected_version: match.version ?? 1,
            expected_status: match.status,
          })
        );
      }
    });
  }

  await Promise.all(updates);
  return allMatches;
}

/**
 * When a match completes, advance the winner to the next match.
 * Determines whether winner fills slot A or B based on match index parity.
 */
export async function advanceWinner(match, allTournamentMatches) {
  if (!match.next_match_id || !match.winner_id) return;

  const nextMatch = allTournamentMatches?.find(
    (m) => m.id === match.next_match_id
  );
  if (!nextMatch) {
    // Fetch from DB if not provided
    const fetched = await maxikay.entities.Match.filter({
      id: match.next_match_id,
    });
    if (!fetched?.[0]) return;
    return _fillSlot(fetched[0], match);
  }
  return _fillSlot(nextMatch, match);
}

async function _fillSlot(nextMatch, completedMatch) {
  // Determine slot: if team_a is still TBD → fill A, else fill B
  const fillA =
    !nextMatch.team_a_id || nextMatch.team_a_name === "TBD";

  const update = fillA
    ? { team_a_id: completedMatch.winner_id, team_a_name: completedMatch.winner_name }
    : { team_b_id: completedMatch.winner_id, team_b_name: completedMatch.winner_name };

  await maxikay.entities.Match.update(nextMatch.id, {
    ...update,
    expected_version: nextMatch.version ?? 1,
    expected_status: nextMatch.status,
  });
}