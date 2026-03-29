import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { Mail, Trash2, Plus, History } from "lucide-react";
import moment from "moment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import StatusBadge from "../components/shared/StatusBadge";

export default function TeamManagement() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("player");
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    maxikay.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", tenantId],
    queryFn: () => maxikay.entities.Team.filter(tenantId ? { tenant_id: tenantId } : {}),
    enabled: !!currentUser,
  });

  const captainTeams = teams.filter((t) => t.captain_email === currentUser?.email) || [];
  const team = selectedTeam || captainTeams[0];

  const { data: upcomingMatches = [] } = useQuery({
    queryKey: ["upcoming-matches", team?.tournament_id],
    queryFn: () =>
      team?.tournament_id
        ? maxikay.entities.Match.filter(
            { tournament_id: team.tournament_id, status: "pending" },
            "-scheduled_time",
            50
          )
        : Promise.resolve([]),
    enabled: !!team?.tournament_id,
  });

  // All tournaments the captain's teams have participated in
  const allTournamentIds = [...new Set(captainTeams.map((t) => t.tournament_id).filter(Boolean))];

  const { data: allTournaments = [] } = useQuery({
    queryKey: ["captain-tournaments", allTournamentIds.join(",")],
    queryFn: () => maxikay.entities.Tournament.list("-start_date", 100),
    enabled: allTournamentIds.length > 0,
    select: (data) => data.filter((t) => allTournamentIds.includes(t.id)),
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }) => {
      const existingRoster = team.roster || [];
      const updated = [
        ...existingRoster,
        {
          player_email: email,
          player_name: email.split("@")[0],
          role: role,
          game_id: "",
        },
      ];
      await maxikay.entities.Team.update(team.id, { roster: updated });
      // Send invite email
      await maxikay.integrations.Core.SendEmail({
        to: email,
        subject: `You're invited to ${team.name}`,
        body: `${currentUser.full_name} invited you to join ${team.name} as a ${role} for the ${team.tournament_id} tournament.`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setInviteEmail("");
      setInviteRole("player");
      setInviteOpen(false);
    },
  });

  const removePlayerMutation = useMutation({
    mutationFn: async (playerEmail) => {
      const updated = team.roster.filter((p) => p.player_email !== playerEmail);
      await maxikay.entities.Team.update(team.id, { roster: updated });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ playerEmail, newRole }) => {
      const updated = team.roster.map((p) =>
        p.player_email === playerEmail ? { ...p, role: newRole } : p
      );
      await maxikay.entities.Team.update(team.id, { roster: updated });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });

  if (teamsLoading) return <LoadingSpinner />;
  if (captainTeams.length === 0)
    return (
      <div className="text-center py-20 text-muted-foreground">
        You are not a captain of any team. Contact an organizer to become one.
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <PageHeader
        title="Team Management"
        subtitle={team ? `Managing: ${team.name}` : "Select a team"}
        actions={
          captainTeams.length > 1 && (
            <Select value={team?.id} onValueChange={(id) => setSelectedTeam(teams.find((t) => t.id === id))}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {captainTeams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      {team && (
        <>
          {/* Roster */}
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold">🎮 Roster</h2>
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" gap-2>
                    <Plus className="w-4 h-4" /> Invite Player
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Player to {team.name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-muted-foreground">Email</label>
                      <Input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="player@team.gg"
                        className="mt-1 bg-secondary/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Role</label>
                      <Select value={inviteRole} onValueChange={setInviteRole}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="player">Player</SelectItem>
                          <SelectItem value="sub">Substitute</SelectItem>
                          <SelectItem value="coach">Coach</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
                      disabled={!inviteEmail || inviteMutation.isPending}
                      className="w-full"
                    >
                      <Mail className="w-4 h-4 mr-2" /> Send Invite
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {team.roster && team.roster.length > 0 ? (
              <div className="space-y-2">
                {team.roster.map((player) => (
                  <div key={player.player_email} className="flex items-center justify-between bg-secondary/40 rounded-lg p-3">
                    <div>
                      <p className="text-sm font-semibold">{player.player_name}</p>
                      <p className="text-xs text-muted-foreground">{player.player_email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={player.role} onValueChange={(newRole) =>
                        updateRoleMutation.mutate({ playerEmail: player.player_email, newRole })
                      }>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="player">Player</SelectItem>
                          <SelectItem value="sub">Sub</SelectItem>
                          <SelectItem value="coach">Coach</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removePlayerMutation.mutate(player.player_email)}
                        disabled={removePlayerMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No players invited yet</p>
            )}
          </div>

          {/* Upcoming Matches */}
          <div className="glass rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-display font-semibold">📅 Upcoming Matches</h2>
            {upcomingMatches.length > 0 ? (
              <div className="space-y-2">
                {upcomingMatches.slice(0, 5).map((match) => (
                  <div key={match.id} className="bg-secondary/40 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">
                          {match.team_a_name || "TBD"} vs {match.team_b_name || "TBD"}
                        </p>
                        <p className="text-xs text-muted-foreground">Round {match.round} · {match.scheduled_time ? moment(match.scheduled_time).format("MMM D, h:mm A") : "TBD"}</p>
                      </div>
                      <StatusBadge status={match.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No upcoming matches</p>
            )}
          </div>

          {/* Tournament History */}
          {allTournaments.length > 0 && (
            <div className="glass rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-display font-semibold flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Tournament History</h2>
              <div className="space-y-2">
                {allTournaments.map((t) => {
                  const participatingTeam = captainTeams.find((ct) => ct.tournament_id === t.id);
                  return (
                    <div key={t.id} className="bg-secondary/40 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.game_title} · {t.format?.replace(/_/g, " ")} · {t.start_date ? moment(t.start_date).format("MMM D, YYYY") : "TBD"}
                        </p>
                        {participatingTeam && (
                          <p className="text-xs text-primary mt-0.5">Team: {participatingTeam.name} · {participatingTeam.wins || 0}W / {participatingTeam.losses || 0}L</p>
                        )}
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}