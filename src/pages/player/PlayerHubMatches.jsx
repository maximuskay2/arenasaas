import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import moment from "moment";
import { Swords, ChevronRight, Radio, Clock, CheckCircle2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { maxikay } from "@/api/maxikayClient";
import { useAuth } from "@/lib/AuthContext";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import PageHeader from "@/components/shared/PageHeader";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
  { id: "done", label: "Completed" },
];

function bucket(status) {
  const s = String(status || "");
  if (s === "in_progress" || s === "under_dispute") return "live";
  if (["completed", "forfeited", "no_show"].includes(s)) return "done";
  return "upcoming";
}

export default function PlayerHubMatches() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["me-matches"],
    queryFn: () => maxikay.auth.meMatches({ limit: 80 }),
    enabled: !!user,
    staleTime: 15_000,
  });

  const matches = data?.matches ?? [];
  const filtered = useMemo(() => {
    if (filter === "all") return matches;
    return matches.filter((m) => bucket(m.status) === filter);
  }, [matches, filter]);

  const counts = useMemo(() => {
    const c = { all: matches.length, live: 0, upcoming: 0, done: 0 };
    for (const m of matches) c[bucket(m.status)] += 1;
    return c;
  }, [matches]);

  if (isLoading) return <LoadingSpinner label="Loading your fixtures…" />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <PageHeader
        eyebrow="Career hub"
        title={
          <>
            My <span className="text-gradient-primary">matches</span>
          </>
        }
        subtitle="Fixtures tied to your roster — open lobby for check-in, chat, and score reports."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Refresh
            </Button>
            <Button variant="arena" size="sm" asChild>
              <Link to="/check-in">Check-in hub</Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-display font-bold uppercase tracking-wide transition-colors ${
              filter === f.id
                ? "bg-primary/15 text-primary border border-primary/35"
                : "bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            {f.label}
            <span className="ml-1.5 tabular-nums opacity-70">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load matches.{" "}
          <button type="button" className="underline font-semibold" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {!isError && filtered.length === 0 && (
        <EmptyState
          icon={Swords}
          title="No matches yet"
          description="Join a tournament and get seeded into the bracket — your fixtures will show up here."
          action={
            <Button asChild variant="arena" size="sm">
              <Link to="/tournaments">Discover events</Link>
            </Button>
          }
        />
      )}

      <div className="space-y-3">
        {filtered.map((m) => {
          const live = m.status === "in_progress";
          const checkIn = m.status === "check_in_open" || m.status === "checked_in";
          return (
            <div
              key={m.id}
              className={`glass rounded-2xl border p-4 md:p-5 shadow-arena-card ${
                live ? "border-red-500/35 glow-border-primary" : "border-border/50"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={m.status} />
                    {live && (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-display font-bold uppercase text-red-400">
                        <span className="live-dot" /> Live
                      </span>
                    )}
                    {checkIn && (
                      <Badge className="bg-primary/15 text-primary border-0 text-[10px]">Check-in</Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground truncate">
                      {m.tournament_name || "Tournament"}
                      {m.round != null ? ` · R${m.round}` : ""}
                    </span>
                  </div>
                  <p className="font-display font-bold tracking-tight text-base md:text-lg">
                    <span className={m.my_side === "a" ? "text-primary" : ""}>{m.team_a_name || "TBD"}</span>
                    <span className="mx-2 text-muted-foreground text-sm font-semibold">
                      {m.score_a ?? 0} – {m.score_b ?? 0}
                    </span>
                    <span className={m.my_side === "b" ? "text-primary" : ""}>{m.team_b_name || "TBD"}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2">
                    {m.my_team_name && (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-primary" /> You: {m.my_team_name}
                        {m.my_team_tag ? ` [${m.my_team_tag}]` : ""}
                      </span>
                    )}
                    {m.scheduled_time && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {moment(m.scheduled_time).format("MMM D · h:mm A")}
                        <span className="opacity-60">({moment(m.scheduled_time).fromNow()})</span>
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {live && (
                    <Button size="sm" variant="arena" asChild>
                      <Link to={`/matches/${m.id}/live`}>
                        <Radio className="h-3.5 w-3.5" /> Watch
                      </Link>
                    </Button>
                  )}
                  <Button size="sm" variant={checkIn ? "arena" : "outline"} asChild>
                    <Link to={`/matches/${m.id}/lobby`}>
                      Lobby <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/matches/${m.id}`}>Details</Link>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/30 p-4 text-xs text-muted-foreground flex gap-2">
        <Filter className="h-4 w-4 shrink-0 text-primary" />
        <p>
          On tenant sites use <strong className="text-foreground">/my-matches</strong> for org-scoped fixtures. Open{" "}
          <Link to="/matches" className="text-primary hover:underline">
            Match center
          </Link>{" "}
          for the full league view when you have organizer access.
        </p>
      </div>
    </div>
  );
}
