import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { TrendingUp, TrendingDown, Minus, Crown, Shield } from "lucide-react";

export default function PowerRankings() {
  const { data, isLoading } = useQuery({
    queryKey: ["power-rankings"],
    queryFn: () => maxikay.public.powerRankings({ limit: 100 }),
  });

  const rows = data?.rankings || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 px-4 py-8 pb-24">
      <PageHeader
        title="Power rankings"
        subtitle="Global Elo — every bracket result shapes the prestige ladder."
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <p className="text-center text-muted-foreground py-16 text-sm">
          No rated teams yet. Elo updates when matches are completed or forfeited.
        </p>
      ) : (
        <div className="rounded-2xl border border-border/60 overflow-hidden bg-secondary/10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 w-12">#</th>
                  <th className="p-3">Team</th>
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
                      <span className="text-muted-foreground text-xs ml-2">[{r.tag}]</span>
                    </td>
                    <td className="p-3 font-display font-bold text-primary tabular-nums">{Math.round(r.elo)}</td>
                    <td className="p-3 tabular-nums text-muted-foreground">
                      {r.wins}W — {r.losses}L
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
                      {r.trend === "flat" && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                          <Minus className="w-3.5 h-3.5" /> Steady
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {r.apex_tier && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/50 bg-primary/10 text-[10px] font-display uppercase tracking-wide text-primary">
                          <Crown className="w-3 h-3" /> Apex
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground flex items-start gap-2 max-w-2xl">
        <Shield className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
        K-factor scales with prize pool tier. Top 10 globally earn the Apex badge on public team profiles when linked to an
        Elo entity.
      </p>
    </div>
  );
}
