import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db.js";
import { listCommunityPosts } from "../services/feed/communityFeedListService.js";

const router = express.Router();

/**
 * GET /api/feed?tenant_id=xyz
 *
 * Compatibility alias for older client specs.
 * - If `tenant_id` is provided, returns tenant-scoped feed.
 * - Otherwise returns global feed.
 */
router.get("/", requireAuth, async (req, res) => {
  const rawTenantId = String(req.query.tenant_id || req.headers["x-tenant-id"] || "").trim();
  const tenantIdFromQuery = rawTenantId || null;

  const scopeQ = String(req.query.scope || "").toLowerCase();
  const scope = scopeQ === "global" ? "global" : tenantIdFromQuery ? "tenant" : "global";

  const tenantId = scope === "global" ? null : tenantIdFromQuery;
  if (scope !== "global" && !tenantId) {
    return res.status(400).json({ error: "tenant_id required for tenant feed" });
  }

  const postType = String(req.query.post_type || "").trim();
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));

  try {
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
  } catch (e) {
    // Keep response consistent with other route patterns.
    console.error(e);
    res.status(500).json({ error: "failed_to_list_feed" });
  }
});

export default router;

