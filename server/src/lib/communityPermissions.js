/**
 * Community feed permission helpers.
 *
 * Kept in a separate module so we can unit-test moderation rules
 * (and so routes stay readable).
 */

export function isPlatformStaff(role) {
  return role === "admin" || role === "super_admin";
}

export async function userTenantRoles(client, userId, tenantId) {
  if (!tenantId) return [];
  const { rows } = await client.query(
    `SELECT role_in_tenant FROM user_tenants WHERE user_id = $1::uuid AND tenant_id = $2`,
    [userId, tenantId]
  );
  return rows.map((r) => r.role_in_tenant);
}

export async function canPostAnnouncement(client, userId, role, tenantId) {
  if (isPlatformStaff(role)) return true;
  if (!tenantId) return false;
  const roles = await userTenantRoles(client, userId, tenantId);
  return roles.some((r) => ["organizer", "admin", "staff"].includes(r));
}

export async function canModeratePost(client, userId, role, post) {
  if (isPlatformStaff(role)) return true;
  if (String(post.author_id) === String(userId)) return true;
  const tid = post.tenant_id ? String(post.tenant_id) : "";
  if (!tid) return false;
  const roles = await userTenantRoles(client, userId, tid);
  return roles.some((r) => ["organizer", "admin", "staff"].includes(r));
}

