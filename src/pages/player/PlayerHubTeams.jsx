import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, UserPlus, Crown, ChevronRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { maxikay } from "@/api/maxikayClient";
import { useAuth } from "@/lib/AuthContext";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";
import PageHeader from "@/components/shared/PageHeader";

export default function PlayerHubTeams() {
  const { user } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["me-teams"],
    queryFn: () => maxikay.auth.meTeams(),
    enabled: !!user,
    staleTime: 20_000,
  });

  const teams = data?.teams ?? [];

  if (isLoading) return <LoadingSpinner label="Loading your squads…" />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <PageHeader
        eyebrow="Career hub"
        title={
          <>
            My <span className="text-gradient-primary">teams</span>
          </>
        }
        subtitle="Squads where you are captain or rostered. Captains manage invites from Team Management."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/free-agents">Free agents</Link>
            </Button>
            <Button variant="arena" size="sm" asChild>
              <Link to="/tournaments">Find a cup</Link>
            </Button>
          </div>
        }
      />

      {isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load teams.{" "}
          <button type="button" className="underline font-semibold" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {!isError && teams.length === 0 && (
        <EmptyState
          icon={Users}
          title="No squads yet"
          description="Join a tournament solo or with a roster — your teams will appear here with roles and status."
          action={
            <Button asChild variant="arena" size="sm">
              <Link to="/tournaments">
                <UserPlus className="h-4 w-4" /> Join an event
              </Link>
            </Button>
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {teams.map((t) => {
          const roster = Array.isArray(t.roster) ? t.roster : [];
          return (
            <div
              key={t.id}
              className="glass rounded-3xl border border-border/50 p-5 shadow-arena-card space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display font-bold tracking-tight truncate">{t.name}</h2>
                    {t.tag && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {t.tag}
                      </Badge>
                    )}
                    {t.is_captain && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-display font-bold uppercase text-amber-400">
                        <Crown className="h-3 w-3" /> Captain
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {t.tournament_name || "Tournament"}
                    {t.game_title ? ` · ${t.game_title}` : ""}
                  </p>
                </div>
                <StatusBadge status={t.status || t.tournament_status || "registered"} />
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  <strong className="text-foreground">{t.wins ?? 0}</strong>W –{" "}
                  <strong className="text-foreground">{t.losses ?? 0}</strong>L
                </span>
                {t.elo != null && (
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="h-3 w-3 text-primary" />
                    Elo <strong className="text-foreground tabular-nums">{Number(t.elo).toFixed(0)}</strong>
                  </span>
                )}
                <span>{roster.length} rostered</span>
              </div>

              {roster.length > 0 && (
                <ul className="space-y-1 max-h-28 overflow-y-auto scrollbar-thin">
                  {roster.slice(0, 8).map((p, i) => (
                    <li
                      key={`${p.player_email || p.email || i}`}
                      className="text-[11px] rounded-lg bg-secondary/40 px-2.5 py-1.5 flex justify-between gap-2"
                    >
                      <span className="truncate font-medium text-foreground">
                        {p.player_name || p.player_email || p.email || "Player"}
                      </span>
                      <span className="text-muted-foreground shrink-0">{p.role || "player"}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {t.tournament_id && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/tournaments/${t.tournament_id}`}>
                      Event <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
                {t.tournament_id && (
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/tournaments/${t.tournament_id}/lobby`}>Lobby</Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/team-management"
          className="glass rounded-2xl border border-border/50 p-4 glass-hover flex items-center gap-3"
        >
          <UserPlus className="h-5 w-5 text-primary" />
          <div>
            <p className="font-display text-sm font-bold">Team management</p>
            <p className="text-[11px] text-muted-foreground">Invites, roles, join links</p>
          </div>
        </Link>
        <Link
          to="/team-dashboard"
          className="glass rounded-2xl border border-border/50 p-4 glass-hover flex items-center gap-3"
        >
          <Users className="h-5 w-5 text-primary" />
          <div>
            <p className="font-display text-sm font-bold">Team dashboard</p>
            <p className="text-[11px] text-muted-foreground">Schedule & finance shortcuts</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
