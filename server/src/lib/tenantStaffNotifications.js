/**
 * In-app notifications for tenant staff (RLS: platform-admin read + internal insert flag).
 */
import { runWithRls } from '../rls/transaction.js';

/**
 * @param {import('pg').Pool} pool
 * @param {string} tenantId
 * @param {Record<string, unknown>} match — row with id, tournament_id
 */
export async function notifyTenantStaffScoreDisputed(pool, tenantId, match) {
  const ten = String(tenantId || '').trim();
  const mid = String(match?.id || '').trim();
  const tourId = String(match?.tournament_id || '').trim();
  if (!ten || !mid) return;

  await runWithRls(
    pool,
    {
      isPlatformAdmin: true,
      allowInternalNotification: true,
      tenantId: '',
      userId: '',
      userEmail: '',
    },
    async (client) => {
      const { rows: staff } = await client.query(
        `SELECT DISTINCT lower(trim(both from u.email)) AS email
         FROM user_tenants ut
         INNER JOIN users u ON u.id = ut.user_id
         WHERE ut.tenant_id = $1
           AND ut.role_in_tenant IN ('organizer', 'admin', 'staff')
           AND trim(COALESCE(u.email, '')) <> ''`,
        [ten]
      );
      const { rows: tr } = await client.query(`SELECT name FROM tournaments WHERE id::text = $1 LIMIT 1`, [tourId]);
      const tname = String(tr[0]?.name || 'Tournament');

      for (const s of staff) {
        const email = s.email;
        if (!email) continue;
        await client.query(
          `INSERT INTO notifications (user_email, type, title, body, link, tournament_id, match_id)
           VALUES ($1, 'score_disputed', $2, $3, $4, $5, $6)`,
          [
            email,
            'Score dispute',
            `${tname}: opposing score reports — open Dispute inbox to rule.`,
            '/league/disputes',
            tourId || null,
            mid,
          ]
        );
      }
    }
  );
}
