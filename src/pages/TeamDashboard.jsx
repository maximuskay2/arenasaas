import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { ArrowLeft, Users, Plus, Mail, Trash2, Shield, BarChart2, Swords, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import StatusBadge from "../components/shared/StatusBadge";
import { toast } from "sonner";
import moment from "moment";
import { motion } from "framer-motion";

const ROLES = ["Duelist", "Controller", "Sentinel", "Initiator", "IGL", "Support", "Flex"];

function StatBox({ label, value, color = "text-foreground" }) {
  return (
    <div className="glass rounded-xl p-3 text-center">
      <p className={`text-xl font-display font-bold ${color}`}>{value ?? "—"}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

export default function TeamDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const teamId = params.get("team_id");
  const [currentUser, setCurrentUser] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Flex");
  const [inviteGameId, setInviteGameId] = useState("");

  useEffect(() => { maxikay.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => maxikay.entities.Team.filter({ id: teamId }).then((r) => r[0]),
    enabled: !!teamId,
  });

  const { data: tournament } = useQuery({
    queryKey: ["tournament", team?.tournament_id],
    queryFn: () => maxikay.entities.Tournament.filter({ id: team.tournament_id }).then((r) => r[0]),
    enabled: !!team?.tournament_id,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["team-matches", teamId],
    queryFn: () => Promise.all([
      maxikay.entities.Match.filter({ team_a_id: teamId }, "-created_date", 30),
      maxikay.entities.Match.filter({ team_b_id: teamId }, "-created_date", 30),
    ]).then(([a, b]) => [...a, ...b].sort((x, y) => new Date(y.created_date) - new Date(x.created_date))),
    enabled: !!teamId,
  });

  const { data: playerStats = [] } = useQuery({
    queryKey: ["team-player-stats", teamId],
    queryFn: () => maxikay.entities.PlayerStat.filter({ team_id: teamId }, "-created_date", 200),
    enabled: !!teamId,
  });

  const isCaptain = currentUser?.email === team?.captain_email;

  // Aggregate stats per player
  const statsByPlayer = {};
  playerStats.forEach((s) => {
    if (!statsByPlayer[s.player_email]) {
      statsByPlayer[s.player_email] = { email: s.player_email, name: s.player_name, kills: 0, deaths: 0, assists: 0, wins: 0, games: 0 };
    }
    const p = statsByPlayer[s.player_email];
    p.kills += s.kills || 0;
    p.deaths += s.deaths || 0;
    p.assists += s.assists || 0;
    if (s.won) p.wins++;
    p.games++;
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const roster = [...(team.roster || []), { player_email: inviteEmail, player_name: inviteEmail.split("@")[0], role: inviteRole, game_id: inviteGameId }];
      await maxikay.entities.Team.update(teamId, { roster });
      // send invite notification
      await maxikay.entities.Notification.create({
        user_email: inviteEmail,
        type: "invite",
        title: `You've been invited to join ${team.name}`,
        body: `${currentUser?.full_name || "A captain"} has added you to the team roster${tournament ? ` for ${tournament.name}` : ""}.`,
        link: `/team-dashboard?team_id=${teamId}`,
      });
      await maxikay.integrations.Core.SendEmail({
        to: inviteEmail,
        subject: `🎮 You've been invited to join ${team.name}`,
        body: `Hi there!\n\n${currentUser?.full_name || "A captain"} has added you to the roster for team "${team.name}"${tournament ? ` in ${tournament.name}` : ""}.\n\nRole: ${inviteRole}\n\nLog in to the platform to view your team details.`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      setInviteEmail(""); setInviteGameId(""); setInviteRole("Flex");
      toast.success("Member added & invite email sent!");
    },
  });

  const removeMember = useMutation({
    mutationFn: async (email) => {
      const roster = (team.roster || []).filter((r) => r.player_email !== email);
      await maxikay.entities.Team.update(teamId, { roster });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team", teamId] }),
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({ email, role }) => {
      const roster = (team.roster || []).map((r) => r.player_email === email ? { ...r, role } : r);
      await maxikay.entities.Team.update(teamId, { roster });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team", teamId] }),
  });

  if (!teamId) return <div className="py-20 text-center text-muted-foreground">No team_id in URL</div>;
  if (isLoading) return <LoadingSpinner />;
  if (!team) return <div className="py-20 text-center text-muted-foreground">Team not found</div>;

  const completedMatches = matches.filter((m) => m.status === "completed");
  const wins = completedMatches.filter((m) => m.winner_id === teamId).length;
  const losses = completedMatches.length - wins;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 md:pb-0">
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            {team.logo_url && <img src={team.logo_url} alt={team.tag} className="w-7 h-7 rounded-lg object-contain" />}
            <span>{team.name}</span>
            <span className="text-sm text-primary font-display">[{team.tag}]</span>
          </div>
        }
        subtitle={tournament ? `${tournament.name} · ${tournament.game_title || ""}` : "Team Dashboard"}
        actions={<Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4" /></Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        <StatBox label="Matches" value={completedMatches.length} />
        <StatBox label="Wins" value={wins} color="text-green-400" />
        <StatBox label="Losses" value={losses} color="text-destructive" />
        <StatBox label="Win Rate" value={completedMatches.length ? `${Math.round((wins / completedMatches.length) * 100)}%` : "—"} color="text-primary" />
        <StatBox label="Players" value={team.roster?.length || 0} />
      </div>

      {/* Roster */}
      <div className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Roster ({team.roster?.length || 0})
          </h3>
          <StatusBadge status={team.status || "registered"} />
        </div>

        <div className="space-y-2">
          {(team.roster || []).length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No players yet. Add members below.</p>
          )}
          {(team.roster || []).map((player, i) => {
            const pStats = statsByPlayer[player.player_email];
            const kda = pStats && pStats.deaths > 0 ? ((pStats.kills + pStats.assists) / pStats.deaths).toFixed(2) : pStats ? "∞" : null;
            return (
              <motion.div
                key={player.player_email + i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/30 hover:border-border/50 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-secondary/60 flex items-center justify-center text-xs font-bold text-primary">
                  {(player.player_name || player.player_email)?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground truncate">{player.player_name || player.player_email}</p>
                    {player.player_email === team.captain_email && <Crown className="w-3 h-3 text-yellow-400 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground truncate">{player.player_email}</p>
                    {player.game_id && <span className="text-[10px] text-primary">#{player.game_id}</span>}
                    {kda && <span className="text-[10px] text-muted-foreground">KDA: {kda}</span>}
                  </div>
                </div>
                {isCaptain ? (
                  <div className="flex items-center gap-2">
                    <Select
                      value={player.role || "Flex"}
                      onValueChange={(role) => updateMemberRole.mutate({ email: player.player_email, role })}
                    >
                      <SelectTrigger className="h-7 text-[11px] w-24 bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {player.player_email !== team.captain_email && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeMember.mutate(player.player_email)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-[11px] bg-secondary/60 px-2 py-0.5 rounded-md text-muted-foreground">{player.role || "—"}</span>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Invite form (captain only) */}
        {isCaptain && (
          <div className="border-t border-border/40 pt-4 space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Invite Member</p>
            <div className="flex gap-2">
              <Input
                placeholder="player@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="bg-secondary/50 text-xs h-8"
              />
              <Input
                placeholder="Game ID"
                value={inviteGameId}
                onChange={(e) => setInviteGameId(e.target.value)}
                className="bg-secondary/50 text-xs h-8 w-28"
              />
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="h-8 text-xs bg-secondary/50 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={() => addMember.mutate()}
              disabled={!inviteEmail.trim() || addMember.isPending}
              className="gap-1.5 text-xs font-display"
            >
              <Mail className="w-3.5 h-3.5" />
              {addMember.isPending ? "Sending..." : "Add & Send Invite"}
            </Button>
          </div>
        )}
      </div>

      {/* Player Stats Breakdown */}
      {Object.values(statsByPlayer).length > 0 && (
        <div className="glass rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> Player Stats
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-[10px] uppercase">
                  <th className="text-left pb-2">Player</th>
                  <th className="text-right pb-2">Games</th>
                  <th className="text-right pb-2">Wins</th>
                  <th className="text-right pb-2">K</th>
                  <th className="text-right pb-2">D</th>
                  <th className="text-right pb-2">A</th>
                  <th className="text-right pb-2">KDA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {Object.values(statsByPlayer).sort((a, b) => b.kills - a.kills).map((p) => {
                  const kda = p.deaths > 0 ? ((p.kills + p.assists) / p.deaths).toFixed(2) : "∞";
                  return (
                    <tr key={p.email} className="hover:bg-secondary/20">
                      <td className="py-2 font-semibold text-foreground">{p.name || p.email}</td>
                      <td className="py-2 text-right text-muted-foreground">{p.games}</td>
                      <td className="py-2 text-right text-green-400">{p.wins}</td>
                      <td className="py-2 text-right text-primary">{p.kills}</td>
                      <td className="py-2 text-right text-destructive">{p.deaths}</td>
                      <td className="py-2 text-right text-muted-foreground">{p.assists}</td>
                      <td className="py-2 text-right font-display font-bold text-foreground">{kda}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Match History */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Swords className="w-3.5 h-3.5" /> Match History
        </h3>
        {matches.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No matches played yet.</p>
        ) : (
          <div className="space-y-2">
            {matches.map((m) => {
              const isTeamA = m.team_a_id === teamId;
              const myScore = isTeamA ? m.score_a : m.score_b;
              const oppScore = isTeamA ? m.score_b : m.score_a;
              const oppName = isTeamA ? m.team_b_name : m.team_a_name;
              const won = m.winner_id === teamId;
              const isCompleted = m.status === "completed";
              return (
                <div key={m.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors hover:border-border/60 ${isCompleted ? (won ? "border-green-500/20 bg-green-500/5" : "border-destructive/20 bg-destructive/5") : "border-border/30"}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-1.5 h-8 rounded-full ${isCompleted ? (won ? "bg-green-400" : "bg-destructive") : "bg-muted-foreground"}`} />
                    <div>
                      <p className="text-xs font-semibold text-foreground">vs {oppName || "TBD"}</p>
                      <p className="text-[10px] text-muted-foreground">Round {m.round} · {moment(m.created_date).format("MMM D")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isCompleted && (
                      <span className="font-display font-bold text-sm">
                        <span className={won ? "text-green-400" : "text-destructive"}>{myScore ?? 0}</span>
                        <span className="text-muted-foreground mx-1">:</span>
                        <span className="text-muted-foreground">{oppScore ?? 0}</span>
                      </span>
                    )}
                    <StatusBadge status={m.status} />
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