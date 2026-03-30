/**
 * Immutable snapshot when a tournament is finalized (for career / wiki archives).
 */
export async function insertTournamentArchive(client, tournamentId, tenantId) {
  const tid = String(tournamentId);
  const ten = String(tenantId);
  const { rows: trows } = await client.query(
    `SELECT * FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
    [tid, ten]
  );
  const tournament = trows[0];
  if (!tournament) return { skipped: true };

  const { rows: teams } = await client.query(`SELECT * FROM teams WHERE tournament_id::text = $1`, [tid]);
  const { rows: matches } = await client.query(`SELECT * FROM matches WHERE tournament_id::text = $1 ORDER BY round, match_number`, [tid]);

  const snapshot = {
    archived_at: new Date().toISOString(),
    tournament,
    teams,
    matches,
  };

  await client.query(
    `INSERT INTO tournament_archives (tournament_id, tenant_id, snapshot)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (tournament_id) DO UPDATE SET snapshot = EXCLUDED.snapshot, archived_at = NOW()`,
    [tid, ten, JSON.stringify(snapshot)]
  );
  return { ok: true };
}
