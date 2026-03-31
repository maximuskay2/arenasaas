import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "../components/shared/PageHeader";
import { ArrowLeft, ArrowRight, Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatPrizeCardLine } from "@/lib/prizeDisplay";
import { PRIZE_BADGE_OPTIONS } from "@/lib/prizeBadgeRegistry";

const STEPS = ["Game", "Format", "Schedule", "Prize & fees", "Branding"];

function buildPrizeStructurePayload(f) {
  if (f.prize_tbd) return {};
  const type = f.prize_structure_type === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
  const ranks = (f.prize_ranks || []).map((r, i) => ({
    rank: Number(r.rank) || i + 1,
    badge_id: String(r.badge_id || `placement_${i + 1}`).slice(0, 120),
    ...(type === "PERCENTAGE"
      ? { percent: Math.max(0, Number(r.percent) || 0) }
      : { payout: Math.max(0, Number(r.payout) || 0) }),
  }));
  if (!ranks.length) return {};
  return {
    type,
    currency: String(f.currency || "USD").toUpperCase().slice(0, 8),
    ranks,
  };
}

function pickDraftPatch(f) {
  const o = {
    name: f.name?.trim() || undefined,
    game_template_id: f.game_template_id || undefined,
    game_title: f.game_title || undefined,
    game_title_id: f.game_title_id || undefined,
    team_roster_size:
      f.team_roster_size != null && f.team_roster_size !== "" ? Number(f.team_roster_size) : undefined,
    competition_scoring_type: f.competition_scoring_type || undefined,
    genre_template_id: f.game_genre_template_id || undefined,
    description: f.description?.trim() || undefined,
    format: f.format,
    max_teams: f.max_teams,
    prize_pool: f.prize_pool,
    currency: f.currency,
    entry_fee: f.entry_fee,
    entry_type: f.entry_type,
    payout_config: f.payout_config,
    start_date: f.start_date || undefined,
    end_date: f.end_date || undefined,
    registration_deadline: f.registration_deadline || undefined,
    check_in_duration_minutes: f.check_in_duration_minutes,
    seeding_method: f.seeding_method,
    banner_url: f.banner_url?.trim() || undefined,
    stream_url: f.stream_url?.trim() || undefined,
    rules: f.rules?.trim() || undefined,
    prize_structure: Object.keys(buildPrizeStructurePayload(f)).length ? buildPrizeStructurePayload(f) : undefined,
    prize_disclosure_tbd: !!f.prize_tbd,
  };
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));
}

export default function TournamentCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantId, isSuperAdmin } = useTenant();
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState(null);
  const draftIdRef = useRef(null);
  const bannerFileRef = useRef(null);

  const { data: entitlements = [] } = useQuery({
    queryKey: ["tenant-entitlement", tenantId],
    queryFn: () =>
      tenantId ? maxikay.entities.TenantEntitlement.filter({ tenant_id: tenantId }) : Promise.resolve([]),
    enabled: !!tenantId && !isSuperAdmin,
  });

  const entitlement = entitlements[0];
  const isBlocked =
    !isSuperAdmin &&
    entitlement &&
    (!entitlement.is_active ||
      (entitlement.plan_type === "one_shot" && (entitlement.single_tournament_remaining || 0) < 1));

  const { data: gameTemplates = [] } = useQuery({
    queryKey: ["game-templates"],
    queryFn: () => maxikay.entities.GameTemplate.list(),
  });

  const [form, setForm] = useState({
    name: "",
    format: "single_elimination",
    max_teams: 8,
    game_template_id: "",
    game_title: "",
    game_title_id: "",
    game_platform_id: "",
    game_genre_id: "",
    use_custom_game: false,
    title_search: "",
    team_roster_size: 5,
    competition_scoring_type: "bracket",
    match_scoring_mode: "best_of_1",
    game_genre_template_id: "",
    require_in_game_id: false,
    description: "",
    prize_pool: 0,
    currency: "USD",
    entry_type: "FREE",
    entry_fee: 0,
    payout_config: { prize_pool_percent: 85, tenant_percent: 15 },
    start_date: "",
    end_date: "",
    registration_deadline: "",
    check_in_duration_minutes: 15,
    seeding_method: "random",
    rules: "",
    banner_url: "",
    stream_url: "",
    prize_split_summary: "1st 60%, 2nd 30%, 3rd 10%",
    prize_structure_type: "FIXED",
    prize_tbd: false,
    prize_ranks: [
      { rank: 1, payout: 500, percent: 50, badge_id: "gold_champion" },
      { rank: 2, payout: 200, percent: 30, badge_id: "silver_finalist" },
      { rank: 3, payout: 100, percent: 20, badge_id: "bronze_competitor" },
    ],
  });

  const { data: gamePlatforms = [] } = useQuery({
    queryKey: ["game-taxonomy-platforms"],
    queryFn: () => maxikay.public.gameTaxonomyPlatforms(),
  });

  const { data: genreTemplates = [] } = useQuery({
    queryKey: ["game-taxonomy-genre-templates"],
    queryFn: () => maxikay.public.gameTaxonomyGenreTemplates(),
  });

  const { data: gameGenres = [] } = useQuery({
    queryKey: ["game-taxonomy-genres", form.game_platform_id],
    queryFn: () => maxikay.public.gameTaxonomyGenres(form.game_platform_id),
    enabled: !!form.game_platform_id,
  });

  const { data: catalogTitles = [] } = useQuery({
    queryKey: ["game-taxonomy-titles", form.game_platform_id, form.game_genre_id],
    queryFn: () =>
      maxikay.public.gameTaxonomyTitles({
        platform_id: form.game_platform_id,
        genre_id: form.game_genre_id,
      }),
    enabled: !!form.game_platform_id && !!form.game_genre_id && !form.use_custom_game,
  });

  const filteredCatalogTitles = useMemo(() => {
    const q = form.title_search.trim().toLowerCase();
    if (!q) return catalogTitles;
    return catalogTitles.filter(
      (t) => t.name?.toLowerCase().includes(q) || t.slug?.toLowerCase().includes(q)
    );
  }, [catalogTitles, form.title_search]);

  const createCustomGame = useMutation({
    mutationFn: (body) => maxikay.gameTaxonomy.createCustom(body),
  });

  const buildDraftPayload = useCallback(() => {
    const start =
      form.start_date ||
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16);
    const reg = form.registration_deadline || start;
    return {
      ...(tenantId ? { tenant_id: tenantId } : {}),
      name: form.name?.trim() || `Draft — ${form.game_title || "Tournament"}`,
      game_template_id: form.game_template_id,
      game_title: form.game_title,
      game_title_id: form.game_title_id || undefined,
      team_roster_size:
        form.team_roster_size != null && form.team_roster_size !== ""
          ? Number(form.team_roster_size)
          : undefined,
      competition_scoring_type: form.competition_scoring_type || undefined,
      genre_template_id: form.game_genre_template_id || undefined,
      format: form.format,
      max_teams: form.max_teams,
      prize_pool: 0,
      entry_fee: 0,
      currency: form.currency || "USD",
      start_date: start,
      registration_deadline: reg,
      check_in_duration_minutes: form.check_in_duration_minutes,
      seeding_method: form.seeding_method,
      status: "draft",
      description: form.description || "",
      rules: form.rules || "",
    };
  }, [tenantId, form]);

  const createDraftRow = useMutation({
    mutationFn: () => maxikay.entities.Tournament.create(buildDraftPayload()),
  });

  const saveDraftPatch = useMutation({
    mutationFn: ({ id, data }) => maxikay.entities.Tournament.update(id, data),
  });

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  const finishMutation = useMutation({
    mutationFn: (data) => {
      const id = draftIdRef.current;
      if (id) return maxikay.entities.Tournament.update(id, data);
      return maxikay.entities.Tournament.create({ ...data, ...(tenantId ? { tenant_id: tenantId } : {}) });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["discovery-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-entitlement"] });
      navigate(`/tournaments/${result.id}`);
    },
  });

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  useEffect(() => {
    if (!draftId || step < 1) return undefined;
    const t = setTimeout(() => {
      const data = pickDraftPatch(form);
      if (Object.keys(data).length === 0) return;
      saveDraftPatch.mutate(
        { id: draftId, data },
        {
          onError: () => {
            /* silent — user may lack network briefly */
          },
        }
      );
    }, 1500);
    return () => clearTimeout(t);
  }, [form, draftId, step]);

  const selectCatalogTitle = async (titleRow) => {
    try {
      const d = await maxikay.public.gameTaxonomyDefaults(titleRow.id);
      const tpl = gameTemplates.find((g) => g.title.toLowerCase() === String(d.name).toLowerCase());
      setForm((prev) => ({
        ...prev,
        game_title_id: titleRow.id,
        game_title: d.name,
        game_genre_template_id: d.genre_template_id || prev.game_genre_template_id || "",
        format: d.suggested_format || prev.format,
        team_roster_size: d.team_roster_size ?? prev.team_roster_size,
        competition_scoring_type: d.competition_scoring_type || prev.competition_scoring_type,
        match_scoring_mode: d.match_scoring_mode || prev.match_scoring_mode,
        require_in_game_id: !!d.require_in_game_id,
        max_teams: Math.min(
          64,
          Math.max(2, (Number(d.team_roster_size) || 5) * 2)
        ),
        game_template_id: tpl?.id || "",
      }));
    } catch {
      toast.error("Could not load game defaults.");
    }
  };

  const canNext = () => {
    if (step === 0) {
      if (form.use_custom_game) {
        return (
          !!form.game_platform_id &&
          !!form.game_genre_id &&
          !!form.game_genre_template_id &&
          !!form.game_title?.trim() &&
          Number(form.team_roster_size) >= 1 &&
          !!form.competition_scoring_type &&
          !!form.match_scoring_mode
        );
      }
      return !!form.game_title_id;
    }
    if (step === 1) return !!form.format && form.max_teams >= 2;
    if (step === 2) return !!form.start_date && !!form.registration_deadline;
    if (step === 3) {
      if (form.entry_type === "PAID") {
        const ef = Number(form.entry_fee);
        if (!Number.isFinite(ef) || ef <= 0) return false;
      }
      if (!form.prize_tbd) {
        const ps = buildPrizeStructurePayload(form);
        if (!ps.ranks?.length) return false;
        if (form.prize_structure_type === "PERCENTAGE") {
          const sum = (form.prize_ranks || []).reduce((s, r) => s + (Number(r.percent) || 0), 0);
          if (sum > 100.01) return false;
        }
      }
      return true;
    }
    if (step === 4) return !!form.name?.trim();
    return false;
  };

  const submit = (nextStatus = "draft") => {
    const status =
      nextStatus === "registration_open" ||
      nextStatus === "registration_closed" ||
      nextStatus === "in_progress" ||
      nextStatus === "completed" ||
      nextStatus === "cancelled"
        ? nextStatus
        : "draft";

    const rulesExtra = form.prize_split_summary
      ? `\n\n--- Prize distribution (organizer intent) ---\n${form.prize_split_summary}\nFunds settle via your configured payout rail (Stripe / Paystack / Flutterwave).`
      : "";
    const {
      prize_split_summary,
      prize_ranks,
      prize_structure_type,
      prize_tbd,
      game_genre_template_id,
      game_platform_id,
      game_genre_id,
      use_custom_game,
      title_search,
      match_scoring_mode,
      require_in_game_id,
      ...rest
    } = form;
    const payout =
      form.payout_config && typeof form.payout_config === "object"
        ? { ...form.payout_config }
        : { prize_pool_percent: 85, tenant_percent: 15 };
    const prize_structure = prize_tbd ? {} : buildPrizeStructurePayload(form);
    const entryType = form.entry_type === "PAID" ? "PAID" : "FREE";
    finishMutation.mutate({
      ...rest,
      genre_template_id: game_genre_template_id || undefined,
      entry_type: entryType,
      entry_fee: entryType === "FREE" ? 0 : form.entry_fee,
      payout_config: payout,
      prize_disclosure_tbd: !!prize_tbd,
      prize_structure,
      rules: (rest.rules || "") + rulesExtra,
      banner_url: form.banner_url || undefined,
      stream_url: form.stream_url?.trim() || undefined,
      status,
    });
  };

  const addPrizeRank = () => {
    const next = (form.prize_ranks?.length || 0) + 1;
    update("prize_ranks", [...(form.prize_ranks || []), { rank: next, payout: 0, percent: 0, badge_id: `rank_${next}` }]);
  };

  const goNext = async () => {
    if (!canNext()) return;
    if (step === 0 && form.use_custom_game && !form.game_title_id) {
      try {
        const row = await createCustomGame.mutateAsync({
          name: form.game_title.trim(),
          genre_id: form.game_genre_id,
          genre_template_id: form.game_genre_template_id,
          platform_ids: [form.game_platform_id],
          default_team_roster_size: Number(form.team_roster_size) || 5,
          competition_scoring_type: form.competition_scoring_type,
          match_scoring_mode: form.match_scoring_mode,
          suggested_format: form.format,
          require_in_game_id: form.require_in_game_id,
        });
        const d = row.defaults || {};
        const tpl = gameTemplates.find(
          (g) => g.title.toLowerCase() === String(row.name || "").toLowerCase()
        );
        setForm((prev) => ({
          ...prev,
          game_title_id: row.id,
          game_title: row.name,
          game_genre_template_id: d.genre_template_id || prev.game_genre_template_id,
          format: d.suggested_format || prev.format,
          team_roster_size: d.team_roster_size ?? prev.team_roster_size,
          competition_scoring_type: d.competition_scoring_type || prev.competition_scoring_type,
          match_scoring_mode: d.match_scoring_mode || prev.match_scoring_mode,
          require_in_game_id: !!d.require_in_game_id,
          max_teams:
            d.team_roster_size != null
              ? Math.min(64, Math.max(2, Number(d.team_roster_size) * 2))
              : prev.max_teams,
          game_template_id: tpl?.id || prev.game_template_id,
        }));
      } catch {
        toast.error("Could not register custom game title.");
        return;
      }
    }
    if (step === 0 && !draftId) {
      try {
        const row = await createDraftRow.mutateAsync();
        setDraftId(row.id);
        toast.success("Draft saved — progress autosaves as you go.");
      } catch {
        toast.error("Could not create draft — check required fields.");
        return;
      }
    }
    setStep((s) => s + 1);
  };

  if (isBlocked) {
    return (
      <div className="max-w-2xl mx-auto pb-20 md:pb-0">
        <PageHeader
          title="Create Tournament"
          actions={
            <Button variant="ghost" onClick={() => navigate("/league/tournaments")} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          }
        />
        <div className="glass rounded-xl p-8 text-center space-y-3">
          <p className="text-2xl">🔒</p>
          <h3 className="font-display font-bold text-foreground">
            {entitlement && !entitlement.is_active ? "Subscription Inactive" : "No Tournament Credits"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {entitlement?.plan_type === "one_shot"
              ? "You have no remaining one-shot tournament credits."
              : "Your subscription is inactive. Please renew to create tournaments."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 md:pb-0">
      <PageHeader
        title="Create Tournament"
        subtitle="Step-by-step wizard"
        actions={
          <Button variant="ghost" onClick={() => navigate("/league/tournaments")} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        }
      />

      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-display font-bold uppercase tracking-wider whitespace-nowrap border ${
              i === step ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground"
            }`}
          >
            {i < step ? <Check className="w-3 h-3" /> : <span className="opacity-60">{i + 1}</span>}
            {label}
          </button>
        ))}
      </div>

      <div className="glass rounded-xl p-6 space-y-5 min-h-[320px]">
        {step === 0 && (
          <>
            <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">1. Game</h2>
            <p className="text-xs text-muted-foreground">
              Pick platform, then category, then title. Defaults for format and roster load from the catalog; you can still change them
              later.
            </p>
            <div className="flex items-center gap-2">
              <input
                id="tc-custom-game"
                type="checkbox"
                checked={form.use_custom_game}
                onChange={(e) => {
                  const v = e.target.checked;
                  setForm((p) => ({
                    ...p,
                    use_custom_game: v,
                    game_title_id: v ? "" : p.game_title_id,
                    game_title: v ? "" : p.game_title,
                    title_search: "",
                    game_template_id: v ? "" : p.game_template_id,
                    game_genre_template_id: v ? "" : p.game_genre_template_id,
                  }));
                }}
                className="rounded border-border"
              />
              <Label htmlFor="tc-custom-game" className="text-xs font-normal cursor-pointer">
                Other / custom (manual roster and scoring — platform team reviews new titles)
              </Label>
            </div>
            <div>
              <Label>Platform *</Label>
              <Select
                value={form.game_platform_id}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    game_platform_id: v,
                    game_genre_id: "",
                    game_title_id: "",
                    game_title: "",
                    title_search: "",
                    game_template_id: "",
                    game_genre_template_id: "",
                  }))
                }
              >
                <SelectTrigger className="mt-1 bg-secondary/50">
                  <SelectValue placeholder="Mobile, PC, Console…" />
                </SelectTrigger>
                <SelectContent>
                  {gamePlatforms.map((gp) => (
                    <SelectItem key={gp.id} value={gp.id}>
                      {gp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Genre *</Label>
              <Select
                value={form.game_genre_id}
                disabled={!form.game_platform_id}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    game_genre_id: v,
                    game_title_id: "",
                    game_title: "",
                    title_search: "",
                    game_template_id: "",
                    game_genre_template_id: "",
                  }))
                }
              >
                <SelectTrigger className="mt-1 bg-secondary/50">
                  <SelectValue placeholder={form.game_platform_id ? "MOBA, FPS…" : "Select platform first"} />
                </SelectTrigger>
                <SelectContent>
                  {gameGenres.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} (default roster {g.default_roster_size})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!form.use_custom_game && (
              <>
                <div>
                  <Label>Game title *</Label>
                  <Input
                    value={form.title_search}
                    onChange={(e) => update("title_search", e.target.value)}
                    placeholder="Search titles…"
                    disabled={!form.game_genre_id}
                    className="mt-1 bg-secondary/50"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border/60 bg-secondary/20 p-2 space-y-1">
                  {!form.game_genre_id ? (
                    <p className="text-xs text-muted-foreground px-2 py-4 text-center">Select platform and genre to list games.</p>
                  ) : filteredCatalogTitles.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-4 text-center">No matches — try custom.</p>
                  ) : (
                    filteredCatalogTitles.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => void selectCatalogTitle(t)}
                        className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                          form.game_title_id === t.id
                            ? "bg-primary/20 text-primary border border-primary/40"
                            : "hover:bg-secondary/80 border border-transparent"
                        }`}
                      >
                        <span className="font-medium">{t.name}</span>
                        <span className="text-xs text-muted-foreground block">
                          {t.genre_name}
                          {t.genre_template_name ? ` · ${t.genre_template_name}` : ""} · roster {t.default_team_roster_size}
                        </span>
                      </button>
                    ))
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs font-medium"
                  disabled={!form.game_genre_id}
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      use_custom_game: true,
                      game_title_id: "",
                      game_title: "",
                      title_search: "",
                      game_template_id: "",
                      game_genre_template_id: "",
                    }))
                  }
                >
                  My game is not listed — use a custom title
                </Button>
              </>
            )}
            {form.use_custom_game && (
              <>
                <div>
                  <Label>Scoring rules template *</Label>
                  <p className="text-[10px] text-muted-foreground mt-0.5 mb-1 leading-relaxed">
                    Pick the rules profile (FPS/MOBA, battle royale, fighters, card/RTS, team sports, or ladder points). Defaults
                    below start from the template—you can still adjust.
                  </p>
                  <Select
                    value={form.game_genre_template_id}
                    disabled={!form.game_genre_id}
                    onValueChange={(tid) => {
                      const tpl = genreTemplates.find((x) => x.id === tid);
                      setForm((p) => ({
                        ...p,
                        game_genre_template_id: tid,
                        format: tpl?.suggested_format || p.format,
                        team_roster_size: tpl?.default_team_roster_size ?? p.team_roster_size,
                        competition_scoring_type: tpl?.competition_scoring_type || p.competition_scoring_type,
                        match_scoring_mode: tpl?.match_scoring_mode || p.match_scoring_mode,
                      }));
                    }}
                  >
                    <SelectTrigger className="mt-1 bg-secondary/50">
                      <SelectValue placeholder={form.game_genre_id ? "Template…" : "Select genre first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {genreTemplates.map((tpl) => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.game_genre_template_id ? (
                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                      {genreTemplates.find((x) => x.id === form.game_genre_template_id)?.rules_summary || ""}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label>Custom title *</Label>
                  <Input
                    value={form.game_title}
                    onChange={(e) => update("game_title", e.target.value)}
                    placeholder="Your game name"
                    className="mt-1 bg-secondary/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Players per team (roster size)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={64}
                      value={form.team_roster_size}
                      onChange={(e) => update("team_roster_size", parseInt(e.target.value, 10) || 1)}
                      className="mt-1 bg-secondary/50"
                    />
                  </div>
                  <div>
                    <Label>Match scoring</Label>
                    <Select value={form.match_scoring_mode} onValueChange={(v) => update("match_scoring_mode", v)}>
                      <SelectTrigger className="mt-1 bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="best_of_1">Best of 1</SelectItem>
                        <SelectItem value="best_of_3">Best of 3</SelectItem>
                        <SelectItem value="best_of_5">Best of 5</SelectItem>
                        <SelectItem value="points">Points-based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Competition style</Label>
                  <Select
                    value={form.competition_scoring_type}
                    onValueChange={(v) => update("competition_scoring_type", v)}
                  >
                    <SelectTrigger className="mt-1 bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bracket">Bracket wins (elimination)</SelectItem>
                      <SelectItem value="points">Points / leaderboard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="tc-req-ign"
                    type="checkbox"
                    checked={form.require_in_game_id}
                    onChange={(e) => update("require_in_game_id", e.target.checked)}
                    className="rounded border-border"
                  />
                  <Label htmlFor="tc-req-ign" className="text-xs font-normal cursor-pointer">
                    Require in-game ID on rosters
                  </Label>
                </div>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">2. Format</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Bracket format *</Label>
                <Select value={form.format} onValueChange={(v) => update("format", v)}>
                  <SelectTrigger className="mt-1 bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_elimination">Single elimination</SelectItem>
                    <SelectItem value="double_elimination">Double elimination</SelectItem>
                    <SelectItem value="round_robin">Round robin</SelectItem>
                    <SelectItem value="swiss">Swiss</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Max teams *</Label>
                <Input
                  type="number"
                  min={2}
                  value={form.max_teams}
                  onChange={(e) => update("max_teams", parseInt(e.target.value, 10) || 2)}
                  className="mt-1 bg-secondary/50"
                />
              </div>
            </div>
            <div>
              <Label>Seeding</Label>
              <Select value={form.seeding_method} onValueChange={(v) => update("seeding_method", v)}>
                <SelectTrigger className="mt-1 bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">Random</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="by_rank">By rank</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">3. Scheduling</h2>
            <div>
              <Label>Registration closes *</Label>
              <Input
                type="datetime-local"
                value={form.registration_deadline}
                onChange={(e) => update("registration_deadline", e.target.value)}
                required
                className="mt-1 bg-secondary/50"
              />
            </div>
            <div>
              <Label>Check-in window (minutes before start)</Label>
              <Input
                type="number"
                min={5}
                value={form.check_in_duration_minutes}
                onChange={(e) => update("check_in_duration_minutes", parseInt(e.target.value, 10) || 15)}
                className="mt-1 bg-secondary/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tournament start *</Label>
                <Input
                  type="datetime-local"
                  value={form.start_date}
                  onChange={(e) => update("start_date", e.target.value)}
                  required
                  className="mt-1 bg-secondary/50"
                />
              </div>
              <div>
                <Label>End (optional)</Label>
                <Input type="datetime-local" value={form.end_date} onChange={(e) => update("end_date", e.target.value)} className="mt-1 bg-secondary/50" />
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">4. Prize & fees</h2>
            <p className="text-xs text-muted-foreground">
              Entry fees are collected via your tenant checkout flows; prizes credit player wallets on finalize per your prize structure.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Entry type</Label>
                <Select
                  value={form.entry_type}
                  onValueChange={(v) => {
                    const next = v === "PAID" ? "PAID" : "FREE";
                    setForm((p) => ({
                      ...p,
                      entry_type: next,
                      entry_fee: next === "FREE" ? 0 : p.entry_fee,
                    }));
                  }}
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
                <Label>Currency</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => update("currency", e.target.value.toUpperCase().slice(0, 8))}
                  className="mt-1 bg-secondary/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Prize pool (headline / cap)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.prize_pool}
                  onChange={(e) => update("prize_pool", parseFloat(e.target.value) || 0)}
                  className="mt-1 bg-secondary/50"
                />
              </div>
              <div>
                <Label>Entry fee</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.entry_fee}
                  onChange={(e) => update("entry_fee", parseFloat(e.target.value) || 0)}
                  className="mt-1 bg-secondary/50"
                  disabled={form.entry_type !== "PAID"}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="prize-tbd"
                type="checkbox"
                checked={form.prize_tbd}
                onChange={(e) => update("prize_tbd", e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="prize-tbd" className="text-xs font-normal cursor-pointer">
                Prizes TBD / sponsor-provided (hide structured payouts on discovery)
              </Label>
            </div>
            {!form.prize_tbd && (
              <div className="space-y-4 p-6 rounded-[2rem] bg-white/5 border border-white/10">
                <h3 className="text-sm font-black uppercase italic text-primary">Prize allocation</h3>
                <div className="flex flex-wrap gap-3 items-center">
                  <Label className="text-xs">Model</Label>
                  <Select value={form.prize_structure_type} onValueChange={(v) => update("prize_structure_type", v)}>
                    <SelectTrigger className="w-48 bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">Guaranteed fixed ($)</SelectItem>
                      <SelectItem value="PERCENTAGE">% of net entry pot</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.prize_structure_type === "FIXED" && (
                    <p className="text-[10px] text-amber-600/90 max-w-xs">
                      You are liable for fixed totals regardless of how many teams register.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  {(form.prize_ranks || []).map((r, i) => (
                    <div key={i} className="flex flex-wrap gap-3 items-center bg-black/40 p-3 rounded-xl">
                      <span className="font-black italic text-slate-500 w-10 shrink-0">{r.rank || i + 1}</span>
                      {form.prize_structure_type === "FIXED" ? (
                        <Input
                          type="number"
                          min={0}
                          placeholder="Amount"
                          className="bg-transparent border-white/10 max-w-[140px]"
                          value={r.payout}
                          onChange={(e) => {
                            const next = [...form.prize_ranks];
                            next[i] = { ...next[i], payout: parseFloat(e.target.value) || 0 };
                            update("prize_ranks", next);
                          }}
                        />
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="%"
                          className="bg-transparent border-white/10 max-w-[100px]"
                          value={r.percent}
                          onChange={(e) => {
                            const next = [...form.prize_ranks];
                            next[i] = { ...next[i], percent: parseFloat(e.target.value) || 0 };
                            update("prize_ranks", next);
                          }}
                        />
                      )}
                      <Select
                        value={PRIZE_BADGE_OPTIONS.some((o) => o.id === r.badge_id) ? r.badge_id : "custom"}
                        onValueChange={(v) => {
                          const next = [...form.prize_ranks];
                          next[i] = { ...next[i], badge_id: v === "custom" ? "" : v };
                          update("prize_ranks", next);
                        }}
                      >
                        <SelectTrigger className="w-[200px] bg-transparent border-white/10 shrink-0">
                          <SelectValue placeholder="Badge" />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIZE_BADGE_OPTIONS.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(!r.badge_id || !PRIZE_BADGE_OPTIONS.some((o) => o.id === r.badge_id)) && (
                        <Input
                          placeholder="custom badge_id"
                          className="bg-transparent border-white/10 flex-1 min-w-[120px]"
                          value={r.badge_id}
                          onChange={(e) => {
                            const next = [...form.prize_ranks];
                            next[i] = { ...next[i], badge_id: e.target.value };
                            update("prize_ranks", next);
                          }}
                        />
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="ghost" onClick={addPrizeRank} className="text-[10px] font-black uppercase italic text-slate-500 hover:text-white">
                    + Add payout rank
                  </Button>
                  {form.prize_structure_type === "PERCENTAGE" &&
                    (form.prize_ranks || []).reduce((s, r) => s + (Number(r.percent) || 0), 0) > 100.01 && (
                      <p className="text-[10px] text-amber-600 font-semibold" role="alert">
                        Percentages must sum to at most 100% (currently{" "}
                        {(form.prize_ranks || []).reduce((s, r) => s + (Number(r.percent) || 0), 0).toFixed(1)}%).
                      </p>
                    )}
                </div>
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Player-facing preview (discovery)</p>
                  <p className="text-xs font-semibold text-foreground" aria-live="polite">
                    {formatPrizeCardLine({
                      ...form,
                      prize_disclosure_tbd: form.prize_tbd,
                      prize_structure: buildPrizeStructurePayload(form),
                    })}
                  </p>
                  {form.prize_structure_type === "PERCENTAGE" && !form.prize_tbd && form.entry_type === "PAID" && (
                    <p className="text-[10px] text-muted-foreground">
                      Estimate at {form.max_teams} teams × {form.currency} {Number(form.entry_fee || 0).toFixed(2)} gross pool (before platform fee):{" "}
                      <span className="text-foreground font-medium">
                        {form.currency}{" "}
                        {(Number(form.max_teams) || 0) * (Number(form.entry_fee) || 0) > 0
                          ? ((Number(form.max_teams) || 0) * (Number(form.entry_fee) || 0)).toFixed(2)
                          : "0.00"}
                      </span>{" "}
                      — exact net split is computed at finalize.
                    </p>
                  )}
                </div>
              </div>
            )}
            {form.prize_tbd && (
              <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/10 p-4">
                <p className="text-[10px] font-black uppercase text-muted-foreground">Player-facing preview (discovery)</p>
                <p className="text-xs font-semibold text-foreground mt-1" aria-live="polite">
                  {formatPrizeCardLine({ prize_disclosure_tbd: true, currency: form.currency })}
                </p>
              </div>
            )}
            <div>
              <Label>Prize split (organizer note, optional)</Label>
              <Input
                value={form.prize_split_summary}
                onChange={(e) => update("prize_split_summary", e.target.value)}
                placeholder="Extra notes for rules text…"
                className="mt-1 bg-secondary/50"
              />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">5. Branding & publish</h2>
            <div>
              <Label>Tournament name *</Label>
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Winter Championship 2026"
                className="mt-1 bg-secondary/50"
              />
            </div>
            <div>
              <Label>Banner</Label>
              <div className="flex flex-col sm:flex-row gap-2 mt-1">
                <Input
                  value={form.banner_url}
                  onChange={(e) => update("banner_url", e.target.value)}
                  placeholder="https://… or upload (dev: data URL)"
                  className="bg-secondary/50 flex-1"
                />
                <input
                  ref={bannerFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      const out = await maxikay.integrations.Core.UploadFile({ file: f });
                      if (out?.file_url) {
                        update("banner_url", out.file_url);
                        toast.success("Banner uploaded");
                      }
                    } catch (err) {
                      toast.error(err?.message || "Upload failed");
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => bannerFileRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" /> Upload
                </Button>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => update("description", e.target.value)} className="mt-1 bg-secondary/50" rows={3} />
            </div>
            <div>
              <Label>Rules</Label>
              <Textarea value={form.rules} onChange={(e) => update("rules", e.target.value)} className="mt-1 bg-secondary/50" rows={4} placeholder="Match rules, map pool, etc." />
            </div>
            <div>
              <Label>Main broadcast URL (YouTube / Twitch)</Label>
              <Input
                value={form.stream_url}
                onChange={(e) => update("stream_url", e.target.value)}
                placeholder="https://youtube.com/watch?v=… or https://twitch.tv/…"
                className="mt-1 bg-secondary/50"
              />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-between gap-3 mt-6">
        <Button type="button" variant="ghost" onClick={() => (step > 0 ? setStep((s) => s - 1) : navigate("/league/tournaments"))}>
          {step === 0 ? "Cancel" : (
            <>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </>
          )}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            disabled={!canNext() || createDraftRow.isPending || createCustomGame.isPending}
            onClick={() => void goNext()}
          >
            Next <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={!canNext() || finishMutation.isPending}
              onClick={() => submit("draft")}
              className="font-display text-xs tracking-wider"
            >
              {finishMutation.isPending ? "Saving…" : "Save as draft"}
            </Button>
            <Button
              type="button"
              disabled={!canNext() || finishMutation.isPending}
              onClick={() => submit("registration_open")}
              className="font-display text-xs tracking-wider"
            >
              {finishMutation.isPending ? "Publishing…" : "Publish (open registration)"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
