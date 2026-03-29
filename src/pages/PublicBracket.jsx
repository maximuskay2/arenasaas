import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { maxikay } from "@/api/maxikayClient";
import { useParams, Link } from "react-router-dom";
import BracketView from "../components/tournament/BracketView";
import StatusBadge from "../components/shared/StatusBadge";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import ScoreReportForm from "../components/match/ScoreReportForm";
import { X, Swords, Calendar, ExternalLink, Trophy, Users, ClipboardList } from "lucide-react";
import moment from "moment";

function MatchDetailModal({ match, onClose }) {
  if (!match) return null;
  const isCompleted = match.status === "completed";
  const [showReport, setShowReport] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const canReport = match.status === "in_progress" || match.status === "check_in_open" || match.status === "checked_in";

  useEffect(() => {
    maxikay.auth.me().then(setCurrentUser).catch(() => {});
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative glass rounded-2xl p-6 w-full max-w-md space-y-4 border border-primary/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-primary" />
            <span className="font-display text-xs font-semibold tracking-wider uppercase text-muted-foreground">{match.bracket_position} · Round {match.round}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Score display */}
        <div className="glass rounded-xl p-5 text-center space-y-2">
          <div className="flex items-center justify-center gap-6">
            <div className="flex-1 text-right">
              <p className={`font-display font-bold text-base ${isCompleted && match.winner_id === match.team_a_id ? "text-primary" : "text-foreground"}`}>{match.team_a_name || "TBD"}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-display font-black text-primary">{match.score_a}</span>
              <span className="text-muted-foreground">:</span>
              <span className="text-3xl font-display font-black text-primary">{match.score_b}</span>
            </div>
            <div className="flex-1 text-left">
              <p className={`font-display font-bold text-base ${isCompleted && match.winner_id === match.team_b_id ? "text-primary" : "text-foreground"}`}>{match.team_b_name || "TBD"}</p>
            </div>
          </div>
          {match.winner_name && (
            <p className="text-xs text-primary font-display font-semibold">🏆 Winner: {match.winner_name}</p>
          )}
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="glass rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</p>
            <div className="mt-1"><StatusBadge status={match.status} /></div>
          </div>
          {match.scheduled_time && (
            <div className="glass rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Calendar className="w-3 h-3" /> Scheduled</p>
              <p className="text-xs font-semibold mt-1">{moment(match.scheduled_time).format("MMM D, h:mm A")}</p>
            </div>
          )}
        </div>

        {match.notes && (
          <p className="text-xs text-muted-foreground bg-secondary/40 rounded-lg p-3">{match.notes}</p>
        )}

        {/* Score Report */}
        {canReport && currentUser && (
          <>
            {showReport ? (
              <div className="border border-primary/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-display font-semibold text-primary uppercase tracking-wider">Submit Score Report</p>
                  <button onClick={() => setShowReport(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                </div>
                <ScoreReportForm
                  match={match}
                  currentUserEmail={currentUser.email}
                  tenantId={match.tenant_id}
                  onSubmitted={() => { setShowReport(false); onClose(); }}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-secondary/60 hover:bg-secondary text-foreground text-xs font-display font-semibold tracking-wider transition-colors"
              >
                <ClipboardList className="w-3.5 h-3.5" /> Report Score
              </button>
            )}
          </>
        )}

        <Link
          to={`/matches/${match.id}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-display font-semibold tracking-wider transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> View Full Match Details
        </Link>
      </div>
    </div>
  );
}

const BRACKET_VIEWS_KEY = "arena_bracket_views_v1";

export default function PublicBracket() {
  const { id } = useParams();
  const [selectedMatch, setSelectedMatch] = useState(null);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(BRACKET_VIEWS_KEY);
      const o = raw ? JSON.parse(raw) : {};
      o[id] = (Number(o[id]) || 0) + 1;
      localStorage.setItem(BRACKET_VIEWS_KEY, JSON.stringify(o));
    } catch {
      /* ignore */
    }
  }, [id]);

  const { data: tournament, isLoading: loadingT } = useQuery({
    queryKey: ["pub-tournament", id],
    queryFn: () => maxikay.entities.Tournament.filter({ id }),
    select: (d) => d[0],
    refetchInterval: 30000, // live refresh every 30s
  });

  const { data: matches = [], isLoading: loadingM } = useQuery({
    queryKey: ["pub-matches", id],
    queryFn: () => maxikay.entities.Match.filter({ tournament_id: id }),
    refetchInterval: 15000,
  });

  if (loadingT || loadingM) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <LoadingSpinner />
    </div>
  );

  if (!tournament) return (
    <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
      Tournament not found.
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg leading-tight">{tournament.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={tournament.status} />
                <span className="text-xs text-muted-foreground">
                  {tournament.game_title} · {tournament.format?.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              {tournament.registered_teams || 0}/{tournament.max_teams} teams
            </span>
            {tournament.start_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {moment(tournament.start_date).format("MMM D, h:mm A")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Prize pool banner */}
      {tournament.prize_pool > 0 && (
        <div className="bg-primary/10 border-b border-primary/20 text-center py-2">
          <span className="text-xs font-display font-bold tracking-wider text-primary">
            💰 PRIZE POOL: {tournament.currency || "USD"} {tournament.prize_pool?.toLocaleString()}
          </span>
        </div>
      )}

      {/* Bracket */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-xs text-muted-foreground text-center mb-4">Click any match card to see details</p>
        <BracketView matches={matches} tournamentId={id} onMatchClick={setSelectedMatch} />
      </div>

      {selectedMatch && <MatchDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />}

      <div className="text-center py-8 text-xs text-muted-foreground">
        Powered by Arena SaaS · Live updates every 15s
      </div>
    </div>
  );
}