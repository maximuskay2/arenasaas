import { computeMatchElo, ELO_DEFAULT, kFactorFromPrizePool } from './elo.js';

/**
 * @param {import('pg').PoolClient} client
 * @param {object} match - row with team_a_id, team_b_id, winner_id, id, tournament_id, tenant_id, status
 * @param {object} [tournament] - optional prize_pool
 */
export async function applyMatchEloUpdate(client, match, tournament = null) {
  const mid = String(match.id || '');
  const tid = String(match.tournament_id || '');
  const ten = String(match.tenant_id || '');
  const st = String(match.status || '');
  if (!mid || !tid || !ten) return { skipped: true, reason: 'missing_ids' };
  if (!['completed', 'forfeited', 'no_show'].includes(st)) return { skipped: true, reason: 'not_terminal' };

  const wa = String(match.team_a_id || '');
  const wb = String(match.team_b_id || '');
  const win = String(match.winner_id || '');
  if (!wa || !wb || !win || (win !== wa && win !== wb)) {
    return { skipped: true, reason: 'no_binary_winner' };
  }

  const dup = await client.query(
    `SELECT 1 FROM team_ratings_history WHERE match_id::text = $1 LIMIT 1`,
    [mid]
  );
  if (dup.rowCount) return { skipped: true, reason: 'already_applied' };

  let prizePool = tournament?.prize_pool;
  if (prizePool === undefined || prizePool === null) {
    const { rows } = await client.query(
      `SELECT prize_pool FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
      [tid, ten]
    );
    prizePool = rows[0]?.prize_pool;
  }
  const k = kFactorFromPrizePool(prizePool);
  const sA = win === wa ? 1 : 0;

  const { rows: ta } = await client.query(`SELECT * FROM teams WHERE id::text = $1 LIMIT 1`, [wa]);
  const { rows: tb } = await client.query(`SELECT * FROM teams WHERE id::text = $1 LIMIT 1`, [wb]);
  const teamA = ta[0];
  const teamB = tb[0];
  if (!teamA || !teamB) return { skipped: true, reason: 'teams_missing' };

  const entityA = await getOrCreateEloEntity(client, teamA);
  const entityB = await getOrCreateEloEntity(client, teamB);

  const { rows: ea } = await client.query(`SELECT elo, wins, losses FROM elo_entities WHERE id = $1 FOR UPDATE`, [
    entityA,
  ]);
  const { rows: eb } = await client.query(`SELECT elo, wins, losses FROM elo_entities WHERE id = $1 FOR UPDATE`, [
    entityB,
  ]);
  let ra = Number(ea[0]?.elo ?? ELO_DEFAULT);
  let rb = Number(eb[0]?.elo ?? ELO_DEFAULT);
  if (!Number.isFinite(ra)) ra = ELO_DEFAULT;
  if (!Number.isFinite(rb)) rb = ELO_DEFAULT;

  const { newA, newB, deltaA, deltaB } = computeMatchElo(ra, rb, sA, k);

  const wA = sA === 1;
  const winsA = Number(ea[0]?.wins ?? 0) + (wA ? 1 : 0);
  const lossesA = Number(ea[0]?.losses ?? 0) + (wA ? 0 : 1);
  const winsB = Number(eb[0]?.wins ?? 0) + (wA ? 0 : 1);
  const lossesB = Number(eb[0]?.losses ?? 0) + (wA ? 1 : 0);

  await client.query(
    `UPDATE elo_entities SET elo = $1, wins = $2, losses = $3, display_name = COALESCE(NULLIF(TRIM($4), ''), display_name),
      tag = COALESCE(NULLIF(TRIM($5), ''), tag), updated_date = NOW() WHERE id = $6`,
    [newA, winsA, lossesA, teamA.name, teamA.tag, entityA]
  );
  await client.query(
    `UPDATE elo_entities SET elo = $1, wins = $2, losses = $3, display_name = COALESCE(NULLIF(TRIM($4), ''), display_name),
      tag = COALESCE(NULLIF(TRIM($5), ''), tag), updated_date = NOW() WHERE id = $6`,
    [newB, winsB, lossesB, teamB.name, teamB.tag, entityB]
  );

  await client.query(
    `INSERT INTO team_ratings_history (elo_entity_id, match_id, tournament_id, tenant_id, rating_before, rating_after, delta, k_factor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entityA, mid, tid, ten, ra, newA, deltaA, k]
  );
  await client.query(
    `INSERT INTO team_ratings_history (elo_entity_id, match_id, tournament_id, tenant_id, rating_before, rating_after, delta, k_factor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entityB, mid, tid, ten, rb, newB, deltaB, k]
  );

  await client.query(`UPDATE teams SET elo = $1, updated_date = NOW() WHERE id::text = $2`, [newA, wa]);
  await client.query(`UPDATE teams SET elo = $1, updated_date = NOW() WHERE id::text = $2`, [newB, wb]);

  return { ok: true, entityA, entityB, newA, newB, deltaA, deltaB, k };
}

async function getOrCreateEloEntity(client, teamRow) {
  const teamId = String(teamRow.id);
  const { rows: link } = await client.query(`SELECT elo_entity_id FROM team_elo_links WHERE team_id::text = $1`, [
    teamId,
  ]);
  if (link[0]?.elo_entity_id) return link[0].elo_entity_id;

  const ten = String(teamRow.tenant_id || '');
  const { rows: ins } = await client.query(
    `INSERT INTO elo_entities (tenant_id, display_name, tag, elo, wins, losses)
     VALUES ($1, $2, $3, $4, 0, 0) RETURNING id`,
    [ten, String(teamRow.name || 'Team'), String(teamRow.tag || 'TAG'), ELO_DEFAULT]
  );
  const eid = ins[0].id;
  await client.query(`INSERT INTO team_elo_links (team_id, elo_entity_id) VALUES ($1, $2)`, [teamId, eid]);
  return eid;
}
