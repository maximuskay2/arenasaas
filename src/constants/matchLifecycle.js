/**
 * Directive ↔ DB match status mapping (single source of truth).
 * DB `matches.status` is authoritative; directive labels are product language only.
 */

/** Values allowed by PostgreSQL CHECK on `matches.status`. */
export const MATCH_STATUS_DB = [
  "pending",
  "check_in_open",
  "checked_in",
  "in_progress",
  "under_dispute",
  "completed",
  "forfeited",
  "no_show",
];

/**
 * Product lifecycle labels (MASTER directive) → one or more DB statuses.
 * Use for docs, analytics buckets, and future UI copy — not stored on rows.
 */
export const DIRECTIVE_STATUS_TO_DB = {
  SCHEDULED: ["pending", "check_in_open"],
  READY: ["checked_in"],
  REPORTING: ["in_progress"],
  VERIFYING: ["in_progress", "under_dispute"],
  COMPLETED: ["completed", "forfeited", "no_show"],
  DISPUTED: ["under_dispute"],
};

/** Rough inverse: primary DB status → directive label for display. */
export function directiveLabelForDbStatus(dbStatus) {
  const s = String(dbStatus || "");
  if (s === "under_dispute") return "DISPUTED";
  if (["completed", "forfeited", "no_show"].includes(s)) return "COMPLETED";
  if (s === "in_progress") return "REPORTING";
  if (s === "checked_in") return "READY";
  if (s === "check_in_open" || s === "pending") return "SCHEDULED";
  return s || "UNKNOWN";
}
