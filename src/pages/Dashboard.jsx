import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { getEffectiveHubMode } from "@/lib/routingLogic";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/lib/AuthContext";
import {
  Trophy,
  Swords,
  Users,
  DollarSign,
  Zap,
  ArrowRight,
  AlertTriangle,
  Plus,
  Radio,
  Compass,
  Wallet,
  Settings,
  LayoutList,
  MessageSquare,
  Flame,
  Rocket,
  Clock,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import StatsCard from "../components/shared/StatsCard";
import StatusBadge from "../components/shared/StatusBadge";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import PlanStatus from "../components/shared/PlanStatus";
import EmptyState from "../components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import moment from "moment";

const QUICK_ACTIONS = [
  { to: "/tournaments/new", label: "New tournament", desc: "Wizard · draft to publish", icon: Plus, accent: true },
  { to: "/tournaments", label: "Discover", desc: "Marketplace & join", icon: Compass },
  { to: "/league/tournaments", label: "My events", desc: "Manage brackets", icon: LayoutList },
  { to: "/league/ops", label: "Ops board", desc: "Event-day command", icon: Activity },
  { to: "/matches", label: "Match center", desc: "Live & check-in", icon: Swords },
  { to: "/watch", label: "Watch live", desc: "Spectator hub", icon: Radio },
  { to: "/teams", label: "Teams", desc: "Rosters & records", icon: Users },
  { to: "/wallet", label: "Org vault", desc: "Fees & payouts", icon: Wallet },
  { to: "/rankings", label: "Power ranks", desc: "Elo prestige", icon: Flame },
  { to: "/community", label: "Community", desc: "War room feed", icon: MessageSquare },
  { to: "/onboarding", label: "Getting started", desc: "Launch checklist", icon: Rocket },
  { to: "/settings", label: "Settings", desc: "Brand & rails", icon: Settings },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { tenantId, isSuperAdmin } = useTenant();
  const queryClient = useQueryClient();
  const leagueHostView = getEffectiveHubMode(user) !== "player";
  const display = user?.full_name || user?.email?.split("@")[0] || "Organizer";

  const { data: tenantRow } = useQuery({
    queryKey: ["tenant-row", tenantId],
    queryFn: () =>
      tenantId ? maxikay.entities.Tenant.filter({ id: tenantId }, "-created_date", 1).then((r) => r[0] ?? null) : null,
    enabled: leagueHostView && Boolean(tenantId && !isSuperAdmin),
  });
  const { data: tournaments = [], isLoading: loadingT } = useQuery({
    queryKey: ["tournaments", tenantId],
    queryFn: () =>
      tenantId && !isSuperAdmin
        ? maxikay.entities.Tournament.filter({ tenant_id: tenantId }, "-created_date", 50)
        : maxikay.entities.Tournament.list("-created_date", 50),
    enabled: leagueHostView,
  });
  const { data: matches = [], isLoading: loadingM } = useQuery({
    queryKey: ["matches-recent", tenantId],
    queryFn: () =>
      tenantId && !isSuperAdmin
        ? maxikay.entities.Match.filter({ tenant_id: tenantId }, "-created_date", 20)
        : maxikay.entities.Match.list("-created_date", 20),
    enabled: leagueHostView,
  });
  const { data: teams = [], isLoading: loadingTeams } = useQuery({
    queryKey: ["teams", tenantId],
    queryFn: () =>
      tenantId && !isSuperAdmin
        ? maxikay.entities.Team.filter({ tenant_id: tenantId }, "-created_date", 50)
        : maxikay.entities.Team.list("-created_date", 50),
    enabled: leagueHostView,
  });

  useEffect(() => {
    if (!leagueHostView) return;
    const unsub1 = maxikay.entities.Match.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["matches-recent", tenantId] });
    });
    const unsub2 = maxikay.entities.Tournament.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["tournaments", tenantId] });
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [leagueHostView, tenantId, queryClient]);

  const activeTournaments = tournaments.filter((t) => t.status === "in_progress");
  const totalPrize = tournaments.reduce((sum, t) => sum + (t.prize_pool || 0), 0);
  const liveMatches = matches.filter((m) => m.status === "in_progress");
  const openReg = tournaments.filter((t) => t.status === "registration_open");
  const drafts = tournaments.filter((t) => t.status === "draft");
  const scheduledSoon = matches
    .filter((m) => m.status === "scheduled" || m.status === "ready" || m.status === "check_in")
    .slice(0, 4);

  const orgName = tenantRow?.name || tenantRow?.slug || null;
  const initials = display
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const attentionItems = useMemo(() => {
    const items = [];
    if (tenantRow?.status === "pending") {
      items.push({
        id: "pending-org",
        tone: "amber",
        icon: AlertTriangle,
        title: "Org pending approval",
        body: "Discovery stays live; tournament creation unlocks after Central Station approves.",
      });
    }
    if (liveMatches.length > 0) {
      items.push({
        id: "live",
        tone: "red",
        icon: Radio,
        title: `${liveMatches.length} live match${liveMatches.length === 1 ? "" : "es"}`,
        body: "Scores and disputes need eyes in Match Center.",
        to: "/matches",
      });
    }
    if (openReg.length > 0) {
      items.push({
        id: "open-reg",
        tone: "cyan",
        icon: Clock,
        title: `${openReg.length} open registration`,
        body: "Watch slots fill — close when ready to seed.",
        to: "/league/tournaments",
      });
    }
    if (drafts.length > 0) {
      items.push({
        id: "drafts",
        tone: "muted",
        icon: CheckCircle2,
        title: `${drafts.length} draft event${drafts.length === 1 ? "" : "s"}`,
        body: "Finish setup and publish to go live.",
        to: "/league/tournaments",
      });
    }
    if (tournaments.length === 0) {
      items.push({
        id: "first",
        tone: "cyan",
        icon: Rocket,
        title: "Launch your first event",
        body: "Run the wizard — format, prize, publish.",
        to: "/tournaments/new",
      });
    }
    return items.slice(0, 4);
  }, [tenantRow?.status, liveMatches.length, openReg.length, drafts.length, tournaments.length]);

  if (!leagueHostView) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loadingT || loadingM || loadingTeams) return <LoadingSpinner label="Syncing command center…" />;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-border/50 glass p-6 md:p-8 shadow-arena"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-accent/15 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--border) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.4) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            maskImage: "radial-gradient(ellipse 80% 70% at 70% 30%, black, transparent)",
          }}
        />
        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 ring-1 ring-primary/35 font-display text-lg font-bold text-primary shadow-arena-glow">
              {initials}
            </div>
            <div>
              <p className="section-label mb-2 flex items-center gap-2">
                <span className="live-dot" /> Live operations
                {orgName ? (
                  <>
                    <span className="text-border">·</span>
                    <span className="text-primary/90 normal-case tracking-normal font-semibold">{orgName}</span>
                  </>
                ) : null}
              </p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight">
                Command <span className="text-gradient-primary">Center</span>
              </h1>
              <p className="text-muted-foreground mt-2 max-w-xl leading-relaxed">
                Welcome back, <strong className="text-foreground font-semibold">{display}</strong> — brackets, live
                matches, teams, vault, and discovery in one place.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="lg">
              <Link to="/tournaments">
                <Radio className="h-4 w-4" /> Discover
              </Link>
            </Button>
            <Button asChild size="lg" variant="arena">
              <Link to="/tournaments/new">
                <Plus className="h-4 w-4" /> New tournament
              </Link>
            </Button>
          </div>
        </div>
      </motion.div>

      {!isSuperAdmin && <PlanStatus />}

      {/* Ops attention strip */}
      {attentionItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display font-semibold text-sm flex items-center gap-2 text-muted-foreground">
            <Activity className="w-4 h-4 text-primary" />
            Needs attention
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {attentionItems.map((item) => {
              const Icon = item.icon;
              const toneBorder =
                item.tone === "amber"
                  ? "border-amber-500/40 bg-amber-500/10"
                  : item.tone === "red"
                    ? "border-red-500/35 bg-red-500/10"
                    : item.tone === "cyan"
                      ? "border-primary/35 bg-primary/10"
                      : "border-border/50 bg-card/40";
              const inner = (
                <div className={`rounded-2xl border p-4 h-full glass-hover ${toneBorder}`}>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-background/40 ring-1 ring-border/40 shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold tracking-tight">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{item.body}</p>
                    </div>
                  </div>
                </div>
              );
              return item.to ? (
                <Link key={item.id} to={item.to} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={item.id}>{inner}</div>
              );
            })}
          </div>
        </section>
      )}

      {/* Pulse stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatsCard
          icon={Trophy}
          label="Tournaments"
          value={tournaments.length}
          trend={`${activeTournaments.length} live · ${openReg.length} open`}
          trendUp
          delay={0}
        />
        <StatsCard
          icon={Swords}
          label="Live matches"
          value={liveMatches.length}
          trend={`${matches.length} recent`}
          trendUp={liveMatches.length > 0}
          delay={0.05}
        />
        <StatsCard icon={Users} label="Teams" value={teams.length} delay={0.1} />
        <StatsCard
          icon={DollarSign}
          label="Prize pool"
          value={`$${totalPrize.toLocaleString()}`}
          delay={0.15}
        />
      </div>

      {/* Open registration spotlight */}
      {openReg.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Open registration
            </h2>
            <Link
              to="/league/tournaments"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {openReg.slice(0, 3).map((t) => (
              <Link key={t.id} to={`/tournaments/${t.id}`} className="block">
                <div className="glass rounded-2xl border border-primary/25 p-4 shadow-arena-card glass-hover h-full">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] font-display font-bold uppercase tracking-wider text-primary bg-primary/10 ring-1 ring-primary/25 px-2 py-0.5 rounded-full">
                      Registration open
                    </span>
                    {t.prize_pool > 0 && (
                      <span className="text-xs font-display font-bold text-primary tabular-nums">
                        ${Number(t.prize_pool).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="font-display font-bold tracking-tight line-clamp-1">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t.game_title || "Multi-game"} · {t.registered_teams || 0}
                    {t.max_teams ? ` / ${t.max_teams}` : ""} teams
                  </p>
                  {t.max_teams > 0 && (
                    <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                        style={{
                          width: `${Math.min(100, Math.round(((t.registered_teams || 0) / t.max_teams) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick launch pad */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Launch pad
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {QUICK_ACTIONS.map((a, i) => (
            <motion.div
              key={a.to}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.02 }}
            >
              <Link
                to={a.to}
                className={`group flex flex-col h-full glass rounded-2xl border p-4 shadow-arena-card glass-hover ${
                  a.accent ? "border-primary/40 ring-1 ring-primary/20" : "border-border/50"
                }`}
              >
                <div
                  className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${
                    a.accent
                      ? "bg-primary/20 text-primary ring-primary/30"
                      : "bg-secondary/60 text-primary ring-border/50"
                  }`}
                >
                  <a.icon className="h-5 w-5" />
                </div>
                <p className="font-display text-sm font-bold tracking-tight group-hover:text-primary transition-colors">
                  {a.label}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{a.desc}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Live + recent + upcoming */}
      <div className="grid lg:grid-cols-3 gap-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-4 lg:col-span-1"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <span className="live-dot" />
              Live matches
            </h2>
            <Link to="/matches" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {liveMatches.length === 0 && (
              <EmptyState
                icon={Swords}
                title="No live matches"
                description="When games go live, scores appear here for instant ops."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/matches">Match center</Link>
                  </Button>
                }
              />
            )}
            {liveMatches.slice(0, 5).map((match) => (
              <Link key={match.id} to={`/matches/${match.id}`} className="block">
                <div className="glass rounded-2xl p-4 glass-hover glow-border-primary border border-border/50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate">{match.team_a_name || "TBD"}</span>
                        <span className="font-display font-bold text-primary tabular-nums">{match.score_a ?? 0}</span>
                        <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">vs</span>
                        <span className="font-display font-bold text-primary tabular-nums">{match.score_b ?? 0}</span>
                        <span className="text-sm font-semibold truncate">{match.team_b_name || "TBD"}</span>
                      </div>
                      {match.scheduled_time && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {moment(match.scheduled_time).format("MMM D · h:mm A")}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={match.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4 lg:col-span-1"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Recent events
            </h2>
            <Link
              to="/league/tournaments"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {tournaments.length === 0 && (
              <EmptyState
                icon={Trophy}
                title="No tournaments yet"
                description="Create your first event and open registration tonight."
                action={
                  <Button asChild size="sm" variant="arena">
                    <Link to="/tournaments/new">Create event</Link>
                  </Button>
                }
              />
            )}
            {tournaments.slice(0, 5).map((t) => (
              <Link key={t.id} to={`/tournaments/${t.id}`} className="block">
                <div className="glass rounded-2xl p-4 glass-hover flex items-center justify-between gap-3 border border-border/50">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t.game_title || "Multi-game"} · {t.registered_teams || 0} teams
                      {t.prize_pool ? ` · $${Number(t.prize_pool).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-4 lg:col-span-1"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Up next
            </h2>
            <Link to="/matches" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              Schedule <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {scheduledSoon.length === 0 && (
              <div className="glass rounded-3xl p-8 text-center border border-border/50">
                <p className="text-sm text-muted-foreground">No upcoming fixtures queued</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Scheduled and check-in matches show here.</p>
              </div>
            )}
            {scheduledSoon.map((match) => (
              <Link key={match.id} to={`/matches/${match.id}`} className="block">
                <div className="glass rounded-2xl p-4 glass-hover border border-border/50">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <StatusBadge status={match.status} />
                    {match.scheduled_time && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {moment(match.scheduled_time).fromNow()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold truncate">
                    {match.team_a_name || "TBD"} <span className="text-muted-foreground font-normal">vs</span>{" "}
                    {match.team_b_name || "TBD"}
                  </p>
                  {match.scheduled_time && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {moment(match.scheduled_time).format("MMM D · h:mm A")}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
