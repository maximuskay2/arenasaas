import { computeMatchElo, ELO_DEFAULT, kFactorFromTournament } from './elo.js';

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

  let tourney = tournament;
  if (!tourney || tourney.prize_pool === undefined || tourney.elo_tier === undefined) {
    const { rows } = await client.query(
      `SELECT prize_pool, elo_tier FROM tournaments WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`,
      [tid, ten]
    );
    tourney = { ...(tournament || {}), ...rows[0] };
  }
  const k = kFactorFromTournament(tourney);
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

  // Solo / 1v1: also update player Elo for captain (and single roster player)
  const playerElo = await applyPlayerEloForSoloMatch(client, {
    matchId: mid,
    tournamentId: tid,
    tenantId: ten,
    teamA,
    teamB,
    winnerTeamId: win,
    k,
  });

  return { ok: true, entityA, entityB, newA, newB, deltaA, deltaB, k, playerElo };
}

function isSoloTeam(teamRow) {
  const roster = Array.isArray(teamRow?.roster) ? teamRow.roster : [];
  if (roster.length <= 1) return true;
  return false;
}

function captainUserKey(teamRow) {
  return String(teamRow?.captain_email || teamRow?.created_by || '')
    .trim()
    .toLowerCase();
}

/**
 * When both sides are solo (roster ≤1), maintain separate player Elo ladder.
 */
async function applyPlayerEloForSoloMatch(client, { matchId, tournamentId, tenantId, teamA, teamB, winnerTeamId, k }) {
  if (!isSoloTeam(teamA) || !isSoloTeam(teamB)) return { skipped: true, reason: 'not_solo' };

  const emailA = captainUserKey(teamA);
  const emailB = captainUserKey(teamB);
  if (!emailA || !emailB) return { skipped: true, reason: 'missing_captain' };

  const { rows: users } = await client.query(
    `SELECT id, email, full_name FROM users WHERE lower(email) = ANY($1::text[])`,
    [[emailA, emailB]]
  );
  const byEmail = Object.fromEntries(users.map((u) => [String(u.email).toLowerCase(), u]));
  const userA = byEmail[emailA];
  const userB = byEmail[emailB];
  if (!userA || !userB) return { skipped: true, reason: 'users_missing' };

  const dup = await client.query(
    `SELECT 1 FROM team_ratings_history h
     INNER JOIN elo_entities e ON e.id = h.elo_entity_id
     WHERE h.match_id::text = $1 AND e.entity_kind = 'player' LIMIT 1`,
    [matchId]
  );
  if (dup.rowCount) return { skipped: true, reason: 'player_already_applied' };

  const entityA = await getOrCreatePlayerEloEntity(client, userA, tenantId);
  const entityB = await getOrCreatePlayerEloEntity(client, userB, tenantId);

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

  const sA = String(winnerTeamId) === String(teamA.id) ? 1 : 0;
  const { newA, newB, deltaA, deltaB } = computeMatchElo(ra, rb, sA, k);
  const wA = sA === 1;

  await client.query(
    `UPDATE elo_entities SET elo = $1, wins = $2, losses = $3, updated_date = NOW() WHERE id = $4`,
    [
      newA,
      Number(ea[0]?.wins ?? 0) + (wA ? 1 : 0),
      Number(ea[0]?.losses ?? 0) + (wA ? 0 : 1),
      entityA,
    ]
  );
  await client.query(
    `UPDATE elo_entities SET elo = $1, wins = $2, losses = $3, updated_date = NOW() WHERE id = $4`,
    [
      newB,
      Number(eb[0]?.wins ?? 0) + (wA ? 0 : 1),
      Number(eb[0]?.losses ?? 0) + (wA ? 1 : 0),
      entityB,
    ]
  );

  await client.query(
    `INSERT INTO team_ratings_history (elo_entity_id, match_id, tournament_id, tenant_id, rating_before, rating_after, delta, k_factor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entityA, matchId, tournamentId, tenantId, ra, newA, deltaA, k]
  );
  await client.query(
    `INSERT INTO team_ratings_history (elo_entity_id, match_id, tournament_id, tenant_id, rating_before, rating_after, delta, k_factor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entityB, matchId, tournamentId, tenantId, rb, newB, deltaB, k]
  );

  return { ok: true, entityA, entityB, newA, newB };
}

async function getOrCreateEloEntity(client, teamRow) {
  const teamId = String(teamRow.id);
  const { rows: link } = await client.query(`SELECT elo_entity_id FROM team_elo_links WHERE team_id::text = $1`, [
    teamId,
  ]);
  if (link[0]?.elo_entity_id) return link[0].elo_entity_id;

  const ten = String(teamRow.tenant_id || '');
  const { rows: ins } = await client.query(
    `INSERT INTO elo_entities (tenant_id, display_name, tag, elo, wins, losses, entity_kind)
     VALUES ($1, $2, $3, $4, 0, 0, 'team') RETURNING id`,
    [ten, String(teamRow.name || 'Team'), String(teamRow.tag || 'TAG'), ELO_DEFAULT]
  );
  const eid = ins[0].id;
  await client.query(`INSERT INTO team_elo_links (team_id, elo_entity_id) VALUES ($1, $2)`, [teamId, eid]);
  return eid;
}

async function getOrCreatePlayerEloEntity(client, userRow, tenantId) {
  const userId = String(userRow.id);
  try {
    const { rows: link } = await client.query(
      `SELECT elo_entity_id FROM player_elo_links WHERE user_id::text = $1 LIMIT 1`,
      [userId]
    );
    if (link[0]?.elo_entity_id) return link[0].elo_entity_id;
  } catch {
    /* table may not exist until migrate */
  }

  const ten = String(tenantId || 'platform');
  const display = String(userRow.full_name || userRow.email || 'Player').slice(0, 80);
  const tag = String(userRow.email || 'PLR')
    .split('@')[0]
    .slice(0, 8)
    .toUpperCase();
  const { rows: ins } = await client.query(
    `INSERT INTO elo_entities (tenant_id, display_name, tag, elo, wins, losses, entity_kind)
     VALUES ($1, $2, $3, $4, 0, 0, 'player') RETURNING id`,
    [ten, display, tag, ELO_DEFAULT]
  );
  const eid = ins[0].id;
  try {
    await client.query(`INSERT INTO player_elo_links (user_id, elo_entity_id) VALUES ($1::uuid, $2)`, [userId, eid]);
  } catch {
    /* ignore if table missing mid-deploy */
  }
  return eid;
}
