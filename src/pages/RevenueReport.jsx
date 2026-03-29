import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { useMemo } from "react";
import { DollarSign, Trophy, Percent, TrendingUp, ArrowLeft } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import moment from "moment";

const tooltipStyle = {
  contentStyle: { background: "hsl(222 44% 8%)", border: "1px solid hsl(222 30% 18%)", borderRadius: 8, fontSize: 11 },
  labelStyle: { color: "hsl(210 40% 70%)" },
};

function KpiCard({ icon: Icon, label, value, sub, color = "text-primary" }) {
  return (
    <div className="glass rounded-xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-display">{label}</p>
        <p className={`text-xl font-display font-bold mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function RevenueReport() {
  const navigate = useNavigate();
  const { tenantId, isAdmin } = useTenant();

  const { data: tournaments = [], isLoading: loadingT } = useQuery({
    queryKey: ["rev-tournaments"],
    queryFn: () =>
      isAdmin
        ? maxikay.entities.Tournament.list("-created_date", 100)
        : maxikay.entities.Tournament.filter({ tenant_id: tenantId }, "-created_date", 100),
  });

  const { data: ledger = [], isLoading: loadingL } = useQuery({
    queryKey: ["rev-ledger"],
    queryFn: () =>
      isAdmin
        ? maxikay.entities.PaymentLedger.list("-created_date", 500)
        : maxikay.entities.PaymentLedger.filter({ tenant_id: tenantId }, "-created_date", 500),
  });

  // Per-tournament financials
  const eventRows = useMemo(() => {
    return tournaments.map((t) => {
      const tLedger = ledger.filter((l) => l.tournament_id === t.id);
      const revenue = tLedger
        .filter((l) => l.source === "registration" && l.type === "credit")
        .reduce((s, l) => s + (Number(l.amount) || 0), 0);
      const prizePool = Number(t.prize_pool) || 0;
      const profit = revenue - prizePool;
      const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
      const paidOut = t.status === "completed";
      return { ...t, revenue, prizePool, profit, margin, paidOut };
    });
  }, [tournaments, ledger]);

  const totRevenue = useMemo(() => eventRows.reduce((s, r) => s + r.revenue, 0), [eventRows]);
  const totPrize = useMemo(() => eventRows.reduce((s, r) => s + r.prizePool, 0), [eventRows]);
  const totProfit = totRevenue - totPrize;
  const avgMargin = totRevenue > 0 ? Math.round((totProfit / totRevenue) * 100) : 0;
  const pendingPayouts = eventRows.filter((r) => !r.paidOut && r.prizePool > 0).reduce((s, r) => s + r.prizePool, 0);

  const chartData = eventRows
    .filter((r) => r.revenue > 0 || r.prizePool > 0)
    .map((r) => ({ name: r.name?.length > 14 ? r.name.slice(0, 14) + "…" : r.name, revenue: r.revenue, prize: r.prizePool, profit: Math.max(0, r.profit) }));

  if (loadingT || loadingL) return <LoadingSpinner />;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <PageHeader
        title="Revenue Report"
        subtitle="Aggregated registration fees, prize payouts, and profit per event"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label="Total Revenue" value={`$${totRevenue.toLocaleString("en", { minimumFractionDigits: 2 })}`} sub={`${eventRows.length} events`} color="text-green-400" />
        <KpiCard icon={Trophy} label="Total Prizes" value={`$${totPrize.toLocaleString()}`} sub="committed to winners" color="text-yellow-400" />
        <KpiCard icon={TrendingUp} label="Net Profit" value={`$${totProfit.toLocaleString()}`} sub="revenue minus prize" color={totProfit >= 0 ? "text-primary" : "text-destructive"} />
        <KpiCard icon={Percent} label="Avg Margin" value={`${avgMargin}%`} sub={`$${pendingPayouts.toLocaleString()} pending payouts`} color={avgMargin >= 0 ? "text-primary" : "text-destructive"} />
      </div>

      {/* Revenue vs Prize bar chart */}
      {chartData.length > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-4">Revenue vs Prize Pool per Event</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 30% 18%)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} />
              <Tooltip {...tooltipStyle} formatter={(v) => `$${v.toLocaleString()}`} />
              <Bar dataKey="revenue" name="Revenue" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="prize" name="Prize Pool" fill="hsl(48 96% 53%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="profit" name="Net Profit" fill="hsl(190 100% 50%)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-event table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Per-Event Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30">
                {["Event", "Status", "Revenue", "Prize Pool", "Net Profit", "Margin", "Payout"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventRows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs">No events found.</td></tr>
              ) : eventRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/20 hover:bg-secondary/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/tournaments/${row.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground truncate max-w-[160px]">{row.name}</p>
                    <p className="text-[11px] text-muted-foreground">{moment(row.start_date).format("MMM D, YYYY")}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {row.status?.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-display font-semibold text-green-400">${row.revenue.toFixed(2)}</td>
                  <td className="px-4 py-3 font-display font-semibold text-yellow-400">${row.prizePool.toFixed(2)}</td>
                  <td className={`px-4 py-3 font-display font-semibold ${row.profit >= 0 ? "text-primary" : "text-destructive"}`}>
                    ${row.profit.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.margin >= 50 ? "bg-green-500" : row.margin >= 20 ? "bg-yellow-500" : "bg-destructive"}`}
                          style={{ width: `${Math.max(0, Math.min(100, row.margin))}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{row.margin}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.prizePool > 0 ? (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${row.paidOut ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"}`}>
                        {row.paidOut ? "Paid" : "Pending"}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}