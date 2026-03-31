import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/lib/AuthContext";
import { isTournamentJoinIntent, tournamentJoinReturnPath } from "@/lib/tournamentJoinIntent";
import moment from "moment";
import { toast } from "sonner";
import { 
  ArrowLeft, Play, Users, Trophy, Calendar, DollarSign, 
  Settings2, Trash2, UserPlus, Building2, Clock, 
  Share2, LayoutDashboard, Zap, Activity, ExternalLink,   Radio,
  BarChart3, Upload,
} from "lucide-react";

// Components
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import StatusBadge from "../components/shared/StatusBadge";
import BracketView from "../components/tournament/BracketView";
import TeamsList from "../components/tournament/TeamsList";
import SponsorBar from "../components/tournament/SponsorBar";
import PrizeDistribution from "../components/tournament/PrizeDistribution";
import BracketEditor from "../components/tournament/BracketEditor";
import TournamentJoinModal from "@/components/tournament/TournamentJoinModal";
import InsightsNode from "@/components/insights/InsightsNode";
import TournamentViewershipPanel from "@/components/insights/TournamentViewershipPanel";
import TournamentPickEm from "@/components/tournament/TournamentPickEm";
import { formatPrizeCardLine, formatPrizeDetailLines } from "@/lib/prizeDisplay";

// Logic Engines (Preserved)
import { generateSingleElimination, generateDoubleElimination, generateRoundRobin, generateSwiss } from "../lib/bracketEngines";
import { linkBracketMatches } from "../lib/bracketAdvancement";

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const [bracketEditMode, setBracketEditMode] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const editBannerFileRef = useRef(null);
  const paymentReturnToastShown = useRef(false);
  const joinIntentConsumed = useRef(false);

  useEffect(() => {
    joinIntentConsumed.current = false;
  }, [id]);

  /** Logged-out visitor with ?join=1 (e.g. shared link) — send to sign-in, then return here with join intent. */
  useEffect(() => {
    if (!id || isLoadingAuth || isAuthenticated) return;
    if (!isTournamentJoinIntent(searchParams)) return;
    maxikay.auth.redirectToLogin(tournamentJoinReturnPath(id));
  }, [id, isLoadingAuth, isAuthenticated, searchParams]);

  useEffect(() => {
    if (!id || paymentReturnToastShown.current) return;
    const sp = new URLSearchParams(window.location.search);
    const ref = sp.get("session_id") || sp.get("reference") || sp.get("trxref") || sp.get("tx_ref");
    if (!ref) return;
    paymentReturnToastShown.current = true;
    toast.message("Payment Detected", { description: "Open Discover → Join to complete registration.", duration: 8000 });
  }, [id]);

  const { data: tournamentRows, isLoading: loadingCrudTournament } = useQuery({
    queryKey: ["tournament", id],
    queryFn: async () => {
      try {
        return await maxikay.entities.Tournament.filter({ id });
      } catch {
        return [];
      }
    },
    enabled: !!id,
  });

  const crudResolved = !!id && !loadingCrudTournament;
  const hasCrudTournament = !!(tournamentRows?.length);

  const { data: publicTournament, isLoading: loadingPublicTournament } = useQuery({
    queryKey: ["public-tournament", id],
    queryFn: () => maxikay.public.tournamentById(id).catch(() => null),
    enabled: !!id && crudResolved && !hasCrudTournament,
    retry: false,
  });

  const tournamentCrud = tournamentRows?.[0];
  const tournament = tournamentCrud ?? publicTournament ?? null;

  const isLoading =
    !!id &&
    !tournament &&
    (loadingCrudTournament || (!tournamentCrud && loadingPublicTournament));

  const { data: matchesCrud = [] } = useQuery({
    queryKey: ["tournament-matches", id],
    queryFn: () => maxikay.entities.Match.filter({ tournament_id: id }),
    enabled: !!id && hasCrudTournament,
  });

  const { data: matchesPublic = [] } = useQuery({
    queryKey: ["public-tournament-matches", id],
    queryFn: () => maxikay.public.tournamentMatches(id).catch(() => []),
    enabled: !!id && crudResolved && !!tournament && !hasCrudTournament,
  });

  const matches = hasCrudTournament ? matchesCrud : matchesPublic;

  const { data: teamsCrud = [] } = useQuery({
    queryKey: ["tournament-teams", id],
    queryFn: () => maxikay.entities.Team.filter({ tournament_id: id }),
    enabled: !!id && hasCrudTournament,
  });

  const { data: teamsPublic = [] } = useQuery({
    queryKey: ["public-tournament-teams", id],
    queryFn: () => maxikay.public.tournamentTeams(id).catch(() => []),
    enabled: !!id && crudResolved && !!tournament && !hasCrudTournament,
  });

  const teams = hasCrudTournament ? teamsCrud : teamsPublic;

  const { data: performanceData } = useQuery({
    queryKey: ["public-tournament-performance", id],
    queryFn: () => maxikay.public.tournamentPerformance(id).catch(() => null),
    enabled: !!id && crudResolved && !!tournament && !hasCrudTournament,
  });

  const showLeagueTab =
    !!tournament && (tournament.format === "round_robin" || tournament.format === "swiss");

  const { data: leagueStandingsRes } = useQuery({
    queryKey: ["public-tournament-league-standings", id],
    queryFn: () => maxikay.public.tournamentLeagueStandings(id).catch(() => null),
    enabled: !!id && crudResolved && showLeagueTab && !hasCrudTournament,
  });

  useEffect(() => {
    if (!hasCrudTournament) setBracketEditMode(false);
  }, [hasCrudTournament]);

  useEffect(() => {
    if (
      !id ||
      joinIntentConsumed.current ||
      !isTournamentJoinIntent(searchParams) ||
      !isAuthenticated ||
      isLoadingAuth ||
      !tournament
    ) {
      return;
    }
    joinIntentConsumed.current = true;
    setJoinModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("join");
    const qs = next.toString();
    navigate(qs ? `/tournaments/${id}?${qs}` : `/tournaments/${id}`, { replace: true });
  }, [id, searchParams, isAuthenticated, isLoadingAuth, tournament, navigate]);

  const openJoinFlow = () => {
    if (isLoadingAuth) return;
    if (!isAuthenticated) {
      maxikay.auth.redirectToLogin(tournamentJoinReturnPath(id));
      return;
    }
    setJoinModalOpen(true);
  };

  // LOGIC: MUTATIONS (Preserved exactly)
  const generateBracket = useMutation({
    mutationFn: async () => {
      if (teams.length < 2) return;
      const format = tournament.format || "single_elimination";
      let matchesToCreate;
      if (format === "double_elimination") matchesToCreate = generateDoubleElimination(teams, id, tenantId);
      else if (format === "round_robin") matchesToCreate = generateRoundRobin(teams, id, tenantId);
      else if (format === "swiss") matchesToCreate = generateSwiss(teams, id, tenantId);
      else matchesToCreate = generateSingleElimination(teams, id, tenantId);
      
      await maxikay.entities.Match.bulkCreate(matchesToCreate);
      await linkBracketMatches(id);
      await maxikay.entities.Tournament.update(id, { status: "in_progress" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament", id] });
      queryClient.invalidateQueries({ queryKey: ["tournament-matches", id] });
      queryClient.invalidateQueries({ queryKey: ["public-tournament-matches", id] });
      queryClient.invalidateQueries({ queryKey: ["public-tournament-performance", id] });
    },
  });

  const deleteTournament = useMutation({
    mutationFn: () => maxikay.entities.Tournament.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      navigate("/tournaments");
      toast.success("Tournament removed");
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Could not delete"),
  });

  const canFinalizeTournament = useMemo(() => {
    if (!hasCrudTournament || !tournament || String(tournament.status) === "completed") return false;
    if (!matches?.length) return false;
    const terminal = ["completed", "forfeited", "no_show"];
    if (!matches.every((m) => terminal.includes(String(m.status)))) return false;
    if (matches.some((m) => String(m.status) === "under_dispute")) return false;
    return true;
  }, [hasCrudTournament, tournament, matches]);

  const isPlatformAdmin = user?.role === "admin" || user?.role === "super_admin";
  const showFinalizeOverride = useMemo(
    () =>
      isPlatformAdmin &&
      hasCrudTournament &&
      tournament &&
      String(tournament.status) !== "completed" &&
      (matches?.length ?? 0) > 0 &&
      !canFinalizeTournament,
    [isPlatformAdmin, hasCrudTournament, tournament, matches, canFinalizeTournament]
  );

  const onFinalizeSuccess = (data) => {
    toast.success(
      data?.finalize_override_applied
        ? "Tournament finalized with platform override — integrity checks skipped; audit log recorded."
        : "Tournament finalized — prize job queued"
    );
    queryClient.invalidateQueries({ queryKey: ["tournament", id] });
    queryClient.invalidateQueries({ queryKey: ["tournament-matches", id] });
  };
  const onFinalizeError = (e) => toast.error(e?.data?.error || e?.message || "Could not finalize");

  const finalizeTournament = useMutation({
    mutationFn: () => maxikay.matchEngine.finalizeTournament(id, {}),
    onSuccess: onFinalizeSuccess,
    onError: onFinalizeError,
  });
  const finalizeTournamentOverride = useMutation({
    mutationFn: () => maxikay.matchEngine.finalizeTournament(id, { finalize_override: true }),
    onSuccess: onFinalizeSuccess,
    onError: onFinalizeError,
  });
  const finalizePending = finalizeTournament.isPending || finalizeTournamentOverride.isPending;

  const updatePrizeTbd = useMutation({
    mutationFn: (prize_disclosure_tbd) => maxikay.entities.Tournament.update(id, { prize_disclosure_tbd }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament", id] });
      queryClient.invalidateQueries({ queryKey: ["public-tournament", id] });
      queryClient.invalidateQueries({ queryKey: ["discovery-catalog"] });
      toast.success("Prize disclosure updated");
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Could not update"),
  });

  const updateTournament = useMutation({
    mutationFn: (patch) => maxikay.entities.Tournament.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament", id] });
      queryClient.invalidateQueries({ queryKey: ["public-tournament", id] });
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["discovery-catalog"] });
      toast.success("Tournament updated");
      setEditOpen(false);
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Could not update tournament"),
  });

  const toLocalInput = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      const tzOffset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    } catch {
      return "";
    }
  };

  const fromLocalInput = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString();
  };

  useEffect(() => {
    if (!editOpen) return;
    if (!tournament) return;
    setEditForm({
      name: tournament.name || "",
      status: tournament.status || "draft",
      currency: (tournament.currency || "USD").toUpperCase().slice(0, 8),
      prize_pool: Number(tournament.prize_pool || 0),
      entry_type: tournament.entry_type === "PAID" ? "PAID" : "FREE",
      entry_fee: Number(tournament.entry_fee || 0),
      max_teams: Number(tournament.max_teams || 8),
      registration_deadline: toLocalInput(tournament.registration_deadline),
      start_date: toLocalInput(tournament.start_date),
      end_date: toLocalInput(tournament.end_date),
      banner_url: tournament.banner_url || "",
      stream_url: tournament.stream_url || "",
      description: tournament.description || "",
      rules: tournament.rules || "",
    });
  }, [editOpen, tournament]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#0a0a0f] text-slate-50">
        <div className="border-b border-white/5 px-4 py-3">
          <Button variant="ghost" asChild className="text-slate-400 hover:text-white -ml-2">
            <Link to="/tournaments" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to tournaments
            </Link>
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4 py-32 text-slate-500">
        <Button variant="outline" asChild className="border-white/10 bg-white/5 text-slate-200">
          <Link to="/tournaments" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to tournaments
          </Link>
        </Button>
        <p className="font-black italic uppercase tracking-wider">Sector Not Found</p>
      </div>
    );
  }

  const liveMainEmbedSrc = tournament.stream_url ? streamEmbedFromUrl(tournament.stream_url) : null;

  return (
    <div className="max-w-7xl mx-auto space-y-8 px-4 py-8 pb-32 font-sans text-slate-50 selection:bg-primary/30">
      <div className="sticky top-0 z-40 -mx-4 flex items-center border-b border-white/10 bg-[#0a0a0f]/90 px-4 py-2 backdrop-blur-md sm:hidden">
        <Button variant="ghost" size="sm" asChild className="text-slate-400 hover:text-white -ml-2 gap-2 font-bold uppercase text-[10px] tracking-widest">
          <Link to="/tournaments">
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Back to tournaments
          </Link>
        </Button>
      </div>

      {/* 1. CINEMATIC HEADER */}
      <header className="relative p-10 rounded-[3rem] bg-white/[0.02] border border-white/5 overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32" />
        
        <div className="flex flex-col lg:flex-row justify-between gap-8 relative z-10">
          <div className="space-y-4">
            <Button variant="ghost" asChild className="text-slate-500 hover:text-white -ml-2 group hidden sm:inline-flex">
              <Link to="/tournaments" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Back to tournaments
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-4">
              <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">
                {tournament.name}
              </h1>
              <StatusBadge status={tournament.status} className="h-8 px-4 text-[10px] font-black italic" />
            </div>
            <div className="flex items-center gap-6 text-slate-400">
               <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-widest">
                  <Activity className="h-4 w-4 text-primary" /> {tournament.game_title || 'Universal Title'}
               </div>
               <div className="h-1 w-1 bg-slate-700 rounded-full" />
               <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-widest">
                  <LayoutDashboard className="h-4 w-4 text-primary" /> {tournament.format?.replace(/_/g, " ")}
               </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start lg:self-center">
             <Button variant="outline" className="rounded-xl border-white/10 bg-white/5 font-black uppercase italic" onClick={() => navigate(`/tournaments/${id}/lobby`)}>
                Player Lobby
             </Button>
             {hasCrudTournament && tournament.status === "draft" && (
               <Button
                 onClick={() => updateTournament.mutate({ status: "registration_open" })}
                 className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 rounded-xl font-black uppercase italic px-6"
               >
                 Publish
               </Button>
             )}
             {hasCrudTournament && (tournament.status === "draft" || tournament.status === "registration_closed") && teams.length >= 2 && (
               <Button onClick={() => generateBracket.mutate()} className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 rounded-xl font-black uppercase italic px-6">
                 <Zap className="mr-2 h-4 w-4" /> Start Bracket
               </Button>
             )}
             <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(window.location.href)} className="rounded-xl bg-white/5">
                <Share2 className="h-4 w-4" />
             </Button>
             {hasCrudTournament && (
             <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-[#0A0A0A] border-white/10 text-white">
                <AlertDialogHeader><AlertDialogTitle className="font-black italic uppercase">Delete Tournament?</AlertDialogTitle></AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-white/5 border-white/10">Abort</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteTournament.mutate()} className="bg-red-600">Erase Data</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
             )}
          </div>
        </div>
      </header>

      <SponsorBar tournamentId={id} tenantId={tenantId || tournament?.tenant_id} />

      {/* 2. DATA GRID — high-density insights tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <InsightsNode icon={Users} label="Participation" value={`${teams.length} / ${tournament.max_teams}`} sub="Active teams" />
        <InsightsNode icon={Trophy} label="Format" value={(tournament.format || "single elimination").replace(/_/g, " ")} sub="Ruleset" />
        <InsightsNode icon={Calendar} label="Commencement" value={tournament.start_date ? moment(tournament.start_date).format("MMM D, LT") : "Pending"} sub="Start time" />
        <InsightsNode
          icon={DollarSign}
          label="Prize pool"
          value={`${tournament.currency || "USD"} ${Number(tournament.prize_pool || 0).toLocaleString()}`}
          sub={formatPrizeCardLine(tournament)}
        />
      </div>

      <div className="p-6 md:p-8 rounded-[2rem] bg-white/5 border border-primary/20 space-y-3" aria-label="Prize pool and placements">
        <h3 className="text-sm font-black uppercase italic tracking-widest text-primary flex items-center gap-2">
          <Trophy className="h-4 w-4" /> Prize pool &amp; placements
        </h3>
        <p className="text-xs text-muted-foreground">
          Entry: {tournament.entry_fee > 0 ? `${tournament.currency || "USD"} ${tournament.entry_fee} ${tournament.entry_type === "PAID" ? "(paid)" : ""}` : "Free"} ·{" "}
          {tournament.currency || "USD"}
        </p>
        <ul className="text-sm text-foreground/90 space-y-1 list-disc list-inside">
          {formatPrizeDetailLines(tournament).length ? (
            formatPrizeDetailLines(tournament).map((line) => (
              <li key={line}>
                <span className="sr-only">Placement line: </span>
                {line}
              </li>
            ))
          ) : (
            <li>
              <span className="sr-only">Prize summary: </span>
              {formatPrizeCardLine(tournament)}
            </li>
          )}
        </ul>
        {hasCrudTournament && tournament.status !== "completed" && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={!!tournament.prize_disclosure_tbd}
              disabled={updatePrizeTbd.isPending}
              onChange={(e) => updatePrizeTbd.mutate(e.target.checked)}
            />
            <span>Prize TBD / sponsor-provided (discovery listing)</span>
          </label>
        )}
        {tournament.status === "completed" && tournament.payout_job_status && (
          <p className="text-[10px] text-muted-foreground mt-2" aria-live="polite">
            <span className="font-semibold text-foreground">Payout job status:</span> {tournament.payout_job_status}
          </p>
        )}
        {hasCrudTournament && canFinalizeTournament && (
          <div className="pt-4 border-t border-white/10">
            <Button
              type="button"
              className="font-black uppercase italic rounded-xl"
              disabled={finalizePending}
              onClick={() => finalizeTournament.mutate()}
            >
              Finalize tournament
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2">
              Locks results and runs prize payouts (wallet credits, ledger, feed) when a prize structure is configured.
            </p>
          </div>
        )}
        {showFinalizeOverride && (
          <div className="pt-4 border-t border-red-500/20">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  className="font-black uppercase italic rounded-xl bg-red-600/90 hover:bg-red-600"
                  disabled={finalizePending}
                >
                  Finalize (platform override)
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-[#0A0A0A] border-red-500/30 text-white max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-black italic uppercase text-red-400">
                    Platform finalize override
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-300 text-sm leading-relaxed">
                    This bypasses checks that all matches are terminal and that there are no open disputes. Prize
                    validation still runs. Use only after manual resolution. An audit log entry is written.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-white/10 border-white/20 text-white">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => finalizeTournamentOverride.mutate()}
                  >
                    Confirm override
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <p className="text-[10px] text-red-400/80 mt-2">
              Visible to platform administrators only — for blocked finalizes (incomplete bracket or disputes).
            </p>
          </div>
        )}
      </div>

      {/* 3. ABOUT & ACTION */}
      <div className="p-8 rounded-[2rem] bg-white/5 border border-white/10 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
            <Building2 className="h-4 w-4" /> Organized By <span className="text-white">{tournament.organizer_name || 'Arena Host'}</span>
          </div>
          <p className="text-slate-400 font-medium leading-relaxed max-w-3xl italic">
            {tournament.description || "The arena awaits. Join the ranks of legends in this seasonal showdown."}
          </p>
          {tournament.registration_deadline && (
            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-primary">
              <Clock className="h-3 w-3" /> Registration Ends {moment(tournament.registration_deadline).fromNow()}
            </div>
          )}
        </div>
        
        {hasCrudTournament && (
          <div className="w-full md:w-auto shrink-0 flex flex-col items-stretch md:items-end gap-3">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-white/10 bg-white/5 text-slate-200 font-black uppercase italic h-12 px-6"
                >
                  <Settings2 className="h-4 w-4 mr-2" /> Edit tournament
                </Button>
              </DialogTrigger>
              <DialogContent className="glass border-border/50 max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-black italic uppercase">Edit tournament</DialogTitle>
                  <DialogDescription>
                    Update your tournament details. Publishing sets status to registration open so players can see it in Discover.
                  </DialogDescription>
                </DialogHeader>

                {!editForm ? null : (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const patch = {
                        name: editForm.name?.trim() || undefined,
                        status: editForm.status,
                        currency: String(editForm.currency || "USD").toUpperCase().slice(0, 8),
                        prize_pool: Number(editForm.prize_pool || 0),
                        entry_type: editForm.entry_type === "PAID" ? "PAID" : "FREE",
                        entry_fee: editForm.entry_type === "PAID" ? Number(editForm.entry_fee || 0) : 0,
                        max_teams: Math.max(2, Number(editForm.max_teams || 2)),
                        registration_deadline: editForm.registration_deadline
                          ? fromLocalInput(editForm.registration_deadline)
                          : undefined,
                        start_date: editForm.start_date ? fromLocalInput(editForm.start_date) : undefined,
                        end_date: editForm.end_date ? fromLocalInput(editForm.end_date) : undefined,
                        banner_url: editForm.banner_url?.trim() || undefined,
                        stream_url: editForm.stream_url?.trim() || undefined,
                        description: editForm.description || "",
                        rules: editForm.rules || "",
                      };
                      // remove undefined so PATCH only touches set fields
                      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
                      if (patch.entry_type === "PAID") {
                        const fee = Number(patch.entry_fee);
                        if (!Number.isFinite(fee) || fee <= 0) {
                          toast.error("Paid tournaments require entry fee > 0");
                          return;
                        }
                      }
                      updateTournament.mutate(patch);
                    }}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <Label>Name</Label>
                        <Input
                          className="mt-1 bg-secondary/50"
                          value={editForm.name}
                          onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                        />
                      </div>

                      <div>
                        <Label>Status</Label>
                        <Select
                          value={editForm.status}
                          onValueChange={(v) => setEditForm((p) => ({ ...p, status: v }))}
                        >
                          <SelectTrigger className="mt-1 bg-secondary/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft (organizer only)</SelectItem>
                            <SelectItem value="registration_open">Published (registration open)</SelectItem>
                            <SelectItem value="registration_closed">Registration closed</SelectItem>
                            <SelectItem value="in_progress">In progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Currency</Label>
                        <Input
                          className="mt-1 bg-secondary/50"
                          value={editForm.currency}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 8) }))
                          }
                        />
                      </div>

                      <div>
                        <Label>Prize pool</Label>
                        <Input
                          type="number"
                          min={0}
                          className="mt-1 bg-secondary/50"
                          value={editForm.prize_pool}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, prize_pool: parseFloat(e.target.value) || 0 }))
                          }
                        />
                      </div>

                      <div>
                        <Label>Max teams</Label>
                        <Input
                          type="number"
                          min={2}
                          className="mt-1 bg-secondary/50"
                          value={editForm.max_teams}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, max_teams: parseInt(e.target.value, 10) || 2 }))
                          }
                        />
                      </div>

                      <div>
                        <Label>Entry type</Label>
                        <Select
                          value={editForm.entry_type}
                          onValueChange={(v) =>
                            setEditForm((p) => ({
                              ...p,
                              entry_type: v === "PAID" ? "PAID" : "FREE",
                              entry_fee: v === "PAID" ? p.entry_fee : 0,
                            }))
                          }
                        >
                          <SelectTrigger className="mt-1 bg-secondary/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="FREE">Free entry</SelectItem>
                            <SelectItem value="PAID">Paid entry</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Entry fee</Label>
                        <Input
                          type="number"
                          min={0}
                          className="mt-1 bg-secondary/50"
                          disabled={editForm.entry_type !== "PAID"}
                          value={editForm.entry_fee}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, entry_fee: parseFloat(e.target.value) || 0 }))
                          }
                        />
                      </div>

                      <div>
                        <Label>Registration deadline</Label>
                        <Input
                          type="datetime-local"
                          className="mt-1 bg-secondary/50"
                          value={editForm.registration_deadline}
                          onChange={(e) => setEditForm((p) => ({ ...p, registration_deadline: e.target.value }))}
                        />
                      </div>

                      <div>
                        <Label>Start date</Label>
                        <Input
                          type="datetime-local"
                          className="mt-1 bg-secondary/50"
                          value={editForm.start_date}
                          onChange={(e) => setEditForm((p) => ({ ...p, start_date: e.target.value }))}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Label>Banner URL</Label>
                        <div className="flex flex-col sm:flex-row gap-2 mt-1">
                          <Input
                            className="bg-secondary/50 flex-1"
                            value={editForm.banner_url}
                            onChange={(e) => setEditForm((p) => ({ ...p, banner_url: e.target.value }))}
                            placeholder="https://… or upload (dev: data URL)"
                          />
                          <input
                            ref={editBannerFileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              if (f.size > 15 * 1024 * 1024) {
                                toast.error("File too large (max 15MB)");
                                return;
                              }
                              try {
                                const out = await maxikay.integrations.Core.UploadFile({ file: f });
                                if (out?.file_url) {
                                  setEditForm((p) => ({ ...p, banner_url: out.file_url }));
                                  toast.success("Banner uploaded");
                                } else {
                                  toast.error("Upload did not return a file URL");
                                }
                              } catch (err) {
                                toast.error(err?.message || "Upload failed");
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 shrink-0"
                            onClick={() => editBannerFileRef.current?.click()}
                          >
                            <Upload className="w-3.5 h-3.5" /> Upload
                          </Button>
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <Label>Stream URL</Label>
                        <Input
                          className="mt-1 bg-secondary/50"
                          value={editForm.stream_url}
                          onChange={(e) => setEditForm((p) => ({ ...p, stream_url: e.target.value }))}
                          placeholder="https://youtube.com/... or https://twitch.tv/..."
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Label>Description</Label>
                        <Textarea
                          rows={3}
                          className="mt-1 bg-secondary/50"
                          value={editForm.description}
                          onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Label>Rules</Label>
                        <Textarea
                          rows={4}
                          className="mt-1 bg-secondary/50"
                          value={editForm.rules}
                          onChange={(e) => setEditForm((p) => ({ ...p, rules: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="ghost" onClick={() => setEditOpen(false)} disabled={updateTournament.isPending}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={updateTournament.isPending} className="font-display text-xs tracking-wider">
                        {updateTournament.isPending ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  </form>
                )}
              </DialogContent>
            </Dialog>
          </div>
        )}

        {tournament.status === "registration_open" && (
          <div className="w-full md:w-auto shrink-0 flex flex-col items-stretch md:items-end gap-3">
            <button
              type="button"
              onClick={openJoinFlow}
              className="group relative isolate overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary via-primary to-cyan-500 px-10 py-7 text-left shadow-[0_8px_40px_-8px_rgba(0,212,255,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset] transition-all duration-300 hover:shadow-[0_12px_48px_-8px_rgba(0,212,255,0.7)] hover:border-primary/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f] active:scale-[0.98] md:min-w-[280px]"
            >
              <span
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.22),_transparent_55%)] opacity-90 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
              <span className="relative flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-black/20 ring-1 ring-white/15 backdrop-blur-sm">
                  <UserPlus className="h-7 w-7 text-white drop-shadow-sm" strokeWidth={2.25} />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-black uppercase italic tracking-tight text-white text-lg sm:text-xl leading-tight drop-shadow-sm">
                    Register to compete
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                    Solo or team · Sign in to finish
                  </span>
                </span>
              </span>
            </button>
            <p className="text-center md:text-right text-[10px] font-medium uppercase tracking-wider text-slate-500 max-w-[320px] md:ml-auto leading-relaxed">
              Secure checkout when there is an entry fee. You can review details in the next step.
            </p>
          </div>
        )}
      </div>

      {/* 4. MAIN TABS (Bracket, Live, Teams) */}
      <Tabs defaultValue={matches.length > 0 ? "bracket" : "teams"} className="space-y-6">
        <TabsList className="bg-white/5 border border-white/10 h-14 p-1 rounded-2xl">
          <TabTrigger value="bracket">Tournament Bracket</TabTrigger>
          <TabTrigger value="teams">Roster ({teams.length})</TabTrigger>
          <TabTrigger value="pickem">Pick &apos;Em</TabTrigger>
          <TabTrigger value="live" className="gap-2">
            {tournament.status === "in_progress" && <span className="h-2 w-2 rounded-full bg-red-600 animate-ping" />} Live Broadcast
          </TabTrigger>
          <TabTrigger value="analytics">Performance</TabTrigger>
          {showLeagueTab ? <TabTrigger value="league">League table</TabTrigger> : null}
          <TabTrigger value="insights" className="gap-2">
            <BarChart3 className="h-3.5 w-3.5 opacity-80" /> Stats &amp; insights
          </TabTrigger>
          <TabTrigger value="info">Rules & Intel</TabTrigger>
        </TabsList>

        <TabsContent value="bracket" className="space-y-6">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black italic uppercase tracking-tighter">Current Standings</h3>
              {hasCrudTournament && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setBracketEditMode(!bracketEditMode)} className={`rounded-xl border-white/10 h-10 italic font-black uppercase ${bracketEditMode ? 'bg-primary border-primary' : ''}`}>
                   <Settings2 className="mr-2 h-4 w-4" /> {bracketEditMode ? "Lock Bracket" : "Edit Seeding"}
                </Button>
              </div>
              )}
           </div>
           
           <div className="rounded-[3rem] bg-white/[0.02] border border-white/5 p-8 min-h-[500px]">
              {bracketEditMode ? (
                <BracketEditor matches={matches} teams={teams} tournamentId={id} onClose={() => setBracketEditMode(false)} />
              ) : (
                <BracketView matches={matches} tournamentId={id} />
              )}
           </div>
        </TabsContent>

        <TabsContent value="teams">
           <TeamsList teams={teams} tournamentId={id} tournament={tournament} />
        </TabsContent>

        <TabsContent value="pickem" className="p-8 rounded-[2rem] bg-white/[0.03] border border-white/10">
          <TournamentPickEm tournamentId={id} tournamentTenantId={tournament?.tenant_id} />
        </TabsContent>

        <TabsContent value="live" className="space-y-8 p-8 rounded-[2rem] bg-white/5 border border-white/10">
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 text-red-500" />
            <h3 className="text-xl font-black italic uppercase tracking-tighter">Live broadcast</h3>
          </div>
          {tournament.stream_url ? (
            <div className="space-y-4">
              {liveMainEmbedSrc ? (
                <div className="aspect-video w-full max-w-4xl rounded-2xl overflow-hidden border border-white/10 bg-black">
                  <iframe
                    title="Tournament stream"
                    src={liveMainEmbedSrc}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : null}
              <a
                href={tournament.stream_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-bold uppercase text-primary"
              >
                <ExternalLink className="h-4 w-4" /> Open stream
              </a>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No main broadcast URL yet. Organizers can set this when creating or editing the tournament (stream URL).
            </p>
          )}
          {matches.filter((m) => m.stream_url).length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-primary">Match streams</h4>
              <ul className="space-y-2">
                {matches
                  .filter((m) => m.stream_url)
                  .map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                      <span className="font-mono text-xs text-slate-500">
                        R{m.round} · M{m.match_number}
                      </span>
                      <span>
                        {(m.team_a_name || 'TBD')} <span className="text-slate-600">vs</span> {(m.team_b_name || 'TBD')}
                      </span>
                      <a
                        href={m.stream_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary"
                      >
                        <Play className="h-3 w-3" /> Watch
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="league" className="space-y-6 p-8 rounded-[2rem] bg-white/5 border border-white/10">
          <h3 className="text-xl font-black italic uppercase tracking-tighter">League standings</h3>
          <p className="text-xs text-slate-500">
            Win 3 pts · Draw 1 pt · Loss 0. Updated when results are finalized on completed matches.
          </p>
          {!leagueStandingsRes ? (
            <p className="text-sm text-slate-500">Loading table…</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <th className="p-3">#</th>
                    <th className="p-3">Team</th>
                    <th className="p-3">P</th>
                    <th className="p-3">W</th>
                    <th className="p-3">D</th>
                    <th className="p-3">L</th>
                    <th className="p-3">GF</th>
                    <th className="p-3">GA</th>
                    <th className="p-3">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {(leagueStandingsRes.standings || []).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-500">
                        No completed matches yet — table fills as games finish.
                      </td>
                    </tr>
                  ) : (
                    (leagueStandingsRes.standings || []).map((row, idx) => (
                      <tr key={row.team_id || idx} className="border-b border-white/5">
                        <td className="p-3 text-slate-500">{idx + 1}</td>
                        <td className="p-3 font-medium text-white">{row.team_name || row.team_id}</td>
                        <td className="p-3">{row.played ?? 0}</td>
                        <td className="p-3">{row.wins ?? 0}</td>
                        <td className="p-3">{row.draws ?? 0}</td>
                        <td className="p-3">{row.losses ?? 0}</td>
                        <td className="p-3">{row.goals_for ?? 0}</td>
                        <td className="p-3">{row.goals_against ?? 0}</td>
                        <td className="p-3 font-bold text-primary">{row.points ?? 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-8 p-8 rounded-[2rem] bg-white/[0.03] border border-white/10">
          <TournamentViewershipPanel
            tournamentId={String(tournament.id)}
            streamUrl={tournament.stream_url}
            gameTitle={tournament.game_title}
          />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-8 p-8 rounded-[2rem] bg-white/5 border border-white/10">
          <h3 className="text-xl font-black italic uppercase tracking-tighter">Performance</h3>
          {!performanceData ? (
            <p className="text-sm text-slate-500">Loading standings…</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <th className="p-3">Team</th>
                      <th className="p-3">W</th>
                      <th className="p-3">L</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(performanceData.teams || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-500">
                          No team results yet.
                        </td>
                      </tr>
                    ) : (
                      (performanceData.teams || []).map((t) => (
                        <tr key={t.id} className="border-b border-white/5">
                          <td className="p-3 font-medium text-white">
                            {t.name} <span className="text-slate-500">[{t.tag}]</span>
                          </td>
                          <td className="p-3">{t.wins ?? 0}</td>
                          <td className="p-3">{t.losses ?? 0}</td>
                          <td className="p-3 text-slate-400">{t.status || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {(performanceData.top_players || []).length > 0 && (
                <div>
                  <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-primary">Player highlights (K/D/A)</h4>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <th className="p-3">Player</th>
                          <th className="p-3">K</th>
                          <th className="p-3">D</th>
                          <th className="p-3">A</th>
                          <th className="p-3">Won</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(performanceData.top_players || []).map((p, i) => (
                          <tr key={`${p.player_email || 'p'}-${i}`} className="border-b border-white/5">
                            <td className="p-3 text-white">{p.player_name || p.player_email || '—'}</td>
                            <td className="p-3">{p.kills ?? 0}</td>
                            <td className="p-3">{p.deaths ?? 0}</td>
                            <td className="p-3">{p.assists ?? 0}</td>
                            <td className="p-3 text-slate-400">{p.won ? 'Yes' : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="info" className="p-10 rounded-[2rem] bg-white/5 border border-white/10">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              <div className="space-y-4">
                 <h4 className="text-xs font-black uppercase tracking-widest text-primary">Tournament Rules</h4>
                 <p className="text-sm text-slate-400 whitespace-pre-wrap leading-loose font-medium">{tournament.rules || "Standard league rules apply."}</p>
              </div>
              <div className="space-y-4">
                 <h4 className="text-xs font-black uppercase tracking-widest text-primary">Payout Structure</h4>
                 <PrizeDistribution tournament={tournament} matches={matches} teams={teams} tenantId={tenantId || tournament?.tenant_id} />
              </div>
              {tournament.stream_url ? (
                <div className="space-y-2 md:col-span-2">
                  <h4 className="text-xs font-black uppercase tracking-widest text-primary">Official broadcast link</h4>
                  <a href={tournament.stream_url} className="break-all text-sm text-cyan-400 hover:underline" target="_blank" rel="noreferrer">
                    {tournament.stream_url}
                  </a>
                </div>
              ) : null}
              {tournament.organizer_slug ? (
                <div className="space-y-2 md:col-span-2">
                  <h4 className="text-xs font-black uppercase tracking-widest text-primary">Organizer</h4>
                  <p className="text-sm text-slate-400">
                    {tournament.organizer_name}{' '}
                    <span className="text-slate-600">(@{tournament.organizer_slug})</span>
                  </p>
                </div>
              ) : null}
           </div>
        </TabsContent>
      </Tabs>

      {/* 5. JOIN MODAL (Preserved Logic) */}
      {joinModalOpen && (
        <TournamentJoinModal
          tournament={tournament}
          onClose={() => setJoinModalOpen(false)}
          extraInvalidateQueryKeys={[
            ["tournament", id],
            ["tournament-teams", id],
            ["public-tournament", id],
            ["public-tournament-teams", id],
            ["public-tournament-matches", id],
            ["public-tournament-performance", id],
            ["public-tournament-league-standings", id],
          ]}
        />
      )}
    </div>
  );
}

function streamEmbedFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  if (typeof window === 'undefined') return null;
  const parent = window.location.hostname;
  const vid = u.match(/twitch\.tv\/videos\/(\d+)/);
  if (vid) return `https://player.twitch.tv/?video=${vid[1]}&parent=${parent}&muted=false`;
  const ch = u.match(/twitch\.tv\/([a-zA-Z0-9_]{4,})\/?$/);
  if (ch && !u.includes('/videos/')) return `https://player.twitch.tv/?channel=${ch[1]}&parent=${parent}&muted=false`;
  return null;
}

// UI HELPER: TAB TRIGGER
function TabTrigger({ value, children, className }) {
  return (
    <TabsTrigger 
      value={value} 
      className={`rounded-xl px-8 h-full data-[state=active]:bg-primary data-[state=active]:text-white font-black uppercase italic text-xs tracking-wider transition-all ${className}`}
    >
      {children}
    </TabsTrigger>
  );
}