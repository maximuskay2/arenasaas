import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { getEffectiveHubMode } from "@/lib/routingLogic";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/lib/AuthContext";
import { Trophy, Swords, Users, DollarSign, Zap, ArrowRight, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import StatsCard from "../components/shared/StatsCard";
import StatusBadge from "../components/shared/StatusBadge";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import PlanStatus from "../components/shared/PlanStatus";
import moment from "moment";

export default function Dashboard() {
  const { user } = useAuth();
  const { tenantId, isSuperAdmin } = useTenant();
  const queryClient = useQueryClient();
  const leagueHostView = getEffectiveHubMode(user) !== "player";

  const { data: tenantRow } = useQuery({
    queryKey: ["tenant-row", tenantId],
    queryFn: () =>
      tenantId ? maxikay.entities.Tenant.filter({ id: tenantId }, '-created_date', 1).then((r) => r[0] ?? null) : null,
    enabled: leagueHostView && Boolean(tenantId && !isSuperAdmin),
  });
  const { data: tournaments = [], isLoading: loadingT } = useQuery({
    queryKey: ["tournaments", tenantId],
    queryFn: () => tenantId && !isSuperAdmin
      ? maxikay.entities.Tournament.filter({ tenant_id: tenantId }, "-created_date", 50)
      : maxikay.entities.Tournament.list("-created_date", 50),
    enabled: leagueHostView,
  });
  const { data: matches = [], isLoading: loadingM } = useQuery({
    queryKey: ["matches-recent", tenantId],
    queryFn: () => tenantId && !isSuperAdmin
      ? maxikay.entities.Match.filter({ tenant_id: tenantId }, "-created_date", 20)
      : maxikay.entities.Match.list("-created_date", 20),
    enabled: leagueHostView,
  });
  const { data: teams = [], isLoading: loadingTeams } = useQuery({
    queryKey: ["teams", tenantId],
    queryFn: () => tenantId && !isSuperAdmin
      ? maxikay.entities.Team.filter({ tenant_id: tenantId }, "-created_date", 50)
      : maxikay.entities.Team.list("-created_date", 50),
    enabled: leagueHostView,
  });

  useEffect(() => {
    if (!leagueHostView) return;
    const unsub1 = maxikay.entities.Match.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ["matches-recent", tenantId] });
    });
    const unsub2 = maxikay.entities.Tournament.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ["tournaments", tenantId] });
    });
    return () => { unsub1(); unsub2(); };
  }, [leagueHostView, tenantId, queryClient]);

  if (!leagueHostView) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loadingT || loadingM || loadingTeams) return <LoadingSpinner />;

  const activeTournaments = tournaments.filter(t => t.status === "in_progress");
  const totalPrize = tournaments.reduce((sum, t) => sum + (t.prize_pool || 0), 0);
  const liveMatches = matches.filter(m => m.status === "in_progress");

  return (
    <div className="space-y-8 pb-20 md:pb-0">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
          Command <span className="text-gradient-primary">Center</span>
        </h1>
        <p className="text-muted-foreground mt-1">Monitor and manage your esports operations</p>
      </motion.div>

      {/* Plan Status */}
      {!isSuperAdmin && <PlanStatus />}

      {!isSuperAdmin && tenantRow?.status === "pending" && (
        <div
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
        >
          <span className="inline-flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <span>
              Your organization is <strong>pending platform approval</strong>. Discovery and player features stay live;
              creating tournaments and other hosting writes unlock after approval (Central Station → Tenants → Approve org).
            </span>
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard icon={Trophy} label="Tournaments" value={tournaments.length} trend={`${activeTournaments.length} active`} trendUp delay={0} />
        <StatsCard icon={Swords} label="Live Matches" value={liveMatches.length} trend={`${matches.length} total`} trendUp delay={0.05} />
        <StatsCard icon={Users} label="Teams" value={teams.length} delay={0.1} />
        <StatsCard icon={DollarSign} label="Prize Pool" value={`$${totalPrize.toLocaleString()}`} delay={0.15} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Live Matches */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Live Matches
            </h2>
            <Link to="/matches" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {liveMatches.length === 0 && (
              <div className="glass rounded-xl p-8 text-center text-muted-foreground text-sm">
                No live matches right now
              </div>
            )}
            {liveMatches.slice(0, 4).map((match) => (
              <Link key={match.id} to={`/matches/${match.id}`}>
                <div className="glass rounded-xl p-4 glass-hover glow-border-primary">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">{match.team_a_name || "TBD"}</span>
                        <span className="text-primary font-display font-bold">{match.score_a}</span>
                        <span className="text-muted-foreground text-xs">vs</span>
                        <span className="text-primary font-display font-bold">{match.score_b}</span>
                        <span className="text-sm font-semibold text-foreground">{match.team_b_name || "TBD"}</span>
                      </div>
                    </div>
                    <StatusBadge status={match.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Recent Tournaments */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <Trophy className="w-4 h-4 text-accent" />
              Recent Tournaments
            </h2>
            <Link to="/league/tournaments" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {tournaments.length === 0 && (
              <div className="glass rounded-xl p-8 text-center text-muted-foreground text-sm">
                No tournaments yet
              </div>
            )}
            {tournaments.slice(0, 5).map((tournament) => (
              <Link key={tournament.id} to={`/tournaments/${tournament.id}`}>
                <div className="glass rounded-xl p-4 glass-hover">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{tournament.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tournament.game_title || "—"} · {tournament.format?.replace(/_/g, " ")} · {tournament.registered_teams || 0}/{tournament.max_teams} teams
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {tournament.start_date && (
                        <span className="text-xs text-muted-foreground">{moment(tournament.start_date).format("MMM D")}</span>
                      )}
                      <StatusBadge status={tournament.status} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}