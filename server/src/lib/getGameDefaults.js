/**
 * Resolved defaults for a game title (wizard + server-side helpers).
 * @param {import('pg').QueryResultRow | null | undefined} row
 */
export function mapGameDefaultsRow(row) {
  if (!row) return null;
  const genreIcon = row.genre_icon_url || null;
  const iconUrl = row.icon_url || genreIcon;
  const bannerUrl = row.banner_url || null;
  return {
    title_id: row.id,
    name: row.name,
    slug: row.slug,
    source: row.source,
    suggested_format: row.suggested_format,
    competition_scoring_type: row.competition_scoring_type,
    match_scoring_mode: row.match_scoring_mode,
    team_roster_size: row.default_team_roster_size,
    require_in_game_id: row.require_in_game_id,
    banner_url: bannerUrl,
    icon_url: iconUrl,
    genre_id: row.genre_id,
    genre_name: row.genre_name,
    genre_default_roster_size: row.genre_default_roster_size,
    genre_icon_url: genreIcon,
    verified_at: row.verified_at,
    genre_template_id: row.genre_template_id,
    genre_template_slug: row.genre_template_slug,
    genre_template_name: row.genre_template_name,
    genre_template_rules_summary: row.genre_template_rules_summary,
    genre_template_min_team_size: row.genre_template_min_team_size,
    genre_template_max_team_size: row.genre_template_max_team_size,
    genre_template_swiss_recommended: row.genre_template_swiss_recommended,
  };
}

/** @param {import('pg').PoolClient} client */
export async function queryGameDefaultsById(client, titleId) {
  const { rows } = await client.query(
    `SELECT t.id, t.slug, t.name, t.source, t.suggested_format, t.competition_scoring_type, t.match_scoring_mode,
            t.default_team_roster_size, t.require_in_game_id, t.banner_url, t.icon_url, t.genre_id, t.genre_template_id,
            t.verified_at,
            gg.name AS genre_name, gg.default_roster_size AS genre_default_roster_size, gg.icon_url AS genre_icon_url,
            gtmp.slug AS genre_template_slug, gtmp.name AS genre_template_name, gtmp.rules_summary AS genre_template_rules_summary,
            gtmp.min_team_size AS genre_template_min_team_size, gtmp.max_team_size AS genre_template_max_team_size,
            gtmp.swiss_recommended AS genre_template_swiss_recommended
     FROM game_titles t
     INNER JOIN game_genres gg ON gg.id = t.genre_id
     LEFT JOIN game_genre_templates gtmp ON gtmp.id = t.genre_template_id
     WHERE t.id = $1::uuid
     LIMIT 1`,
    [titleId]
  );
  return mapGameDefaultsRow(rows[0]);
}
