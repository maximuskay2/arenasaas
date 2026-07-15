import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Radio, Swords, ChevronRight, Sparkles, Tv } from "lucide-react";
import { maxikay } from "@/api/maxikayClient";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import moment from "moment";

/**
 * Spectator growth surface — all live / check-in matches across the grid.
 */
export default function WatchHub() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["live-matches-hub"],
    queryFn: () => maxikay.public.liveMatches({ limit: 40 }),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const items = data?.items ?? [];
  const live = items.filter((m) => m.status === "in_progress");
  const other = items.filter((m) => m.status !== "in_progress");

  return (
    <div className="max-w-6xl mx-auto space-y-8 px-4 sm:px-6 py-6 pb-16">
      <PageHeader
        eyebrow="Spectator"
        title={
          <>
            Watch <span className="text-gradient-primary">live</span>
          </>
        }
        subtitle="Live and check-in matches across every organization — stream when available, bracket always open."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
            <Button variant="arena" size="sm" asChild>
              <Link to="/tournaments">Browse cups</Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="glass rounded-2xl border border-border/50 p-4 text-center">
          <p className="font-display text-2xl font-bold text-primary tabular-nums">{live.length}</p>
          <p className="section-label mt-1">Live now</p>
        </div>
        <div className="glass rounded-2xl border border-border/50 p-4 text-center">
          <p className="font-display text-2xl font-bold tabular-nums">{items.length}</p>
          <p className="section-label mt-1">On the board</p>
        </div>
        <div className="glass rounded-2xl border border-border/50 p-4 text-center col-span-2 sm:col-span-1">
          <p className="font-display text-2xl font-bold tabular-nums">
            {items.filter((m) => m.has_stream).length}
          </p>
          <p className="section-label mt-1">With stream</p>
        </div>
      </div>

      {isLoading && <LoadingSpinner label="Loading live grid…" />}
      {isError && (
        <p className="text-sm text-destructive">
          Could not load live matches.{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Retry
          </button>
        </p>
      )}

      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={Tv}
          title="Nothing live right now"
          description="When matches go in progress or open check-in, they surface here for the whole platform."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/tournaments">Explore tournaments</Link>
            </Button>
          }
        />
      )}

      {live.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display font-bold text-lg flex items-center gap-2">
            <span className="live-dot" />
            Live now
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {live.map((m) => (
              <MatchCard key={m.id} m={m} featured />
            ))}
          </div>
        </section>
      )}

      {other.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display font-bold text-lg flex items-center gap-2">
            <Swords className="h-4 w-4 text-primary" />
            Check-in &amp; dispute
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {other.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      <div className="glass rounded-3xl border border-primary/25 p-6 text-center space-y-3 shadow-arena-glow">
        <Sparkles className="h-6 w-6 text-primary mx-auto" />
        <p className="font-display font-bold">Want more action?</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Discover open registration cups, follow power rankings, or join the community war room.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="arena" size="sm">
            <Link to="/tournaments">Discover</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/rankings">Power ranks</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/community">Community</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function MatchCard({ m, featured }) {
  return (
    <div
      className={`glass rounded-3xl border p-5 shadow-arena-card space-y-3 ${
        featured ? "border-red-500/35" : "border-border/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={m.status} />
        {m.has_stream && (
          <span className="inline-flex items-center gap-1 text-[10px] font-display font-bold uppercase text-primary">
            <Radio className="h-3 w-3" /> Stream
          </span>
        )}
      </div>
      <div>
        <p className="font-display font-bold tracking-tight">
          {m.team_a_name || "TBD"}{" "}
          <span className="text-primary tabular-nums">
            {m.score_a ?? 0}–{m.score_b ?? 0}
          </span>{" "}
          {m.team_b_name || "TBD"}
        </p>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {m.tournament_name}
          {m.game_title ? ` · ${m.game_title}` : ""}
          {m.organizer_name ? ` · ${m.organizer_name}` : ""}
        </p>
        {m.scheduled_time && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{moment(m.scheduled_time).fromNow()}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="arena" className="flex-1" asChild>
          <Link to={m.watch_path || `/matches/${m.id}/live`}>
            Watch <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to={`/tournaments/${m.tournament_id}`}>Event</Link>
        </Button>
      </div>
    </div>
  );
}
