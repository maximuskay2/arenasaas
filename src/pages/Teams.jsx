import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { Users, Search, BarChart2, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import LoadingSpinner from "../components/shared/LoadingSpinner";

export default function Teams() {
  const { tenantId, isSuperAdmin } = useTenant();
  const [search, setSearch] = useState("");

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams", tenantId],
    queryFn: () => tenantId && !isSuperAdmin
      ? maxikay.entities.Team.filter({ tenant_id: tenantId }, "-created_date", 100)
      : maxikay.entities.Team.list("-created_date", 100),
  });

  const { data: tournaments = [] } = useQuery({
    queryKey: ["tournaments", tenantId],
    queryFn: () => tenantId && !isSuperAdmin
      ? maxikay.entities.Tournament.filter({ tenant_id: tenantId })
      : maxikay.entities.Tournament.list(),
  });

  if (isLoading) return <LoadingSpinner />;

  const tournamentMap = {};
  tournaments.forEach(t => { tournamentMap[t.id] = t.name; });

  const filtered = teams.filter(t =>
    !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.tag?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <PageHeader title="Teams" subtitle={`${teams.length} teams registered`} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search teams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-secondary/50 border-border/50"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No teams found" description="Teams appear when you add them to tournaments" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((team, i) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <div className="glass rounded-xl p-5 glass-hover h-full">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    {team.logo_url ? (
                      <img src={team.logo_url} alt={team.tag} className="w-8 h-8 object-contain" />
                    ) : (
                      <span className="font-display text-sm font-bold text-primary">{team.tag}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{team.name}</h3>
                    <p className="text-xs text-muted-foreground">[{team.tag}]</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    <p>{team.roster?.length || 0} players</p>
                    <p className="mt-0.5">{team.wins || 0}W - {team.losses || 0}L</p>
                  </div>
                  <StatusBadge status={team.status || "registered"} />
                </div>
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                  {team.tournament_id && tournamentMap[team.tournament_id] ? (
                    <Link to={`/tournaments/${team.tournament_id}`}>
                      <p className="text-xs text-primary hover:underline truncate">{tournamentMap[team.tournament_id]}</p>
                    </Link>
                  ) : <span />}
                  <div className="flex items-center gap-2">
                    <Link to={`/team-finance?team_id=${team.id}`} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors">
                      <BarChart2 className="w-3 h-3" /> Finances
                    </Link>
                    <Link to={`/team-dashboard?team_id=${team.id}`} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors">
                      <LayoutDashboard className="w-3 h-3" /> Dashboard
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}