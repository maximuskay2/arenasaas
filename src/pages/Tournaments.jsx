import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { Trophy, Plus, Search, Filter } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import moment from "moment";

export default function Tournaments() {
  const navigate = useNavigate();
  const { tenantId, isSuperAdmin } = useTenant();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ["tournaments", tenantId],
    queryFn: () => tenantId && !isSuperAdmin
      ? maxikay.entities.Tournament.filter({ tenant_id: tenantId }, "-created_date", 100)
      : maxikay.entities.Tournament.list("-created_date", 100),
  });

  if (isLoading) return <LoadingSpinner />;

  const filtered = tournaments.filter((t) => {
    const matchesSearch = !search || t.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses = ["all", "draft", "registration_open", "in_progress", "completed"];

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <PageHeader
        title="Tournaments"
        subtitle={`${tournaments.length} tournaments total`}
        actions={
          <Button onClick={() => navigate("/tournaments/new")} className="gap-2 font-display text-xs tracking-wider">
            <Plus className="w-4 h-4" /> CREATE
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tournaments..."
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

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No tournaments found"
          description="Create your first tournament to get started"
          action={
            <Button onClick={() => navigate("/tournaments/new")} className="gap-2">
              <Plus className="w-4 h-4" /> Create Tournament
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map((tournament, i) => (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Link to={`/tournaments/${tournament.id}`}>
                <div className={`glass rounded-xl p-5 glass-hover ${tournament.status === "in_progress" ? "glow-border-primary" : ""}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-foreground truncate">{tournament.name}</h3>
                        <StatusBadge status={tournament.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span>{tournament.game_title || "No game"}</span>
                        <span>{tournament.format?.replace(/_/g, " ")}</span>
                        <span>{tournament.registered_teams || 0}/{tournament.max_teams} teams</span>
                        {tournament.prize_pool > 0 && (
                          <span className="text-primary font-semibold">${tournament.prize_pool.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {tournament.start_date && (
                        <p>{moment(tournament.start_date).format("MMM D, YYYY")}</p>
                      )}
                      <p className="mt-0.5">{moment(tournament.created_date).fromNow()}</p>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}