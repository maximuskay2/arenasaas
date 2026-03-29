import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { ThumbsUp, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function FanVotingWidget({ tournamentId, matchId, teamA, teamB, currentUser }) {
  const queryClient = useQueryClient();
  const [voteType, setVoteType] = useState("player");

  const { data: votes = [] } = useQuery({
    queryKey: ["fan-votes", matchId],
    queryFn: () => maxikay.entities.FanVote.filter({ match_id: matchId }),
    refetchInterval: 5000,
  });

  // Check if user already voted
  const userVote = currentUser ? votes.find((v) => v.voter_email === currentUser.email) : null;

  const castVote = useMutation({
    mutationFn: async ({ targetType, targetId, targetName, targetEmail }) => {
      // Remove previous vote if exists
      if (userVote) {
        // In production, would delete the old vote
      }
      await maxikay.entities.FanVote.create({
        tournament_id: tournamentId,
        match_id: matchId,
        voter_email: currentUser.email,
        vote_type: targetType,
        target_id: targetId,
        target_email: targetEmail,
        target_name: targetName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fan-votes", matchId] });
      toast.success("Vote recorded! 🎉");
    },
  });

  const playerVotes = votes.filter((v) => v.vote_type === "player");
  const teamVotes = votes.filter((v) => v.vote_type === "team");

  const playerLeaderboard = Object.entries(
    playerVotes.reduce((acc, v) => {
      const key = v.target_email || v.target_name;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const teamLeaderboard = Object.entries(
    teamVotes.reduce((acc, v) => {
      const key = v.target_id || v.target_name;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-yellow-400" />
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Fan Favorite Voting</h3>
      </div>

      <Tabs defaultValue="vote" className="w-full">
        <TabsList className="bg-secondary/50 w-full">
          <TabsTrigger value="vote" className="flex-1">
            <ThumbsUp className="w-3 h-3 mr-1" /> Vote
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex-1">
            <Trophy className="w-3 h-3 mr-1" /> Leaderboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vote" className="space-y-4">
          {!currentUser ? (
            <p className="text-xs text-muted-foreground text-center py-4">Sign in to vote</p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground mb-2">Vote for:</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={voteType === "player" ? "default" : "outline"}
                    onClick={() => setVoteType("player")}
                    className="text-xs flex-1"
                  >
                    Player
                  </Button>
                  <Button size="sm" variant={voteType === "team" ? "default" : "outline"} onClick={() => setVoteType("team")} className="text-xs flex-1">
                    Team
                  </Button>
                </div>
              </div>

              {voteType === "player" && (
                <div className="space-y-2">
                  {[teamA, teamB].map((team) => (
                    <div key={team.id}>
                      <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider">{team.name}</p>
                      <div className="space-y-1">
                        {(team.roster || []).slice(0, 5).map((player) => (
                          <Button
                            key={player.player_email}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              castVote.mutate({
                                targetType: "player",
                                targetEmail: player.player_email,
                                targetName: player.player_name,
                              })
                            }
                            disabled={castVote.isPending || (userVote && userVote.vote_type === "player")}
                            className="w-full justify-start text-[11px] h-7"
                          >
                            {userVote?.target_email === player.player_email && <ThumbsUp className="w-2.5 h-2.5 mr-1.5 text-primary" />}
                            {player.player_name} {player.role ? `(${player.role})` : ""}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {voteType === "team" && (
                <div className="space-y-2">
                  {[teamA, teamB].map((team) => (
                    <Button
                      key={team.id}
                      size="sm"
                      onClick={() =>
                        castVote.mutate({
                          targetType: "team",
                          targetId: team.id,
                          targetName: team.name,
                        })
                      }
                      disabled={castVote.isPending || (userVote && userVote.vote_type === "team")}
                      className="w-full justify-start text-xs h-8"
                      variant={userVote?.target_id === team.id ? "default" : "outline"}
                    >
                      {userVote?.target_id === team.id && <ThumbsUp className="w-3 h-3 mr-2 text-primary" />}
                      {team.name}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="leaderboard" className="space-y-3">
          {voteType === "player" ? (
            playerLeaderboard.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-4">No votes yet</p>
            ) : (
              <div className="space-y-2">
                {playerLeaderboard.map((player, idx) => (
                  <motion.div
                    key={player.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/30 border border-border/20"
                  >
                    <div className="flex items-center gap-2">
                      {idx === 0 && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
                      <span className="text-[11px] font-semibold text-foreground">#{idx + 1}</span>
                      <span className="text-xs text-muted-foreground truncate">{player.name}</span>
                    </div>
                    <span className="text-xs font-display font-bold text-primary">{player.count} votes</span>
                  </motion.div>
                ))}
              </div>
            )
          ) : teamLeaderboard.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-4">No votes yet</p>
          ) : (
            <div className="space-y-2">
              {teamLeaderboard.map((team, idx) => (
                <motion.div
                  key={team.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/30 border border-border/20"
                >
                  <div className="flex items-center gap-2">
                    {idx === 0 && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
                    <span className="text-[11px] font-semibold text-foreground">#{idx + 1}</span>
                    <span className="text-xs text-muted-foreground truncate">{team.name}</span>
                  </div>
                  <span className="text-xs font-display font-bold text-primary">{team.count} votes</span>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}