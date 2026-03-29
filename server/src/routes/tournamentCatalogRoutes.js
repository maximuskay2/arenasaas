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
                tn.name AS organizer_name,
                tn.slug AS organizer_slug
         FROM teams tm
         INNER JOIN tournaments t ON t.id::text = tm.tournament_id::text
         LEFT JOIN tenants tn ON tn.id::text = t.tenant_id
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

      return { team, appearances, roster_stats: rosterStats.rows, career_prize_total: careerPrize };
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

export async function invalidateTournamentCatalogCache() {
  catalogCache.clear();
  discoveryDashboardCache.clear();
  await catalogRedisInvalidate();
}

export default router;
