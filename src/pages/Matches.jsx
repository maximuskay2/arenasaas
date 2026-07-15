import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { Swords, Search, Radio, DoorOpen, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import StatsCard from "../components/shared/StatsCard";

export default function Matches() {
  const { tenantId, isSuperAdmin } = useTenant();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["matches", tenantId],
    queryFn: () =>
      tenantId && !isSuperAdmin
        ? maxikay.entities.Match.filter({ tenant_id: tenantId }, "-created_date", 100)
        : maxikay.entities.Match.list("-created_date", 100),
  });

  useEffect(() => {
    const unsub = maxikay.entities.Match.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["matches", tenantId] });
    });
    return unsub;
  }, [tenantId, queryClient]);

  if (isLoading) return <LoadingSpinner label="Loading fixtures…" />;

  const filtered = matches.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      m.team_a_name?.toLowerCase().includes(q) ||
      m.team_b_name?.toLowerCase().includes(q) ||
      m.bracket_position?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const liveCount = matches.filter((m) => m.status === "in_progress").length;
  const checkInCount = matches.filter((m) =>
    ["check_in_open", "checked_in"].includes(m.status)
  ).length;
  const doneCount = matches.filter((m) =>
    ["completed", "forfeited", "no_show"].includes(m.status)
  ).length;

  const statuses = ["all", "pending", "check_in_open", "in_progress", "completed", "forfeited"];

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Match center"
        title={
          <>
            Live <span className="text-gradient-primary">matches</span>
          </>
        }
        subtitle={`${matches.length} fixtures · scores, check-in, lobbies, and live streams`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatsCard icon={Swords} label="Total" value={matches.length} delay={0} />
        <StatsCard
          icon={Radio}
          label="Live now"
          value={liveCount}
          trend={liveCount > 0 ? "In progress" : "None live"}
          trendUp={liveCount > 0}
          delay={0.04}
        />
        <StatsCard icon={DoorOpen} label="Check-in" value={checkInCount} delay={0.08} />
        <StatsCard icon={Swords} label="Finished" value={doneCount} delay={0.12} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 glass rounded-2xl p-3 border border-border/50 shadow-arena-card">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search teams or bracket position…"
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
          icon={Swords}
          title="No matches found"
          description="Matches appear when brackets are generated for a tournament."
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((match, i) => {
            const isLive = match.status === "in_progress";
            const showLiveLink = ["in_progress", "check_in_open", "checked_in"].includes(match.status);
            return (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
              >
                <div
                  className={`glass rounded-2xl p-4 md:p-5 glass-hover flex flex-col sm:flex-row sm:items-stretch gap-3 border border-border/50 shadow-arena-card ${
                    isLive ? "glow-border-primary" : ""
                  }`}
                >
                  <Link to={`/matches/${match.id}/lobby`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-4 h-full">
                      <div className="flex-1 min-w-0">
                        {isLive && (
                          <p className="section-label text-red-400 flex items-center gap-1.5 mb-1.5">
                            <span className="live-dot" /> Live now
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-sm font-display font-bold text-foreground truncate max-w-[40%]">
                            {match.team_a_name || "TBD"}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xl font-display font-bold text-primary tabular-nums">
                              {match.score_a ?? 0}
                            </span>
                            <span className="text-[10px] font-display font-bold text-muted-foreground uppercase">
                              vs
                            </span>
                            <span className="text-xl font-display font-bold text-primary tabular-nums">
                              {match.score_b ?? 0}
                            </span>
                          </div>
                          <span className="text-sm font-display font-bold text-foreground truncate max-w-[40%]">
                            {match.team_b_name || "TBD"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {match.bracket_position || "Bracket"} · Round {match.round}
                          {match.match_number != null ? ` · #${match.match_number}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={match.status} />
                    </div>
                  </Link>

                  <div className="flex sm:flex-col justify-end sm:justify-center gap-2 border-t sm:border-t-0 sm:border-l border-border/40 pt-3 sm:pt-0 sm:pl-4 shrink-0">
                    {showLiveLink && (
                      <Button variant="outline" size="sm" asChild className="h-8 text-[10px] border-red-500/30 text-red-400 hover:text-red-300">
                        <Link to={`/matches/${match.id}/live`} className="gap-1">
                          <Radio className="w-3 h-3" /> Live
                        </Link>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" asChild className="h-8 text-[10px]">
                      <Link to={`/matches/${match.id}/lobby`} className="gap-1">
                        <DoorOpen className="w-3 h-3" /> Lobby
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild className="h-8 text-[10px] text-muted-foreground">
                      <Link to={`/matches/${match.id}`} className="gap-1">
                        <Settings2 className="w-3 h-3" /> Console
                      </Link>
                    </Button>
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
