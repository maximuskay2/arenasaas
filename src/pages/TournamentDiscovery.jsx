import { useState, useMemo, useEffect, useDeferredValue, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import {
  Search,
  Filter,
  Trophy,
  Star,
  X,
  Sparkles,
  ArrowLeft,
  GitCompare,
  Compass,
  Radio,
  Plus,
  Swords,
} from "lucide-react";
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
import EmptyState from "@/components/shared/EmptyState";
import { getEffectiveHubMode } from "@/lib/routingLogic";

const OPEN_STATUSES = ["registration_open"];

const QUICK_STATUS = [
  { id: "all", label: "All" },
  { id: "open", label: "Registering" },
  { id: "live", label: "Live" },
  { id: "completed", label: "Finished" },
];

const QUICK_FEE = [
  { id: "all", label: "Any fee" },
  { id: "free", label: "Free" },
  { id: "paid", label: "Paid" },
];

export default function TournamentDiscovery({ showPublicHeader = true } = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const isHost = user && getEffectiveHubMode(user) !== "player";

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

  const { data: watchlistRes } = useQuery({
    queryKey: ["me-watchlist"],
    queryFn: () => maxikay.auth.meWatchlist(),
    enabled: isAuthenticated && !isLoadingAuth,
    staleTime: 30_000,
  });
  const watchedIds = useMemo(
    () => new Set((watchlistRes?.items || []).map((x) => String(x.id))),
    [watchlistRes]
  );

  const watchMut = useMutation({
    mutationFn: async ({ tournament, watched }) => {
      if (watched) return maxikay.auth.meWatchlistRemove(tournament.id);
      return maxikay.auth.meWatchlistAdd(tournament.id);
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["me-watchlist"] });
      toast.success(vars.watched ? "Removed from watchlist" : "Added to watchlist");
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || "Watchlist update failed"),
  });

  const handleToggleWatch = useCallback(
    (t) => {
      if (!t?.id) return;
      if (!isAuthenticated) {
        maxikay.auth.redirectToLogin(tournamentJoinReturnPath(t.id));
        return;
      }
      const watched = watchedIds.has(String(t.id));
      watchMut.mutate({ tournament: t, watched });
    },
    [isAuthenticated, watchedIds, watchMut]
  );
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
  const totalCount = data?.total ?? items.length;

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

  const compareRows = useMemo(
    () => compareIds.map((id) => catalogById.get(id)).filter(Boolean),
    [compareIds, catalogById]
  );

  const toggleComparePick = (t) => {
    if (!t?.id) return;
    setCompareIds((prev) => {
      const id = t.id;
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const clearFilters = () => {
    setFilterGame("all");
    setFilterOrganizer("");
    setFilterStatus("all");
    setFilterFee("all");
    setPage(1);
  };

  useEffect(() => {
    const o = searchParams.get("organizer");
    if (o) {
      setFilterOrganizer(decodeURIComponent(o));
      setShowFilters(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const off = subscribeTournamentSlots(() => {
      queryClient.invalidateQueries({ queryKey: ["discovery-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["discovery-dashboard"] });
    });
    return off;
  }, [queryClient]);

  const body = (
    <div className="max-w-7xl mx-auto space-y-8 px-4 sm:px-6 py-4 md:py-6 pb-24">
      {/* Mobile back */}
      <div className="sticky top-0 z-30 -mx-4 flex items-center border-b border-border/40 bg-background/85 px-4 py-2 backdrop-blur-md sm:static sm:z-auto sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 gap-2 text-muted-foreground hover:text-foreground font-display text-[10px] tracking-widest uppercase"
          onClick={goBack}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back
        </Button>
      </div>

      {/* Hero */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-border/50 glass p-6 md:p-8 shadow-arena"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/4 h-36 w-36 rounded-full bg-accent/15 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--border) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.4) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            maskImage: "radial-gradient(ellipse 80% 70% at 60% 30%, black, transparent)",
          }}
        />
        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-widest text-primary">
              <span className="live-dot" />
              <Sparkles className="w-3 h-3" />
              Tournament hub · Live marketplace
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight leading-[1.05]">
              Find your <span className="text-gradient-primary">Arena</span>
            </h1>
            <p className="text-muted-foreground max-w-xl leading-relaxed text-sm md:text-base">
              World-class competitions with live slots, verified prize pools, and instant registration across every org.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isHost ? (
              <Button asChild variant="arena" size="lg">
                <Link to="/tournaments/new">
                  <Plus className="h-4 w-4" /> Host an event
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="lg">
              <Link to="/rankings">
                <Swords className="h-4 w-4" /> Power ranks
              </Link>
            </Button>
          </div>
        </div>
      </motion.header>

      {/* Search + filter bar */}
      <div className="glass rounded-2xl border border-border/50 p-3 md:p-4 shadow-arena-card space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative group flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search tournaments, games, organizers…"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              className="h-12 pl-12 bg-background/40 border-border/60 rounded-xl font-medium focus-visible:ring-primary"
            />
            {searchInput ? (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearchInput("");
                  setPage(1);
                }}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Button
            variant={showFilters ? "secondary" : "outline"}
            className={`h-12 px-6 shrink-0 ${hasFilters ? "text-primary border-primary/50" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filters
            {hasFilters ? (
              <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] font-display font-bold text-primary">
                •
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant={compareMode ? "arena" : "outline"}
            className="h-12 px-5 shrink-0"
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
        </div>

        {/* Quick chips */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_STATUS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setFilterStatus(s.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-display font-bold uppercase tracking-wide transition-colors ${
                  filterStatus === s.id
                    ? "bg-primary/15 text-primary border border-primary/35"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {s.id === "live" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="live-dot scale-75" /> {s.label}
                  </span>
                ) : (
                  s.label
                )}
              </button>
            ))}
          </div>
          <div className="hidden sm:block h-5 w-px bg-border/60" />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_FEE.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setFilterFee(s.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-display font-bold uppercase tracking-wide transition-colors ${
                  filterFee === s.id
                    ? "bg-primary/15 text-primary border border-primary/35"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {hasFilters || deferredSearch ? (
            <Button variant="ghost" size="sm" className="text-xs text-primary sm:ml-auto" onClick={clearFilters}>
              Reset <X className="ml-1 h-3 w-3" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Advanced filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, y: -12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -12, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 md:p-6 rounded-3xl glass border border-border/50 shadow-arena-card">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
                <div className="space-y-2">
                  <label className="section-label" htmlFor="filter-status">
                    Status
                  </label>
                  <Select
                    value={filterStatus}
                    onValueChange={(v) => {
                      setFilterStatus(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="filter-status" className="h-11 bg-background/40 border-border/60 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any status</SelectItem>
                      <SelectItem value="open">Registering now</SelectItem>
                      <SelectItem value="live">Live matches</SelectItem>
                      <SelectItem value="completed">Finished</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="section-label" htmlFor="filter-game">
                    Game title
                  </label>
                  <Select
                    value={filterGame}
                    onValueChange={(v) => {
                      setFilterGame(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="filter-game" className="h-11 bg-background/40 border-border/60 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All games</SelectItem>
                      {games.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="section-label" htmlFor="filter-org">
                    Organizer
                  </label>
                  <Input
                    id="filter-org"
                    placeholder="e.g. ESL"
                    value={filterOrganizer}
                    onChange={(e) => {
                      setFilterOrganizer(e.target.value);
                      setPage(1);
                    }}
                    className="h-11 bg-background/40 border-border/60 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <label className="section-label" htmlFor="filter-fee">
                    Entry fee
                  </label>
                  <Select
                    value={filterFee}
                    onValueChange={(v) => {
                      setFilterFee(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="filter-fee" className="h-11 bg-background/40 border-border/60 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any fee</SelectItem>
                      <SelectItem value="free">Free entry</SelectItem>
                      <SelectItem value="paid">Paid entry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="mt-4 text-xs text-primary" onClick={clearFilters}>
                  Reset all filters <X className="ml-2 h-3 w-3" />
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {compareMode && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground">
            Compare mode — pick up to <strong className="text-foreground">2 tournaments</strong> from the grid.
          </span>
        </div>
      )}

      {/* Platform pulse widgets */}
      {!hasFilters && !deferredSearch && page === 1 && <DiscoveryDashboardWidgets />}

      {/* Catalog */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-72 rounded-3xl bg-secondary/40 animate-pulse border border-border/30" />
          ))}
        </div>
      ) : (
        <div className="space-y-12">
          {/* Spotlight */}
          {featured.length > 0 && !hasFilters && !deferredSearch && page === 1 && (
            <section className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-amber-400/15 text-amber-400 rounded-xl flex items-center justify-center ring-1 ring-amber-400/30">
                    <Star className="w-5 h-5 fill-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-display font-bold tracking-tight">Spotlight</h2>
                    <p className="section-label mt-0.5">Open registration · prize pool</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {featured.map((t) => (
                  <DiscoveryTournamentCard
                    key={t.id}
                    tournament={t}
                    featured
                    onJoin={handleJoinIntent}
                    compareMode={compareMode}
                    isSelected={compareIds.includes(t.id)}
                    onToggleCompare={toggleComparePick}
                    showWatch
                    watched={watchedIds.has(String(t.id))}
                    onToggleWatch={handleToggleWatch}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Browse */}
          <section id="browse-arena" className="scroll-mt-24 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center text-primary">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-display font-bold tracking-tight">Browse arena</h2>
                  <p className="section-label mt-0.5">Full catalog</p>
                </div>
              </div>
              <Badge
                variant="outline"
                className="px-4 py-1.5 rounded-full border-border/60 font-display text-[10px] uppercase tracking-wider"
              >
                {isFetching ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Radio className="h-3 w-3 animate-pulse text-primary" /> Syncing…
                  </span>
                ) : (
                  `${totalCount.toLocaleString()} competitions`
                )}
              </Badge>
            </div>

            {browseItems.length === 0 ? (
              <EmptyState
                icon={Compass}
                title="No competitions found"
                description={
                  hasFilters || deferredSearch
                    ? "Try clearing filters or searching a different game or organizer."
                    : "No open tournaments in the catalog yet — host one or check back soon."
                }
                action={
                  <div className="flex flex-wrap gap-2 justify-center">
                    {(hasFilters || deferredSearch) && (
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    )}
                    {isHost ? (
                      <Button asChild variant="arena" size="sm">
                        <Link to="/tournaments/new">Host an event</Link>
                      </Button>
                    ) : (
                      <Button asChild variant="outline" size="sm">
                        <Link to="/">Back home</Link>
                      </Button>
                    )}
                  </div>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {browseItems.map((t) => (
                  <DiscoveryTournamentCard
                    key={t.id}
                    tournament={t}
                    onJoin={handleJoinIntent}
                    compareMode={compareMode}
                    isSelected={compareIds.includes(t.id)}
                    onToggleCompare={toggleComparePick}
                    showWatch
                    watched={watchedIds.has(String(t.id))}
                    onToggleWatch={handleToggleWatch}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-8 border-t border-border/40">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl h-11 px-6"
                >
                  Previous
                </Button>
                <div className="section-label tabular-nums">
                  Page {page} <span className="text-border mx-1">/</span> {totalPages}
                </div>
                <Button
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-xl h-11 px-6"
                >
                  Next
                </Button>
              </div>
            )}
          </section>
        </div>
      )}

      {joiningTournament && (
        <TournamentJoinModal
          key={joiningTournament.id}
          tournament={joiningTournament}
          onClose={() => setJoiningTournament(null)}
        />
      )}

      {compareMode && compareIds.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-primary/35 glass px-5 py-3 shadow-arena-glow backdrop-blur-md">
            <span className="text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground">
              {compareIds.length}/2 selected
            </span>
            <Button size="sm" variant="arena" disabled={compareIds.length < 2} onClick={() => setCompareVsOpen(true)}>
              Open versus
            </Button>
            <Button size="sm" variant="ghost" className="text-[10px] font-display font-bold uppercase" onClick={() => setCompareIds([])}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <Dialog open={compareVsOpen} onOpenChange={setCompareVsOpen}>
        <DialogContent className="max-w-4xl border-border/50 glass">
          <DialogHeader>
            <DialogTitle className="font-display font-bold tracking-tight text-xl">Tournament comparison</DialogTitle>
          </DialogHeader>
          {compareRows.length < 2 ? (
            <p className="text-sm text-muted-foreground">Select two tournaments from the grid (compare mode).</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {compareRows.map((t) => {
                const joined = t.joined_count ?? t.registered_teams ?? 0;
                const maxSlots = t.max_slots ?? t.max_teams ?? 0;
                const prize = t.prize_pool != null ? Number(t.prize_pool) : 0;
                return (
                  <div key={t.id} className="rounded-2xl border border-border/50 bg-card/40 p-5 space-y-3">
                    <p className="section-label text-primary">Versus card</p>
                    <h3 className="text-lg font-display font-bold tracking-tight text-foreground leading-tight">{t.name}</h3>
                    <p className="text-xs text-muted-foreground font-semibold">
                      {t.organizer_name || t.organizer_slug || "Organizer"}
                    </p>
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="section-label mb-0.5">Prize pool</dt>
                        <dd className="font-display font-bold text-foreground tabular-nums">
                          {prize > 0 ? `${t.currency || "USD"} ${prize.toLocaleString()}` : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="section-label mb-0.5">Teams</dt>
                        <dd className="font-display font-bold text-foreground tabular-nums">
                          {joined}/{maxSlots || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="section-label mb-0.5">Game</dt>
                        <dd className="font-semibold text-foreground/90">{t.game_title || "—"}</dd>
                      </div>
                      <div>
                        <dt className="section-label mb-0.5">Status</dt>
                        <dd className="font-semibold text-foreground/90">{t.status?.replace(/_/g, " ") || "—"}</dd>
                      </div>
                      <div>
                        <dt className="section-label mb-0.5">Format</dt>
                        <dd className="font-semibold text-foreground/90">{t.format?.replace(/_/g, " ") || "—"}</dd>
                      </div>
                      <div>
                        <dt className="section-label mb-0.5">Entry</dt>
                        <dd className="font-semibold text-foreground/90">
                          {Number(t.entry_fee) > 0 ? `${t.currency || "USD"} ${t.entry_fee}` : "Free"}
                        </dd>
                      </div>
                    </dl>
                    <Button asChild variant="outline" size="sm" className="w-full">
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
    <div className="flex min-h-screen flex-col arena-stage">
      <div className="arena-content flex flex-col min-h-screen w-full">
        <PublicSiteHeader />
        <main id="main-content" className="flex-1">
          {body}
        </main>
      </div>
    </div>
  );
}
