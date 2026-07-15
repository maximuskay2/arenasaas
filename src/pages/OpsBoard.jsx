import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Clock,
  Radio,
  Swords,
  Trophy,
  FileEdit,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import PageHeader from "@/components/shared/PageHeader";
import StatsCard from "@/components/shared/StatsCard";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import moment from "moment";

function Panel({ title, icon: Icon, children, to, empty }) {
  return (
    <section className="glass rounded-3xl border border-border/50 p-5 shadow-arena-card space-y-4 min-h-[200px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-bold tracking-tight flex items-center gap-2 text-sm md:text-base">
          {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
          {title}
        </h2>
        {to && (
          <Link to={to} className="text-[10px] font-display font-bold uppercase text-primary hover:underline inline-flex items-center gap-0.5">
            Open <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {empty ? <p className="text-sm text-muted-foreground py-6 text-center">{empty}</p> : children}
    </section>
  );
}

/**
 * Event-day operations board for league organizers.
 */
export default function OpsBoard() {
  const { tenantId, isSuperAdmin } = useTenant();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["ops-board", tenantId],
    queryFn: () => maxikay.public.opsBoard(tenantId),
    enabled: Boolean(tenantId || isSuperAdmin),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  if (!tenantId && !isSuperAdmin) {
    return (
      <EmptyState
        icon={Activity}
        title="Select an organization"
        description="Ops board needs a tenant context. Complete onboarding or switch org."
        action={
          <Button asChild variant="arena" size="sm">
            <Link to="/onboarding">Onboarding</Link>
          </Button>
        }
      />
    );
  }

  if (isLoading) return <LoadingSpinner label="Loading ops board…" />;

  const c = data?.counts || {};
  const live = data?.live_matches || [];
  const checkIns = data?.check_ins || [];
  const disputes = data?.disputes || [];
  const openReg = data?.open_registration || [];
  const drafts = data?.drafts || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      <PageHeader
        eyebrow="Event day"
        title={
          <>
            Ops <span className="text-gradient-primary">board</span>
          </>
        }
        subtitle="Live matches, check-ins, disputes, and open registration — one command surface for match day."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="arena" size="sm" asChild>
              <Link to="/matches">Match center</Link>
            </Button>
          </div>
        }
      />

      {isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load ops data. Check API connectivity and tenant context.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatsCard icon={Radio} label="Live" value={c.live_matches ?? live.length} trendUp={(c.live_matches || 0) > 0} />
        <StatsCard icon={Clock} label="Check-in" value={c.check_ins ?? checkIns.length} />
        <StatsCard icon={AlertTriangle} label="Disputes" value={c.disputes ?? disputes.length} trendUp={(c.disputes || 0) > 0} />
        <StatsCard icon={Trophy} label="Open reg" value={c.open_registration ?? openReg.length} />
        <StatsCard icon={FileEdit} label="Drafts" value={c.drafts ?? drafts.length} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="Live matches" icon={Swords} to="/matches" empty={live.length === 0 ? "No live matches" : null}>
          <ul className="space-y-2">
            {live.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/matches/${m.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 hover:bg-red-500/15 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-display font-bold truncate">
                      {m.team_a_name || "TBD"} {m.score_a ?? 0}–{m.score_b ?? 0} {m.team_b_name || "TBD"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{m.tournament_name}</p>
                  </div>
                  <span className="live-dot shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Check-in queue" icon={Clock} to="/matches" empty={checkIns.length === 0 ? "No active check-ins" : null}>
          <ul className="space-y-2">
            {checkIns.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/matches/${m.id}/lobby`}
                  className="block rounded-xl border border-border/40 bg-card/40 px-3 py-2.5 hover:border-primary/30 transition-colors"
                >
                  <p className="text-sm font-semibold truncate">
                    {m.team_a_name || "TBD"} vs {m.team_b_name || "TBD"}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex flex-wrap gap-2 mt-0.5">
                    <span>{m.tournament_name}</span>
                    <span>
                      A:{m.team_a_checked_in ? "✓" : "…"} B:{m.team_b_checked_in ? "✓" : "…"}
                    </span>
                    {m.check_in_deadline && <span>by {moment(m.check_in_deadline).format("h:mm A")}</span>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Disputes" icon={AlertTriangle} to="/league/disputes" empty={disputes.length === 0 ? "No open disputes" : null}>
          <ul className="space-y-2">
            {disputes.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/matches/${m.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 hover:bg-amber-500/15"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {m.team_a_name} vs {m.team_b_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{m.tournament_name}</p>
                  </div>
                  <StatusBadge status="under_dispute" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Open registration" icon={Trophy} to="/league/tournaments" empty={openReg.length === 0 ? "No open registration" : null}>
          <ul className="space-y-2">
            {openReg.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/tournaments/${t.id}`}
                  className="block rounded-xl border border-border/40 bg-card/40 px-3 py-2.5 hover:border-primary/30"
                >
                  <p className="text-sm font-display font-bold truncate">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.game_title || "Multi-game"} · {t.registered_teams || 0}
                    {t.max_teams ? ` / ${t.max_teams}` : ""} teams
                    {t.prize_pool ? ` · ${t.currency || "USD"} ${Number(t.prize_pool).toLocaleString()}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {drafts.length > 0 && (
        <Panel title="Draft events" icon={FileEdit} to="/league/tournaments">
          <div className="flex flex-wrap gap-2">
            {drafts.map((t) => (
              <Link
                key={t.id}
                to={`/tournaments/${t.id}`}
                className="rounded-xl border border-border/40 bg-secondary/40 px-3 py-2 text-xs font-semibold hover:border-primary/30"
              >
                {t.name}
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
