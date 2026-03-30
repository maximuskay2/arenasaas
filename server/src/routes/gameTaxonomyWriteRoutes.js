import express from 'express';
import { randomBytes } from 'crypto';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { runWithRls, rlsContextFromRequest } from '../rls/transaction.js';
import { queryGameDefaultsById } from '../lib/getGameDefaults.js';

const router = express.Router();

function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s.slice(0, 72) || 'game';
}

router.use(requireAuth);
router.post('/custom-titles', express.json({ limit: '64kb' }), async (req, res) => {
  const ctx = rlsContextFromRequest(req);
  const tenantId = String(ctx.tenantId || '').trim();
  if (!tenantId) return res.status(400).json({ error: 'Organization scope required (X-Tenant-ID or JWT tenant_id)' });
  if (!ctx.userId) return res.status(401).json({ error: 'Unauthorized' });

  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 200) return res.status(400).json({ error: 'name required (max 200 chars)' });
  const genreId = String(req.body?.genre_id || '').trim();
  if (!genreId) return res.status(400).json({ error: 'genre_id required' });
  const genreTemplateId = String(req.body?.genre_template_id || '').trim();
  if (!genreTemplateId) return res.status(400).json({ error: 'genre_template_id required (scoring rules template)' });
  const platformIds = Array.isArray(req.body?.platform_ids) ? req.body.platform_ids.map((x) => String(x).trim()).filter(Boolean) : [];
  if (!platformIds.length) return res.status(400).json({ error: 'platform_ids required (non-empty array)' });

  let slug = `${slugify(name)}-${randomBytes(3).toString('hex')}`;

  try {
    const out = await runWithRls(pool, ctx, async (client) => {
      const gtr = await client.query(`SELECT * FROM game_genre_templates WHERE id = $1::uuid LIMIT 1`, [genreTemplateId]);
      const gtmp = gtr.rows[0];
      if (!gtmp) throw Object.assign(new Error('Invalid genre_template_id'), { httpStatus: 400 });

      const rosterCap = (n) => Math.max(1, Math.min(64, n));
      let roster = rosterCap(parseInt(String(req.body?.default_team_roster_size || ''), 10) || 0);
      if (!roster) roster = rosterCap(gtmp.default_team_roster_size);
      if (gtmp.min_team_size != null) roster = Math.max(roster, gtmp.min_team_size);
      if (gtmp.max_team_size != null) roster = Math.min(roster, gtmp.max_team_size);

      let competition = String(req.body?.competition_scoring_type || '').trim();
      if (competition !== 'bracket' && competition !== 'points') competition = gtmp.competition_scoring_type;

      let matchMode = String(req.body?.match_scoring_mode || '').trim();
      if (!['best_of_1', 'best_of_3', 'best_of_5', 'points'].includes(matchMode)) {
        matchMode = gtmp.match_scoring_mode;
      }

      let suggestedFormat = String(req.body?.suggested_format || '').trim();
      if (!['single_elimination', 'double_elimination', 'round_robin', 'swiss'].includes(suggestedFormat)) {
        suggestedFormat = gtmp.suggested_format;
      }

      let row;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const ins = await client.query(
            `INSERT INTO game_titles (
               genre_id, genre_template_id, slug, name, source, suggested_format, competition_scoring_type,
               match_scoring_mode, default_team_roster_size, require_in_game_id,
               created_by_user_id, created_by_tenant_id
             ) VALUES ($1::uuid, $2::uuid, $3, $4, 'custom', $5, $6, $7, $8, $9, $10::uuid, $11)
             RETURNING id, slug, name, genre_id, genre_template_id, created_date`,
            [
              genreId,
              genreTemplateId,
              slug,
              name,
              suggestedFormat,
              competition,
              matchMode,
              roster,
              !!req.body?.require_in_game_id,
              ctx.userId,
              tenantId,
            ]
          );
          row = ins.rows[0];
          break;
        } catch (e) {
          if (e.code === '23505') {
            slug = `${slugify(name)}-${randomBytes(4).toString('hex')}`;
            continue;
          }
          throw e;
        }
      }
      if (!row) throw new Error('Could not allocate unique slug');

      for (const pid of platformIds) {
        await client.query(
          `INSERT INTO game_title_platforms (title_id, platform_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
          [row.id, pid]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, actor_email, actor_role, details)
         VALUES ($1, 'custom_game_title_created', 'game_titles', $2, $3, 'organizer', $4)`,
        [
          tenantId,
          String(row.id),
          String(req.user?.email || ''),
          JSON.stringify({ name, slug: row.slug, genre_id: genreId, genre_template_id: genreTemplateId }),
        ]
      );

      return row;
    });

    const defaults = await runWithRls(pool, { ...ctx, allowGameTaxonomyPublicRead: true, allowGameTemplateRead: true }, (c) =>
      queryGameDefaultsById(c, out.id)
    );
    res.status(201).json({ ...out, defaults });
  } catch (e) {
    console.error('[game-taxonomy/custom-titles]', e);
    if (e.httpStatus === 400) {
      return res.status(400).json({ error: e.message || 'Bad request' });
    }
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
