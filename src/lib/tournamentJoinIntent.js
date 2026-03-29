/** Query flag: after login/registration, open the join modal on the tournament page. */
export const TOURNAMENT_JOIN_PARAM = "join";

/**
 * Relative path to return to a tournament with “open join” intent (for returnUrl / redirects).
 */
export function tournamentJoinReturnPath(tournamentId) {
  const id = String(tournamentId ?? "").trim();
  if (!id) return "/tournaments";
  return `/tournaments/${encodeURIComponent(id)}?${TOURNAMENT_JOIN_PARAM}=1`;
}

export function isTournamentJoinIntent(searchParams) {
  if (!searchParams) return false;
  return String(searchParams.get(TOURNAMENT_JOIN_PARAM) || "") === "1";
}

/** Safe in-app path only (no protocol / open redirects). */
export function safeAppReturnPath(raw) {
  if (raw == null || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  if (s.includes("://")) return null;
  if (s.includes("@")) return null;
  return s;
}
