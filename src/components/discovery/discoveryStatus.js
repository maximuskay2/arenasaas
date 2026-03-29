/**
 * Discovery UI labels: LIVE (in progress), REGISTERING, COMPLETED, etc.
 */
export function getDiscoveryStatus(tournament) {
  const s = tournament?.status;
  if (s === "in_progress") return { label: "LIVE", tone: "live" };
  if (s === "registration_open") return { label: "REGISTERING", tone: "registering" };
  if (s === "completed") return { label: "COMPLETED", tone: "completed" };
  if (s === "registration_closed") return { label: "LOCKED", tone: "locked" };
  if (s === "draft") return { label: "DRAFT", tone: "draft" };
  return { label: (s || "UPCOMING").replace(/_/g, " ").toUpperCase(), tone: "muted" };
}

export function discoveryStatusClass(tone) {
  switch (tone) {
    case "live":
      return "shadow-[0_0_20px_rgba(239,68,68,0.5)] border-red-500/60 bg-red-500/15 text-red-200";
    case "registering":
      return "shadow-[0_0_18px_rgba(34,211,238,0.45)] border-cyan-500/50 bg-cyan-500/12 text-cyan-200";
    case "completed":
      return "border-slate-500/50 bg-slate-500/15 text-slate-300";
    case "locked":
      return "border-amber-500/45 bg-amber-500/10 text-amber-200";
    default:
      return "border-border bg-secondary/50 text-muted-foreground";
  }
}
