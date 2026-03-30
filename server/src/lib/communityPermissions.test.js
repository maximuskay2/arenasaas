import test from "node:test";
import assert from "node:assert/strict";

import { canModeratePost } from "./communityPermissions.js";

const mkClient = (rolesByTenant = {}) => ({
  query: async (_sql, params) => {
    // userTenantRoles uses: [userId, tenantId]
    const userId = String(params?.[0] || "");
    const tenantId = String(params?.[1] || "");
    const roles = rolesByTenant[`${userId}|${tenantId}`] || [];
    return { rows: roles.map((r) => ({ role_in_tenant: r })) };
  },
});

test("platform staff can moderate any comment", async () => {
  const client = mkClient();
  const ok = await canModeratePost(
    client,
    "11111111-1111-1111-1111-111111111111",
    "super_admin",
    { author_id: "22222222-2222-2222-2222-222222222222", tenant_id: "33333333-3333-3333-3333-333333333333" }
  );
  assert.equal(ok, true);
});

test("author can moderate their own comment", async () => {
  const client = mkClient();
  const ok = await canModeratePost(
    client,
    "22222222-2222-2222-2222-222222222222",
    "player",
    { author_id: "22222222-2222-2222-2222-222222222222", tenant_id: "33333333-3333-3333-3333-333333333333" }
  );
  assert.equal(ok, true);
});

test("tenant staff can moderate tenant comments", async () => {
  const userId = "22222222-2222-2222-2222-222222222222";
  const tenantId = "33333333-3333-3333-3333-333333333333";
  const client = mkClient({
    [`${userId}|${tenantId}`]: ["organizer"],
  });
  const ok = await canModeratePost(
    client,
    userId,
    "player",
    { author_id: "11111111-1111-1111-1111-111111111111", tenant_id: tenantId }
  );
  assert.equal(ok, true);
});

test("non-staff, non-author cannot moderate foreign tenant comments", async () => {
  const userId = "22222222-2222-2222-2222-222222222222";
  const tenantId = "33333333-3333-3333-3333-333333333333";
  const client = mkClient({
    [`${userId}|${tenantId}`]: [],
  });
  const ok = await canModeratePost(
    client,
    userId,
    "player",
    { author_id: "11111111-1111-1111-1111-111111111111", tenant_id: tenantId }
  );
  assert.equal(ok, false);
});

