import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";

export default function TournamentAnalytics() {
  const { tenantId } = useTenant();
  const [selectedTournament, setSelectedTournament] = useState(null);

  const { data: tournaments = [], isLoading: tournamentsLoading } = useQuery({
    queryKey: ["tournaments", tenantId],
    queryFn: () => maxikay.entities.Tournament.filter(tenantId ? { tenant_id: tenantId } : {}),
  });

  const tournament = selectedTournament || tournaments[0];

  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ["tournament-matches", tournament?.id],
    queryFn: () =>
      tournament?.id
        ? maxikay.entities.Match.filter({ tournament_id: tournament.id }, "-updated_date", 500)
        : Promise.resolve([]),
    enabled: !!tournament?.id,
  });

  const { data: stats = [], isLoading: statsLoading } = useQuery({
    queryKey: ["player-stats", tournament?.id],
    queryFn: () =>
      tournament?.id
        ? maxikay.entities.PlayerStat.filter({ tournament_id: tournament.id }, "-updated_date", 1000)
        : Promise.resolve([]),
    enabled: !!tournament?.id,
  });

  if (tournamentsLoading) return <LoadingSpinner />;
  if (tournaments.length === 0)
    return <div className="text-center py-20 text-muted-foreground">No tournaments found</div>;

  // Calculate analytics
  const completedMatches = matches.filter((m) => m.status === "completed");
  const avgDuration =
    completedMatches.length > 0
      ? Math.round(
          completedMatches.reduce((sum, m) => {
            if (!m.scheduled_time) return sum;
            const scheduled = new Date(m.scheduled_time).getTime();
            const updated = new Date(m.updated_date).getTime();
            return sum + (updated - scheduled);
          }, 0) / completedMatches.length / 60000
        )
      : 0;

  // Kill stats trend
  const killTrend = matches.slice(0, 20).map((m, i) => ({
    name: `Match ${i + 1}`,
    kills: stats.filter((s) => s.match_id === m.id).reduce((sum, s) => sum + (s.kills || 0), 0),
    deaths: stats.filter((s) => s.match_id === m.id).reduce((sum, s) => sum + (s.deaths || 0), 0),
  }));

  // Player performance distribution
  const playerKDRatio = stats.reduce((acc, s) => {
    const existing = acc.find((p) => p.name === s.player_name);
    const ratio = (s.kills || 0) / Math.max((s.deaths || 1), 1);
    if (existing) {
      existing.kills += s.kills || 0;
      existing.deaths += s.deaths || 0;
      existing.count += 1;
    } else {
      acc.push({
        name: s.player_name || "Unknown",
        kills: s.kills || 0,
        deaths: s.deaths || 0,
        count: 1,
      });
    }
    return acc;
  }, []);

  const topPlayers = playerKDRatio
    .map((p) => ({
      ...p,
      kda: ((p.kills / Math.max(p.count, 1)) + (p.deaths / Math.max(p.count, 1))).toFixed(2),
    }))
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 8);

  // Match outcome distribution
  const scoreDistribution = completedMatches.map((m) => ({
    name: `${m.team_a_name || "A"} vs ${m.team_b_name || "B"}`,
    teamA: m.score_a || 0,
    teamB: m.score_b || 0,
  }));

  const colors = ["#00d4ff", "#ff4655", "#ffb648", "#6dd5ed", "#a78bfa"];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <PageHeader
        title="Tournament Analytics"
        subtitle="Match statistics & performance trends"
        actions={
          tournaments.length > 1 && (
            <Select value={tournament?.id} onValueChange={(id) => setSelectedTournament(tournaments.find((t) => t.id === id))}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tournaments.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass rounded-lg p-4 text-center">
          <p className="text-2xl font-display font-bold text-primary">{completedMatches.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Completed Matches</p>
        </div>
        <div className="glass rounded-lg p-4 text-center">
          <p className="text-2xl font-display font-bold text-accent">{avgDuration}m</p>
          <p className="text-xs text-muted-foreground mt-1">Avg Duration</p>
        </div>
        <div className="glass rounded-lg p-4 text-center">
          <p className="text-2xl font-display font-bold text-primary">
            {stats.reduce((sum, s) => sum + (s.kills || 0), 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Total Kills</p>
        </div>
        <div className="glass rounded-lg p-4 text-center">
          <p className="text-2xl font-display font-bold text-accent">{topPlayers.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Top Players</p>
        </div>
      </div>

      {/* Kill Trend */}
      {killTrend.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h3 className="text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Kill & Death Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={killTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Legend />
              <Bar dataKey="kills" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="deaths" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Players */}
        {topPlayers.length > 0 && (
          <div className="glass rounded-xl p-6">
            <h3 className="text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              🏆 Top Players by Kills
            </h3>
            <div className="space-y-2">
              {topPlayers.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between bg-secondary/40 rounded p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-primary">{i + 1}</span>
                    <div>
                      <p className="text-xs font-semibold">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.kills} kills · {p.deaths} deaths</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-primary">{p.kda} KDA</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Match Score Distribution */}
        {scoreDistribution.length > 0 && (
          <div className="glass rounded-xl p-6">
            <h3 className="text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Match Scores
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={scoreDistribution.slice(0, 6)}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" width={75} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Bar dataKey="teamA" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="teamB" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Win Rate Pie */}
      {completedMatches.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h3 className="text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Match Distribution
          </h3>
          <div className="flex items-center justify-center gap-12">
            <ResponsiveContainer width="50%" height={250}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Completed", value: completedMatches.length },
                    { name: "Pending", value: matches.filter((m) => m.status === "pending").length },
                    { name: "In Progress", value: matches.filter((m) => m.status === "in_progress").length },
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {colors.map((color, i) => (
                    <Cell key={`cell-${i}`} fill={color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[0] }} />
                <span className="text-sm">Completed: {completedMatches.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[1] }} />
                <span className="text-sm">Pending: {matches.filter((m) => m.status === "pending").length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[2] }} />
                <span className="text-sm">In Progress: {matches.filter((m) => m.status === "in_progress").length}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}