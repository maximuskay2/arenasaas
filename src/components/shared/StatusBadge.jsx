const statusStyles = {
  draft: "bg-muted text-muted-foreground",
  registration_open: "bg-green-500/15 text-green-400 border border-green-500/30",
  registration_closed: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  in_progress: "bg-primary/15 text-primary border border-primary/30 animate-pulse-glow",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive border border-destructive/30",
  pending: "bg-muted text-muted-foreground",
  check_in_open: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  checked_in: "bg-green-500/15 text-green-400 border border-green-500/30",
  under_dispute: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
  forfeited: "bg-destructive/15 text-destructive border border-destructive/30",
  no_show: "bg-destructive/15 text-destructive border border-destructive/30",
  registered: "bg-primary/15 text-primary border border-primary/30",
  eliminated: "bg-destructive/15 text-destructive border border-destructive/30",
  winner: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
};

const statusLabels = {
  draft: "Draft",
  registration_open: "Open",
  registration_closed: "Closed",
  in_progress: "Live",
  completed: "Completed",
  cancelled: "Cancelled",
  pending: "Pending",
  check_in_open: "Check-in",
  checked_in: "Checked In",
  under_dispute: "Disputed",
  forfeited: "Forfeited",
  no_show: "No Show",
  registered: "Registered",
  eliminated: "Eliminated",
  winner: "Winner",
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${statusStyles[status] || statusStyles.draft}`}>
      {status === "in_progress" && <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5 animate-pulse" />}
      {statusLabels[status] || status}
    </span>
  );
}