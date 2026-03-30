import express from 'express';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { optionalAuth } from '../middleware/auth.js';
import { runWithRls } from '../rls/transaction.js';
import { queryGameDefaultsById } from '../lib/getGameDefaults.js';

const router = express.Router();
router.use(optionalAuth);

function taxonomyReadCtx(req) {
  const user = req.user;
  const h = req.headers || {};
  const headerTenant = String(h['x-tenant-id'] || h['X-Tenant-ID'] || '').trim();
  const jwtTenant = user?.tenant_id != null && String(user.tenant_id).trim() !== '' ? String(user.tenant_id).trim() : '';
  return {
    tenantId: headerTenant || jwtTenant,
    isPlatformAdmin: user?.role === 'admin' || user?.role === 'super_admin',
    userId: user?.sub || '',
    userEmail: user?.email || '',
    allowGameTaxonomyPublicRead: true,
    allowGameTemplateRead: true,
  };
}

router.get('/platforms', async (req, res) => {
  try {
    const { rows } = await runWithRls(pool, taxonomyReadCtx(req), (c) =>
      c.query(
        `SELECT id, slug, name, icon_url, sort_order
         FROM game_platforms
         ORDER BY sort_order ASC, name ASC`
      )
    );
    res.json(rows);
  } catch (e) {
    console.error('[game-taxonomy/platforms]', e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/genre-templates', async (req, res) => {
  try {
    const { rows } = await runWithRls(pool, taxonomyReadCtx(req), (c) =>
      c.query(
        `SELECT id, slug, name, rules_summary, default_team_roster_size, min_team_size, max_team_size,
                suggested_format, competition_scoring_type, match_scoring_mode, swiss_recommended, sort_order
         FROM game_genre_templates
         ORDER BY sort_order ASC, name ASC`
      )
    );
    res.json(rows);
  } catch (e) {
    console.error('[game-taxonomy/genre-templates]', e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/genres', async (req, res) => {
  const platformId = String(req.query.platform_id || '').trim();
  try {
    const { rows } = await runWithRls(pool, taxonomyReadCtx(req), (c) => {
      if (!platformId) {
        return c.query(
          `SELECT id, slug, name, default_roster_size, icon_url, sort_order
           FROM game_genres
           ORDER BY sort_order ASC, name ASC`
        );
      }
      return c.query(
        `SELECT DISTINCT g.id, g.slug, g.name, g.default_roster_size, g.icon_url, g.sort_order
         FROM game_genres g
         INNER JOIN game_titles t ON t.genre_id = g.id
         INNER JOIN game_title_platforms tp ON tp.title_id = t.id
         WHERE tp.platform_id = $1::uuid
         ORDER BY g.sort_order ASC, g.name ASC`,
        [platformId]
      );
    });
    res.json(rows);
  } catch (e) {
    console.error('[game-taxonomy/genres]', e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/titles', async (req, res) => {
  const platformId = String(req.query.platform_id || '').trim();
  const genreId = String(req.query.genre_id || '').trim();
  const q = String(req.query.q || '').trim().slice(0, 80);
  try {
    const { rows } = await runWithRls(pool, taxonomyReadCtx(req), (c) => {
      const conds = [];
      const vals = [];
      let i = 1;
      if (platformId) {
        conds.push(`EXISTS (SELECT 1 FROM game_title_platforms tp2 WHERE tp2.title_id = t.id AND tp2.platform_id = $${i++}::uuid)`);
        vals.push(platformId);
      }
      if (genreId) {
        conds.push(`t.genre_id = $${i++}::uuid`);
        vals.push(genreId);
      }
      if (q) {
        conds.push(`(t.name ILIKE $${i} OR t.slug ILIKE $${i})`);
        vals.push(`%${q.replace(/%/g, '').replace(/_/g, '')}%`);
        i++;
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const sql = `
        SELECT t.id, t.slug, t.name, t.source, t.genre_id, g.name AS genre_name,
               t.genre_template_id, gt.slug AS genre_template_slug, gt.name AS genre_template_name,
               t.suggested_format, t.competition_scoring_type, t.match_scoring_mode,
               t.default_team_roster_size, t.banner_url, t.icon_url, g.icon_url AS genre_icon_url,
               t.verified_at
        FROM game_titles t
        INNER JOIN game_genres g ON g.id = t.genre_id
        LEFT JOIN game_genre_templates gt ON gt.id = t.genre_template_id
        ${where}
        ORDER BY t.name ASC
        LIMIT 300`;
      return c.query(sql, vals);
    });
    res.json(rows);
  } catch (e) {
    console.error('[game-taxonomy/titles]', e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

router.get('/defaults/:titleId', async (req, res) => {
  const titleId = String(req.params.titleId || '').trim();
  if (!titleId) return res.status(400).json({ error: 'title_id required' });
  try {
    const row = await runWithRls(pool, taxonomyReadCtx(req), (c) => queryGameDefaultsById(c, titleId));
    if (!row) return res.status(404).json({ error: 'Title not found' });
    res.json(row);
  } catch (e) {
    console.error('[game-taxonomy/defaults]', e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
