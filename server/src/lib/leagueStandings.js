/**
 * Round-robin / Swiss: recompute tournament_league_standings from terminal matches (+3 win, +1 draw).
 */

const TERMINAL = new Set(['completed', 'forfeited', 'no_show']);

/**
 * @param {import('pg').PoolClient} client
 * @param {string} tournamentId
 * @param {string} tenantId
 * @param {string} format — tournaments.format
 */
export async function recomputeLeagueStandings(client, tournamentId, tenantId, format) {
  const fmt = String(format || '').toLowerCase().replace(/-/g, '_');
  if (fmt !== 'round_robin' && fmt !== 'swiss') return;

  const tid = String(tournamentId || '').trim();
  const ten = String(tenantId || '').trim();
  if (!tid || !ten) return;

  await client.query(`DELETE FROM tournament_league_standings WHERE tournament_id::text = $1 AND tenant_id = $2`, [
    tid,
    ten,
  ]);

  const { rows: matches } = await client.query(
    `SELECT * FROM matches
     WHERE tournament_id::text = $1 AND tenant_id = $2
       AND status = ANY($3::text[])
     ORDER BY round ASC, match_number ASC`,
    [tid, ten, [...TERMINAL]]
  );

  /** @type {Map<string, { team_id: string, team_name: string, played: number, wins: number, draws: number, losses: number, points: number, goals_for: number, goals_against: number }>} */
  const agg = new Map();

  function ensure(teamId, name) {
    const id = String(teamId || '').trim();
    if (!id) return null;
    if (!agg.has(id)) {
      agg.set(id, {
        team_id: id,
        team_name: String(name || '').slice(0, 200),
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        goals_for: 0,
        goals_against: 0,
      });
    }
    return agg.get(id);
  }

  for (const m of matches) {
    const aId = String(m.team_a_id || '').trim();
    const bId = String(m.team_b_id || '').trim();
    if (!aId || !bId) continue;

    const sa = Number(m.score_a) || 0;
    const sb = Number(m.score_b) || 0;
    const wa = ensure(aId, m.team_a_name);
    const wb = ensure(bId, m.team_b_name);
    if (!wa || !wb) continue;

    wa.played += 1;
    wb.played += 1;
    wa.goals_for += sa;
    wa.goals_against += sb;
    wb.goals_for += sb;
    wb.goals_against += sa;

    const winner = m.winner_id ? String(m.winner_id).trim() : '';

    if (sa === sb && !winner) {
      wa.draws += 1;
      wb.draws += 1;
      wa.points += 1;
      wb.points += 1;
    } else if (winner === aId || (!winner && sa > sb)) {
      wa.wins += 1;
      wb.losses += 1;
      wa.points += 3;
    } else if (winner === bId || (!winner && sb > sa)) {
      wb.wins += 1;
      wa.losses += 1;
      wb.points += 3;
    }
  }

  for (const row of agg.values()) {
    await client.query(
      `INSERT INTO tournament_league_standings (
         tenant_id, tournament_id, team_id, team_name, played, wins, draws, losses, points, goals_for, goals_against, updated_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        ten,
        tid,
        row.team_id,
        row.team_name,
        row.played,
        row.wins,
        row.draws,
        row.losses,
        row.points,
        row.goals_for,
        row.goals_against,
      ]
    );
  }
}
