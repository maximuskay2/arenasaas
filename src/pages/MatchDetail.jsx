import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, AlertTriangle, Play, FileText, ClipboardCheck, Radio, Tv } from "lucide-react";
import CheckInPanel from "../components/match/CheckInPanel";
import DisputeResolver from "../components/match/DisputeResolver";
import MatchReadyBanner from "../components/match/MatchReadyBanner";
import MatchChat from "../components/match/MatchChat";
import ScoreReportForm from "../components/match/ScoreReportForm";
import ReportApprovalPanel from "../components/match/ReportApprovalPanel";
import StreamStatusBadge from "../components/match/StreamStatusBadge";
import MatchStreamEmbed from "../components/match/MatchStreamEmbed";
import GameApiImporter from "../components/match/GameApiImporter";
import MatchScheduler from "../components/match/MatchScheduler";
import { sendDiscordNotification } from "../lib/discord";
import { opponentCheckedInNotif } from "../lib/notifications";
import { advanceWinner } from "../lib/bracketAdvancement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import MatchHighlightsFeed from "../components/match/MatchHighlightsFeed";
import FanVotingWidget from "../components/tournament/FanVotingWidget";
import { joinTournamentRoom, leaveTournamentRoom } from "@/lib/realtimeClient";

function VotingWrapper({ match, currentUser }) {
  const queries = useQueries({
    queries: [
      { queryKey: ["team", match.team_a_id], queryFn: () => maxikay.entities.Team.filter({ id: match.team_a_id }).then((r) => r[0]) },
      { queryKey: ["team", match.team_b_id], queryFn: () => maxikay.entities.Team.filter({ id: match.team_b_id }).then((r) => r[0]) },
    ],
  });
  const [teamA, teamB] = queries.map((q) => q.data);
  if (!teamA || !teamB) return <div className="py-6 text-center text-muted-foreground">Loading teams...</div>;
  return (
    <FanVotingWidget
      tournamentId={match.tournament_id}
      matchId={match.id}
      teamA={teamA}
      teamB={teamB}
      currentUser={currentUser}
    />
  );
}

export default function MatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenantId, tenantConfig } = useTenant();

  const { data: match, isLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => maxikay.entities.Match.filter({ id }),
    select: (data) => data[0],
  });

  useEffect(() => {
    maxikay.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (!match?.tournament_id) return;
    joinTournamentRoom(match.tournament_id);
    return () => leaveTournamentRoom(match.tournament_id);
  }, [match?.tournament_id]);

  // Real-time subscription for this match
  useEffect(() => {
    const unsub = maxikay.entities.Match.subscribe((event) => {
      if (event.id === id) {
        queryClient.invalidateQueries({ queryKey: ["match", id] });
      }
    });
    return unsub;
  }, [id, queryClient]);

  const [scoreA, setScoreA] = useState(null);
  const [scoreB, setScoreB] = useState(null);
  const [notes, setNotes] = useState("");
  const [reportTab, setReportTab] = useState("submit");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState("match");
  const [streamDraft, setStreamDraft] = useState("");
  const [editingStream, setEditingStream] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const saveMatchStream = useMutation({
    mutationFn: (url) =>
      maxikay.entities.Match.update(id, {
        stream_url: url,
        expected_version: match?.version ?? 1,
        expected_status: match?.status,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["match", id] }); setEditingStream(false); },
  });

  const updateMatch = useMutation({
    mutationFn: (data) => maxikay.entities.Match.update(id, data),
    onError: (err) => {
      const code = err?.data?.code;
      if (err?.status === 409 && code === "state_conflict") {
        toast({
          title: "Match status changed",
          description: "Refresh and try again — another transition happened first.",
          variant: "destructive",
        });
        return;
      }
      if (err?.status === 409 || code === "optimistic_lock") {
        toast({
          title: "Concurrent update",
          description: "This match changed on the server. Data was refreshed.",
          variant: "destructive",
        });
      }
    },
    onMutate: async (newData) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["match", id] });
      const previous = queryClient.getQueryData(["match", id]);
      queryClient.setQueryData(["match", id], (old) => old ? { ...old, ...newData } : old);
      return { previous };
    },
    onError: (err, newData, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(["match", id], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["match", id] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["tournament-matches"] });
    },
  });

  const startMatch = () => {
    updateMatch.mutate({
      status: "in_progress",
      expected_version: match.version ?? 1,
      expected_status: match.status,
    });
  };

  const submitScore = () => {
    const sA = scoreA ?? match.score_a;
    const sB = scoreB ?? match.score_b;
    const currentVersion = match.version || 1;
    const winnerId = sA > sB ? match.team_a_id : sB > sA ? match.team_b_id : "";
    const winnerName = sA > sB ? match.team_a_name : sB > sA ? match.team_b_name : "";
    
    updateMatch.mutate({
      score_a: sA,
      score_b: sB,
      status: "completed",
      winner_id: winnerId,
      winner_name: winnerName,
      notes: notes || match.notes,
      expected_version: currentVersion,
      expected_status: match.status,
    });

    const completedMatch = {
      ...match,
      score_a: sA,
      score_b: sB,
      winner_id: winnerId,
      winner_name: winnerName,
    };
    // Auto-advance winner to next bracket match
    maxikay.entities.Match.filter({ tournament_id: match.tournament_id }, "match_number", 500)
      .then((allMatches) => advanceWinner(completedMatch, allMatches))
      .then(() => queryClient.invalidateQueries({ queryKey: ["tournament-matches"] }));

    sendDiscordNotification(tenantConfig?.discord_webhook_url, {
      title: "✅ Match Completed",
      action: "score_submitted",
      entity_type: "match",
      entity_id: id,
      actor_email: "system",
      actor_role: "organizer",
      details: JSON.stringify({ score_a: sA, score_b: sB, winner: winnerName }),
      tournament_id: match.tournament_id,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    });
  };

  const disputeMatch = () => {
    updateMatch.mutate({
      status: "under_dispute",
      expected_version: match.version ?? 1,
      expected_status: match.status,
    });
    maxikay.entities.AuditLog.create({
      action: "match_disputed",
      entity_type: "match",
      entity_id: id,
      actor_email: "system",
      actor_role: "referee",
      tournament_id: match.tournament_id,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    });
    sendDiscordNotification(tenantConfig?.discord_webhook_url, {
      title: "⚠️ Match Under Dispute",
      description: `**${match.team_a_name}** vs **${match.team_b_name}** — Round ${match.round}`,
      color: 0xff8c00,
    });
  };

  const handleCheckIn = (side) => {
    const willComplete = side === "a" ? match.team_b_checked_in : match.team_a_checked_in;
    updateMatch.mutate(
      side === "a"
        ? {
            team_a_checked_in: true,
            status: match.team_b_checked_in ? "checked_in" : "check_in_open",
            expected_version: match.version ?? 1,
            expected_status: match.status,
          }
        : {
            team_b_checked_in: true,
            status: match.team_a_checked_in ? "checked_in" : "check_in_open",
            expected_version: match.version ?? 1,
            expected_status: match.status,
          }
    );
    // Notify the other team's captain that opponent checked in
    opponentCheckedInNotif({ match, notifyTeam: side === "a" ? "b" : "a", webhook: tenantConfig?.discord_webhook_url });
  };

  const resolveDispute = (winnerId, winnerName) => {
    updateMatch.mutate({
      status: "completed",
      winner_id: winnerId,
      winner_name: winnerName,
      expected_version: match.version ?? 1,
      expected_status: match.status,
    });
    maxikay.entities.AuditLog.create({
      action: "dispute_resolved",
      entity_type: "match",
      entity_id: id,
      actor_email: "system",
      actor_role: "admin",
      details: JSON.stringify({ forced_winner: winnerName }),
      tournament_id: match.tournament_id,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    });
  };

  const reinstateMatch = () => {
    updateMatch.mutate({
      status: "in_progress",
      expected_version: match.version ?? 1,
      expected_status: match.status,
    });
  };

  if (isLoading) return <LoadingSpinner label="Loading match…" />;
  if (!match) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground font-display font-bold uppercase tracking-wider">Match not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>
    );
  }

  const currentScoreA = scoreA ?? match.score_a;
  const currentScoreB = scoreB ?? match.score_b;

  const tabBtn = (key, label, extra) => (
    <button
      type="button"
      onClick={() => setActiveTab(key)}
      className={`flex-1 text-[10px] font-display font-bold uppercase tracking-wider py-2.5 rounded-xl transition-all flex items-center justify-center gap-1 ${
        activeTab === key
          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      }`}
    >
      {extra}
      {label}
    </button>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 md:pb-8">
      <MatchReadyBanner match={match} />
      <PageHeader
        eyebrow="Match control"
        title={
          <>
            <span className="text-foreground">{match.team_a_name || "TBD"}</span>
            <span className="text-muted-foreground font-normal mx-2 text-lg">vs</span>
            <span className="text-foreground">{match.team_b_name || "TBD"}</span>
          </>
        }
        subtitle={
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <StatusBadge status={match.status} />
            <span className="text-xs text-muted-foreground">
              {match.bracket_position || "Bracket"} · Round {match.round} · v{match.version || 1}
            </span>
          </div>
        }
        actions={
          <div className="flex gap-2">
            {id ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/matches/${id}/live`} className="gap-1.5">
                  <Tv className="w-4 h-4" /> Live center
                </Link>
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      {match && !match.team_a_id && (
        <div className="py-4 text-center text-muted-foreground text-sm glass rounded-2xl border border-border/50">
          Teams not assigned yet
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 glass rounded-2xl p-1.5 border border-border/50">
        {tabBtn("match", "Match")}
        {tabBtn("highlights", "Highlights")}
        {match.status === "in_progress" && tabBtn("voting", "Voting")}
        {tabBtn(
          "stream",
          "Watch",
          (match.stream_url || match.tournament_id) ? (
            <Radio className="w-3 h-3 text-red-400 animate-pulse" />
          ) : null
        )}
      </div>

      {activeTab === "stream" && (
        <div className="space-y-4">
          {/* Per-match stream */}
          <div className="glass rounded-2xl p-4 space-y-3 border border-border/50 shadow-arena-card">
            <div className="flex items-center justify-between">
              <p className="section-label flex items-center gap-1.5"><Tv className="w-3.5 h-3.5" /> Match stream URL</p>
              <button type="button" onClick={() => { setStreamDraft(match.stream_url || ""); setEditingStream(!editingStream); }} className="text-[10px] font-display font-bold uppercase tracking-wider text-primary hover:underline">{editingStream ? "Cancel" : "Edit"}</button>
            </div>
            {editingStream ? (
              <div className="flex gap-2">
                <Input value={streamDraft} onChange={(e) => setStreamDraft(e.target.value)} className="bg-background/40 border-border/60 text-xs rounded-xl" placeholder="twitch.tv/channel or youtube.com/watch?v=…" />
                <Button size="sm" variant="arena" onClick={() => saveMatchStream.mutate(streamDraft)} disabled={saveMatchStream.isPending} className="text-xs">Save</Button>
              </div>
            ) : match.stream_url ? (
              <p className="text-xs text-muted-foreground break-all">{match.stream_url}</p>
            ) : (
              <p className="text-xs text-muted-foreground/70">No match-specific stream set</p>
            )}
          </div>
          {parsedMatchStream ? (
            <div className="glass rounded-2xl overflow-hidden border border-red-500/25 shadow-arena">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-red-500/10">
                <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                <span className="text-[10px] font-display uppercase tracking-wider text-red-400 font-bold">Live · Match stream</span>
              </div>
              <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                {parsedMatchStream.type === "twitch" ? (
                  <iframe src={`https://player.twitch.tv/?channel=${parsedMatchStream.channel}&parent=${hostname}&autoplay=false`} className="absolute inset-0 w-full h-full" allowFullScreen title="Match Stream" />
                ) : (
                  <iframe src={`https://www.youtube.com/embed/${parsedMatchStream.videoId}?autoplay=0`} className="absolute inset-0 w-full h-full" allowFullScreen title="Match Stream" />
                )}
              </div>
            </div>
          ) : (
            <MatchStreamEmbed tournamentId={match.tournament_id} />
          )}
        </div>
      )}

      {activeTab === "highlights" && (
        <MatchHighlightsFeed tournamentId={match.tournament_id} matchId={id} isOrganizer={false} />
      )}

      {activeTab === "voting" && match.status === "in_progress" && currentUser && (
        <VotingWrapper match={match} currentUser={currentUser} />
      )}

      {activeTab === "match" && (
      <>{/* Stream status */}
      {match.tournament_id && <StreamStatusBadge tournamentId={match.tournament_id} />}

      {/* Scheduling + auto-import */}
      <div className="flex justify-end gap-2 flex-wrap">
        {match.status !== "completed" && match.status !== "forfeited" && (
          <GameApiImporter match={match} onScoresImported={() => {}} />
        )}
        <MatchScheduler match={match} tenantConfig={tenantConfig} isAdmin={true} />
      </div>

      {/* Score display */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`relative overflow-hidden glass rounded-3xl p-8 text-center border border-border/50 shadow-arena ${match.status === "in_progress" ? "glow-border-primary" : ""}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="relative flex items-center justify-center gap-6 md:gap-8">
          <div className="flex-1 text-right min-w-0">
            <p className={`font-display font-bold text-base md:text-lg truncate ${match.winner_id === match.team_a_id ? "text-primary" : "text-foreground"}`}>
              {match.team_a_name || "TBD"}
            </p>
          </div>
          <div className="flex items-center gap-3 md:gap-4 shrink-0">
            <span className="text-4xl md:text-5xl font-display font-bold text-primary tabular-nums">{match.score_a ?? 0}</span>
            <span className="text-sm text-muted-foreground font-display">VS</span>
            <span className="text-4xl md:text-5xl font-display font-bold text-primary tabular-nums">{match.score_b ?? 0}</span>
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className={`font-display font-bold text-base md:text-lg truncate ${match.winner_id === match.team_b_id ? "text-primary" : "text-foreground"}`}>
              {match.team_b_name || "TBD"}
            </p>
          </div>
        </div>
        {match.winner_name && (
          <p className="relative mt-5 text-sm text-primary font-display font-semibold">
            Winner: {match.winner_name}
          </p>
        )}
      </motion.div>

      {/* Actions */}
      {match.status !== "completed" && match.status !== "forfeited" && (
        <div className="glass rounded-3xl p-6 space-y-5 border border-border/50 shadow-arena-card">
          <h3 className="section-label">Match controls</h3>

          {match.status === "pending" && (
            <div className="space-y-4">
              <CheckInPanel match={match} onCheckIn={handleCheckIn} isLoading={updateMatch.isPending} />
              {match.team_a_checked_in && match.team_b_checked_in && (
                <Button variant="arena" onClick={startMatch} className="w-full gap-2" disabled={updateMatch.isPending}>
                  <Play className="w-4 h-4" /> Start match
                </Button>
              )}
              {!match.team_a_checked_in && !match.team_b_checked_in && (
                <Button onClick={startMatch} variant="outline" className="w-full gap-2" disabled={updateMatch.isPending}>
                  <Play className="w-4 h-4" /> Skip check-in &amp; start
                </Button>
              )}
            </div>
          )}

          {match.status === "check_in_open" && (
            <div className="space-y-4">
              <CheckInPanel match={match} onCheckIn={handleCheckIn} isLoading={updateMatch.isPending} />
            </div>
          )}

          {match.status === "checked_in" && (
            <Button variant="arena" onClick={startMatch} className="w-full gap-2" disabled={updateMatch.isPending}>
              <Play className="w-4 h-4" /> Start match
            </Button>
          )}

          {(match.status === "in_progress" || match.status === "under_dispute") && (
            <>
              {match.status === "under_dispute" && (
                <DisputeResolver match={match} onResolve={resolveDispute} onReinstate={reinstateMatch} isLoading={updateMatch.isPending} />
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">{match.team_a_name || "Team A"} Score</Label>
                  <Input
                    type="number"
                    value={currentScoreA}
                    onChange={(e) => setScoreA(parseInt(e.target.value) || 0)}
                    min={0}
                    className="mt-1 bg-secondary/50 text-center text-xl font-display font-bold"
                  />
                </div>
                <div>
                  <Label className="text-xs">{match.team_b_name || "Team B"} Score</Label>
                  <Input
                    type="number"
                    value={currentScoreB}
                    onChange={(e) => setScoreB(parseInt(e.target.value) || 0)}
                    min={0}
                    className="mt-1 bg-secondary/50 text-center text-xl font-display font-bold"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 bg-secondary/50"
                  placeholder="Match notes..."
                  rows={2}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="arena" onClick={submitScore} disabled={updateMatch.isPending} className="flex-1 gap-2">
                  <Check className="w-4 h-4" /> Submit score
                </Button>
                {match.status !== "under_dispute" && (
                  <Button onClick={disputeMatch} variant="outline" disabled={updateMatch.isPending} className="gap-2 text-orange-400 border-orange-400/30">
                    <AlertTriangle className="w-4 h-4" /> Dispute
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Match info */}
      <div className="glass rounded-3xl p-6 space-y-3 border border-border/50 shadow-arena-card">
        <h3 className="section-label">Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="section-label !normal-case tracking-normal">Round</span>
            <p className="font-semibold mt-0.5">{match.round}</p>
          </div>
          <div>
            <span className="section-label !normal-case tracking-normal">Match #</span>
            <p className="font-semibold mt-0.5">{match.match_number}</p>
          </div>
          <div>
            <span className="section-label !normal-case tracking-normal">Position</span>
            <p className="font-semibold mt-0.5">{match.bracket_position || "—"}</p>
          </div>
          <div>
            <span className="section-label !normal-case tracking-normal">Version</span>
            <p className="font-semibold mt-0.5 tabular-nums">{match.version || 1}</p>
          </div>
        </div>
        {match.notes && (
          <div className="pt-3 border-t border-border/50">
            <span className="section-label !normal-case tracking-normal">Notes</span>
            <p className="text-sm mt-1 text-muted-foreground">{match.notes}</p>
          </div>
        )}
      </div>

      {/* Post-match reporting */}
      {(match.status === "in_progress" || match.status === "completed") && (
        <div className="glass rounded-3xl p-6 space-y-4 border border-border/50 shadow-arena-card">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="section-label flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Score reports
            </h3>
            <div className="flex gap-1 glass rounded-xl p-1 border border-border/40">
              <Button size="sm" variant={reportTab === "submit" ? "arena" : "ghost"} className="text-xs h-8" onClick={() => setReportTab("submit")}>
                <FileText className="w-3.5 h-3.5 mr-1" /> Submit
              </Button>
              <Button size="sm" variant={reportTab === "review" ? "arena" : "ghost"} className="text-xs h-8" onClick={() => setReportTab("review")}>
                <ClipboardCheck className="w-3.5 h-3.5 mr-1" /> Review
              </Button>
            </div>
          </div>
          {reportTab === "submit" ? (
            reportSubmitted ? (
              <p className="text-sm text-emerald-400 text-center py-4 font-medium">Report submitted — awaiting organizer approval.</p>
            ) : (
              <ScoreReportForm
                match={match}
                currentUserEmail="captain@team.gg"
                tenantId={tenantId}
                onSubmitted={() => { setReportSubmitted(true); setReportTab("review"); }}
              />
            )
          ) : (
            <ReportApprovalPanel
              matchId={id}
              match={match}
              onApprove={() => { queryClient.invalidateQueries({ queryKey: ["match", id] }); }}
            />
          )}
        </div>
      )}

      {/* Match Chat on feed tab */}
      {activeTab === "feed" && <MatchChat matchId={id} tenantId={tenantId} />}
    </>
      )}
    </div>
  );
}