/**
 * Public tournament discovery catalog (paginated, in-memory + optional Redis TTL cache).
 */
import express from 'express';
import { pool } from '../db.js';
import { runWithRls } from '../rls/transaction.js';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { optionalAuth } from '../middleware/auth.js';
import { buildPrizeSummary } from '../lib/prizeCalculator.js';
import { catalogRedisGet, catalogRedisSet, catalogRedisInvalidate } from '../cache/catalogRedis.js';
import { runDiscoveryDashboardQueries } from '../lib/discoveryDashboard.js';

const router = express.Router();

const CATALOG_TTL_MS = Number(process.env.TOURNAMENT_CATALOG_CACHE_TTL_MS || 15_000);
const CATALOG_TTL_SEC = Math.max(1, Math.ceil(CATALOG_TTL_MS / 1000));
const catalogCache = new Map();
const DISCOVERY_DASHBOARD_KEY = 'discovery-dashboard-v1';
const discoveryDashboardCache = new Map();

function cacheKey(qs) {
  return JSON.stringify({
    page: qs.page,
    limit: qs.limit,
    q: qs.q,
    game: qs.game,
    organizer: qs.organizer,
    status: qs.status,
    fee_min: qs.fee_min,
    fee_max: qs.fee_max,
  });
}

function catalogReadContext() {
  return { isPlatformAdmin: true };
}

async function fetchCatalogBody({ page, limit, q, game, organizer, status, feeMin, feeMax }) {
  const offset = (page - 1) * limit;
  const conditions = [`t.status IS NOT NULL`, `t.status NOT IN ('draft', 'cancelled')`];
  const vals = [];
  let i = 1;

  if (q) {
    conditions.push(`(t.name ILIKE $${i} OR t.game_title ILIKE $${i})`);
    vals.push(`%${q}%`);
    i += 1;
  }
  if (game) {
    conditions.push(`t.game_title = $${i}`);
    vals.push(game);
    i += 1;
  }
  if (organizer) {
    conditions.push(`(tn.name ILIKE $${i} OR tn.slug ILIKE $${i})`);
    vals.push(`%${organizer}%`);
    i += 1;
  }
  if (status && status !== 'all') {
    if (status === 'open') {
      conditions.push(`t.status = 'registration_open'`);
    } else if (status === 'live') {
      conditions.push(`t.status = 'in_progress'`);
    } else if (status === 'completed') {
      conditions.push(`t.status = 'completed'`);
    } else if (status === 'upcoming') {
      conditions.push(`t.status IN ('registration_closed')`);
    } else {
      conditions.push(`t.status = $${i}`);
      vals.push(status);
      i += 1;
    }
  }
  if (feeMin !== null && !Number.isNaN(feeMin)) {
    conditions.push(`COALESCE(t.entry_fee, 0) >= $${i}`);
    vals.push(feeMin);
    i += 1;
  }
  if (feeMax !== null && !Number.isNaN(feeMax)) {
    conditions.push(`COALESCE(t.entry_fee, 0) <= $${i}`);
    vals.push(feeMax);
    i += 1;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  vals.push(limit, offset);

  const sql = `
    SELECT
      t.*,
      tn.name AS organizer_name,
      tn.slug AS organizer_slug,
      gt.roster_size AS roster_size
    FROM tournaments t
    LEFT JOIN tenants tn ON tn.id::text = t.tenant_id
    LEFT JOIN game_templates gt ON gt.id::text = t.game_template_id
    ${where}
    ORDER BY t.created_date DESC
    LIMIT $${i} OFFSET $${i + 1}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS c
    FROM tournaments t
    LEFT JOIN tenants tn ON tn.id::text = t.tenant_id
    LEFT JOIN game_templates gt ON gt.id::text = t.game_template_id
    ${where}
  `;

  const countVals = vals.slice(0, vals.length - 2);
  const [listRes, countRes] = await Promise.all([
    runWithRls(pool, catalogReadContext(), (client) => client.query(sql, vals)),
    runWithRls(pool, catalogReadContext(), (client) => client.query(countSql, countVals)),
  ]);

  const total = countRes.rows[0]?.c ?? 0;
  const rows = listRes.rows.map((row) => ({
    ...row,
    joined_count: row.registered_teams ?? 0,
    max_slots: row.max_teams ?? 0,
    prize_summary: buildPrizeSummary(row),
  }));

  return {
    items: rows,
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function handleCatalog(req, res) {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24));
  const q = String(req.query.q || '').trim();
  const game = String(req.query.game || '').trim();
  const organizer = String(req.query.organizer || '').trim();
  const status = String(req.query.status || '').trim();
  const feeMin = req.query.fee_min !== undefined && req.query.fee_min !== '' ? Number(req.query.fee_min) : null;
  const feeMax = req.query.fee_max !== undefined && req.query.fee_max !== '' ? Number(req.query.fee_max) : null;

  const ck = cacheKey({ page, limit, q, game, organizer, status, fee_min: feeMin, fee_max: feeMax });
  const redisKey = `arena:tcatalog:${ck}`;
  const now = Date.now();

  const mem = catalogCache.get(ck);
  if (mem && now - mem.at < CATALOG_TTL_MS) {
    res.set('X-Cache', 'HIT');
    return res.json(mem.body);
  }

  const redisHit = await catalogRedisGet(redisKey);
  if (redisHit) {
    catalogCache.set(ck, { at: now, body: redisHit });
    res.set('X-Cache', 'HIT-REDIS');
    return res.json(redisHit);
  }

  try {
    const body = await fetchCatalogBody({ page, limit, q, game, organizer, status, feeMin, feeMax });
    catalogCache.set(ck, { at: now, body });
    await catalogRedisSet(redisKey, body, CATALOG_TTL_SEC);
    if (catalogCache.size > 200) {
      const cutoff = now - CATALOG_TTL_MS;
      for (const [k, v] of catalogCache) {
        if (v.at < cutoff) catalogCache.delete(k);
      }
    }
    res.set('X-Cache', 'MISS');
    res.json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
}

/** Single tournament for public detail pages (organizer name, roster_size, same visibility as catalog). */
router.get('/tournament/:id', optionalAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const r = await runWithRls(pool, catalogReadContext(), (client) =>
      client.query(
        `SELECT
          t.*,
          tn.name AS organizer_name,
          tn.slug AS organizer_slug,
          gt.roster_size AS roster_size
        FROM tournaments t
        LEFT JOIN tenants tn ON tn.id::text = t.tenant_id
        LEFT JOIN game_templates gt ON gt.id::text = t.game_template_id
        WHERE t.id::text = $1 AND t.status IS NOT NULL AND t.status NOT IN ('draft', 'cancelled')`,
        [id]
      )
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Tournament not found' });
    const row = r.rows[0];
    res.json({
      ...row,
      joined_count: row.registered_teams ?? 0,
      max_slots: row.max_teams ?? 0,
      prize_summary: buildPrizeSummary(row),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

const PUBLIC_TOURNAMENT_WHERE = `t.id::text = $1 AND t.status IS NOT NULL AND t.status NOT IN ('draft', 'cancelled')`;

/** Teams for bracket / roster when the viewer is not in the organizer tenant (RLS-safe via catalog read context). */
router.get('/tournament/:id/teams', optionalAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const rows = await runWithRls(pool, catalogReadContext(), async (client) => {
      const check = await client.query(`SELECT 1 FROM tournaments t WHERE ${PUBLIC_TOURNAMENT_WHERE}`, [id]);
      if (!check.rows.length) return null;
      const r = await client.query(
        `SELECT * FROM teams WHERE tournament_id::text = $1 ORDER BY seed NULLS LAST, name ASC`,
        [id]
      );
      return r.rows;
    });
    if (rows === null) return res.status(404).json({ error: 'Tournament not found' });
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** League table for round-robin / swiss (+3 / +1), rebuilt from completed matches. */
router.get('/tournament/:id/league-standings', optionalAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const rows = await runWithRls(pool, catalogReadContext(), async (client) => {
      const tr = await client.query(
        `SELECT format FROM tournaments t WHERE ${PUBLIC_TOURNAMENT_WHERE} LIMIT 1`,
        [id]
      );
      if (!tr.rows.length) return null;
      const fmt = String(tr.rows[0]?.format || '');
      if (fmt !== 'round_robin' && fmt !== 'swiss') return { format: fmt, standings: [] };
      const r = await client.query(
        `SELECT team_id, team_name, played, wins, draws, losses, points, goals_for, goals_against, updated_date
         FROM tournament_league_standings
         WHERE tournament_id::text = $1
         ORDER BY points DESC,
           (goals_for - goals_against) DESC,
           wins DESC,
           team_id ASC`,
        [id]
      );
      return { format: fmt, standings: r.rows };
    });
    if (rows === null) return res.status(404).json({ error: 'Tournament not found' });
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Matches for bracket view (same visibility as catalog). */
router.get('/tournament/:id/matches', optionalAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const rows = await runWithRls(pool, catalogReadContext(), async (client) => {
      const check = await client.query(`SELECT 1 FROM tournaments t WHERE ${PUBLIC_TOURNAMENT_WHERE}`, [id]);
      if (!check.rows.length) return null;
      const r = await client.query(
        `SELECT * FROM matches WHERE tournament_id::text = $1 ORDER BY round ASC, match_number ASC`,
        [id]
      );
      return r.rows;
    });
    if (rows === null) return res.status(404).json({ error: 'Tournament not found' });
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Standings + optional player_stats leaderboard for the Performance tab. */
router.get('/tournament/:id/performance', optionalAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const body = await runWithRls(pool, catalogReadContext(), async (client) => {
      const check = await client.query(`SELECT 1 FROM tournaments t WHERE ${PUBLIC_TOURNAMENT_WHERE}`, [id]);
      if (!check.rows.length) return null;
      const [teamsR, playersR] = await Promise.all([
        client.query(
          `SELECT id, name, tag, wins, losses, status, seed
           FROM teams WHERE tournament_id::text = $1
           ORDER BY wins DESC, losses ASC, name ASC`,
          [id]
        ),
        client.query(
          `SELECT player_name, player_email, team_id, kills, deaths, assists, won, game_title
           FROM player_stats WHERE tournament_id::text = $1
           ORDER BY kills DESC NULLS LAST, deaths ASC NULLS LAST
           LIMIT 40`,
          [id]
        ),
      ]);
      return { teams: teamsR.rows, top_players: playersR.rows };
    });
    if (body === null) return res.status(404).json({ error: 'Tournament not found' });
    res.json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Public team profile — roster, appearances by tag, prize totals (catalog visibility). */
router.get('/team/:id', optionalAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const body = await runWithRls(pool, catalogReadContext(), async (client) => {
      const tr = await client.query(
        `SELECT tm.*,
                t.name AS tournament_name,
                t.status AS tournament_status,
                t.game_title,
                t.prize_pool,
                t.stream_url AS tournament_stream_url,
                tn.name AS organizer_name,
                tn.slug AS organizer_slug,
                ee.elo AS global_elo,
                ee.id AS elo_entity_id
         FROM teams tm
         INNER JOIN tournaments t ON t.id::text = tm.tournament_id::text
         LEFT JOIN tenants tn ON tn.id::text = t.tenant_id
         LEFT JOIN team_elo_links tel ON tel.team_id::text = tm.id::text
         LEFT JOIN elo_entities ee ON ee.id = tel.elo_entity_id
         WHERE tm.id::text = $1
           AND t.status IS NOT NULL
           AND t.status NOT IN ('draft', 'cancelled')`,
        [id]
      );
      const team = tr.rows[0];
      if (!team) return null;

      const tagNorm = String(team.tag || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      let appearances = [];
      if (tagNorm) {
        const ar = await client.query(
          `SELECT tm.id, tm.name, tm.tournament_id, tm.wins, tm.losses, tm.tag, tm.status,
                  t.name AS tournament_name, t.status AS tournament_status, t.game_title
           FROM teams tm
           INNER JOIN tournaments t ON t.id::text = tm.tournament_id::text
           WHERE upper(regexp_replace(coalesce(tm.tag, ''), '[^a-zA-Z0-9]', '', 'g')) = $1
             AND t.status NOT IN ('draft', 'cancelled')
           ORDER BY t.created_date DESC
           LIMIT 30`,
          [tagNorm]
        );
        appearances = ar.rows;
      }

      const rosterStats = await client.query(
        `SELECT player_email,
                MAX(player_name) AS player_name,
                SUM(COALESCE(kills, 0))::int AS kills,
                SUM(COALESCE(deaths, 0))::int AS deaths,
                SUM(COALESCE(assists, 0))::int AS assists,
                BOOL_OR(COALESCE(won, false)) AS won_any
         FROM player_stats
         WHERE team_id::text = $1
         GROUP BY player_email
         ORDER BY SUM(COALESCE(kills, 0)) DESC NULLS LAST
         LIMIT 40`,
        [id]
      );

      const prizeR = await client.query(
        `SELECT COALESCE(SUM(prize_amount), 0)::numeric AS s
         FROM prize_payments
         WHERE team_id::text = $1 AND status IN ('sent', 'confirmed')`,
        [id]
      );
      const careerPrize = Number(prizeR.rows[0]?.s || 0);

      let apex_tier = false;
      if (team.elo_entity_id) {
        const { rows: rk } = await client.query(
          `SELECT 1 + COUNT(*)::int AS r
           FROM elo_entities e
           WHERE (e.wins + e.losses) > 0
             AND e.elo > (SELECT elo FROM elo_entities WHERE id = $1::uuid)`,
          [team.elo_entity_id]
        );
        apex_tier = Number(rk[0]?.r) <= 10;
      }

      return { team: { ...team, apex_tier }, appearances, roster_stats: rosterStats.rows, career_prize_total: careerPrize };
    });

    if (!body) return res.status(404).json({ error: 'Team not found' });
    res.json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Aggregated widgets for /tournaments discovery (stats, lists, rankings). */
router.get('/discovery/dashboard', optionalAuth, async (req, res) => {
  const now = Date.now();
  const mem = discoveryDashboardCache.get(DISCOVERY_DASHBOARD_KEY);
  if (mem && now - mem.at < CATALOG_TTL_MS) {
    res.set('X-Cache', 'HIT');
    return res.json(mem.body);
  }
  const redisKey = `arena:discovery:${DISCOVERY_DASHBOARD_KEY}`;
  const redisHit = await catalogRedisGet(redisKey);
  if (redisHit) {
    discoveryDashboardCache.set(DISCOVERY_DASHBOARD_KEY, { at: now, body: redisHit });
    res.set('X-Cache', 'HIT-REDIS');
    return res.json(redisHit);
  }
  try {
    const body = await runWithRls(pool, catalogReadContext(), (client) => runDiscoveryDashboardQueries(client));
    discoveryDashboardCache.set(DISCOVERY_DASHBOARD_KEY, { at: now, body });
    await catalogRedisSet(redisKey, body, CATALOG_TTL_SEC);
    res.set('X-Cache', 'MISS');
    res.json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Paginated discovery — canonical path. */
router.get('/tournaments-catalog', optionalAuth, handleCatalog);

/** Alias — matches TRANSACTION_LAYER public tournaments naming. */
router.get('/tournaments', optionalAuth, handleCatalog);

/** Match Center: stream URL resolution for embed (Twitch / YouTube) + multi-stream list. */
router.get('/match/:matchId/watch', optionalAuth, async (req, res) => {
  const matchId = String(req.params.matchId || '').trim();
  if (!matchId) return res.status(400).json({ error: 'matchId required' });
  try {
    const payload = await runWithRls(pool, catalogReadContext(), async (client) => {
      const { rows } = await client.query(
        `SELECT m.*, t.name AS tournament_name, t.stream_url AS tournament_stream_url, t.status AS tournament_status,
                t.id::text AS tournament_uuid
         FROM matches m
         INNER JOIN tournaments t ON t.id::text = m.tournament_id::text
         WHERE m.id::text = $1 AND t.status NOT IN ('draft', 'cancelled') LIMIT 1`,
        [matchId]
      );
      const row = rows[0] || null;
      if (!row) return null;

      let streams = [];
      try {
        const s = await client.query(
          `SELECT id, label, stream_url, provider, sort_order, is_primary, match_id
           FROM tournament_streams
           WHERE tournament_id::text = $1
             AND (match_id IS NULL OR match_id::text = $2 OR btrim(match_id) = '')
           ORDER BY is_primary DESC, sort_order ASC, created_date ASC
           LIMIT 20`,
          [String(row.tournament_id), matchId]
        );
        streams = s.rows;
      } catch {
        streams = [];
      }

      const primary =
        streams.find((x) => x.is_primary)?.stream_url ||
        streams[0]?.stream_url ||
        row.stream_url ||
        row.tournament_stream_url ||
        '';

      // Synthesize default list when only legacy columns exist
      if (!streams.length && primary) {
        streams = [
          {
            id: 'legacy-main',
            label: 'Main',
            stream_url: primary,
            provider: null,
            sort_order: 0,
            is_primary: true,
            match_id: matchId,
          },
        ];
      }

      return { match: row, stream_url: primary, streams };
    });
    if (!payload) return res.status(404).json({ error: 'Match not found' });
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Global Elo leaderboard (+ trend vs ~14d snapshot, Apex top 10). Query: kind=team|player (default team). */
router.get('/power-rankings', optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const kindRaw = String(req.query.kind || 'team').toLowerCase();
    const entityKind = kindRaw === 'player' ? 'player' : 'team';
    const rankings = await runWithRls(pool, catalogReadContext(), async (client) => {
      const { rows } = await client.query(
        `WITH ranked AS (
           SELECT e.*,
             ROW_NUMBER() OVER (ORDER BY e.elo DESC, e.wins DESC, e.losses ASC) AS global_rank
           FROM elo_entities e
           WHERE (e.wins + e.losses) > 0
             AND COALESCE(e.entity_kind, 'team') = $2
         )
         SELECT r.*,
           (SELECT h.rating_after FROM team_ratings_history h
            WHERE h.elo_entity_id = r.id AND h.created_date <= NOW() - INTERVAL '14 days'
            ORDER BY h.created_date DESC LIMIT 1) AS elo_snapshot_14d
         FROM ranked r
         ORDER BY r.global_rank ASC
         LIMIT $1`,
        [limit, entityKind]
      );
      return rows.map((row) => {
        const apex = Number(row.global_rank) <= 10;
        const prev = row.elo_snapshot_14d != null ? Number(row.elo_snapshot_14d) : null;
        const elo = Number(row.elo);
        let trend = 'flat';
        if (prev != null && Number.isFinite(prev)) {
          if (elo > prev + 5) trend = 'up';
          else if (elo < prev - 5) trend = 'down';
        }
        return {
          id: row.id,
          display_name: row.display_name,
          tag: row.tag,
          tenant_id: row.tenant_id,
          entity_kind: row.entity_kind || entityKind,
          elo,
          wins: row.wins,
          losses: row.losses,
          global_rank: Number(row.global_rank),
          trend,
          apex_tier: apex,
        };
      });
    });
    res.json({ rankings, kind: entityKind });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Cross-tenant career snapshot for recruitment card (public directory read). */
router.get('/player-career', optionalAuth, async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email query required' });
  try {
    const body = await runWithRls(pool, catalogReadContext(), async (client) => {
      const { rows: users } = await client.query(`SELECT id, full_name, email FROM users WHERE lower(email) = $1 LIMIT 1`, [
        email,
      ]);
      const u = users[0];
      if (!u) return { user: null };

      const { rows: accolades } = await client.query(
        `SELECT tournament_id, tournament_title, rank, badge_id, metadata, created_date
         FROM user_accolades WHERE user_id = $1 ORDER BY created_date DESC LIMIT 80`,
        [u.id]
      );

      const { rows: archiveRows } = await client.query(
        `SELECT ta.tournament_id,
                ta.archived_at,
                COALESCE(ta.snapshot->'tournament'->>'name', 'Tournament') AS tournament_title
         FROM tournament_archives ta
         WHERE EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(ta.snapshot->'teams', '[]'::jsonb)) AS team
           WHERE lower(COALESCE(team->>'captain_email', '')) = lower($1::text)
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(team->'roster', '[]'::jsonb)) AS r
                WHERE lower(COALESCE(r->>'player_email', '')) = lower($1::text)
              )
         )
         ORDER BY ta.archived_at DESC
         LIMIT 24`,
        [email]
      );
      const accoladeTids = new Set(accolades.map((a) => String(a.tournament_id)));
      const archive_milestones = archiveRows
        .filter((r) => !accoladeTids.has(String(r.tournament_id)))
        .map((r) => ({
          tournament_id: r.tournament_id,
          tournament_title: r.tournament_title,
          archived_at: r.archived_at,
        }));

      const { rows: statAgg } = await client.query(
        `SELECT COUNT(*)::int AS played,
            SUM(CASE WHEN COALESCE(won, false) THEN 1 ELSE 0 END)::int AS wins
         FROM player_stats WHERE lower(player_email) = lower($1)`,
        [email]
      );

      const { rows: byGame } = await client.query(
        `SELECT COALESCE(game_title, 'Unknown') AS game_title, COUNT(*)::int AS cnt
         FROM player_stats WHERE lower(player_email) = lower($1)
         GROUP BY COALESCE(game_title, 'Unknown') ORDER BY cnt DESC LIMIT 8`,
        [email]
      );

      const { rows: earn } = await client.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS s
         FROM payment_ledger
         WHERE beneficiary_user_id = $1::uuid AND type = 'prize_payout' AND status = 'completed'`,
        [u.id]
      );

      const played = Number(statAgg[0]?.played || 0);
      const wins = Number(statAgg[0]?.wins || 0);
      const winRate = played > 0 ? Math.round((wins / played) * 1000) / 10 : 0;
      const mostPlayed = byGame[0]?.game_title || '—';

      return {
        user: { id: u.id, email: u.email, full_name: u.full_name },
        timeline: accolades,
        archive_milestones,
        stats: {
          total_career_earnings: Number(earn[0]?.s || 0),
          most_played_game: mostPlayed,
          win_rate_pct: winRate,
          matches_tracked: played,
          wins,
        },
      };
    });
    if (!body.user) return res.status(404).json({ error: 'User not found' });
    res.json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/**
 * Global live / upcoming watch hub for spectators.
 * GET /api/public/live-matches
 */
router.get('/live-matches', optionalAuth, async (req, res) => {
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
  try {
    const rows = await runWithRls(pool, catalogReadContext(), async (client) => {
      const r = await client.query(
        `
        SELECT
          m.id, m.tournament_id, m.status, m.score_a, m.score_b,
          m.team_a_name, m.team_b_name, m.scheduled_time, m.stream_url AS match_stream_url,
          m.round, m.match_number,
          t.name AS tournament_name, t.game_title, t.stream_url AS tournament_stream_url,
          t.banner_url, t.prize_pool, t.currency, t.tenant_id,
          tn.name AS organizer_name, tn.slug AS organizer_slug,
          COALESCE(m.stream_url, t.stream_url) AS stream_url
        FROM matches m
        INNER JOIN tournaments t ON t.id::text = m.tournament_id::text
        LEFT JOIN tenants tn ON tn.id::text = t.tenant_id
        WHERE t.status NOT IN ('draft', 'cancelled')
          AND m.status IN ('in_progress', 'check_in_open', 'checked_in', 'under_dispute')
        ORDER BY
          CASE m.status WHEN 'in_progress' THEN 0 WHEN 'under_dispute' THEN 1 ELSE 2 END,
          m.scheduled_time NULLS LAST,
          m.updated_date DESC
        LIMIT $1
        `,
        [limit]
      );
      return r.rows;
    });
    res.json({
      items: rows.map((row) => ({
        ...row,
        watch_path: `/matches/${row.id}/live`,
        has_stream: Boolean(row.stream_url),
      })),
      total: rows.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** Organizer event-day ops snapshot for a tenant. */
router.get('/ops-board', optionalAuth, async (req, res) => {
  const tenantId = String(req.query.tenant_id || req.headers['x-tenant-id'] || '').trim();
  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
  try {
    const body = await runWithRls(pool, { isPlatformAdmin: true }, async (client) => {
      const [openReg, live, disputes, checkIn, drafts] = await Promise.all([
        client.query(
          `SELECT id, name, status, registered_teams, max_teams, game_title, prize_pool, currency
           FROM tournaments WHERE tenant_id = $1 AND status = 'registration_open'
           ORDER BY start_date NULLS LAST LIMIT 20`,
          [tenantId]
        ),
        client.query(
          `SELECT m.id, m.tournament_id, m.status, m.team_a_name, m.team_b_name, m.score_a, m.score_b,
                  m.scheduled_time, t.name AS tournament_name
           FROM matches m
           INNER JOIN tournaments t ON t.id::text = m.tournament_id::text
           WHERE m.tenant_id = $1 AND m.status = 'in_progress'
           ORDER BY m.updated_date DESC LIMIT 30`,
          [tenantId]
        ),
        client.query(
          `SELECT m.id, m.tournament_id, m.team_a_name, m.team_b_name, m.status, t.name AS tournament_name
           FROM matches m
           INNER JOIN tournaments t ON t.id::text = m.tournament_id::text
           WHERE m.tenant_id = $1 AND m.status = 'under_dispute'
           ORDER BY m.updated_date DESC LIMIT 20`,
          [tenantId]
        ),
        client.query(
          `SELECT m.id, m.tournament_id, m.team_a_name, m.team_b_name, m.check_in_deadline,
                  m.team_a_checked_in, m.team_b_checked_in, t.name AS tournament_name
           FROM matches m
           INNER JOIN tournaments t ON t.id::text = m.tournament_id::text
           WHERE m.tenant_id = $1 AND m.status IN ('check_in_open', 'checked_in')
           ORDER BY m.check_in_deadline NULLS LAST LIMIT 30`,
          [tenantId]
        ),
        client.query(
          `SELECT id, name, status, game_title FROM tournaments
           WHERE tenant_id = $1 AND status = 'draft' ORDER BY updated_date DESC LIMIT 10`,
          [tenantId]
        ),
      ]);
      return {
        open_registration: openReg.rows,
        live_matches: live.rows,
        disputes: disputes.rows,
        check_ins: checkIn.rows,
        drafts: drafts.rows,
        counts: {
          open_registration: openReg.rows.length,
          live_matches: live.rows.length,
          disputes: disputes.rows.length,
          check_ins: checkIn.rows.length,
          drafts: drafts.rows.length,
        },
      };
    });
    res.json(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export async function invalidateTournamentCatalogCache() {
  catalogCache.clear();
  discoveryDashboardCache.clear();
  await catalogRedisInvalidate();
}

export default router;
