import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { joinTournamentRoom, leaveTournamentRoom } from "@/lib/realtimeClient";
import { Button } from "@/components/ui/button";
import MatchReadyBanner from "../components/match/MatchReadyBanner";
import MatchChat from "../components/match/MatchChat";
import MatchStreamEmbed from "../components/match/MatchStreamEmbed";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { motion } from "framer-motion";
import moment from "moment";
import { ArrowLeft, Radio, Swords, ExternalLink, Clock, ShieldCheck, Upload } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function lobbyBadge(match) {
  const s = match?.status;
  if (s === "in_progress") {
    return {
      label: "LIVE",
      wrap: "shadow-[0_0_24px_rgba(239,68,68,0.45)] border-red-500/50 bg-red-500/15 text-red-300",
    };
  }
  if (s === "check_in_open" || s === "checked_in" || s === "pending") {
    return {
      label: s === "pending" ? "UPCOMING" : "CHECK-IN",
      wrap: "shadow-[0_0_20px_rgba(52,211,153,0.35)] border-emerald-500/45 bg-emerald-500/12 text-emerald-300",
    };
  }
  if (s === "completed" || s === "forfeited") {
    return {
      label: "FINISHED",
      wrap: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    };
  }
  if (s === "under_dispute") {
    return {
      label: "DISPUTE",
      wrap: "shadow-[0_0_18px_rgba(251,146,60,0.35)] border-orange-500/45 bg-orange-500/12 text-orange-200",
    };
  }
  return { label: (s || "MATCH").replace(/_/g, " ").toUpperCase(), wrap: "border-border bg-secondary/40 text-muted-foreground" };
}

export default function MatchLobby() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  const { isAuthenticated } = useAuth();
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [povLink, setPovLink] = useState("");
  const [shotUrl, setShotUrl] = useState("");
  const [shotFiles, setShotFiles] = useState([]);

  const { data: match, isLoading } = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => maxikay.entities.Match.filter({ id: matchId }),
    select: (rows) => rows[0],
    enabled: !!matchId,
  });

  const { data: tournament } = useQuery({
    queryKey: ["tournament", match?.tournament_id],
    queryFn: () => maxikay.entities.Tournament.filter({ id: match.tournament_id }).then((r) => r[0]),
    enabled: !!match?.tournament_id,
  });

  const reportMutation = useMutation({
    mutationFn: async () => {
      let urls = shotUrl.trim() ? [shotUrl.trim()] : [];
      if (shotFiles.length) {
        const up = await maxikay.matchEngine.uploadMatchEvidence(matchId, shotFiles);
        urls = [...urls, ...(up?.urls || [])];
      }
      return maxikay.matchEngine.reportResult(matchId, {
        score_a: Number(scoreA),
        score_b: Number(scoreB),
        pov_link: povLink.trim() || undefined,
        screenshot_urls: urls.slice(0, 8),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["match", matchId] });
      if (data?.disputed) toast.warning("Scores conflict — match is under dispute. Staff will review.");
      else if (data?.resolved) toast.success("Match result locked.");
      else toast.success("Report submitted — waiting for opponent confirmation.");
      setScoreA("");
      setScoreB("");
      setPovLink("");
      setShotUrl("");
      setShotFiles([]);
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Submit failed"),
  });

  const showResultPortal =
    isAuthenticated &&
    match &&
    !["completed", "forfeited", "no_show", "under_dispute"].includes(match.status) &&
    (match.status === "in_progress" || match.status === "checked_in");

  useEffect(() => {
    if (!match?.tournament_id) return;
    joinTournamentRoom(match.tournament_id);
    return () => leaveTournamentRoom(match.tournament_id);
  }, [match?.tournament_id]);

  useEffect(() => {
    const unsub = maxikay.entities.Match.subscribe((event) => {
      if (event.id === matchId) {
        queryClient.invalidateQueries({ queryKey: ["match", matchId] });
      }
    });
    return unsub;
  }, [matchId, queryClient]);

  if (isLoading) return <LoadingSpinner />;
  if (!match) {
    return (
      <div className="max-w-lg mx-auto text-center py-24 space-y-4">
        <Swords className="w-12 h-12 mx-auto text-muted-foreground opacity-40" />
        <p className="text-muted-foreground">Match not found.</p>
        <Button variant="outline" onClick={() => navigate("/matches")}>
          Back to matches
        </Button>
      </div>
    );
  }

  const badge = lobbyBadge(match);
  const scheduled = match.scheduled_time ? moment(match.scheduled_time) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 md:pb-8">
      <MatchReadyBanner match={match} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/matches/${matchId}`}>
            <Button variant="outline" size="sm" className="gap-2 font-display text-[10px] tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" /> Match console
            </Button>
          </Link>
          {tournament?.id && (
            <Link to={`/tournaments/${tournament.id}`}>
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                Tournament <ExternalLink className="w-3 h-3" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-secondary/80 to-background p-6 md:p-10"
      >
        <div className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/25 via-transparent to-transparent" />
        <div className="relative flex flex-col items-center text-center space-y-6">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase italic tracking-widest border ${badge.wrap}`}
            >
              {match.status === "in_progress" && <Radio className="w-3 h-3 animate-pulse" />}
              {badge.label}
            </span>
            {tournament?.name && (
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                {tournament.name}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 md:gap-10 items-center w-full max-w-3xl">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-6 py-8">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Side A</p>
              <p className="font-display text-xl md:text-2xl font-black italic tracking-tight text-foreground">
                {match.team_a_name || "TBD"}
              </p>
              <p className="mt-4 text-4xl md:text-5xl font-black font-display text-primary tabular-nums">{match.score_a ?? 0}</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Swords className="w-8 h-8 text-primary/60" />
              <span className="text-xs font-display font-bold text-muted-foreground tracking-[0.3em]">VS</span>
              <span className="text-[10px] text-muted-foreground">
                R{match.round} · #{match.match_number}
              </span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-6 py-8">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Side B</p>
              <p className="font-display text-xl md:text-2xl font-black italic tracking-tight text-foreground">
                {match.team_b_name || "TBD"}
              </p>
              <p className="mt-4 text-4xl md:text-5xl font-black font-display text-primary tabular-nums">{match.score_b ?? 0}</p>
            </div>
          </div>

          {scheduled?.isValid() && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Scheduled {scheduled.format("MMM D, YYYY · h:mm A")}
            </div>
          )}

          {/* Check-in strip */}
          <div className="flex flex-wrap justify-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${match.team_a_checked_in ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-muted-foreground/35"}`} />
              <span className="text-muted-foreground">Team A</span>
              <span className="font-semibold">{match.team_a_checked_in ? "Checked in" : "Waiting"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${match.team_b_checked_in ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-muted-foreground/35"}`} />
              <span className="text-muted-foreground">Team B</span>
              <span className="font-semibold">{match.team_b_checked_in ? "Checked in" : "Waiting"}</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground max-w-md">
            Captains and organizers: use <strong className="text-foreground">Match console</strong> for check-in, score submission, and disputes.
          </p>
        </div>
      </motion.div>

      {showResultPortal && (
        <div className="p-8 rounded-[2rem] bg-white/5 border border-primary/20 backdrop-blur-xl space-y-6">
          <h2 className="text-xl font-black uppercase italic text-primary">Submit intelligence</h2>
          <p className="text-[11px] text-muted-foreground">
            Both teams must report the <strong className="text-foreground">same</strong> score (side A vs side B as shown above). Mismatch opens a dispute.
          </p>
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-6 md:gap-8">
            <div className="flex-1 space-y-2">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Your score (side A)</Label>
              <Input
                type="number"
                min={0}
                className="h-16 text-center text-3xl font-black italic bg-black/40"
                value={scoreA}
                onChange={(e) => setScoreA(e.target.value)}
              />
            </div>
            <span className="text-2xl font-black italic text-slate-600 text-center hidden md:block">VS</span>
            <div className="flex-1 space-y-2">
              <Label className="text-[10px] uppercase font-bold text-slate-500">Opponent score (side B)</Label>
              <Input
                type="number"
                min={0}
                className="h-16 text-center text-3xl font-black italic bg-black/40"
                value={scoreB}
                onChange={(e) => setScoreB(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-slate-500">POV / proof link (optional)</Label>
            <Input
              className="bg-black/30 border-white/10"
              placeholder="https://…"
              value={povLink}
              onChange={(e) => setPovLink(e.target.value)}
            />
          </div>
          <div className="border-2 border-dashed border-white/10 rounded-2xl p-6 text-center space-y-3">
            <Upload className="mx-auto h-8 w-8 text-slate-600" />
            <p className="text-[10px] font-black uppercase text-slate-500">Screenshots (upload or paste URL)</p>
            <Input
              type="file"
              accept="image/*"
              multiple
              className="bg-black/30 border-white/10 max-w-md mx-auto text-xs"
              onChange={(e) => setShotFiles(Array.from(e.target.files || []).slice(0, 8))}
            />
            {shotFiles.length > 0 && (
              <p className="text-[10px] text-slate-400">{shotFiles.length} file(s) selected</p>
            )}
            <Input
              className="bg-black/30 border-white/10 max-w-md mx-auto"
              placeholder="Or paste image URL https://…"
              value={shotUrl}
              onChange={(e) => setShotUrl(e.target.value)}
            />
          </div>
          <Button
            type="button"
            className="w-full h-14 bg-primary font-black uppercase italic rounded-xl"
            disabled={reportMutation.isPending || scoreA === "" || scoreB === ""}
            onClick={() => reportMutation.mutate()}
          >
            {reportMutation.isPending ? "Transmitting…" : "Transmit results"}
          </Button>
        </div>
      )}

      {/* Stream */}
      {match.tournament_id && (
        <div className="space-y-3">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-red-400" /> Broadcast
          </h2>
          <div className="rounded-2xl overflow-hidden border border-white/10">
            <MatchStreamEmbed tournamentId={match.tournament_id} preferStreamUrl={match.stream_url} />
            {!match.stream_url && !tournament?.stream_url && (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground border-t border-dashed border-border/50 bg-secondary/10">
                No stream URL yet. Link one from the match or tournament console.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lobby chat */}
      <div className="space-y-3">
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">Lobby chat</h2>
        <div className="rounded-2xl border border-white/10 overflow-hidden min-h-[280px]">
          <MatchChat matchId={matchId} tenantId={tenantId} />
        </div>
      </div>
    </div>
  );
}
