/**
 * Runs work inside a transaction with SET LOCAL–style GUCs (session vars scoped to the transaction).
 * Matches MASTER_IMPLEMENTATION_DIRECTIVE: never use session-wide SET for tenant context under a pool.
 *
 * GUCs (all transaction-local via set_config(..., true)):
 * - app.tenant_id
 * - app.is_platform_admin
 * - app.user_id
 * - app.auth_user_email
 * - app.auth_login_email (login lookup)
 * - app.allow_user_register
 * - app.allow_bootstrap_tenant
 * - app.otp_session_email
 * - app.allow_game_template_read
 * - app.allow_public_directory_read
 * - app.public_tenant_slug
 * - app.allow_public_platform_config_read
 * - app.allow_internal_notification (server-only: staff broadcast rows)
 */

export async function runWithRls(pool, context, fn) {
  const client = await pool.connect();
  const ctx = {
    tenantId: '',
    isPlatformAdmin: false,
    /** Set true for internal prize settlement job (credits arbitrary user_wallets). */
    systemPrizeWorker: false,
    userId: '',
    userEmail: '',
    authLoginEmail: '',
    allowUserRegister: false,
    allowBootstrapTenant: false,
    otpSessionEmail: '',
    allowGameTemplateRead: false,
    allowPublicDirectoryRead: false,
    publicTenantSlug: '',
    allowPublicPlatformConfigRead: false,
    /** Insert notifications for arbitrary tenant staff emails (dispute alerts, etc.). */
    allowInternalNotification: false,
    ...context,
  };

  try {
    await client.query('BEGIN');

    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [ctx.tenantId || '']);
    await client.query(`SELECT set_config('app.is_platform_admin', $1, true)`, [
      ctx.isPlatformAdmin ? 'true' : 'false',
    ]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [ctx.userId || '']);
    await client.query(`SELECT set_config('app.auth_user_email', $1, true)`, [
      (ctx.userEmail || '').toLowerCase(),
    ]);
    await client.query(`SELECT set_config('app.auth_login_email', $1, true)`, [
      (ctx.authLoginEmail || '').toLowerCase(),
    ]);
    await client.query(`SELECT set_config('app.allow_user_register', $1, true)`, [
      ctx.allowUserRegister ? '1' : '',
    ]);
    await client.query(`SELECT set_config('app.allow_bootstrap_tenant', $1, true)`, [
      ctx.allowBootstrapTenant ? '1' : '',
    ]);
    await client.query(`SELECT set_config('app.otp_session_email', $1, true)`, [
      (ctx.otpSessionEmail || '').toLowerCase(),
    ]);
    await client.query(`SELECT set_config('app.allow_game_template_read', $1, true)`, [
      ctx.allowGameTemplateRead ? '1' : '',
    ]);
    await client.query(`SELECT set_config('app.allow_public_directory_read', $1, true)`, [
      ctx.allowPublicDirectoryRead ? '1' : '',
    ]);
    await client.query(`SELECT set_config('app.public_tenant_slug', $1, true)`, [
      ctx.publicTenantSlug || '',
    ]);
    await client.query(`SELECT set_config('app.allow_public_platform_config_read', $1, true)`, [
      ctx.allowPublicPlatformConfigRead ? '1' : '',
    ]);
    await client.query(`SELECT set_config('app.system_prize_worker', $1, true)`, [
      ctx.systemPrizeWorker ? 'true' : '',
    ]);
    await client.query(`SELECT set_config('app.allow_internal_notification', $1, true)`, [
      ctx.allowInternalNotification ? '1' : '',
    ]);

    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Build default API RLS context from Express request.
 * @param {import('express').Request} req
 * @param {{ publicCatalog?: boolean }} opts
 */
export function rlsContextFromRequest(req, opts = {}) {
  const headerTenant = (req.headers['x-tenant-id'] || req.headers['X-Tenant-ID'] || '').toString().trim();
  const user = req.user;
  const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const publicCatalog = opts.publicCatalog === true;
  /** Issued on login/refresh so CRUD works without X-Tenant-ID (matches first user_tenants row). */
  const jwtTenant =
    user && user.tenant_id != null && String(user.tenant_id).trim() !== ''
      ? String(user.tenant_id).trim()
      : '';

  return {
    tenantId: headerTenant || jwtTenant,
    isPlatformAdmin,
    userId: user?.sub || '',
    userEmail: user?.email || '',
    allowGameTemplateRead: !!user || publicCatalog,
    allowPublicDirectoryRead: !!user || publicCatalog,
  };
}

/**
 * Resolve tenant scope for anonymous requests using slug (SECURITY DEFINER in DB).
 */
export async function resolveTenantIdBySlug(client, slug) {
  if (!slug) return '';
  const { rows } = await client.query('SELECT arena_tenant_id_by_slug($1) AS tid', [slug]);
  return rows[0]?.tid || '';
}
