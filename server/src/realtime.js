/** Socket.io fan-out for bracket / match patches (§7.1). Set from index.js after Server created. */
let _io = null;

export function setRealtimeIo(io) {
  _io = io;
}

export function emitMatchUpdated(matchRow) {
  if (!_io || !matchRow?.tournament_id) return;
  const room = `tournament:${matchRow.tournament_id}`;
  _io.to(room).emit('match:updated', { match: matchRow });
  _io.to(room).emit('bracket:patch', { type: 'match', match: matchRow });
}

export function emitMatchReady(matchRow) {
  if (!_io || !matchRow?.tournament_id) return;
  const room = `tournament:${matchRow.tournament_id}`;
  _io.to(room).emit('match:ready', { matchId: matchRow.id, match: matchRow });
}

/** Discovery / join — slot counts after registration changes */
export function emitTournamentSlotsUpdated(tournamentRow) {
  if (!_io || !tournamentRow?.id) return;
  const tid = String(tournamentRow.id);
  const room = `tournament:${tid}`;
  _io.to(room).emit('tournament:slots', {
    tournamentId: tid,
    registered_teams: tournamentRow.registered_teams ?? 0,
    max_teams: tournamentRow.max_teams ?? 0,
  });
}

function pseudoViewersFromMatchId(matchId) {
  const s = String(matchId || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return 120 + (Math.abs(h) % 48_000);
}

/**
 * Global landing-page ticker when a match moves into in_progress.
 */
export function emitLiveTickerForMatch(prevStatus, matchRow) {
  if (!_io || !matchRow?.tournament_id) return;
  if (matchRow.status !== 'in_progress') return;
  if (prevStatus === 'in_progress') return;
  _io.emit('live:ticker', {
    at: Date.now(),
    tournament_id: String(matchRow.tournament_id),
    match_id: String(matchRow.id || ''),
    team_a: matchRow.team_a_name || 'TBD',
    team_b: matchRow.team_b_name || 'TBD',
    viewers: pseudoViewersFromMatchId(matchRow.id),
  });
}
