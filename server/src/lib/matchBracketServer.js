/**
 * Advance bracket winner into next_match_id slot (server-side, mirrors client bracketAdvancement).
 */

/**
 * @param {import('pg').PoolClient} client
 * @param {Record<string, unknown>} completed — match row with next_match_id, winner_id, winner_name
 */
export async function advanceWinnerToNextMatch(client, completed) {
  const nextId = completed.next_match_id ? String(completed.next_match_id) : '';
  const winnerId = completed.winner_id ? String(completed.winner_id) : '';
  const winnerName = (completed.winner_name ? String(completed.winner_name) : '') || 'Winner';
  if (!nextId || !winnerId) return null;

  const { rows: nextRows } = await client.query(`SELECT * FROM matches WHERE id = $1::uuid LIMIT 1`, [nextId]);
  const nextMatch = nextRows[0];
  if (!nextMatch) return null;

  const fillA =
    !nextMatch.team_a_id ||
    String(nextMatch.team_a_name || '').toUpperCase() === 'TBD' ||
    !String(nextMatch.team_a_id || '').trim();

  const v = Number(nextMatch.version) || 1;

  const { rows } = fillA
    ? await client.query(
        `UPDATE matches SET
           team_a_id = $2::text,
           team_a_name = $3::text,
           version = version + 1,
           updated_date = NOW()
         WHERE id = $1::uuid AND version = $4
         RETURNING *`,
        [nextId, winnerId, winnerName, v]
      )
    : await client.query(
        `UPDATE matches SET
           team_b_id = $2::text,
           team_b_name = $3::text,
           version = version + 1,
           updated_date = NOW()
         WHERE id = $1::uuid AND version = $4
         RETURNING *`,
        [nextId, winnerId, winnerName, v]
      );

  return rows[0] || null;
}
