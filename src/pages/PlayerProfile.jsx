import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, TrendingUp, Swords, User, Target, Zap, Share2, Copy, Star, Gamepad2, Edit3, Check, X, Briefcase, DollarSign, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import StatusBadge from "../components/shared/StatusBadge";
import PageHeader from "../components/shared/PageHeader";
import OrderTracker from "../components/merchandise/OrderTracker";
import moment from "moment";
import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";

function usePlayerEmail() {
  const params = new URLSearchParams(window.location.search);
  return params.get("email") || "";
}

function StatCard({ label, value, icon: Icon, color = "text-primary", sub }) {
  return (
    <div className="glass rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-xl font-display font-bold ${color}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function Badge({ icon, label, color }) {
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${color}`}>
      {icon} {label}
    </span>
  );
}

function WinStreakBar({ matches, teamIds }) {
  const recent = matches.slice(0, 10).reverse();
  return (
    <div className="flex gap-1">
      {recent.map((m, i) => {
        const won = teamIds.includes(m.winner_id);
        return (
          <div
            key={m.id}
            title={`${m.team_a_name} vs ${m.team_b_name} — ${won ? "WIN" : "LOSS"}`}
            className={`flex-1 h-3 rounded-sm ${won ? "bg-green-500" : "bg-destructive/70"}`}
          />
        );
      })}
      {recent.length < 10 && Array.from({ length: 10 - recent.length }).map((_, i) => (
        <div key={`e${i}`} className="flex-1 h-3 rounded-sm bg-secondary/40" />
      ))}
    </div>
  );
}

function GameHandlesEditor({ currentUser }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [handles, setHandles] = useState(currentUser?.game_handles || {});
  const GAMES = ["Valorant", "League of Legends", "CS2", "Fortnite", "Apex Legends", "Rocket League", "Overwatch 2"];

  const save = useMutation({
    mutationFn: () => maxikay.auth.updateMe({ game_handles: handles }),
    onSuccess: () => { setEditing(false); queryClient.invalidateQueries({ queryKey: ["current-user"] }); },
  });

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Gamepad2 className="w-3.5 h-3.5" /> Game Account Handles
        </h3>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Edit3 className="w-3 h-3" /> Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setHandles(currentUser?.game_handles || {}); setEditing(false); }} className="text-xs text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            <button onClick={() => save.mutate()} disabled={save.isPending} className="flex items-center gap-1 text-xs text-green-400 hover:underline">
              <Check className="w-3 h-3" /> Save
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {GAMES.map((game) => (
          <div key={game} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-32 shrink-0">{game}</span>
            {editing ? (
              <input
                value={handles[game] || ""}
                onChange={(e) => setHandles({ ...handles, [game]: e.target.value })}
                placeholder="Your in-game ID"
                className="flex-1 px-2 py-1 rounded-md bg-secondary/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            ) : (
              <span className={`text-xs ${handles[game] ? "text-foreground font-semibold" : "text-muted-foreground/50 italic"}`}>
                {handles[game] || "Not set"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlayerProfile() {
  const navigate = useNavigate();
  const email = usePlayerEmail();
  const [copySuccess, setCopySuccess] = useState(false);

  const { data: allTeams = [], isLoading: loadingTeams } = useQuery({
    queryKey: ["player-teams", email],
    queryFn: () => maxikay.entities.Team.list("-created_date", 200),
    enabled: !!email,
  });

  const playerTeams = useMemo(
    () => allTeams.filter((t) => t.captain_email === email || t.roster?.some((r) => r.player_email === email)),
    [allTeams, email]
  );
  const teamIds = playerTeams.map((t) => t.id);

  const { data: allMatches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ["player-matches", email],
    queryFn: () => maxikay.entities.Match.filter({ status: "completed" }, "-created_date", 200),
    enabled: !!email,
  });

  const playerMatches = useMemo(
    () => allMatches.filter((m) => teamIds.includes(m.team_a_id) || teamIds.includes(m.team_b_id)),
    [allMatches, teamIds]
  );

  const { data: playerStats = [], isLoading: loadingStats } = useQuery({
    queryKey: ["player-stats", email],
    queryFn: () => maxikay.entities.PlayerStat.filter({ player_email: email }, "-created_date", 200),
    enabled: !!email,
  });

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => maxikay.auth.me(),
  });

  const { data: career } = useQuery({
    queryKey: ["player-career-public", email],
    queryFn: () => maxikay.public.playerCareer(email).catch(() => null),
    enabled: !!email,
    retry: false,
  });

  const { data: fanMVPVotes = [] } = useQuery({
    queryKey: ["fan-mvp-votes", email],
    queryFn: () => maxikay.entities.FanVote.filter({ vote_type: "player", target_email: email }),
    enabled: !!email,
  });

  const mergedCareerTimeline = useMemo(() => {
    if (!career) return [];
    const acc = (career.timeline || []).map((ev) => ({
      kind: "accolade",
      sort: new Date(ev.created_date || 0).getTime(),
      ev,
    }));
    const arch = (career.archive_milestones || []).map((ev) => ({
      kind: "archive",
      sort: new Date(ev.archived_at || 0).getTime(),
      ev,
    }));
    return [...acc, ...arch].sort((a, b) => b.sort - a.sort).slice(0, 28);
  }, [career]);

  const analytics = useMemo(() => {
    const wins = playerMatches.filter((m) => teamIds.includes(m.winner_id)).length;
    const losses = playerMatches.length - wins;
    const winRate = playerMatches.length ? Math.round((wins / playerMatches.length) * 100) : 0;

    const totalKills = playerStats.reduce((s, p) => s + (p.kills || 0), 0);
    const totalDeaths = playerStats.reduce((s, p) => s + (p.deaths || 0), 0);
    const totalAssists = playerStats.reduce((s, p) => s + (p.assists || 0), 0);
    const avgKills = playerStats.length ? (totalKills / playerStats.length).toFixed(1) : "—";
    const avgDeaths = playerStats.length ? (totalDeaths / playerStats.length).toFixed(1) : "—";
    const kda = totalDeaths > 0 ? ((totalKills + totalAssists) / totalDeaths).toFixed(2) : totalKills > 0 ? "∞" : "—";

    // Win streak
    let streak = 0;
    for (const m of playerMatches) {
      if (teamIds.includes(m.winner_id)) streak++;
      else break;
    }

    // Consistency score (0-100): based on win rate + participation
    const consistency = Math.min(100, Math.round(winRate * 0.7 + Math.min(playerMatches.length * 3, 30)));

    // Match activity over time (last 8 months)
    const activity = {};
    playerMatches.forEach((m) => {
      const key = moment(m.created_date).format("MMM YYYY");
      activity[key] = (activity[key] || 0) + 1;
    });
    const activityChart = Object.entries(activity).slice(-8).map(([month, count]) => ({ month, count }));

    return { wins, losses, winRate, avgKills, avgDeaths, kda, streak, consistency, activityChart, totalKills, totalDeaths, totalAssists };
  }, [playerMatches, playerStats, teamIds]);

  const shareProfile = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    toast.success("Profile link copied!");
    setTimeout(() => setCopySuccess(false), 2000);
  };

  if (!email) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        No player email specified. Use <code>?email=player@example.com</code>
      </div>
    );
  }

  if (loadingTeams || loadingMatches || loadingStats) return <LoadingSpinner />;

  const username = email.split("@")[0];

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-20 md:pb-0">
      <PageHeader
        title="Player Profile"
        subtitle="Public recruitment card"
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={shareProfile} className="gap-1.5 text-xs">
              {copySuccess ? <Copy className="w-3.5 h-3.5 text-primary" /> : <Share2 className="w-3.5 h-3.5" />}
              Share
            </Button>
          </div>
        }
      />

      {/* Recruitment Card */}
      <div className="glass rounded-2xl p-6 border border-primary/20 glow-border-primary space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center shrink-0">
            <User className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-bold text-xl text-foreground">{username}</h2>
              {analytics.winRate >= 60 && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-semibold">
                  <Star className="w-2.5 h-2.5" /> Top Performer
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{email}</p>
            <div className="flex flex-wrap gap-3 mt-2">
              <span className="text-xs text-muted-foreground">{playerTeams.length} team{playerTeams.length !== 1 ? "s" : ""}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{playerMatches.length} matches played</span>
              {analytics.streak > 1 && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-green-400 font-semibold">🔥 {analytics.streak}-match win streak</span>
                </>
              )}
            </div>
          </div>
          {/* Consistency ring */}
          <div className="text-center shrink-0">
            <div className="relative w-14 h-14">
              <svg viewBox="0 0 48 48" className="w-14 h-14 -rotate-90">
                <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                <circle
                  cx="24" cy="24" r="20" fill="none"
                  stroke="hsl(var(--primary))" strokeWidth="4"
                  strokeDasharray={`${(analytics.consistency / 100) * 125.6} 125.6`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-display font-bold text-primary">{analytics.consistency}</span>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1 uppercase tracking-wider">Consistency</p>
          </div>
        </div>

        {/* Win streak visualizer */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Last 10 matches</p>
          <WinStreakBar matches={playerMatches} teamIds={teamIds} />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">Oldest</span>
            <span className="text-[10px] text-muted-foreground">Most recent</span>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Fan Votes" value={fanMVPVotes.length} icon={Trophy} color="text-yellow-400" sub="MVP votes" />
        <StatCard label="Win Rate" value={`${analytics.winRate}%`} icon={TrendingUp} color="text-green-400" sub={`${analytics.wins}W / ${analytics.losses}L`} />
        <StatCard label="Avg Kills" value={analytics.avgKills} icon={Target} color="text-primary" sub={`${analytics.totalKills} total`} />
        <StatCard label="KDA Ratio" value={analytics.kda} icon={Zap} color="text-yellow-400" sub={`${analytics.avgDeaths} avg deaths`} />
        <StatCard label="Matches" value={playerMatches.length} icon={Swords} color="text-foreground" sub={`${playerTeams.length} teams`} />
      </div>

      {career?.stats && (
        <div className="glass rounded-xl p-5 border border-primary/15 space-y-4">
          <h3 className="text-xs font-display uppercase tracking-wider text-primary flex items-center gap-2">
            <Briefcase className="w-3.5 h-3.5" /> Career résumé (platform)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Career earnings"
              value={`$${Number(career.stats.total_career_earnings || 0).toLocaleString()}`}
              icon={DollarSign}
              color="text-emerald-400"
              sub="Prize payouts"
            />
            <StatCard
              label="Win rate (tracked)"
              value={`${career.stats.win_rate_pct}%`}
              icon={TrendingUp}
              color="text-green-400"
              sub={`${career.stats.wins}W / ${career.stats.matches_tracked} maps`}
            />
            <StatCard
              label="Most played"
              value={career.stats.most_played_game}
              icon={Gamepad2}
              color="text-foreground"
              sub="By stat rows"
            />
            <StatCard
              label="Profile XP"
              value={currentUser?.profile_xp ?? "—"}
              icon={Star}
              color="text-yellow-400"
              sub="Pick'Em + future rewards"
            />
          </div>
        </div>
      )}

      {mergedCareerTimeline.length > 0 && (
        <div className="glass rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <History className="w-3.5 h-3.5" /> Career timeline
          </h3>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Placements from accolades and finalized events archived for recruitment (no hard-delete of concluded tournaments).
          </p>
          <div className="relative pl-6 border-l border-border/60 space-y-5">
            {mergedCareerTimeline.map((item, idx) =>
              item.kind === "accolade" ? (
                <div key={`${item.ev.tournament_id}-acc-${idx}`} className="relative">
                  <span className="absolute -left-[25px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-background" />
                  <p className="text-sm font-semibold text-foreground">{item.ev.tournament_title || "Tournament"}</p>
                  <p className="text-xs text-muted-foreground">
                    Rank #{item.ev.rank} · {item.ev.badge_id?.replace(/_/g, " ")}
                    {item.ev.created_date ? ` · ${moment(item.ev.created_date).format("MMM D, YYYY")}` : ""}
                  </p>
                </div>
              ) : (
                <div key={`${item.ev.tournament_id}-arc-${idx}`} className="relative">
                  <span className="absolute -left-[25px] top-1.5 w-2.5 h-2.5 rounded-full bg-cyan-500/80 ring-4 ring-background" />
                  <p className="text-sm font-semibold text-foreground">{item.ev.tournament_title || "Tournament"}</p>
                  <p className="text-xs text-muted-foreground">
                    Competitive archive sealed
                    {item.ev.archived_at ? ` · ${moment(item.ev.archived_at).format("MMM D, YYYY")}` : ""}
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Activity Chart */}
      {analytics.activityChart.length > 1 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-4">Match Activity</h3>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={analytics.activityChart}>
              <defs>
                <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#actGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Performance breakdown (if stats exist) */}
      {playerStats.length > 0 && (
        <div className="glass rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Performance Breakdown</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-display font-bold text-primary">{analytics.totalKills}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Kills</p>
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-destructive">{analytics.totalDeaths}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Deaths</p>
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-yellow-400">{analytics.totalAssists}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Assists</p>
            </div>
          </div>
        </div>
      )}

      {/* Teams */}
      {playerTeams.length > 0 && (
        <div className="glass rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Teams</h3>
          <div className="space-y-2">
            {playerTeams.map((team) => (
              <div key={team.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-foreground">{team.name}</p>
                  <p className="text-xs text-muted-foreground">[{team.tag}] · {team.captain_email === email ? "Captain" : "Player"}</p>
                </div>
                <StatusBadge status={team.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game Handles — only show if viewing own profile */}
      {currentUser?.email === email && (
        <GameHandlesEditor currentUser={currentUser} />
      )}

      {/* Badges */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Earned Badges</h3>
        <div className="flex flex-wrap gap-2">
          {analytics.winRate >= 60 && <Badge icon="🏆" label="Top Performer" color="text-yellow-400 border-yellow-500/30 bg-yellow-500/10" />}
          {analytics.streak >= 3 && <Badge icon="🔥" label={`${analytics.streak}-Win Streak`} color="text-orange-400 border-orange-500/30 bg-orange-500/10" />}
          {playerMatches.length >= 10 && <Badge icon="⚔️" label="Veteran (10+ matches)" color="text-primary border-primary/30 bg-primary/10" />}
          {analytics.kda !== "—" && parseFloat(analytics.kda) >= 3 && <Badge icon="🎯" label="Sharp Shooter" color="text-green-400 border-green-500/30 bg-green-500/10" />}
          {fanMVPVotes.length >= 5 && <Badge icon="⭐" label={`Fan Favorite (${fanMVPVotes.length} votes)`} color="text-purple-400 border-purple-500/30 bg-purple-500/10" />}
          {playerTeams.length >= 3 && <Badge icon="🤝" label="Team Player" color="text-blue-400 border-blue-500/30 bg-blue-500/10" />}
          {playerMatches.length === 0 && playerTeams.length === 0 && <span className="text-xs text-muted-foreground italic">Play matches to earn badges!</span>}
        </div>
      </div>

      {/* Order History */}
      {email && (
        <div className="glass rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">📦 My Orders</h3>
          <OrderTracker userEmail={email} />
        </div>
      )}

      {/* Match history */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Recent Match History</h3>
        {playerMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No completed matches found.</p>
        ) : (
          <div className="space-y-2">
            {playerMatches.slice(0, 15).map((match) => {
              const myTeamId = teamIds.includes(match.team_a_id) ? match.team_a_id : match.team_b_id;
              const won = match.winner_id === myTeamId;
              const stat = playerStats.find((s) => s.match_id === match.id);
              return (
                <div
                  key={match.id}
                  onClick={() => navigate(`/matches/${match.id}`)}
                  className="flex items-center justify-between py-2 px-3 rounded-lg border border-border/30 hover:border-primary/30 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${won ? "bg-green-400" : "bg-destructive"}`} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{match.team_a_name} vs {match.team_b_name}</p>
                      <p className="text-xs text-muted-foreground">Round {match.round} · {moment(match.created_date).fromNow()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-bold text-sm text-primary">{match.score_a} : {match.score_b}</p>
                    {stat ? (
                      <p className="text-[10px] text-muted-foreground">{stat.kills}K / {stat.deaths}D / {stat.assists}A</p>
                    ) : (
                      <p className={`text-xs font-semibold ${won ? "text-green-400" : "text-destructive"}`}>{won ? "WIN" : "LOSS"}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}