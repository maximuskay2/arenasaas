/**
 * Match Results `media_url` format for production object storage (MinIO/S3).
 *
 * We intentionally use a single strict template so the client can detect
 * "match results" embeds without false positives.
 *
 * URL template (path-style bucket):
 *   https://<MINIO_PUBLIC_ORIGIN>/<BUCKET>/match-results/v1/matches/<matchId>/manifest.json
 *
 * Example:
 *   https://media.example.com/arena-media/match-results/v1/matches/3b4c8f9e-2a1b-4c3d-9e10-11aa22bb33cc/manifest.json
 */

const PATH_RE =
  /^\/[^/]+\/match-results\/v1\/matches\/([0-9a-fA-F-]{32,36})\/manifest\.json$/;

/**
 * Extract matchId from a strict match-results media_url.
 * Returns null if the URL does not match the exact template.
 */
export function extractMatchIdFromMatchResultsMediaUrl(mediaUrl) {
  const raw = typeof mediaUrl === "string" ? mediaUrl.trim() : "";
  if (!raw) return null;
  if (raw.startsWith("data:")) return null;

  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }

  const m = String(u.pathname || "").match(PATH_RE);
  return m?.[1] || null;
}

/**
 * Build the canonical match-results media URL.
 * This is what you should persist in `community_posts.media_url` for match embeds.
 */
export function buildMatchResultsMediaUrl({ publicOrigin, bucket, matchId }) {
  const origin = String(publicOrigin || "").replace(/\/+$/, "");
  const b = String(bucket || "").replace(/^\/+|\/+$/g, "");
  const mid = String(matchId || "").trim();
  if (!origin || !b || !mid) throw new Error("publicOrigin, bucket, and matchId are required");

  return `${origin}/${b}/match-results/v1/matches/${encodeURIComponent(mid)}/manifest.json`;
}

