import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { Users, Search, BarChart2, LayoutDashboard, Trophy, Swords } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import StatsCard from "../components/shared/StatsCard";

export default function Teams() {
  const { tenantId, isSuperAdmin } = useTenant();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams", tenantId],
    queryFn: () =>
      tenantId && !isSuperAdmin
        ? maxikay.entities.Team.filter({ tenant_id: tenantId }, "-created_date", 100)
        : maxikay.entities.Team.list("-created_date", 100),
  });

  const { data: tournaments = [] } = useQuery({
    queryKey: ["tournaments", tenantId],
    queryFn: () =>
      tenantId && !isSuperAdmin
        ? maxikay.entities.Tournament.filter({ tenant_id: tenantId })
        : maxikay.entities.Tournament.list(),
  });

  if (isLoading) return <LoadingSpinner label="Loading rosters…" />;

  const tournamentMap = {};
  tournaments.forEach((t) => {
    tournamentMap[t.id] = t.name;
  });

  const filtered = teams.filter((t) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      t.name?.toLowerCase().includes(q) ||
      t.tag?.toLowerCase().includes(q) ||
      t.captain_email?.toLowerCase().includes(q);
    const st = String(t.status || "registered");
    const matchStatus = statusFilter === "all" || st === statusFilter;
    return matchSearch && matchStatus;
  });

  const winners = teams.filter((t) => t.status === "winner").length;
  const active = teams.filter((t) => !["eliminated", "winner"].includes(String(t.status || ""))).length;
  const totalPlayers = teams.reduce((s, t) => s + (Array.isArray(t.roster) ? t.roster.length : 0), 0);

  const statuses = ["all", "registered", "checked_in", "eliminated", "winner"];

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Rosters"
        title={
          <>
            League <span className="text-gradient-primary">teams</span>
          </>
        }
        subtitle={`${teams.length} teams · ${totalPlayers} rostered players across your events`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatsCard icon={Users} label="Teams" value={teams.length} delay={0} />
        <StatsCard icon={Swords} label="Active" value={active} trend="Not eliminated" trendUp delay={0.04} />
        <StatsCard icon={Trophy} label="Champions" value={winners} delay={0.08} />
        <StatsCard icon={Users} label="Players" value={totalPlayers} delay={0.12} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 glass rounded-2xl p-3 border border-border/50 shadow-arena-card">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, tag, or captain…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background/40 border-border/50 rounded-xl"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-display font-bold uppercase tracking-wide whitespace-nowrap transition-colors border ${
                statusFilter === s
                  ? "bg-primary/15 text-primary border-primary/35"
                  : "bg-secondary/50 text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No teams found"
          description="Teams appear when players register for your tournaments."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((team, i) => {
            const wins = team.wins || 0;
            const losses = team.losses || 0;
            const games = wins + losses;
            const winRate = games > 0 ? Math.round((wins / games) * 100) : null;
            return (
              <motion.div
                key={team.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.35) }}
              >
                <div className="glass rounded-3xl p-5 glass-hover h-full border border-border/50 shadow-arena-card flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/25 to-accent/15 ring-1 ring-primary/25 flex items-center justify-center shrink-0">
                      {team.logo_url ? (
                        <img src={team.logo_url} alt={team.tag} className="w-8 h-8 object-contain" />
                      ) : (
                        <span className="font-display text-sm font-bold text-primary">
                          {String(team.tag || "TM").slice(0, 4)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display font-bold text-foreground tracking-tight truncate">
                        {team.name}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono">[{team.tag}]</p>
                    </div>
                    <StatusBadge status={team.status || "registered"} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="rounded-xl bg-secondary/40 border border-border/40 px-2 py-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Roster</p>
                      <p className="font-display font-bold text-sm tabular-nums">
                        {team.roster?.length || 0}
                      </p>
                    </div>
                    <div className="rounded-xl bg-secondary/40 border border-border/40 px-2 py-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Record</p>
                      <p className="font-display font-bold text-sm tabular-nums">
                        {wins}–{losses}
                      </p>
                    </div>
                    <div className="rounded-xl bg-secondary/40 border border-border/40 px-2 py-2 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Win%</p>
                      <p className="font-display font-bold text-sm tabular-nums text-primary">
                        {winRate != null ? `${winRate}%` : "—"}
                      </p>
                    </div>
                  </div>

                  {team.captain_email && (
                    <p className="text-[11px] text-muted-foreground mb-3 truncate">
                      Captain · <span className="text-foreground/80">{team.captain_email}</span>
                    </p>
                  )}

                  <div className="mt-auto pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                    {team.tournament_id && tournamentMap[team.tournament_id] ? (
                      <Link
                        to={`/tournaments/${team.tournament_id}`}
                        className="text-xs text-primary hover:underline truncate font-medium min-w-0"
                      >
                        {tournamentMap[team.tournament_id]}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">No event</span>
                    )}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        to={`/team-finance?team_id=${team.id}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <BarChart2 className="w-3 h-3" /> Finances
                      </Link>
                      <Link
                        to={`/team-dashboard?team_id=${team.id}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <LayoutDashboard className="w-3 h-3" /> Board
                      </Link>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
