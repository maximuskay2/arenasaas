import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useMemo } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DollarSign, Users, MessageSquare, TrendingUp, Trophy, Percent, Wallet } from "lucide-react";
import moment from "moment";

function MetricCard({ icon: Icon, label, value, sub, color = "text-primary" }) {
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

const tooltipStyle = {
  contentStyle: { background: "hsl(222 44% 8%)", border: "1px solid hsl(222 30% 18%)", borderRadius: 8, fontSize: 11 },
  labelStyle: { color: "hsl(210 40% 70%)" },
};

export default function AnalyticsTab({ tournamentId, tournament, teams, matches }) {
  const { data: ledger = [] } = useQuery({
    queryKey: ["analytics-ledger", tournamentId],
    queryFn: () => maxikay.entities.PaymentLedger.filter({ tournament_id: tournamentId }, "created_date", 200),
  });

  const { data: chatMessages = [] } = useQuery({
    queryKey: ["analytics-chat", tournamentId],
    queryFn: () => maxikay.entities.ChatMessage.filter({ match_id: `tournament_${tournamentId}` }, "created_date", 500),
  });

  // Total registration revenue
  const totalRevenue = useMemo(
    () => ledger.filter((l) => l.source === "registration" && l.type === "credit").reduce((s, l) => s + (l.amount || 0), 0),
    [ledger]
  );

  // Team sign-up velocity — group by day
  const signupVelocity = useMemo(() => {
    const counts = {};
    teams.forEach((t) => {
      const day = moment(t.created_date).format("MMM D");
      counts[day] = (counts[day] || 0) + 1;
    });
    return Object.entries(counts).map(([day, count]) => ({ day, teams: count }));
  }, [teams]);

  // Cumulative registrations
  const cumulativeSignups = useMemo(() => {
    let total = 0;
    return signupVelocity.map((d) => { total += d.teams; return { day: d.day, total }; });
  }, [signupVelocity]);

  // Chat volume — group by hour
  const chatVolume = useMemo(() => {
    const counts = {};
    chatMessages.forEach((m) => {
      const hour = moment(m.created_date).format("MMM D HH:mm");
      counts[hour] = (counts[hour] || 0) + 1;
    });
    return Object.entries(counts).slice(-24).map(([hour, count]) => ({ hour, messages: count }));
  }, [chatMessages]);

  const avgSignupsPerDay = signupVelocity.length
    ? (teams.length / signupVelocity.length).toFixed(1)
    : 0;

  const prizePool = tournament?.prize_pool || 0;
  const entryFee = tournament?.entry_fee || 0;
  const currency = tournament?.currency || "USD";
  const pendingPayout = prizePool; // prize pool to be paid to winner
  const profit = totalRevenue - prizePool;
  const profitMargin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Financial summary */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Financial Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            icon={DollarSign}
            label="Total Revenue"
            value={`${currency} ${totalRevenue.toLocaleString("en", { minimumFractionDigits: 2 })}`}
            sub={`${entryFee > 0 ? `${currency} ${entryFee} / team` : "Free entry"}`}
            color="text-green-400"
          />
          <MetricCard
            icon={Trophy}
            label="Prize Pool"
            value={`${currency} ${prizePool.toLocaleString()}`}
            sub="to winner(s)"
            color="text-yellow-400"
          />
          <MetricCard
            icon={Wallet}
            label="Pending Payout"
            value={`${currency} ${pendingPayout.toLocaleString()}`}
            sub={tournament?.status === "completed" ? "awaiting withdrawal" : "not yet due"}
            color="text-accent"
          />
          <MetricCard
            icon={Percent}
            label="Profit Margin"
            value={`${profitMargin}%`}
            sub={`${currency} ${Math.max(0, profit).toLocaleString()} net`}
            color={profitMargin >= 0 ? "text-primary" : "text-destructive"}
          />
        </div>
        {/* Per-event bar: revenue vs prize pool */}
        <div className="flex items-center gap-4 pt-2">
          <div className="flex-1">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>Revenue</span><span>{currency} {totalRevenue.toFixed(2)}</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: "100%" }} />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>Prize Payout</span><span>{currency} {prizePool.toFixed(2)}</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-yellow-500 rounded-full" style={{ width: totalRevenue > 0 ? `${Math.min(100, (prizePool / totalRevenue) * 100)}%` : "0%" }} />
            </div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={DollarSign}
          label="Registration Revenue"
          value={`${currency} ${totalRevenue.toLocaleString("en", { minimumFractionDigits: 2 })}`}
          sub={`${ledger.filter((l) => l.source === "registration").length} transactions`}
          color="text-green-400"
        />
        <MetricCard
          icon={Users}
          label="Teams Registered"
          value={`${teams.length} / ${tournament?.max_teams || "—"}`}
          sub={`${Math.round((teams.length / (tournament?.max_teams || 1)) * 100)}% capacity`}
        />
        <MetricCard
          icon={TrendingUp}
          label="Avg Sign-ups / Day"
          value={avgSignupsPerDay}
          sub={`over ${signupVelocity.length} day${signupVelocity.length !== 1 ? "s" : ""}`}
          color="text-yellow-400"
        />
        <MetricCard
          icon={MessageSquare}
          label="Live Chat Messages"
          value={chatMessages.length.toLocaleString()}
          sub="spectator engagement"
          color="text-accent"
        />
      </div>

      {/* Sign-up velocity */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-4">Team Sign-up Velocity</h3>
        {signupVelocity.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No registration data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={cumulativeSignups}>
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(190 100% 50%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(190 100% 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 30% 18%)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="total" stroke="hsl(190 100% 50%)" fill="url(#grad1)" strokeWidth={2} name="Cumulative Teams" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chat volume */}
      <div className="glass rounded-xl p-5">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-4">Spectator Chat Volume (last 24 data points)</h3>
        {chatVolume.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No chat activity yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chatVolume}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 30% 18%)" />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "hsl(215 20% 55%)" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="messages" fill="hsl(348 83% 60%)" radius={[3, 3, 0, 0]} name="Messages" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}