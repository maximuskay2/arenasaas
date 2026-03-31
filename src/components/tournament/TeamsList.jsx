import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Users } from "lucide-react";
import SeedingPanel from "./SeedingPanel";
import { motion } from "framer-motion";
import StatusBadge from "../shared/StatusBadge";
import EmptyState from "../shared/EmptyState";

export default function TeamsList({ teams, tournamentId, tournament }) {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamTag, setTeamTag] = useState("");

  const handleAddTeam = (e) => {
    e.preventDefault();
    createTeam.mutate({
      name: teamName,
      tag: teamTag,
      tournament_id: tournamentId,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    });
  };

  const createTeam = useMutation({
    mutationFn: (data) => maxikay.entities.Team.create(data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      maxikay.entities.Tournament.update(tournamentId, {
        registered_teams: (tournament?.registered_teams || 0) + 1,
      });
      queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["discovery-catalog"] });
      setOpen(false);
      setTeamName("");
      setTeamTag("");
    },
  });

  const deleteTeam = useMutation({
    mutationFn: (teamId) => maxikay.entities.Team.delete(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const canAddTeams = tournament?.status === "draft" || tournament?.status === "registration_open";
  const canSeed = teams.length >= 2 && (tournament?.status === "draft" || tournament?.status === "registration_open" || tournament?.status === "registration_closed");

  return (
    <div className="space-y-4">
      {(canAddTeams || canSeed) && (
        <div className="flex justify-end gap-2">
          {canSeed && <SeedingPanel teams={teams} tournamentId={tournamentId} />}
          {canAddTeams && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2 font-display text-xs tracking-wider">
                  <Plus className="w-4 h-4" /> ADD TEAM
                </Button>
              </DialogTrigger>
              <DialogContent className="glass border-border/50">
                <DialogHeader>
                  <DialogTitle className="font-display">Add Team</DialogTitle>
                  <DialogDescription>
                    Add a team to seed and test brackets. Player-paid entry (if enabled) is handled from the public tournament page.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddTeam} className="space-y-4">
                  {tournament?.entry_fee > 0 && (
                    <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary space-y-1.5">
                      <p className="font-semibold">
                        Public entry fee: {tournament.currency || "USD"} {tournament.entry_fee}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-normal leading-relaxed">
                        Players pay via <Link to="/tournaments" className="underline text-primary">Tournaments (Discover)</Link> with Stripe, Paystack, or Flutterwave. Organizer-added teams here skip the gate for seeding and testing.
                      </p>
                    </div>
                  )}
                  <div>
                    <Label>Team Name</Label>
                    <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} required className="mt-1 bg-secondary/50" placeholder="e.g. Team Liquid" />
                  </div>
                  <div>
                    <Label>Tag</Label>
                    <Input value={teamTag} onChange={(e) => setTeamTag(e.target.value)} required className="mt-1 bg-secondary/50" placeholder="e.g. TL" maxLength={5} />
                  </div>
                  <Button type="submit" disabled={createTeam.isPending} className="w-full">
                    {createTeam.isPending ? "Adding..." : "Add Team"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {teams.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No teams registered"
          description="Add teams to this tournament to get started"
        />
      ) : (
        <div className="grid gap-3">
          {teams.map((team, i) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass rounded-xl p-4 flex items-center justify-between glass-hover"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="font-display text-xs font-bold text-primary">{team.tag}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{team.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {team.roster?.length || 0} players · Seed #{team.seed || i + 1}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase" asChild>
                  <Link to={`/teams/p/${team.id}`}>Team profile</Link>
                </Button>
                <StatusBadge status={team.status || "registered"} />
                {canAddTeams && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteTeam.mutate(team.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}