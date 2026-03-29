/**
 * FCM topic names (Firebase: [a-zA-Z0-9-_.~%]+).
 * arena_user_<uuid> — per-user broadcasts
 * arena_tournament_<id> — tournament-scoped (optional subscription)
 * arena_tenant_<id> — org-scoped (optional)
 */
export function fcmTopicUser(userSub) {
  const s = String(userSub || '').replace(/[^a-zA-Z0-9-_.~%]/g, '_');
  return `arena_user_${s}`.slice(0, 900);
}

export function fcmTopicTournament(tournamentId) {
  const s = String(tournamentId || '').replace(/[^a-zA-Z0-9-_.~%]/g, '_');
  return `arena_tournament_${s}`.slice(0, 900);
}

export function fcmTopicTenant(tenantId) {
  const s = String(tenantId || '').replace(/[^a-zA-Z0-9-_.~%]/g, '_');
  return `arena_tenant_${s}`.slice(0, 900);
}
