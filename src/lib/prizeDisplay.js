/**
 * Player-facing prize copy (discovery cards + detail). Prefer API `prize_summary` when present.
 */

function num2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function ordinal(n) {
  const r = Number(n);
  if (r === 1) return "1st";
  if (r === 2) return "2nd";
  if (r === 3) return "3rd";
  return `${r}th`;
}

/** @param {Record<string, unknown>} tournament */
export function formatPrizeCardLine(tournament) {
  if (tournament?.prize_summary?.cardLine) return String(tournament.prize_summary.cardLine);
  if (tournament?.prize_disclosure_tbd === true || tournament?.prize_disclosure_tbd === "true") {
    return "Prize TBD / sponsor-provided";
  }
  const ps = tournament?.prize_structure;
  if (!ps || typeof ps !== "object") {
    const pool = num2(tournament?.prize_pool);
    const cur = String(tournament?.currency || "USD").toUpperCase();
    return pool > 0 ? `${cur} ${pool.toFixed(2)} pool` : "Prizes announced by organizer";
  }
  const type = String(ps.type || "FIXED").toUpperCase() === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
  const cur = String(ps.currency || tournament?.currency || "USD").toUpperCase();
  const ranks = Array.isArray(ps.ranks) ? ps.ranks : [];
  if (type === "FIXED") {
    const total = ranks.reduce((s, r) => s + num2(r?.payout), 0);
    const first = ranks.find((r) => Number(r?.rank) === 1);
    const firstLine = first ? `${ordinal(1)} ${cur} ${num2(first.payout).toFixed(2)}` : "";
    return `${cur} ${total.toFixed(2)} guaranteed${firstLine ? ` · ${firstLine}` : ""}`;
  }
  const pctLine = ranks
    .map((r) => `${ordinal(r.rank || 0)} ${num2(r.percent ?? r.payout_percent)}%`)
    .join(" · ");
  return `${pctLine} of net pot`;
}

/** @param {Record<string, unknown>} tournament */
export function formatPrizeDetailLines(tournament) {
  if (Array.isArray(tournament?.prize_summary?.detailLines) && tournament.prize_summary.detailLines.length) {
    return tournament.prize_summary.detailLines.map(String);
  }
  if (tournament?.prize_disclosure_tbd === true || tournament?.prize_disclosure_tbd === "true") {
    return ["Prize TBD / sponsor-provided — organizer will announce details."];
  }
  const ps = tournament?.prize_structure;
  if (!ps || typeof ps !== "object" || !Array.isArray(ps.ranks)) return [];
  const type = String(ps.type || "FIXED").toUpperCase() === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
  const cur = String(ps.currency || tournament?.currency || "USD").toUpperCase();
  return ps.ranks
    .slice()
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .map((r) =>
      type === "FIXED"
        ? `${ordinal(r.rank)} — ${cur} ${num2(r.payout).toFixed(2)}${r.badge_id ? ` · badge ${r.badge_id}` : ""}`
        : `${ordinal(r.rank)} — ${num2(r.percent ?? r.payout_percent)}% of net pot`
    );
}
