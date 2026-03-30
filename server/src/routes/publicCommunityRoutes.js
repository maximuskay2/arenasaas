/**
 * Public (unauthenticated) community read endpoints.
 *
 * - Posts + comments are visible for reading.
 * - Mutations (post/comment/like/moderation) remain under /api/community and require auth.
 */
import express from "express";
import { pool } from "../db.js";
import { clientSafeErrorMessage } from "../clientSafeError.js";
import { listCommunityPosts } from "../services/feed/communityFeedListService.js";

const router = express.Router();

/** GET /api/public/community/posts — ?scope=global|tenant&tenant_id=&post_type=&page=&limit= */
router.get("/posts", async (req, res) => {
  const scope = String(req.query.scope || (req.query.tenant_id ? "tenant" : "global")).toLowerCase();
  const tenantId = String(req.query.tenant_id || "").trim() || null;
  const postType = String(req.query.post_type || "").trim();
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));

  try {
    if (scope !== "global" && !tenantId) {
      return res.status(400).json({ error: "tenant_id required for tenant scope" });
    }
    const data = await listCommunityPosts({
      pool,
      userId: null, // public: no liked_by_me lookup
      scope,
      tenantId,
      postType,
      page,
      limit,
    });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: clientSafeErrorMessage(e) });
  }
});

/** GET /api/public/community/posts/:id/comments */
router.get("/posts/:id/comments", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    const chk = await pool.query(
      `SELECT 1 FROM community_posts WHERE id = $1::uuid AND deleted_at IS NULL`,
      [id]
    );
    if (!chk.rowCount) return res.status(404).json({ error: "Not found" });

    const { rows } = await pool.query(
      `SELECT c.*, u.email AS author_email, u.full_name AS author_full_name
       FROM community_post_comments c
       INNER JOIN community_posts p ON p.id = c.post_id
       INNER JOIN users u ON u.id = c.user_id
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

export default router;

