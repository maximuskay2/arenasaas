/**
 * Community feed listing logic.
 *
 * This is intentionally extracted so we can reuse it for:
 * - `/api/community/posts` (existing routes)
 * - `/api/feed` compatibility alias (spec naming)
 *
 * Note: this is still hosted in the main API server (logical split for MVP).
 */

export async function listCommunityPosts({
  pool,
  userId, // optional for public read
  scope, // "global" | "tenant"
  tenantId, // null for global
  postType, // optional: "announcement" | "strategy" | "recruitment"
  page,
  limit,
}) {
  const useGlobal = String(scope).toLowerCase() === "global";
  const effectiveTenantId = useGlobal ? null : tenantId;
  const offset = (page - 1) * limit;

  const conds = ["p.deleted_at IS NULL"];
  const vals = [];
  let i = 1;

  // Shadowban visibility: hide authors shadowbanned globally or within the tenant scope.
  conds.push(`NOT EXISTS (
    SELECT 1 FROM community_shadowbans sb
    WHERE sb.user_id = p.author_id
    AND (
      sb.scope = 'global'
      OR ($${i}::text IS NOT NULL AND sb.scope = 'tenant' AND sb.tenant_id = $${i})
    )
  )`);
  vals.push(useGlobal ? null : effectiveTenantId);
  i += 1;

  if (useGlobal) {
    conds.push("p.tenant_id IS NULL");
  } else {
    conds.push(`p.tenant_id = $${i}`);
    vals.push(effectiveTenantId);
    i += 1;
  }

  if (postType && ["announcement", "strategy", "recruitment"].includes(postType)) {
    conds.push(`p.post_type = $${i}`);
    vals.push(postType);
    i += 1;
  }

  const where = conds.join(" AND ");

  const likeParam = i;
  const hasUser = userId != null && String(userId).trim() !== "";
  if (hasUser) {
    vals.push(userId);
    i += 1;
  }

  const limParam = i;
  vals.push(limit);
  i += 1;

  const offParam = i;
  vals.push(offset);

  const likedByMeExpr = hasUser
    ? `EXISTS (
        SELECT 1 FROM community_post_likes pl
        WHERE pl.post_id = p.id AND pl.user_id = $${likeParam}::uuid
      )`
    : `FALSE`;

  const sql = `
    SELECT p.*,
      auth.author_email,
      auth.author_full_name,
      auth.author_role,
      ${likedByMeExpr} AS liked_by_me
    FROM community_posts p
    LEFT JOIN LATERAL public.arena_community_author_snapshot(p.author_id) auth ON true
    WHERE ${where}
    ORDER BY p.pinned DESC NULLS LAST, p.created_date DESC
    LIMIT $${limParam} OFFSET $${offParam}
  `;

  // countSql uses the same WHERE params, but not liked_by_me / LIMIT / OFFSET.
  // vals layout:
  // - base WHERE params (shadowban tenant, optional tenant_id, optional postType)
  // - optional userId (liked_by_me)
  // - limit
  // - offset
  const tailParams = hasUser ? 3 : 2;
  const countVals = vals.slice(0, Math.max(0, vals.length - tailParams));
  const countSql = `
    SELECT COUNT(*)::int AS c
    FROM community_posts p
    WHERE ${where}
  `;

  const [listRes, countRes] = await Promise.all([pool.query(sql, vals), pool.query(countSql, countVals)]);

  return {
    items: listRes.rows,
    page,
    limit,
    total: countRes.rows[0]?.c ?? 0,
  };
}

