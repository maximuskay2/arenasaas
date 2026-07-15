import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Swords, Calendar, AlertTriangle } from "lucide-react";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import StatusBadge from "../components/shared/StatusBadge";
import moment from "moment";

export default function PlayerCheckin() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);

  const urlParams = new URLSearchParams(window.location.search);
  const matchId = urlParams.get("match_id");

  useEffect(() => {
    maxikay.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: match, isLoading } = useQuery({
    queryKey: ["checkin-match", matchId],
    queryFn: () => maxikay.entities.Match.filter({ id: matchId }).then((r) => r[0]),
    enabled: !!matchId,
    refetchInterval: 10000,
  });

  // Find which team the player is on
  const playerTeamSide = match && currentUser
    ? match.team_a_name && match.team_b_name
      ? null // need to check via team roster
      : null
    : null;

  const { data: playerTeams = [] } = useQuery({
    queryKey: ["player-teams", currentUser?.email, match?.tournament_id],
    queryFn: () => maxikay.entities.Team.filter({ tournament_id: match.tournament_id }, "-created_date", 50),
    enabled: !!currentUser && !!match,
  });

  const myTeam = playerTeams.find((t) =>
    t.captain_email === currentUser?.email ||
    t.roster?.some((r) => r.player_email === currentUser?.email)
  );

  const isTeamA = myTeam?.id === match?.team_a_id;
  const isTeamB = myTeam?.id === match?.team_b_id;
  const isParticipant = isTeamA || isTeamB;

  const alreadyCheckedIn = isTeamA ? match?.team_a_checked_in : match?.team_b_checked_in;
  const opponentCheckedIn = isTeamA ? match?.team_b_checked_in : match?.team_a_checked_in;

  const checkInMutation = useMutation({
    mutationFn: () => {
      // Mirror MatchDetail: when both sides are in, advance status to checked_in.
      const update = isTeamA
        ? {
            team_a_checked_in: true,
            status: match.team_b_checked_in ? "checked_in" : match.status || "check_in_open",
          }
        : {
            team_b_checked_in: true,
            status: match.team_a_checked_in ? "checked_in" : match.status || "check_in_open",
          };
      return maxikay.entities.Match.update(match.id, {
        ...update,
        expected_version: match.version ?? 1,
        expected_status: match.status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkin-match", matchId] });
    },
  });

  if (!matchId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto" />
          <p className="text-muted-foreground">No match ID provided. Use the link from your notification.</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><LoadingSpinner /></div>;

  if (!match) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Match not found.</p>
    </div>
  );

  if (!currentUser) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
        <Swords className="w-10 h-10 text-primary mx-auto" />
        <h2 className="font-display font-bold text-xl">Check In to Match</h2>
        <p className="text-sm text-muted-foreground">You need to log in to check in for your match.</p>
        <Button onClick={() => maxikay.auth.redirectToLogin(window.location.href)} className="w-full font-display">
          Log In to Check In
        </Button>
      </div>
    </div>
  );

  const bothCheckedIn = match.team_a_checked_in && match.team_b_checked_in;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full space-y-6">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Swords className="w-6 h-6 text-primary" />
          </div>
          <h1 className="font-display font-bold text-2xl">Match Check-In</h1>
          <div><StatusBadge status={match.status} /></div>
        </div>

        {/* Match card */}
        <div className="glass rounded-xl p-5 text-center space-y-3">
          <div className="flex items-center justify-center gap-6">
            <div className={`flex-1 text-right ${isTeamA ? "text-primary font-bold" : ""}`}>
              <p className="font-display font-bold">{match.team_a_name || "TBD"}</p>
              {match.team_a_checked_in && <span className="text-[10px] text-green-400">✓ Checked In</span>}
            </div>
            <span className="text-muted-foreground text-lg">VS</span>
            <div className={`flex-1 text-left ${isTeamB ? "text-primary font-bold" : ""}`}>
              <p className="font-display font-bold">{match.team_b_name || "TBD"}</p>
              {match.team_b_checked_in && <span className="text-[10px] text-green-400">✓ Checked In</span>}
            </div>
          </div>
          {match.scheduled_time && (
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {moment(match.scheduled_time).format("MMM D, h:mm A")}
            </p>
          )}
          {match.check_in_deadline && (
            <p className="text-xs text-yellow-400 flex items-center justify-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Check-in deadline: {moment(match.check_in_deadline).format("h:mm A")}
            </p>
          )}
        </div>

        {/* Check-in action */}
        {!isParticipant ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            You are not registered as a participant in this match.
          </div>
        ) : alreadyCheckedIn ? (
          <div className="flex items-center justify-center gap-2 py-4 text-green-400 font-display font-semibold">
            <CheckCircle2 className="w-5 h-5" />
            You're checked in!
            {!opponentCheckedIn && <span className="text-xs text-muted-foreground ml-2">Waiting for opponent…</span>}
          </div>
        ) : (
          <Button
            onClick={() => checkInMutation.mutate()}
            disabled={checkInMutation.isPending || match.status === "completed"}
            className="w-full font-display tracking-wider text-sm gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {checkInMutation.isPending ? "Checking In…" : "Confirm Check-In"}
          </Button>
        )}

        {bothCheckedIn && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center text-sm text-green-400 font-semibold">
            🎮 Both teams checked in! Match is ready to begin.
          </div>
        )}
      </div>
    </div>
  );
}