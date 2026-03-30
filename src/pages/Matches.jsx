import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { Swords, Search, Radio } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import LoadingSpinner from "../components/shared/LoadingSpinner";

export default function Matches() {
  const { tenantId, isSuperAdmin } = useTenant();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["matches", tenantId],
    queryFn: () => tenantId && !isSuperAdmin
      ? maxikay.entities.Match.filter({ tenant_id: tenantId }, "-created_date", 100)
      : maxikay.entities.Match.list("-created_date", 100),
  });

  useEffect(() => {
    const unsub = maxikay.entities.Match.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["matches", tenantId] });
    });
    return unsub;
  }, [tenantId, queryClient]);

  if (isLoading) return <LoadingSpinner />;

  const filtered = matches.filter((m) => {
    const matchesSearch = !search || 
      m.team_a_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.team_b_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses = ["all", "pending", "check_in_open", "in_progress", "completed", "forfeited"];

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <PageHeader title="Matches" subtitle={`${matches.length} total matches`} />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by team name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === s
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Swords} title="No matches found" description="Matches appear when brackets are generated" />
      ) : (
        <div className="grid gap-3">
          {filtered.map((match, i) => (
            <motion.div
              key={match.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
            >
              <div className={`glass rounded-xl p-4 glass-hover flex flex-col sm:flex-row sm:items-stretch gap-3 ${match.status === "in_progress" ? "glow-border-primary" : ""}`}>
                <Link to={`/matches/${match.id}/lobby`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-4 h-full">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">{match.team_a_name || "TBD"}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-display font-bold text-primary">{match.score_a}</span>
                          <span className="text-xs text-muted-foreground">vs</span>
                          <span className="text-lg font-display font-bold text-primary">{match.score_b}</span>
                        </div>
                        <span className="text-sm font-semibold text-foreground">{match.team_b_name || "TBD"}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {match.bracket_position} · Round {match.round}
                      </p>
                    </div>
                    <StatusBadge status={match.status} />
                  </div>
                </Link>
                <div className="flex sm:flex-col justify-end gap-2 border-t sm:border-t-0 sm:border-l border-border/40 pt-3 sm:pt-0 sm:pl-3">
                  {(match.status === "in_progress" || match.status === "check_in_open" || match.status === "checked_in") && (
                    <Link
                      to={`/matches/${match.id}/live`}
                      className="inline-flex items-center justify-center gap-1 text-[10px] font-display font-bold uppercase tracking-wider text-red-400 hover:text-red-300 text-center sm:text-left"
                    >
                      <Radio className="w-3 h-3 shrink-0" /> Live
                    </Link>
                  )}
                  <Link
                    to={`/matches/${match.id}/lobby`}
                    className="text-[10px] font-display font-bold uppercase tracking-wider text-primary hover:underline text-center sm:text-left"
                  >
                    Lobby
                  </Link>
                  <Link
                    to={`/matches/${match.id}`}
                    className="text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground text-center sm:text-left"
                  >
                    Console
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}