import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useEffect, useMemo } from "react";
import { joinTournamentRoom, leaveTournamentRoom, subscribeTournamentSlots, subscribeMatchUpdatesForTournament } from "@/lib/realtimeClient";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Swords, Calendar, Radio, Trophy } from "lucide-react";
import moment from "moment";

export default function TournamentLobby() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: tournament, isLoading: tLoading } = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => maxikay.entities.Tournament.filter({ id }).then((r) => r[0]),
    enabled: !!id,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["tournament-matches", id],
    queryFn: () => maxikay.entities.Match.filter({ tournament_id: id }, "round", 200),
    enabled: !!id,
  });

  const { data: me } = useQuery({
    queryKey: ["auth-me-lobby"],
    queryFn: () => maxikay.auth.me().catch(() => null),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["tournament-teams", id],
    queryFn: () => maxikay.entities.Team.filter({ tournament_id: id }),
    enabled: !!id,
  });

  const myTeam = useMemo(() => {
    if (!me?.email) return null;
    const e = me.email.toLowerCase();
    return teams.find((t) => (t.captain_email || "").toLowerCase() === e || JSON.stringify(t.roster || []).includes(e));
  }, [teams, me]);

  const nextMatch = useMemo(() => {
    const open = matches.filter((m) => ["pending", "check_in_open", "checked_in", "in_progress"].includes(m.status));
    return open.sort((a, b) => (a.round || 0) - (b.round || 0) || (a.match_number || 0) - (b.match_number || 0))[0];
  }, [matches]);

  const checkInHint = useMemo(() => {
    if (!tournament?.start_date || tournament?.check_in_duration_minutes == null) return null;
    const start = moment(tournament.start_date);
    const open = start.clone().subtract(Number(tournament.check_in_duration_minutes) || 15, "minutes");
    return { open, start };
  }, [tournament?.start_date, tournament?.check_in_duration_minutes]);

  useEffect(() => {
    if (!id) return;
    joinTournamentRoom(id);
    const offSlots = subscribeTournamentSlots((payload) => {
      if (String(payload?.tournamentId) === String(id)) {
        queryClient.invalidateQueries({ queryKey: ["tournament", id] });
        queryClient.invalidateQueries({ queryKey: ["tournament-matches", id] });
        queryClient.invalidateQueries({ queryKey: ["discovery-catalog"] });
      }
    });
    const offMatches = subscribeMatchUpdatesForTournament(id, () => {
      queryClient.invalidateQueries({ queryKey: ["tournament-matches", id] });
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", id] });
    });
    return () => {
      leaveTournamentRoom(id);
      offSlots();
      offMatches();
    };
  }, [id, queryClient]);

  if (tLoading || !id) return <LoadingSpinner />;
  if (!tournament) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <p className="text-muted-foreground">Tournament not found.</p>
        <Button variant="outline" onClick={() => navigate("/tournaments")}>
          Back to discovery
        </Button>
      </div>
    );
  }

  const bracketLive = matches.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20 md:pb-0">
      <PageHeader
        title={tournament.name}
        subtitle="Match lobby"
        actions={
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate(`/tournaments/${id}`)}>
            <ArrowLeft className="w-4 h-4" /> Tournament hub
          </Button>
        }
      />

      {checkInHint && tournament.status === "registration_open" && (
        <div className="glass rounded-xl p-4 border border-cyan-500/25 text-sm text-muted-foreground">
          <p className="text-[11px] font-display font-bold uppercase tracking-wider text-cyan-300/90 mb-1">Check-in window</p>
          <p>
            Opens <span className="text-foreground font-medium">{checkInHint.open.calendar()}</span> · Match start{" "}
            <span className="text-foreground font-medium">{checkInHint.start.calendar()}</span>
          </p>
        </div>
      )}

      {!bracketLive && (
        <div className="glass rounded-2xl p-8 text-center space-y-3 border border-border/60">
          <Calendar className="w-10 h-10 text-muted-foreground mx-auto" />
          <h2 className="font-display font-bold text-foreground">Bracket not generated yet</h2>
          <p className="text-sm text-muted-foreground">Check back after the organizer publishes the bracket. You can open the full tournament page for rules and schedule.</p>
          <Button asChild variant="outline" className="mt-2">
            <Link to={`/tournaments/${id}`}>Open tournament</Link>
          </Button>
        </div>
      )}

      {bracketLive && (
        <>
          <div className="glass rounded-2xl p-6 border border-primary/20 space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Radio className="w-4 h-4 animate-pulse" />
              <span className="text-xs font-black uppercase tracking-widest">Live bracket</span>
            </div>
            {nextMatch ? (
              <div className="space-y-3">
                <h3 className="font-display font-bold text-lg flex items-center gap-2">
                  <Swords className="w-5 h-5" /> Next match
                </h3>
                <p className="text-sm text-muted-foreground">
                  Round {nextMatch.round} · Match {nextMatch.match_number} ·{" "}
                  <span className="text-foreground font-medium">{nextMatch.status?.replace(/_/g, " ")}</span>
                </p>
                <p className="text-foreground">
                  {(nextMatch.team_a_name || "TBD")} <span className="text-muted-foreground">vs</span>{" "}
                  {(nextMatch.team_b_name || "TBD")}
                </p>
                {nextMatch.scheduled_time && (
                  <p className="text-xs text-muted-foreground">{moment(nextMatch.scheduled_time).calendar()}</p>
                )}
                <Button asChild className="mt-2">
                  <Link to={`/matches/${nextMatch.id}/lobby`}>Enter match lobby</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming matches — check the bracket for results.</p>
            )}
            <Button asChild variant="outline" size="sm">
              <Link to={`/public/bracket/${id}`}>View bracket</Link>
            </Button>
          </div>

          {myTeam && (
            <div className="glass rounded-xl p-5 border border-border/50">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Your team</h3>
              <p className="text-foreground font-semibold">
                {myTeam.name} <span className="text-muted-foreground text-sm">[{myTeam.tag}]</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2 capitalize">Status: {String(myTeam.status || "registered").replace(/_/g, " ")}</p>
              {myTeam.status === "eliminated" && (
                <p className="text-sm text-amber-200/90 mt-2">You are out of this bracket — thanks for playing.</p>
              )}
              {myTeam.status === "winner" && (
                <p className="text-sm text-yellow-300 mt-2 flex items-center gap-2">
                  <Trophy className="w-4 h-4" /> Champion — great run!
                </p>
              )}
              {nextMatch && myTeam.status === "registered" && (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to={`/matches/${nextMatch.id}/lobby`}>Report score / lobby</Link>
                </Button>
              )}
            </div>
          )}

          {!myTeam && me && (
            <p className="text-xs text-muted-foreground text-center">No team linked to your account for this tournament yet.</p>
          )}
        </>
      )}

      {tournament.status === "completed" && (
        <div className="glass rounded-xl p-6 text-center border border-yellow-500/25">
          <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
          <p className="font-display font-bold text-foreground">Tournament completed</p>
          <p className="text-sm text-muted-foreground mt-1">Thanks for competing.</p>
        </div>
      )}
    </div>
  );
}
