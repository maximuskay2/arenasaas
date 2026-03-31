/**
 * Community / war-room feed: global + per-tenant namespaces, likes, comments, moderation, shadowbans.
 */
import express from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { clientSafeErrorMessage } from '../clientSafeError.js';
import { emitCommunityFeedEvent } from '../realtime.js';
import { runWithRls, rlsContextFromRequest } from '../rls/transaction.js';
import {
  canModeratePost,
  canPostAnnouncement,
  isPlatformStaff,
  userTenantRoles,
} from '../lib/communityPermissions.js';
import { listCommunityPosts } from '../services/feed/communityFeedListService.js';

const router = express.Router();

/** GET /api/community/posts — requireAuth; ?scope=global|tenant&tenant_id=&post_type=&page=&limit= */
router.get('/posts', requireAuth, async (req, res) => {
  const scope = String(req.query.scope || 'tenant').toLowerCase();
  const tenantId = String(req.query.tenant_id || req.headers['x-tenant-id'] || '').trim() || null;
  const postType = String(req.query.post_type || '').trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
  const offset = (page - 1) * limit;

  try {
    const useGlobal = scope === 'global';

    if (!useGlobal && !tenantId) {
      return res.status(400).json({ error: 'tenant_id or X-Tenant-ID required for tenant scope' });
    }

    const data = await listCommunityPosts({
      pool,
      userId: req.user.sub,
      scope,
      tenantId,
      postType,
      page,
      limit,
    });
    res.json(data);
    return;

    const conds = ['p.deleted_at IS NULL'];
    const vals = [];
    let i = 1;

    conds.push(`NOT EXISTS (
      SELECT 1 FROM community_shadowbans sb
      WHERE sb.user_id = p.author_id
      AND (
        sb.scope = 'global'
        OR ($${i}::text IS NOT NULL AND sb.scope = 'tenant' AND sb.tenant_id = $${i})
      )
    )`);
    vals.push(useGlobal ? null : tenantId);
    i += 1;

    if (useGlobal) {
      conds.push('p.tenant_id IS NULL');
    } else {
      conds.push(`p.tenant_id = $${i}`);
      vals.push(tenantId);
      i += 1;
    }
    if (postType && ['announcement', 'strategy', 'recruitment'].includes(postType)) {
      conds.push(`p.post_type = $${i}`);
      vals.push(postType);
      i += 1;
    }

    const where = conds.join(' AND ');
    const likeParam = i;
    vals.push(req.user.sub);
    i += 1;
    const limParam = i;
    vals.push(limit);
    i += 1;
    const offParam = i;
    vals.push(offset);

    const sql = `
      SELECT p.*,
        u.email AS author_email,
        u.full_name AS author_full_name,
        u.role AS author_role,
        EXISTS (
          SELECT 1 FROM community_post_likes pl
          WHERE pl.post_id = p.id AND pl.user_id = $${likeParam}::uuid
        ) AS liked_by_me
      FROM community_posts p
      INNER JOIN users u ON u.id = p.author_id
      WHERE ${where}
      ORDER BY p.pinned DESC NULLS LAST, p.created_date DESC
      LIMIT $${limParam} OFFSET $${offParam}
    `;

    const countVals = vals.slice(0, vals.length - 3);
    const countSql = `
      SELECT COUNT(*)::int AS c
      FROM community_posts p
      INNER JOIN users u ON u.id = p.author_id
      WHERE ${where}
    `;

    const [listRes, countRes] = await Promise.all([pool.query(sql, vals), pool.query(countSql, countVals)]);

    res.json({
      items: listRes.rows,
      page,
      limit,
      total: countRes.rows[0]?.c ?? 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** POST /api/community/posts */
router.post('/posts', requireAuth, async (req, res) => {
  const { title, content, post_type: postType, media_url: mediaUrl, tenant_id: bodyTenant } = req.body || {};
  const scope = String(req.body?.scope || req.query.scope || 'tenant').toLowerCase();
  const titleS = String(title || '').trim().slice(0, 255);
  const contentS = String(content || '').trim().slice(0, 20000);
  const mediaS = mediaUrl ? String(mediaUrl).trim().slice(0, 2000) : null;
  const type = String(postType || 'strategy').toLowerCase();

  if (!contentS && !titleS) {
    return res.status(400).json({ error: 'title or content required' });
  }
  if (!['announcement', 'strategy', 'recruitment'].includes(type)) {
    return res.status(400).json({ error: 'invalid post_type' });
  }

  const useGlobal = scope === 'global';
  const tenantId = useGlobal ? null : String(bodyTenant || req.headers['x-tenant-id'] || '').trim() || null;

  if (!useGlobal && !tenantId) {
    return res.status(400).json({ error: 'tenant_id required for tenant posts' });
  }

  try {
    const out = await runWithRls(
      pool,
      {
        ...rlsContextFromRequest(req, { publicCatalog: false }),
        /** tenant feed is scoped; global is null */
        tenantId: tenantId || '',
      },
      async (client) => {
        if (type === 'announcement') {
          const ok = await canPostAnnouncement(client, req.user.sub, req.user.role, tenantId);
          if (!ok) return { forbidden: 'Only staff can post announcements' };
        } else if (!useGlobal) {
          const roles = await userTenantRoles(client, req.user.sub, tenantId);
          if (!roles.length && !isPlatformStaff(req.user.role)) {
            return { forbidden: 'Not a member of this organization' };
          }
        }

        const { rows } = await client.query(
          `INSERT INTO community_posts (tenant_id, author_id, title, content, post_type, media_url, pinned)
           VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
           RETURNING *`,
          [tenantId, req.user.sub, titleS, contentS, type, mediaS, type === 'announcement' ? true : false]
        );
        const post = rows[0];
        const ures = await client.query(`SELECT email, full_name, role FROM users WHERE id = $1::uuid`, [req.user.sub]);
        const u = ures.rows[0] || {};
        return {
          post,
          author: u,
        };
      }
    );

    if (out?.forbidden) return res.status(403).json({ error: out.forbidden });

    const payload = {
      ...(out?.post || {}),
      author_email: out?.author?.email,
      author_full_name: out?.author?.full_name,
      author_role: out?.author?.role,
      liked_by_me: false,
    };
    emitCommunityFeedEvent('community:post', { post: payload, tenant_id: tenantId, scope: useGlobal ? 'global' : 'tenant' });
    res.status(201).json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** DELETE /api/community/posts/:id */
router.delete('/posts/:id', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const { rows } = await pool.query(`SELECT * FROM community_posts WHERE id = $1::uuid`, [id]);
    const post = rows[0];
    if (!post || post.deleted_at) return res.status(404).json({ error: 'Not found' });

    const client = await pool.connect();
    try {
      const ok = await canModeratePost(client, req.user.sub, req.user.role, post);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      await client.query(`UPDATE community_posts SET deleted_at = NOW(), updated_date = NOW() WHERE id = $1::uuid`, [id]);
      emitCommunityFeedEvent('community:post-removed', { post_id: id, tenant_id: post.tenant_id, scope: post.tenant_id ? 'tenant' : 'global' });
      res.json({ ok: true });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** PATCH /api/community/posts/:id/pin */
router.patch('/posts/:id/pin', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  const pinned = !!req.body?.pinned;
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const { rows } = await pool.query(`SELECT * FROM community_posts WHERE id = $1::uuid AND deleted_at IS NULL`, [id]);
    const post = rows[0];
    if (!post) return res.status(404).json({ error: 'Not found' });

    const client = await pool.connect();
    try {
      const ok = await canPostAnnouncement(client, req.user.sub, req.user.role, post.tenant_id);
      if (!ok) return res.status(403).json({ error: 'Only staff can pin' });
      await client.query(`UPDATE community_posts SET pinned = $2, updated_date = NOW() WHERE id = $1::uuid`, [id, pinned]);
      const { rows: out } = await pool.query(`SELECT * FROM community_posts WHERE id = $1::uuid`, [id]);
      emitCommunityFeedEvent('community:post-updated', { post: out[0], tenant_id: post.tenant_id, scope: post.tenant_id ? 'tenant' : 'global' });
      res.json(out[0]);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** POST /api/community/posts/:id/like */
router.post('/posts/:id/like', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: pr } = await client.query(`SELECT id, tenant_id, deleted_at FROM community_posts WHERE id = $1::uuid`, [id]);
    if (!pr[0] || pr[0].deleted_at) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const ins = await client.query(
      `INSERT INTO community_post_likes (post_id, user_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
      [id, req.user.sub]
    );
    if (ins.rowCount) {
      await client.query(`UPDATE community_posts SET like_count = like_count + 1, updated_date = NOW() WHERE id = $1::uuid`, [id]);
    }
    const { rows } = await client.query(`SELECT like_count FROM community_posts WHERE id = $1::uuid`, [id]);
    await client.query('COMMIT');
    const payload = { post_id: id, like_count: rows[0]?.like_count ?? 0, liked: true };
    emitCommunityFeedEvent('community:like', { ...payload, tenant_id: pr[0].tenant_id, scope: pr[0].tenant_id ? 'tenant' : 'global' });
    res.json(payload);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  } finally {
    client.release();
  }
});

/** DELETE /api/community/posts/:id/like */
router.delete('/posts/:id/like', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: pr } = await client.query(`SELECT id, tenant_id, deleted_at FROM community_posts WHERE id = $1::uuid`, [id]);
    if (!pr[0] || pr[0].deleted_at) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const del = await client.query(
      `DELETE FROM community_post_likes WHERE post_id = $1::uuid AND user_id = $2::uuid`,
      [id, req.user.sub]
    );
    if (del.rowCount) {
      await client.query(
        `UPDATE community_posts SET like_count = GREATEST(0, like_count - 1), updated_date = NOW() WHERE id = $1::uuid`,
        [id]
      );
    }
    const { rows } = await client.query(`SELECT like_count FROM community_posts WHERE id = $1::uuid`, [id]);
    await client.query('COMMIT');
    const payload = { post_id: id, like_count: rows[0]?.like_count ?? 0, liked: false };
    emitCommunityFeedEvent('community:like', { ...payload, tenant_id: pr[0].tenant_id, scope: pr[0].tenant_id ? 'tenant' : 'global' });
    res.json(payload);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  } finally {
    client.release();
  }
});

/** GET /api/community/posts/:id/comments */
router.get('/posts/:id/comments', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const chk = await pool.query(`SELECT 1 FROM community_posts WHERE id = $1::uuid AND deleted_at IS NULL`, [id]);
    if (!chk.rowCount) return res.status(404).json({ error: 'Not found' });

    const { rows } = await pool.query(
      `SELECT c.*, snap.author_email, snap.author_full_name
       FROM community_post_comments c
       INNER JOIN community_posts p ON p.id = c.post_id
       LEFT JOIN LATERAL public.arena_community_author_snapshot(c.user_id) snap ON true
       WHERE c.post_id = $1::uuid
         AND c.deleted_at IS NULL
         AND p.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM community_shadowbans sb
           WHERE sb.user_id = c.user_id
             AND (
               sb.scope = 'global'
               OR (
                 sb.scope = 'tenant'
                 AND p.tenant_id IS NOT NULL
                 AND sb.tenant_id = p.tenant_id
               )
             )
         )
       ORDER BY c.created_date ASC
       LIMIT 200`,
      [id]
    );
    res.json({ items: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** POST /api/community/posts/:id/comments */
router.post('/posts/:id/comments', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  const body = String(req.body?.body || '').trim().slice(0, 8000);
  if (!id) return res.status(400).json({ error: 'id required' });
  if (!body) return res.status(400).json({ error: 'body required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: pr } = await pool.query(`SELECT * FROM community_posts WHERE id = $1::uuid AND deleted_at IS NULL`, [id]);
    if (!pr[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const { rows } = await client.query(
      `INSERT INTO community_post_comments (post_id, user_id, body) VALUES ($1::uuid, $2::uuid, $3) RETURNING *`,
      [id, req.user.sub, body]
    );
    const comment = rows[0];
    await client.query(`UPDATE community_posts SET comment_count = comment_count + 1, updated_date = NOW() WHERE id = $1::uuid`, [id]);
    const ures = await client.query(`SELECT email, full_name FROM users WHERE id = $1::uuid`, [req.user.sub]);
    const u = ures.rows[0] || {};
    await client.query('COMMIT');
    const payload = {
      ...comment,
      author_email: u.email,
      author_full_name: u.full_name,
    };
    emitCommunityFeedEvent('community:comment', {
      comment: payload,
      post_id: id,
      tenant_id: pr[0].tenant_id,
      scope: pr[0].tenant_id ? 'tenant' : 'global',
    });
    res.status(201).json(payload);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  } finally {
    client.release();
  }
});

/** DELETE /api/community/comments/:id */
router.delete('/comments/:id', requireAuth, async (req, res) => {
  const cid = String(req.params.id || '').trim();
  if (!cid) return res.status(400).json({ error: 'id required' });
  try {
    const { rows } = await pool.query(
      `SELECT c.*, p.tenant_id AS post_tenant_id, p.author_id AS post_author_id
       FROM community_post_comments c
       INNER JOIN community_posts p ON p.id = c.post_id
       WHERE c.id = $1::uuid AND c.deleted_at IS NULL`,
      [cid]
    );
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'Not found' });

    const client = await pool.connect();
    try {
      const postForMod = { author_id: c.post_author_id, tenant_id: c.post_tenant_id };
      const ok =
        String(c.user_id) === String(req.user.sub) || (await canModeratePost(client, req.user.sub, req.user.role, postForMod));
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      await client.query(`UPDATE community_post_comments SET deleted_at = NOW() WHERE id = $1::uuid`, [cid]);
      await client.query(
        `UPDATE community_posts SET comment_count = GREATEST(0, comment_count - 1), updated_date = NOW() WHERE id = $1::uuid`,
        [c.post_id]
      );
      emitCommunityFeedEvent('community:comment-removed', {
        comment_id: cid,
        post_id: c.post_id,
        tenant_id: c.post_tenant_id,
        scope: c.post_tenant_id ? 'tenant' : 'global',
      });
      res.json({ ok: true });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** POST /api/community/admin/shadowban */
router.post('/admin/shadowban', requireAuth, async (req, res) => {
  const { user_id: targetId, tenant_id: tidBody, scope } = req.body || {};
  const target = String(targetId || '').trim();
  const banScope = String(scope || 'tenant').toLowerCase();
  const tenantId = tidBody != null && String(tidBody).trim() ? String(tidBody).trim() : null;

  if (!target) return res.status(400).json({ error: 'user_id required' });
  if (!['global', 'tenant'].includes(banScope)) return res.status(400).json({ error: 'invalid scope' });
  if (banScope === 'tenant' && !tenantId) return res.status(400).json({ error: 'tenant_id required for tenant scope' });

  try {
    if (banScope === 'global' && !isPlatformStaff(req.user.role)) {
      return res.status(403).json({ error: 'Platform role required' });
    }
    if (banScope === 'tenant') {
      const client = await pool.connect();
      try {
        const ok = await canPostAnnouncement(client, req.user.sub, req.user.role, tenantId);
        if (!ok) return res.status(403).json({ error: 'Tenant staff only' });
      } finally {
        client.release();
      }
    }

    const tidVal = banScope === 'tenant' ? tenantId : null;
    const dup = await pool.query(
      `SELECT 1 FROM community_shadowbans
       WHERE user_id = $1::uuid AND scope = $2 AND COALESCE(tenant_id, '') = COALESCE($3, '')`,
      [target, banScope, tidVal]
    );
    if (!dup.rowCount) {
      await pool.query(
        `INSERT INTO community_shadowbans (user_id, tenant_id, scope, created_by, reason)
         VALUES ($1::uuid, $2, $3, $4::uuid, $5)`,
        [target, tidVal, banScope, req.user.sub, String(req.body?.reason || '').slice(0, 500)]
      );
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** DELETE /api/community/admin/shadowban — body: { user_id, scope, tenant_id? } */
router.delete('/admin/shadowban', requireAuth, async (req, res) => {
  const { user_id: targetId, tenant_id: tidBody, scope } = req.body || {};
  const target = String(targetId || '').trim();
  const banScope = String(scope || 'tenant').toLowerCase();
  const tenantId = tidBody != null && String(tidBody).trim() ? String(tidBody).trim() : null;
  if (!target) return res.status(400).json({ error: 'user_id required' });

  try {
    if (banScope === 'global' && !isPlatformStaff(req.user.role)) {
      return res.status(403).json({ error: 'Platform role required' });
    }
    if (banScope === 'tenant') {
      const client = await pool.connect();
      try {
        const ok = await canPostAnnouncement(client, req.user.sub, req.user.role, tenantId);
        if (!ok) return res.status(403).json({ error: 'Tenant staff only' });
      } finally {
        client.release();
      }
    }

    await pool.query(
      `DELETE FROM community_shadowbans
       WHERE user_id = $1::uuid AND scope = $2 AND COALESCE(tenant_id, '') = COALESCE($3, '')`,
      [target, banScope, banScope === 'tenant' ? tenantId : null]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

export default router;
