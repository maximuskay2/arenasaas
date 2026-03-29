/**
 * Aggregated public discovery dashboard (same visibility as tournament catalog).
 * All queries run under catalog read RLS context.
 */

const VIS_TOURNAMENTS = `t.status IS NOT NULL AND t.status NOT IN ('draft', 'cancelled')`;

export async function runDiscoveryDashboardQueries(client) {
  const statsSql = `
    SELECT
      (SELECT COUNT(*)::int FROM tournaments t WHERE ${VIS_TOURNAMENTS}) AS tournaments,
      (SELECT COUNT(*)::int FROM matches m
        INNER JOIN tournaments t ON t.id::text = m.tournament_id::text
        WHERE ${VIS_TOURNAMENTS}) AS matches,
      (SELECT COUNT(*)::int FROM teams tm
        INNER JOIN tournaments t ON t.id::text = tm.tournament_id::text
        WHERE ${VIS_TOURNAMENTS}) AS teams,
      (SELECT COUNT(DISTINCT lower(trim(ps.player_email)))::int FROM player_stats ps
        INNER JOIN tournaments t ON t.id::text = ps.tournament_id::text
        WHERE ${VIS_TOURNAMENTS}
          AND ps.player_email IS NOT NULL AND btrim(ps.player_email) <> '') AS players,
      (SELECT COUNT(DISTINCT NULLIF(trim(t.game_title), ''))::int FROM tournaments t WHERE ${VIS_TOURNAMENTS}) AS games
  `;

  const recentSql = `
    SELECT
      t.id, t.name, t.game_title, t.status, t.banner_url, t.end_date, t.start_date, t.created_date,
      tn.name AS organizer_name, tn.slug AS organizer_slug
    FROM tournaments t
    LEFT JOIN tenants tn ON tn.id::text = t.tenant_id
    WHERE t.status = 'completed'
    ORDER BY COALESCE(t.finalized_at, t.end_date, t.updated_date, t.created_date) DESC NULLS LAST
    LIMIT 8
  `;

  const upcomingSql = `
    SELECT
      t.id, t.name, t.game_title, t.status, t.banner_url, t.start_date, t.registration_deadline, t.created_date,
      tn.name AS organizer_name, tn.slug AS organizer_slug
    FROM tournaments t
    LEFT JOIN tenants tn ON tn.id::text = t.tenant_id
    WHERE ${VIS_TOURNAMENTS}
      AND t.start_date >= NOW()
      AND t.status IN ('registration_open', 'registration_closed')
    ORDER BY t.start_date ASC
    LIMIT 8
  `;

  const liveSql = `
    SELECT
      m.id, m.tournament_id, m.team_a_name, m.team_b_name, m.team_a_id, m.team_b_id,
      m.score_a, m.score_b, m.status AS match_status, m.scheduled_time, m.updated_date,
      t.name AS tournament_name, t.game_title, t.status AS tournament_status,
      tn.name AS organizer_name, tn.slug AS organizer_slug
    FROM matches m
    INNER JOIN tournaments t ON t.id::text = m.tournament_id::text
    LEFT JOIN tenants tn ON tn.id::text = t.tenant_id
    WHERE ${VIS_TOURNAMENTS}
      AND m.status IN ('in_progress', 'checked_in', 'check_in_open')
    ORDER BY m.updated_date DESC NULLS LAST, m.scheduled_time DESC NULLS LAST
    LIMIT 12
  `;

  const orgsSql = `
    SELECT
      COALESCE(tn.id::text, t.tenant_id, '') AS tenant_id,
      COALESCE(tn.name, 'Independent') AS organizer_name,
      COALESCE(tn.slug, '') AS organizer_slug,
      MAX(tn.logo_url) AS organizer_logo_url,
      COUNT(*)::int AS tournament_count
    FROM tournaments t
    LEFT JOIN tenants tn ON tn.id::text = t.tenant_id
    WHERE ${VIS_TOURNAMENTS}
    GROUP BY COALESCE(tn.id::text, t.tenant_id, ''), COALESCE(tn.name, 'Independent'), COALESCE(tn.slug, '')
    ORDER BY tournament_count DESC
    LIMIT 8
  `;

  const teamsSql = `
    WITH vis AS (
      SELECT id::text AS tid FROM tournaments t WHERE ${VIS_TOURNAMENTS}
    )
    SELECT tm.id, tm.name, tm.tag, tm.logo_url, tm.tournament_id, COUNT(m.id)::int AS match_count
    FROM teams tm
    INNER JOIN vis ON vis.tid = tm.tournament_id::text
    INNER JOIN matches m ON m.tournament_id::text = tm.tournament_id::text
      AND (m.team_a_id::text = tm.id::text OR m.team_b_id::text = tm.id::text)
      AND m.status <> 'pending'
    GROUP BY tm.id, tm.name, tm.tag, tm.logo_url, tm.tournament_id
    ORDER BY match_count DESC
    LIMIT 8
  `;

  const gamesSql = `
    SELECT COALESCE(NULLIF(trim(t.game_title), ''), 'Other') AS game_title, COUNT(m.id)::int AS match_count
    FROM matches m
    INNER JOIN tournaments t ON t.id::text = m.tournament_id::text
    WHERE ${VIS_TOURNAMENTS}
    GROUP BY 1
    ORDER BY match_count DESC
    LIMIT 8
  `;

  const [
    statsRes,
    recentRes,
    upcomingRes,
    liveRes,
    orgsRes,
    teamsRes,
    gamesRes,
  ] = await Promise.all([
    client.query(statsSql),
    client.query(recentSql),
    client.query(upcomingSql),
    client.query(liveSql),
    client.query(orgsSql),
    client.query(teamsSql),
    client.query(gamesSql),
  ]);

  const s = statsRes.rows[0] || {};
  return {
    stats: {
      tournaments: Number(s.tournaments) || 0,
      matches: Number(s.matches) || 0,
      teams: Number(s.teams) || 0,
      players: Number(s.players) || 0,
      games: Number(s.games) || 0,
    },
    recent_tournaments: recentRes.rows,
    upcoming_tournaments: upcomingRes.rows,
    live_matches: liveRes.rows,
    top_organizations: orgsRes.rows,
    top_teams: teamsRes.rows,
    top_games: gamesRes.rows,
  };
}
