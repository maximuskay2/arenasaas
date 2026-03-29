import { useState, useMemo, useEffect, useDeferredValue } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Search, Filter, Trophy, Star, X, Sparkles, ArrowLeft, GitCompare } from "lucide-react";
import TournamentJoinModal from "@/components/tournament/TournamentJoinModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import DiscoveryTournamentCard from "@/components/discovery/DiscoveryTournamentCard";
import { subscribeTournamentSlots } from "@/lib/realtimeClient";
import { useAuth } from "@/lib/AuthContext";
import { tournamentJoinReturnPath } from "@/lib/tournamentJoinIntent";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PublicSiteHeader from "@/components/layout/PublicSiteHeader";
import DiscoveryDashboardWidgets from "@/components/discovery/DiscoveryDashboardWidgets";

const OPEN_STATUSES = ["registration_open"];

export default function TournamentDiscovery({ showPublicHeader = true } = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoadingAuth } = useAuth();

  const goBack = () => {
    const idx = typeof window !== "undefined" ? window.history.state?.idx : null;
    if (typeof idx === "number" && idx > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };
  const [joiningTournament, setJoiningTournament] = useState(null);

  const handleJoinIntent = (t) => {
    if (!t?.id) return;
    if (isLoadingAuth) return;
    if (!isAuthenticated) {
      maxikay.auth.redirectToLogin(tournamentJoinReturnPath(t.id));
      return;
    }
    setJoiningTournament(t);
  };
  const [searchInput, setSearchInput] = useState("");
  const deferredSearch = useDeferredValue(searchInput);
  const [filterGame, setFilterGame] = useState("all");
  const [filterOrganizer, setFilterOrganizer] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFee, setFilterFee] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [compareVsOpen, setCompareVsOpen] = useState(false);

  // --- LOGIC: VARIABLES DECLARED BEFORE USE ---
  
  const hasFilters = 
    filterGame !== "all" || 
    filterOrganizer.trim() !== "" || 
    filterStatus !== "all" || 
    filterFee !== "all";

  const catalogParams = useMemo(() => {
    const p = { page, limit: 24 };
    if (deferredSearch.trim()) p.q = deferredSearch.trim();
    if (filterGame !== "all") p.game = filterGame;
    if (filterOrganizer.trim()) p.organizer = filterOrganizer.trim();
    if (filterStatus !== "all" && filterStatus !== "any") p.status = filterStatus;
    if (filterFee === "free") p.fee_max = 0;
    else if (filterFee === "paid") p.fee_min = 0.01;
    return p;
  }, [page, deferredSearch, filterGame, filterOrganizer, filterStatus, filterFee]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["discovery-catalog", catalogParams],
    queryFn: () => maxikay.public.discoveryTournaments(catalogParams),
    staleTime: 10_000,
  });

  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  const games = useMemo(() => {
    const g = [...new Set(items.map((t) => t.game_title).filter(Boolean))];
    return g.sort();
  }, [items]);

  const featured = useMemo(() => {
    return [...items]
      .filter((t) => OPEN_STATUSES.includes(t.status) && (t.prize_pool || 0) > 0)
      .slice(0, 3);
  }, [items]);

  const browseItems = useMemo(() => {
    // Fixed: hasFilters and deferredSearch are now accessible before this useMemo executes
    if (page !== 1 || !featured.length || hasFilters || deferredSearch) return items;
    const ids = new Set(featured.map((f) => f.id));
    return items.filter((t) => !ids.has(t.id));
  }, [items, featured, page, hasFilters, deferredSearch]);

  const catalogById = useMemo(() => {
    const m = new Map();
    for (const t of items) m.set(t.id, t);
    for (const t of featured) m.set(t.id, t);
    return m;
  }, [items, featured]);

  const compareRows = useMemo(() => compareIds.map((id) => catalogById.get(id)).filter(Boolean), [compareIds, catalogById]);

  const toggleComparePick = (t) => {
    if (!t?.id) return;
    setCompareIds((prev) => {
      const id = t.id;
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  useEffect(() => {
    const o = searchParams.get("organizer");
    if (o) setFilterOrganizer(decodeURIComponent(o));
  }, [searchParams]);

  useEffect(() => {
    const off = subscribeTournamentSlots(() => {
      queryClient.invalidateQueries({ queryKey: ["discovery-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["discovery-dashboard"] });
    });
    return off;
  }, [queryClient]);

  // --- UI RENDERING ---

  const body = (
    <div className="max-w-7xl mx-auto space-y-10 px-4 py-8">
      <div className="sticky top-0 z-30 -mx-4 flex items-center border-b border-white/10 bg-[#0a0a0f]/90 px-4 py-2 backdrop-blur-md sm:static sm:z-auto sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 gap-2 text-slate-400 hover:text-white font-bold uppercase text-[10px] tracking-widest"
          onClick={goBack}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back
        </Button>
      </div>

      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary italic">
            <Sparkles className="w-3 h-3" /> Live Marketplace
          </div>
          <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none">
            Find Your <span className="text-primary">Arena</span>
          </h1>
          <p className="text-slate-400 font-medium max-w-lg">
            Join the world's most competitive leagues. Real-time updates, instant brackets, and verified prize pools.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
           <div className="relative group flex-1 md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search tournaments..."
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
                className="h-14 pl-12 bg-white/5 border-white/10 rounded-2xl italic font-bold focus:ring-primary"
              />
           </div>
           <Button 
            variant={showFilters ? "secondary" : "outline"} 
            className={`h-14 px-6 rounded-2xl border-white/10 font-black uppercase italic ${hasFilters ? 'text-primary border-primary/50' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
           >
             <Filter className="mr-2 h-4 w-4" /> Filters {hasFilters && "•"}
           </Button>
        </div>
      </header>

      <DiscoveryDashboardWidgets />

      {/* FILTER DRAWER */}
      <AnimatePresence>
        {showFilters && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-8 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-xl"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="space-y-3">
                <label className="uppercase text-[10px] font-black tracking-widest text-slate-500">Status</label>
                <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
                  <SelectTrigger className="h-12 bg-black/40 border-white/5 rounded-xl font-bold italic">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0A0A] border-white/10">
                    <SelectItem value="all">Any Status</SelectItem>
                    <SelectItem value="open">Registering Now</SelectItem>
                    <SelectItem value="live">Live Matches</SelectItem>
                    <SelectItem value="completed">Finished</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <label className="uppercase text-[10px] font-black tracking-widest text-slate-500">Game Title</label>
                <Select value={filterGame} onValueChange={(v) => { setFilterGame(v); setPage(1); }}>
                  <SelectTrigger className="h-12 bg-black/40 border-white/5 rounded-xl font-bold italic">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0A0A] border-white/10">
                    <SelectItem value="all">All Games</SelectItem>
                    {games.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <label className="uppercase text-[10px] font-black tracking-widest text-slate-500">Organizer</label>
                <Input
                  placeholder="e.g. ESL"
                  value={filterOrganizer}
                  onChange={(e) => { setFilterOrganizer(e.target.value); setPage(1); }}
                  className="h-12 bg-black/40 border-white/5 rounded-xl font-bold"
                />
              </div>

              <div className="space-y-3">
                <label className="uppercase text-[10px] font-black tracking-widest text-slate-500">Entry Fee</label>
                <Select value={filterFee} onValueChange={(v) => { setFilterFee(v); setPage(1); }}>
                  <SelectTrigger className="h-12 bg-black/40 border-white/5 rounded-xl font-bold italic">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0A0A] border-white/10">
                    <SelectItem value="all">Any Fee</SelectItem>
                    <SelectItem value="free">Free Entry</SelectItem>
                    <SelectItem value="paid">Professional (Paid)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {hasFilters && (
              <Button 
                variant="ghost" 
                className="mt-6 text-xs font-black uppercase italic text-primary hover:bg-primary/10" 
                onClick={() => { setFilterGame("all"); setFilterOrganizer(""); setFilterStatus("all"); setFilterFee("all"); setPage(1); }}
              >
                Reset All Filters <X className="ml-2 h-3 w-3" />
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTENT AREA */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-64 rounded-[2rem] bg-white/5 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-16">
          {/* FEATURED SPOTLIGHT */}
          {featured.length > 0 && !hasFilters && !deferredSearch && page === 1 && (
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-yellow-400/10 text-yellow-400 rounded-lg flex items-center justify-center">
                  <Star className="w-5 h-5 fill-yellow-400" />
                </div>
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">Spotlight</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {featured.map((t) => (
                  <DiscoveryTournamentCard
                    key={t.id}
                    tournament={t}
                    featured
                    onJoin={handleJoinIntent}
                    compareMode={compareMode}
                    isSelected={compareIds.includes(t.id)}
                    onToggleCompare={toggleComparePick}
                  />
                ))}
              </div>
            </section>
          )}

          {/* MAIN BROWSE SECTION */}
          <section id="browse-arena" className="scroll-mt-24 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-6">
              <div className="flex items-center gap-3">
                 <Trophy className="w-6 h-6 text-primary" />
                 <h2 className="text-2xl font-black italic uppercase tracking-tighter">Browse Arena</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={compareMode ? "default" : "outline"}
                  className="h-10 rounded-xl border-white/10 font-black uppercase italic text-[10px]"
                  onClick={() => {
                    setCompareMode((v) => {
                      if (v) setCompareIds([]);
                      return !v;
                    });
                  }}
                >
                  <GitCompare className="w-4 h-4 mr-2" />
                  {compareMode ? "Exit compare" : "Compare"}
                </Button>
                <Badge variant="outline" className="px-4 py-1.5 rounded-full border-white/10 font-black italic uppercase">
                  {isFetching ? "Syncing..." : `${data?.total ?? items.length} Competitions`}
                </Badge>
              </div>
            </div>

            {browseItems.length === 0 ? (
              <div className="py-32 text-center rounded-[3rem] bg-white/5 border border-dashed border-white/10">
                <Trophy className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                <h3 className="text-2xl font-black uppercase italic text-slate-500">No Matches Found</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {browseItems.map((t) => (
                  <DiscoveryTournamentCard
                    key={t.id}
                    tournament={t}
                    onJoin={handleJoinIntent}
                    compareMode={compareMode}
                    isSelected={compareIds.includes(t.id)}
                    onToggleCompare={toggleComparePick}
                  />
                ))}
              </div>
            )}

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-10 border-t border-white/5">
                <Button 
                  variant="outline" 
                  disabled={page <= 1} 
                  onClick={() => setPage((p) => Math.max(1, p - 1))} 
                  className="rounded-xl h-12 px-6 font-black italic uppercase transition-all hover:bg-white/10"
                >
                  Prev
                </Button>
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Sector {page} <span className="text-slate-800">/</span> {totalPages}
                </div>
                <Button 
                  variant="outline" 
                  disabled={page >= totalPages} 
                  onClick={() => setPage((p) => p + 1)} 
                  className="rounded-xl h-12 px-6 font-black italic uppercase transition-all hover:bg-white/10"
                >
                  Next
                </Button>
              </div>
            )}
          </section>
        </div>
      )}

      {/* MODAL */}
      {joiningTournament && (
        <TournamentJoinModal 
          key={joiningTournament.id} 
          tournament={joiningTournament} 
          onClose={() => setJoiningTournament(null)} 
        />
      )}

      {compareMode && compareIds.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-primary/35 bg-[#0a0a0f]/95 px-5 py-3 shadow-2xl shadow-primary/10 backdrop-blur-md">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {compareIds.length}/2 tournaments
            </span>
            <Button
              size="sm"
              className="font-black uppercase italic text-[10px]"
              disabled={compareIds.length < 2}
              onClick={() => setCompareVsOpen(true)}
            >
              Open versus
            </Button>
            <Button size="sm" variant="ghost" className="text-[10px] font-bold uppercase" onClick={() => setCompareIds([])}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <Dialog open={compareVsOpen} onOpenChange={setCompareVsOpen}>
        <DialogContent className="max-w-4xl border-white/10 bg-[#0a0a0f] text-slate-100">
          <DialogHeader>
            <DialogTitle className="font-black italic uppercase tracking-tighter">Tournament comparison</DialogTitle>
          </DialogHeader>
          {compareRows.length < 2 ? (
            <p className="text-sm text-slate-500">Select two tournaments from the grid (compare mode).</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {compareRows.map((t) => {
                const joined = t.joined_count ?? t.registered_teams ?? 0;
                const maxSlots = t.max_slots ?? t.max_teams ?? 0;
                const prize = t.prize_pool != null ? Number(t.prize_pool) : 0;
                return (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3"
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Versus card</p>
                    <h3 className="text-lg font-black italic uppercase tracking-tight text-white leading-tight">{t.name}</h3>
                    <p className="text-xs text-slate-500 font-bold">{t.organizer_name || t.organizer_slug || "Organizer"}</p>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-slate-600 uppercase tracking-wider">Prize pool</dt>
                        <dd className="font-black text-white">{prize > 0 ? `$${prize.toLocaleString()}` : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-600 uppercase tracking-wider">Teams</dt>
                        <dd className="font-black text-white">
                          {joined}/{maxSlots || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-600 uppercase tracking-wider">Game</dt>
                        <dd className="font-bold text-slate-300">{t.game_title || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-600 uppercase tracking-wider">Status</dt>
                        <dd className="font-bold text-slate-300">{t.status?.replace(/_/g, " ") || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-600 uppercase tracking-wider">Format</dt>
                        <dd className="font-bold text-slate-300">{t.format?.replace(/_/g, " ") || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-600 uppercase tracking-wider">Entry</dt>
                        <dd className="font-bold text-slate-300">
                          {Number(t.entry_fee) > 0 ? `${t.currency || "USD"} ${t.entry_fee}` : "Free"}
                        </dd>
                      </div>
                    </dl>
                    <Button asChild variant="outline" size="sm" className="w-full font-black uppercase italic text-[10px] border-white/15">
                      <Link to={`/tournaments/${t.id}`}>View tournament</Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  if (!showPublicHeader) return body;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicSiteHeader />
      <main id="main-content" className="flex-1">
        {body}
      </main>
    </div>
  );
}