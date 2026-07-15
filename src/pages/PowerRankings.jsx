import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { maxikay } from "@/api/maxikayClient";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { TrendingUp, TrendingDown, Minus, Crown, Shield, Flame, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PowerRankings() {
  const [kind, setKind] = useState("team");
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["power-rankings", kind],
    queryFn: () => maxikay.public.powerRankings({ limit: 100, kind }),
    staleTime: 30_000,
    retry: 2,
  });

  const rows = Array.isArray(data?.rankings) ? data.rankings : [];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 px-4 py-6 md:py-8 pb-24">
        <PageHeader
          className="mb-2"
          eyebrow="Prestige"
          title={
            <>
              Power <span className="text-gradient-primary">rankings</span>
            </>
          }
          subtitle="Global Elo from registered teams and solo players — results and seed data on this platform."
          actions={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          }
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={kind === "team" ? "default" : "outline"}
            className="font-display text-xs uppercase tracking-wider"
            onClick={() => setKind("team")}
          >
            Teams
          </Button>
          <Button
            type="button"
            size="sm"
            variant={kind === "player" ? "default" : "outline"}
            className="font-display text-xs uppercase tracking-wider"
            onClick={() => setKind("player")}
          >
            Players (1v1)
          </Button>
          <Link
            to="/tournaments"
            className="inline-flex items-center text-xs font-display font-bold uppercase tracking-wider text-primary hover:underline ml-auto"
          >
            Compete to climb →
          </Link>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center space-y-3">
            <p className="text-sm text-destructive font-medium">
              Could not load rankings: {error?.message || "request failed"}
            </p>
            <Button type="button" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border/50 glass p-10 text-center space-y-3">
            <Flame className="w-8 h-8 text-primary mx-auto opacity-80" />
            <p className="text-sm text-muted-foreground">
              {kind === "player"
                ? "No rated solo players yet. Player Elo updates after completed 1v1 matches."
                : "No rated teams yet. Elo updates when matches are completed or forfeited."}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/tournaments">Browse tournaments</Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 overflow-hidden bg-secondary/10 shadow-arena-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="p-3 w-12">#</th>
                    <th className="p-3">{kind === "player" ? "Player" : "Team"}</th>
                    <th className="p-3">Elo</th>
                    <th className="p-3">Record</th>
                    <th className="p-3">Trend</th>
                    <th className="p-3">Badge</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-secondary/20">
                      <td className="p-3 tabular-nums text-muted-foreground">{r.global_rank}</td>
                      <td className="p-3">
                        <span className="font-semibold text-foreground">{r.display_name}</span>
                        {r.tag ? (
                          <span className="text-muted-foreground text-xs ml-2">[{r.tag}]</span>
                        ) : null}
                      </td>
                      <td className="p-3 font-display font-bold text-primary tabular-nums">
                        {Math.round(Number(r.elo) || 0)}
                      </td>
                      <td className="p-3 tabular-nums text-muted-foreground">
                        {r.wins ?? 0}W — {r.losses ?? 0}L
                      </td>
                      <td className="p-3">
                        {r.trend === "up" && (
                          <span className="inline-flex items-center gap-1 text-green-400 text-xs font-semibold">
                            <TrendingUp className="w-3.5 h-3.5" /> Climbing
                          </span>
                        )}
                        {r.trend === "down" && (
                          <span className="inline-flex items-center gap-1 text-red-400/90 text-xs font-semibold">
                            <TrendingDown className="w-3.5 h-3.5" /> Cooling
                          </span>
                        )}
                        {(r.trend === "flat" || !r.trend) && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                            <Minus className="w-3.5 h-3.5" /> Steady
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {r.apex_tier ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/50 bg-primary/10 text-[10px] font-display uppercase tracking-wide text-primary">
                            <Crown className="w-3 h-3" /> Apex
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border/40">
              Showing {rows.length} {kind === "player" ? "players" : "teams"} · K-factor scales with prize pool /
              Elo tier
            </p>
          </div>
        )}

      <p className="text-[11px] text-muted-foreground flex items-start gap-2 max-w-2xl">
        <Shield className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
        Top 10 earn the Apex badge. Ratings come from registered match outcomes and platform seed data — not
        dummy leaderboard names.
      </p>
    </div>
  );
}
