import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useEffect, useMemo } from "react";
import {
  joinTournamentRoom,
  leaveTournamentRoom,
  subscribeTournamentSlots,
  subscribeMatchUpdatesForTournament,
} from "@/lib/realtimeClient";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import StatusBadge from "../components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Swords, Calendar, Radio, Trophy, Users, Clock } from "lucide-react";
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
    return teams.find(
      (t) =>
        (t.captain_email || "").toLowerCase() === e || JSON.stringify(t.roster || []).includes(e)
    );
  }, [teams, me]);

  const nextMatch = useMemo(() => {
    const open = matches.filter((m) =>
      ["pending", "check_in_open", "checked_in", "in_progress"].includes(m.status)
    );
    return open.sort(
      (a, b) => (a.round || 0) - (b.round || 0) || (a.match_number || 0) - (b.match_number || 0)
    )[0];
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

  if (tLoading || !id) return <LoadingSpinner label="Loading lobby…" />;
  if (!tournament) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <p className="text-muted-foreground font-display font-bold uppercase tracking-wider">
          Tournament not found
        </p>
        <Button variant="outline" onClick={() => navigate("/tournaments")}>
          Back to discovery
        </Button>
      </div>
    );
  }

  const bracketLive = matches.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 md:pb-8">
      <PageHeader
        eyebrow="Player lobby"
        title={
          <>
            {tournament.name}
          </>
        }
        subtitle="Your match hub — next game, check-in windows, and team status"
        actions={
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate(`/tournaments/${id}`)}>
            <ArrowLeft className="w-4 h-4" /> Tournament hub
          </Button>
        }
      />

      {checkInHint && tournament.status === "registration_open" && (
        <div className="glass rounded-2xl p-4 md:p-5 border border-primary/25 shadow-arena-card flex gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="section-label text-primary mb-1">Check-in window</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Opens <span className="text-foreground font-semibold">{checkInHint.open.calendar()}</span>
              {" · "}
              Match start <span className="text-foreground font-semibold">{checkInHint.start.calendar()}</span>
            </p>
          </div>
        </div>
      )}

      {!bracketLive && (
        <div className="glass rounded-3xl p-8 md:p-10 text-center space-y-4 border border-border/50 shadow-arena">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-secondary/80 ring-1 ring-border flex items-center justify-center">
            <Calendar className="w-7 h-7 text-muted-foreground" />
          </div>
          <h2 className="font-display font-bold text-xl tracking-tight">Bracket not generated yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Check back after the organizer publishes the bracket. Open the tournament page for rules and schedule.
          </p>
          <Button asChild variant="outline" className="mt-1">
            <Link to={`/tournaments/${id}`}>Open tournament</Link>
          </Button>
        </div>
      )}

      {bracketLive && (
        <>
          <div className="relative overflow-hidden glass rounded-3xl p-6 md:p-7 border border-primary/25 shadow-arena space-y-5">
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative flex items-center gap-2">
              <span className="live-dot" />
              <span className="section-label text-primary">Live bracket</span>
              {tournament.status && <StatusBadge status={tournament.status} className="ml-auto" />}
            </div>

            {nextMatch ? (
              <div className="relative space-y-4">
                <h3 className="font-display font-bold text-xl tracking-tight flex items-center gap-2">
                  <Swords className="w-5 h-5 text-primary" /> Next match
                </h3>
                <p className="text-sm text-muted-foreground">
                  Round {nextMatch.round} · Match {nextMatch.match_number}
                  {" · "}
                  <StatusBadge status={nextMatch.status} />
                </p>
                <div className="rounded-2xl border border-border/50 bg-card/40 p-5 text-center">
                  <p className="font-display font-bold text-lg md:text-xl tracking-tight">
                    {nextMatch.team_a_name || "TBD"}
                    <span className="text-muted-foreground font-normal mx-3 text-sm">vs</span>
                    {nextMatch.team_b_name || "TBD"}
                  </p>
                  {(nextMatch.score_a != null || nextMatch.score_b != null) && (
                    <p className="mt-2 text-2xl font-display font-bold text-primary tabular-nums">
                      {nextMatch.score_a ?? 0} – {nextMatch.score_b ?? 0}
                    </p>
                  )}
                  {nextMatch.scheduled_time && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {moment(nextMatch.scheduled_time).calendar()}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="arena">
                    <Link to={`/matches/${nextMatch.id}/lobby`}>Enter match lobby</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to={`/matches/${nextMatch.id}/live`}>Live center</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <p className="relative text-sm text-muted-foreground">
                No upcoming matches — check the bracket for results.
              </p>
            )}

            <Button asChild variant="outline" size="sm" className="relative">
              <Link to={`/public/bracket/${id}`}>View public bracket</Link>
            </Button>
          </div>

          {myTeam && (
            <div className="glass rounded-3xl p-5 md:p-6 border border-border/50 shadow-arena-card space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <h3 className="section-label">Your team</h3>
              </div>
              <p className="text-foreground font-display font-bold text-lg tracking-tight">
                {myTeam.name}{" "}
                <span className="text-muted-foreground text-sm font-normal">[{myTeam.tag}]</span>
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                Status:{" "}
                <span className="text-foreground font-medium">
                  {String(myTeam.status || "registered").replace(/_/g, " ")}
                </span>
              </p>
              {myTeam.status === "eliminated" && (
                <p className="text-sm text-amber-200/90 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                  You are out of this bracket — thanks for playing.
                </p>
              )}
              {myTeam.status === "winner" && (
                <p className="text-sm text-amber-300 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-center gap-2">
                  <Trophy className="w-4 h-4" /> Champion — great run!
                </p>
              )}
              {nextMatch && myTeam.status === "registered" && (
                <Button asChild variant="outline" size="sm" className="mt-1">
                  <Link to={`/matches/${nextMatch.id}/lobby`}>Report score / lobby</Link>
                </Button>
              )}
            </div>
          )}

          {!myTeam && me && (
            <p className="text-xs text-muted-foreground text-center glass rounded-2xl py-4 border border-border/40">
              No team linked to your account for this tournament yet.
            </p>
          )}
        </>
      )}

      {tournament.status === "completed" && (
        <div className="glass rounded-3xl p-8 text-center border border-amber-500/30 shadow-arena space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-amber-500/15 ring-1 ring-amber-500/35 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-amber-400" />
          </div>
          <p className="font-display font-bold text-lg text-foreground">Tournament completed</p>
          <p className="text-sm text-muted-foreground">Thanks for competing.</p>
        </div>
      )}
    </div>
  );
}
