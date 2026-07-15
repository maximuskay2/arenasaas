const statusStyles = {
  draft: "bg-muted/80 text-muted-foreground border border-border/60",
  registration_open: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/35",
  registration_closed: "bg-amber-500/15 text-amber-300 border border-amber-500/35",
  in_progress: "bg-primary/15 text-primary border border-primary/40 shadow-[0_0_16px_hsl(var(--primary)/0.2)]",
  completed: "bg-muted/80 text-muted-foreground border border-border/60",
  cancelled: "bg-destructive/15 text-destructive border border-destructive/35",
  pending: "bg-muted/80 text-muted-foreground border border-border/60",
  check_in_open: "bg-amber-500/15 text-amber-300 border border-amber-500/35",
  checked_in: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/35",
  under_dispute: "bg-orange-500/15 text-orange-400 border border-orange-500/35",
  forfeited: "bg-destructive/15 text-destructive border border-destructive/35",
  no_show: "bg-destructive/15 text-destructive border border-destructive/35",
  registered: "bg-primary/15 text-primary border border-primary/35",
  eliminated: "bg-destructive/15 text-destructive border border-destructive/35",
  winner: "bg-amber-500/15 text-amber-300 border border-amber-500/40",
};

const statusLabels = {
  draft: "Draft",
  registration_open: "Open",
  registration_closed: "Closed",
  in_progress: "LIVE",
  completed: "Completed",
  cancelled: "Cancelled",
  pending: "Pending",
  check_in_open: "Check-in",
  checked_in: "Ready",
  under_dispute: "Disputed",
  forfeited: "Forfeited",
  no_show: "No Show",
  registered: "Registered",
  eliminated: "Eliminated",
  winner: "Champion",
};

export default function StatusBadge({ status, className = "" }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-display font-bold uppercase tracking-wider ${statusStyles[status] || statusStyles.draft} ${className}`}
    >
      {status === "in_progress" && (
        <span className="relative flex h-1.5 w-1.5 mr-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
        </span>
      )}
      {statusLabels[status] || status}
    </span>
  );
}
