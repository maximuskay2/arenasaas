import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import {
  Activity,
  AlertTriangle,
  Ban,
  Building2,
  Cpu,
  DollarSign,
  Gavel,
  Landmark,
  Layers,
  Lock,
  LogIn,
  LogOut,
  Palette,
  Pencil,
  Search,
  Server,
  Shield,
  ToggleRight,
  Trash2,
  Users,
  Wrench,
  KeyRound,
  Mail,
  CreditCard,
  Sparkles,
} from "lucide-react";
import { setImpersonatedTenantId, getImpersonatedTenantId } from "@/hooks/useTenant";
import { toast } from "sonner";
import { overrideTenantBranding } from "@/lib/whiteLabelManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PageHeader from "../components/shared/PageHeader";
import { useAuth } from "@/lib/AuthContext";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function EditTemplateForm({ template, onSave, onCancel, pending }) {
  const [title, setTitle] = useState(template.title || "");
  const [rosterSize, setRosterSize] = useState(template.roster_size ?? 5);
  const [scoringMode, setScoringMode] = useState(template.scoring_mode || "best_of_1");
  const [mapStr, setMapStr] = useState(
    Array.isArray(template.map_pool) ? template.map_pool.join(", ") : ""
  );
  const [rulesJson, setRulesJson] = useState(template.rules_json || "{}");

  useEffect(() => {
    setTitle(template.title || "");
    setRosterSize(template.roster_size ?? 5);
    setScoringMode(template.scoring_mode || "best_of_1");
    setMapStr(Array.isArray(template.map_pool) ? template.map_pool.join(", ") : "");
    setRulesJson(template.rules_json || "{}");
  }, [template]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="text-[10px] text-muted-foreground">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 bg-secondary/50" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">Roster size</label>
          <Input
            type="number"
            min={1}
            value={rosterSize}
            onChange={(e) => setRosterSize(Number(e.target.value))}
            className="mt-1 bg-secondary/50"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">Scoring</label>
          <select
            value={scoringMode}
            onChange={(e) => setScoringMode(e.target.value)}
            className="w-full mt-1 h-9 rounded-md bg-secondary/80 border border-border px-2 text-foreground text-sm"
          >
            {["best_of_1", "best_of_3", "best_of_5", "points"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">Map pool (comma-separated)</label>
        <Input value={mapStr} onChange={(e) => setMapStr(e.target.value)} className="mt-1 bg-secondary/50" />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">rules_json</label>
        <Input value={rulesJson} onChange={(e) => setRulesJson(e.target.value)} className="mt-1 bg-secondary/50 font-mono text-xs" />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending || !title.trim()}
          onClick={() =>
            onSave({
              title: title.trim(),
              roster_size: Number(rosterSize) || 1,
              scoring_mode: scoringMode,
              map_pool: mapStr
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              rules_json: rulesJson.trim() || "{}",
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function apiBasePath(path) {
  const raw = import.meta.env.VITE_API_URL;
  if (raw) return `${String(raw).replace(/\/$/, "")}${path}`;
  return path;
}

const LARGE_PAYOUT_USD = 1000;

const CS_SHELL = "min-h-screen bg-gradient-to-b from-background via-background to-muted/20";
const CS_CONTAINER = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24 pt-4 sm:pt-6";
const CS_HERO =
  "relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-card/85 via-background to-primary/[0.09] p-6 md:p-8 shadow-xl shadow-black/20";
const CS_HERO_GLOW_BEFORE =
  "pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl";
const CS_HERO_GLOW_AFTER =
  "pointer-events-none absolute -bottom-20 -left-16 h-44 w-44 rounded-full bg-accent/15 blur-3xl";
const CS_TAB_WRAP =
  "sticky top-0 z-20 -mx-4 border-b border-border/50 bg-background/85 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none";
const CS_TAB_LIST =
  "inline-flex h-auto w-full flex-wrap gap-1.5 justify-start rounded-xl border border-border/60 bg-secondary/40 p-1.5 shadow-inner backdrop-blur-sm sm:w-auto";
const CS_TAB_TRIGGER =
  "gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all duration-200 sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-secondary data-[state=inactive]:hover:text-foreground";
const CS_STAT_CARD =
  "group relative overflow-hidden rounded-xl border border-border/55 bg-gradient-to-br from-card/60 to-card/30 p-5 shadow-sm transition-all duration-300 hover:border-primary/35 hover:shadow-lg hover:shadow-primary/10";
const CS_PANEL =
  "glass rounded-xl border border-border/50 shadow-md shadow-black/15 transition-all duration-200 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5";

/**
 * Platform Super Admin — "Central Station" (admin host / simulate admin entry).
 *
 * Deploy: use a non-obvious host path (e.g. internal.…/central-station), IP allowlist, and MFA for `admin` users.
 * Heavy analytics should use a read-replica later so pulse queries do not contend with live match traffic.
 */
export default function SystemAdmin() {
  const queryClient = useQueryClient();
  const { logout, user, checkAppState } = useAuth();
  const [banEmail, setBanEmail] = useState("");
  const [banHwid, setBanHwid] = useState("");
  const [banReason, setBanReason] = useState("");
  const [tmplTitle, setTmplTitle] = useState("");
  const [tmplRoster, setTmplRoster] = useState(5);
  const [tmplScoring, setTmplScoring] = useState("best_of_1");
  const [tmplMaps, setTmplMaps] = useState("");
  const [tmplRulesJson, setTmplRulesJson] = useState("{}");
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [impersonating, setImpersonating] = useState(getImpersonatedTenantId());
  const [tenantSearch, setTenantSearch] = useState("");
  const [newSecretKey, setNewSecretKey] = useState("riot_api");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [resendApiKeyInput, setResendApiKeyInput] = useState("");
  const [mfaSetupSecret, setMfaSetupSecret] = useState("");
  const [mfaVerifyCode, setMfaVerifyCode] = useState("");
  const [mfaDisablePassword, setMfaDisablePassword] = useState("");
  const [entryFeePercentDraft, setEntryFeePercentDraft] = useState(5);
  const [overrideTenant, setOverrideTenant] = useState(null);
  const [brandingOverride, setBrandingOverride] = useState({
    primaryColor: "#00d4ff",
    secondaryColor: "#0a0e1a",
    accentColor: "#ff4655",
    displayFont: "Orbitron",
  });
  const [disputeNotes, setDisputeNotes] = useState("");
  const [activeDispute, setActiveDispute] = useState(null);
  const [brandingOpen, setBrandingOpen] = useState(false);

  const { data: health, isError: healthError } = useQuery({
    queryKey: ["system-admin-health"],
    queryFn: async () => {
      const t0 = performance.now();
      const res = await fetch(apiBasePath("/api/health"));
      const apiMs = Math.round(performance.now() - t0);
      const body = await res.json().catch(() => ({}));
      return { ...body, apiMs, httpOk: res.ok };
    },
    refetchInterval: 30_000,
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ["all-tenants"],
    queryFn: () => maxikay.entities.Tenant.list("-updated_date", 500),
  });

  const { data: tenantConfigs = [] } = useQuery({
    queryKey: ["all-tenant-configs"],
    queryFn: () => maxikay.entities.TenantConfig.list("-updated_date", 500),
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["all-payments"],
    queryFn: () => maxikay.entities.PaymentLedger.list("-updated_date", 1000),
  });

  const { data: tournaments = [] } = useQuery({
    queryKey: ["all-tournaments"],
    queryFn: () => maxikay.entities.Tournament.list("-updated_date", 500),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["all-teams-pulse"],
    queryFn: () => maxikay.entities.Team.list("-updated_date", 1500),
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["all-matches-pulse"],
    queryFn: () => maxikay.entities.Match.list("-updated_date", 800),
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["platform-audit-logs"],
    queryFn: () => maxikay.entities.AuditLog.list("-created_date", 300),
  });

  const { data: matchReports = [] } = useQuery({
    queryKey: ["platform-match-reports"],
    queryFn: () => maxikay.entities.MatchReport.list("-created_date", 400),
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["platform-withdrawals"],
    queryFn: () => maxikay.entities.WithdrawalRequest.list("-created_date", 200),
  });

  const { data: prizePayments = [] } = useQuery({
    queryKey: ["platform-prize-payments"],
    queryFn: () => maxikay.entities.PrizePayment.list("-created_date", 300),
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["platform-tenant-wallets"],
    queryFn: () => maxikay.entities.TenantWallet.list("-updated_date", 500),
  });

  const { data: gameTemplates = [] } = useQuery({
    queryKey: ["platform-game-templates"],
    queryFn: () => maxikay.entities.GameTemplate.list("-updated_date", 100),
  });

  const { data: platformConfigRows = [] } = useQuery({
    queryKey: ["platform-config-admin"],
    queryFn: () => maxikay.entities.PlatformConfig.list(),
  });

  const { data: pulseReplica } = useQuery({
    queryKey: ["system-pulse-readonly"],
    queryFn: () => maxikay.system.pulseReadonly(),
    staleTime: 15_000,
  });

  const { data: hwidBanPayload } = useQuery({
    queryKey: ["platform-hwid-bans"],
    queryFn: () => maxikay.system.hwidBansList(),
    staleTime: 30_000,
  });
  const hwidBans = hwidBanPayload?.bans ?? [];

  const { data: stripeEscrow } = useQuery({
    queryKey: ["system-stripe-escrow"],
    queryFn: () => maxikay.system.stripeEscrow(),
    staleTime: 60_000,
  });

  const { data: vaultSecrets } = useQuery({
    queryKey: ["system-platform-secrets"],
    queryFn: () => maxikay.system.platformSecretsList(),
  });

  const { data: emailStatus } = useQuery({
    queryKey: ["system-email-status"],
    queryFn: () => maxikay.system.emailStatus(),
    staleTime: 30_000,
  });

  const platformConfig = platformConfigRows[0] || {};
  const platformMaintenance = !!platformConfig.platform_maintenance;
  const manualReportingMode = !!platformConfig.manual_reporting_mode;

  useEffect(() => {
    const v = platformConfig.entry_platform_fee_percent;
    if (v == null || Number.isNaN(Number(v))) return;
    const n = Number(v);
    setEntryFeePercentDraft(Math.min(25, Math.max(0, n)));
  }, [platformConfig.entry_platform_fee_percent]);

  const entryFeePercentSafe = useMemo(
    () => Math.min(25, Math.max(0, Number(entryFeePercentDraft) || 0)),
    [entryFeePercentDraft]
  );

  const updateTenantMutation = useMutation({
    mutationFn: ({ id, patch }) => maxikay.entities.Tenant.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tenants"] });
      toast.success("Tenant updated");
    },
    onError: (e) => toast.error(e?.message || "Update failed"),
  });

  const saveCommissionMutation = useMutation({
    mutationFn: () =>
      maxikay.entities.PlatformConfig.update("platform-config", {
        entry_platform_fee_percent: entryFeePercentSafe,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-config-admin"] });
      toast.success("Platform entry fee % saved");
    },
    onError: (e) => toast.error(e?.message || "Could not save commission"),
  });

  const savePlatformMutation = useMutation({
    mutationFn: (patch) => maxikay.entities.PlatformConfig.update("platform-config", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-config-admin"] });
      toast.success("Platform settings saved");
    },
    onError: (e) => toast.error(e?.message || "Save failed"),
  });

  const saveVaultSecretMutation = useMutation({
    mutationFn: () => maxikay.system.platformSecretPut(newSecretKey, newSecretValue),
    onSuccess: () => {
      setNewSecretValue("");
      queryClient.invalidateQueries({ queryKey: ["system-platform-secrets"] });
      queryClient.invalidateQueries({ queryKey: ["system-email-status"] });
      toast.success("Secret stored (server vault)");
    },
    onError: (e) => toast.error(e?.message || "Vault save failed — set SECRETS_MASTER_KEY on API"),
  });

  const saveResendApiKeyMutation = useMutation({
    mutationFn: (keyVal) => maxikay.system.platformSecretPut("resend_api_key", keyVal),
    onSuccess: () => {
      setResendApiKeyInput("");
      queryClient.invalidateQueries({ queryKey: ["system-platform-secrets"] });
      queryClient.invalidateQueries({ queryKey: ["system-email-status"] });
      toast.success("Resend API key saved to vault");
    },
    onError: (e) => toast.error(e?.message || "Vault save failed — set SECRETS_MASTER_KEY on API"),
  });

  const testEmailMutation = useMutation({
    mutationFn: (body) => maxikay.system.testEmail(body),
    onSuccess: (data) => {
      if (data?.result?.stub) toast.message("Email stub — configure provider + secrets");
      else toast.success("Test email sent");
      queryClient.invalidateQueries({ queryKey: ["system-email-status"] });
    },
    onError: (e) => toast.error(e?.message || "Send failed"),
  });

  const defaultEmailSettings = useMemo(
    () => ({
      provider: "none",
      from_address: "",
      from_name: "Arena",
      smtp: { host: "", port: 587, secure: false, user: "" },
    }),
    []
  );
  const emailSettings = useMemo(() => {
    const raw = platformConfig.email_settings;
    const o = raw && typeof raw === "object" ? raw : {};
    return {
      ...defaultEmailSettings,
      ...o,
      smtp: { ...defaultEmailSettings.smtp, ...(o.smtp || {}) },
    };
  }, [platformConfig.email_settings, defaultEmailSettings]);

  const defaultPaymentSettings = useMemo(
    () => ({
      stripe_enabled: true,
      paystack_enabled: true,
      flutterwave_enabled: true,
      stripe_publishable_key: "",
      paystack_public_key: "",
      flutterwave_public_key: "",
    }),
    []
  );
  const paymentGatewaySettings = useMemo(() => {
    const raw = platformConfig.payment_gateway_settings;
    const o = raw && typeof raw === "object" ? raw : {};
    return { ...defaultPaymentSettings, ...o };
  }, [platformConfig.payment_gateway_settings, defaultPaymentSettings]);

  const [emailForm, setEmailForm] = useState(emailSettings);
  const [paymentForm, setPaymentForm] = useState(paymentGatewaySettings);

  useEffect(() => {
    setEmailForm(emailSettings);
  }, [emailSettings]);

  useEffect(() => {
    setPaymentForm(paymentGatewaySettings);
  }, [paymentGatewaySettings]);

  const banUserMutation = useMutation({
    mutationFn: async () => {
      const email = banEmail.trim();
      const hwid = banHwid.trim();
      if (!banReason.trim() || (!email && !hwid)) {
        throw new Error("Provide a reason and at least an email or HWID");
      }
      if (hwid) {
        await maxikay.system.hwidBanCreate({
          hwid,
          reason: banReason.trim(),
        });
      }
      if (email) {
        await maxikay.integrations.Core.SendEmail({
          to: email,
          subject: "Account Suspended",
          body: `Your account has been suspended for the following reason: ${banReason}. Contact support for appeal.`,
        });
      }
      return { email, hwid };
    },
    onSuccess: () => {
      setBanEmail("");
      setBanHwid("");
      setBanReason("");
      queryClient.invalidateQueries({ queryKey: ["all-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["platform-hwid-bans"] });
      toast.success("Ban recorded (email notice if provided; HWID persisted for auth checks when clients send client_hwid)");
    },
    onError: (e) => toast.error(e?.message || "Ban action failed (check email integration / API)"),
  });

  const hwidUnbanMutation = useMutation({
    mutationFn: (id) => maxikay.system.hwidBanDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-hwid-bans"] });
      toast.success("HWID unbanned");
    },
    onError: (e) => toast.error(e?.message || "Could not remove HWID ban"),
  });

  const createTemplateMutation = useMutation({
    mutationFn: () => {
      const maps = tmplMaps
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return maxikay.entities.GameTemplate.create({
        title: tmplTitle.trim(),
        roster_size: Number(tmplRoster) || 1,
        scoring_mode: tmplScoring,
        map_pool: maps,
        rules_json: tmplRulesJson.trim() || "{}",
        created_by: user?.email || "platform_admin",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-game-templates"] });
      setTmplTitle("");
      setTmplMaps("");
      setTmplRulesJson("{}");
      toast.success("Blueprint created");
    },
    onError: (e) => toast.error(e?.message || "Could not create template"),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, patch }) => maxikay.entities.GameTemplate.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-game-templates"] });
      setEditingTemplate(null);
      toast.success("Blueprint updated");
    },
    onError: (e) => toast.error(e?.message || "Update failed"),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => maxikay.entities.GameTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-game-templates"] });
      toast.success("Blueprint removed");
    },
    onError: (e) => toast.error(e?.message || "Delete failed"),
  });

  const deleteTenantMutation = useMutation({
    mutationFn: (tenantId) => maxikay.entities.Tenant.delete(tenantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-tenants"] }),
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: ({ id, status, review_notes }) =>
      maxikay.entities.MatchReport.update(id, { status, review_notes: review_notes || null, reviewed_by: "platform_admin" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-match-reports"] });
      setActiveDispute(null);
      setDisputeNotes("");
      toast.success("Ruling recorded");
    },
    onError: (e) => toast.error(e?.message || "Could not update dispute"),
  });

  const withdrawalReviewMutation = useMutation({
    mutationFn: ({ id, status, notes, aml_status }) =>
      maxikay.entities.WithdrawalRequest.update(id, {
        ...(status != null ? { status } : {}),
        ...(notes != null ? { notes } : {}),
        ...(aml_status != null ? { aml_status } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-withdrawals"] });
      toast.success("Withdrawal updated");
    },
    onError: (e) => toast.error(e?.message || "Withdrawal update failed"),
  });

  const prizeAmlMutation = useMutation({
    mutationFn: ({ id, aml_status, notes }) =>
      maxikay.entities.PrizePayment.update(id, {
        ...(aml_status != null ? { aml_status } : {}),
        ...(notes != null ? { notes } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-prize-payments"] });
      toast.success("Prize AML status updated");
    },
    onError: (e) => toast.error(e?.message || "Update failed"),
  });

  const filteredTenants = useMemo(() => {
    const q = tenantSearch.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) =>
        (t.name || "").toLowerCase().includes(q) ||
        (t.slug || "").toLowerCase().includes(q) ||
        (t.owner_email || "").toLowerCase().includes(q)
    );
  }, [tenants, tenantSearch]);

  const activeTenantCount = useMemo(() => tenants.filter((t) => t.status === "active").length, [tenants]);

  const liveTournamentIds = useMemo(() => {
    const ids = new Set();
    for (const t of tournaments) {
      if (t.status === "in_progress") ids.add(t.id);
    }
    return ids;
  }, [tournaments]);

  const concurrentPlayers = useMemo(() => {
    let n = 0;
    for (const tm of teams) {
      if (!liveTournamentIds.has(tm.tournament_id)) continue;
      const r = tm.roster;
      n += Array.isArray(r) ? r.length : 0;
    }
    return n;
  }, [teams, liveTournamentIds]);

  const liveMatches = useMemo(
    () => matches.filter((m) => m.status === "in_progress" || m.status === "check_in_open"),
    [matches]
  );

  const commissionLedgerTotal = useMemo(
    () => payments.filter((p) => p.type === "platform_fee").reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments]
  );

  const entryFeesTotal = useMemo(
    () => payments.filter((p) => p.type === "entry_fee").reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments]
  );

  const revenueSnapshot = useMemo(() => {
    if (commissionLedgerTotal > 0) return commissionLedgerTotal;
    const pct = Number(platformConfig.entry_platform_fee_percent ?? entryFeePercentSafe) / 100;
    return entryFeesTotal * pct;
  }, [commissionLedgerTotal, entryFeesTotal, platformConfig.entry_platform_fee_percent, entryFeePercentSafe]);

  const disputedReports = useMemo(() => matchReports.filter((r) => r.status === "disputed"), [matchReports]);

  const escrowApprox = useMemo(() => {
    const walletSum = wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
    const pendingPrizes = prizePayments.filter((p) => p.status === "pending").reduce((s, p) => s + (Number(p.prize_amount) || 0), 0);
    return walletSum + pendingPrizes;
  }, [wallets, prizePayments]);

  const payoutQueue = useMemo(() => {
    const w = withdrawals.filter((x) => x.status === "pending" || x.status === "processing");
    const bigPrizes = prizePayments.filter(
      (p) => p.status === "pending" && (Number(p.prize_amount) || 0) >= LARGE_PAYOUT_USD
    );
    return { withdrawals: w, bigPrizes };
  }, [withdrawals, prizePayments]);

  const configByTenantId = useMemo(() => {
    const m = new Map();
    for (const c of tenantConfigs) m.set(c.tenant_id, c);
    return m;
  }, [tenantConfigs]);

  const vaultKeySet = useMemo(() => new Set((vaultSecrets?.keys || []).map((k) => k.key_name)), [vaultSecrets]);

  if (tenantsLoading) return <LoadingSpinner />;

  return (
    <div className={CS_SHELL}>
      <div className={CS_CONTAINER}>
        <header className={CS_HERO}>
          <div className={CS_HERO_GLOW_BEFORE} aria-hidden />
          <div className={CS_HERO_GLOW_AFTER} aria-hidden />
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4 min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-display font-bold uppercase tracking-widest text-primary">
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Control plane
              </div>
              <PageHeader
                title="Central Station"
                subtitle="Platform pulse, tenants, security hardening, infrastructure, and financial controls — one console for operators."
                className="mb-0"
                actions={
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Button variant="outline" size="sm" onClick={() => logout()} className="gap-2 border-border/80 bg-background/50 hover:bg-background">
                      <LogOut className="w-4 h-4" /> Log out
                    </Button>
                    <Button
                      size="sm"
                      variant={platformMaintenance ? "destructive" : "default"}
                      className={platformMaintenance ? "gap-2" : "gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"}
                      onClick={() => savePlatformMutation.mutate({ platform_maintenance: !platformMaintenance })}
                      disabled={savePlatformMutation.isPending}
                    >
                      <ToggleRight className="w-4 h-4" />{" "}
                      {platformMaintenance ? "Maintenance ON — click to restore" : "Platform maintenance"}
                    </Button>
                  </div>
                }
              />
            </div>
          </div>
        </header>

        <div className={`${CS_PANEL} p-4 md:p-5`}>
          <p className="font-display font-semibold text-foreground flex items-center gap-2 text-sm tracking-tight">
            <Shield className="w-4 h-4 text-primary shrink-0" /> Security &amp; ops checklist
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-4xl">
            <code className="rounded bg-secondary/80 px-1 py-0.5 text-[10px]">ADMIN_IP_ALLOWLIST</code> restricts platform admin API calls
            by client IP.{" "}
            <code className="rounded bg-secondary/80 px-1 py-0.5 text-[10px]">MFA_REQUIRED_FOR_ADMIN=true</code> /{" "}
            <code className="rounded bg-secondary/80 px-1 py-0.5 text-[10px]">MFA_REQUIRED_FOR_SUPER_ADMIN=true</code> gate logins until
            TOTP is enabled. Platform maintenance and per-tenant league maintenance are enforced in API middleware. Secrets use{" "}
            <code className="rounded bg-secondary/80 px-1 py-0.5 text-[10px]">SECRETS_MASTER_KEY</code> (64 hex) +{" "}
            <code className="rounded bg-secondary/80 px-1 py-0.5 text-[10px]">DATABASE_READ_REPLICA_URL</code> for pulse summaries.
          </p>
        </div>

        {platformMaintenance && (
          <div className="rounded-xl border border-orange-500/40 bg-gradient-to-r from-orange-500/10 to-transparent p-4 md:p-5 flex items-start gap-3 shadow-lg shadow-orange-500/5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
              <AlertTriangle className="w-5 h-5 text-orange-400" aria-hidden />
            </div>
            <div className="text-sm min-w-0">
              <p className="font-display font-semibold text-orange-300">Platform maintenance is active</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Non-admin API traffic to <code className="rounded bg-background/50 px-1 text-[10px]">/api/v1</code>, functions, and
                integrations returns 503 until you turn this off (admins and{" "}
                <code className="rounded bg-background/50 px-1 text-[10px]">/api/system</code> still work).
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="pulse" className="space-y-6">
          <div className={CS_TAB_WRAP}>
            <TabsList className={CS_TAB_LIST}>
              <TabsTrigger value="pulse" className={CS_TAB_TRIGGER}>
                <Activity className="w-3.5 h-3.5 shrink-0 opacity-80" /> Pulse
              </TabsTrigger>
              <TabsTrigger value="tenants" className={CS_TAB_TRIGGER}>
                <Building2 className="w-3.5 h-3.5 shrink-0 opacity-80" /> Tenants
              </TabsTrigger>
              <TabsTrigger value="security" className={CS_TAB_TRIGGER}>
                <Lock className="w-3.5 h-3.5 shrink-0 opacity-80" /> Security
              </TabsTrigger>
              <TabsTrigger value="infrastructure" className={CS_TAB_TRIGGER}>
                <Server className="w-3.5 h-3.5 shrink-0 opacity-80" /> Infrastructure
              </TabsTrigger>
              <TabsTrigger value="financial" className={CS_TAB_TRIGGER}>
                <Landmark className="w-3.5 h-3.5 shrink-0 opacity-80" /> Financial
              </TabsTrigger>
            </TabsList>
          </div>

        <TabsContent value="pulse" className="space-y-4 focus-visible:outline-none">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={CS_STAT_CARD}>
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Building2 className="h-4 w-4" aria-hidden />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Live orgs</span>
              </div>
              <p className="mt-4 text-3xl font-display font-bold tabular-nums text-primary">{activeTenantCount}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-snug">Active tenants on the platform</p>
            </div>
            <div className={CS_STAT_CARD}>
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-lg bg-accent/15 p-2 text-accent">
                  <Users className="h-4 w-4" aria-hidden />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Arena load</span>
              </div>
              <p className="mt-4 text-3xl font-display font-bold tabular-nums text-accent">{concurrentPlayers}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-snug">Players in live tournaments (roster count)</p>
            </div>
            <div className={CS_STAT_CARD}>
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <DollarSign className="h-4 w-4" aria-hidden />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Commission</span>
              </div>
              <p className="mt-4 text-3xl font-display font-bold tabular-nums text-primary">${revenueSnapshot.toFixed(2)}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-snug">
                {commissionLedgerTotal > 0 ? "Ledger platform_fee" : "Estimated from entry fees × %"}
              </p>
            </div>
            <div className={CS_STAT_CARD}>
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-lg bg-secondary p-2 text-foreground">
                  <Activity className="h-4 w-4" aria-hidden />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Matches</span>
              </div>
              <p className="mt-4 text-3xl font-display font-bold tabular-nums text-foreground">{liveMatches.length}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-snug">Open / in-progress matches</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className={`${CS_PANEL} p-5 space-y-4`}>
              <h3 className="font-display font-semibold flex items-center gap-2 text-base border-b border-border/50 pb-3">
                <Cpu className="w-4 h-4 text-primary shrink-0" /> System health
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-secondary/40 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">API round-trip</p>
                  <p className="font-mono text-lg">{health?.apiMs != null ? `${health.apiMs} ms` : "—"}</p>
                  <Badge variant={healthError || !health?.httpOk ? "destructive" : "secondary"} className="mt-1 text-[10px]">
                    {healthError || !health?.httpOk ? "degraded" : "ok"}
                  </Badge>
                </div>
                <div className="rounded-lg bg-secondary/40 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Database</p>
                  <p className="font-mono text-lg">
                    {health?.database?.latency_ms != null ? `${health.database.latency_ms} ms` : "—"}
                  </p>
                  <Badge variant={health?.database?.ok === false ? "destructive" : "secondary"} className="mt-1 text-[10px]">
                    {health?.database?.ok === false ? "down" : "ok"}
                  </Badge>
                </div>
                <div className="rounded-lg bg-secondary/40 p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Tournament engine (DB pulse)</p>
                  <p className="font-mono text-lg">
                    {pulseReplica?.engine_query_ms != null ? `${pulseReplica.engine_query_ms} ms` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {pulseReplica?.engine_active_bracket_rows != null
                      ? `${pulseReplica.engine_active_bracket_rows} live bracket rows`
                      : "Open Pulse after replica endpoint loads"}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Engine metric times a cross-tenant bracket query (matches in active tournaments). Add worker Prometheus later for true
                process latency.
              </p>
            </div>

            <div className={`${CS_PANEL} p-5 space-y-3`}>
              <h3 className="font-display font-semibold flex items-center gap-2 text-base border-b border-border/50 pb-3">
                <Users className="w-4 h-4 text-accent shrink-0" /> At a glance
              </h3>
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li>Total organizations: {tenants.length}</li>
                <li>Tournaments in progress: {tournaments.filter((t) => t.status === "in_progress").length}</li>
                <li>Ledger rows (loaded): {payments.length}</li>
              </ul>
            </div>

            {pulseReplica && (
              <div className={`${CS_PANEL} p-5 space-y-3 md:col-span-2`}>
                <h3 className="font-display font-semibold flex items-center gap-2 text-base border-b border-border/50 pb-3">
                  <Server className="w-4 h-4 text-primary shrink-0" /> Read-replica pulse (analytics)
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Source: <span className="font-mono text-foreground">{pulseReplica.source}</span>
                  {pulseReplica.source === "primary_pool" ? " — set DATABASE_READ_REPLICA_URL to offload heavy reporting." : ""}
                </p>
                <ul className="text-xs text-muted-foreground grid sm:grid-cols-2 gap-2">
                  <li>Active tenants: {pulseReplica.active_tenants}</li>
                  <li>Tournaments in progress: {pulseReplica.tournaments_in_progress}</li>
                  <li>Teams (total): {pulseReplica.teams_total}</li>
                  <li>Platform fee ledger sum: ${Number(pulseReplica.platform_fee_ledger_sum || 0).toFixed(2)}</li>
                  <li>Engine query: {pulseReplica.engine_query_ms != null ? `${pulseReplica.engine_query_ms} ms` : "—"}</li>
                  <li>Live bracket rows: {pulseReplica.engine_active_bracket_rows ?? "—"}</li>
                </ul>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tenants" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                placeholder="Search organizations (name, slug, owner)…"
                className="pl-9 bg-secondary/40"
              />
            </div>
            <p className="text-xs text-muted-foreground">{filteredTenants.length} shown</p>
          </div>

          <div className={`${CS_PANEL} p-6 space-y-4`}>
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Tenant directory & subscription
            </h3>
            <div className="space-y-2 max-h-[28rem] overflow-y-auto">
              {impersonating && (
                <div className="flex items-center justify-between bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 mb-3">
                  <p className="text-xs text-orange-400 font-semibold">
                    Impersonating: {tenants.find((t) => t.id === impersonating)?.name || impersonating}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
                    onClick={() => {
                      setImpersonatedTenantId(null);
                      setImpersonating(null);
                      queryClient.invalidateQueries();
                      toast.success("Stopped impersonating");
                    }}
                  >
                    <LogOut className="w-3.5 h-3.5" /> Stop
                  </Button>
                </div>
              )}
              {filteredTenants.map((tenant) => {
                const tenantPayments = payments.filter((p) => p.tenant_id === tenant.id);
                const revenue = tenantPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                const isImpersonated = impersonating === tenant.id;
                const cfg = configByTenantId.get(tenant.id);

                return (
                  <div
                    key={tenant.id}
                    className={`flex flex-col lg:flex-row lg:items-center gap-3 justify-between rounded-lg p-3 ${
                      isImpersonated ? "bg-orange-500/10 border border-orange-500/30" : "bg-secondary/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{tenant.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {tenant.slug} · {tenant.owner_email}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {tenant.status}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {tenant.plan}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-right mr-2">
                        <p className="text-xs font-semibold">${revenue.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">ledger (tenant)</p>
                      </div>
                      <select
                        value={tenant.plan}
                        onChange={(e) =>
                          updateTenantMutation.mutate({ id: tenant.id, patch: { plan: e.target.value } })
                        }
                        className="text-xs rounded-md bg-secondary/80 border border-border px-2 py-1.5 text-foreground"
                      >
                        {["free", "starter", "pro", "enterprise"].map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      {tenant.status === "pending" && (
                        <Button
                          size="sm"
                          className="text-xs h-8 bg-emerald-600 hover:bg-emerald-600/90 text-white"
                          onClick={() =>
                            updateTenantMutation.mutate({ id: tenant.id, patch: { status: "active" } })
                          }
                        >
                          Approve org
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={tenant.status === "suspended" ? "secondary" : "outline"}
                        className="text-xs h-8"
                        onClick={() =>
                          updateTenantMutation.mutate({
                            id: tenant.id,
                            patch: { status: tenant.status === "suspended" ? "active" : "suspended" },
                          })
                        }
                      >
                        {tenant.status === "suspended" ? "Unfreeze" : "Freeze"}
                      </Button>
                      <Button
                        size="sm"
                        variant={tenant.maintenance_mode ? "destructive" : "outline"}
                        className="text-xs h-8"
                        title="League maintenance — blocks non-admin API for this tenant when X-Tenant-ID matches"
                        onClick={() =>
                          updateTenantMutation.mutate({
                            id: tenant.id,
                            patch: { maintenance_mode: !tenant.maintenance_mode },
                          })
                        }
                      >
                        {tenant.maintenance_mode ? "League maint ON" : "League maint"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-xs h-8"
                        title="Impersonate tenant admin context"
                        onClick={() => {
                          if (isImpersonated) {
                            setImpersonatedTenantId(null);
                            setImpersonating(null);
                            toast.success("Stopped impersonating");
                          } else {
                            setImpersonatedTenantId(tenant.id);
                            setImpersonating(tenant.id);
                            toast.success(`Impersonating ${tenant.name}`);
                          }
                          queryClient.invalidateQueries();
                        }}
                      >
                        {isImpersonated ? (
                          <LogOut className="w-3.5 h-3.5 text-orange-400" />
                        ) : (
                          <LogIn className="w-3.5 h-3.5 text-primary" />
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteTenantMutation.mutate(tenant.id)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                    {cfg?.logo_url && (
                      <div className="flex items-center gap-2 lg:ml-2">
                        <img src={cfg.logo_url} alt="" className="h-9 w-9 rounded object-contain bg-black/30 border border-border" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`${CS_PANEL} p-6 space-y-4`}>
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Palette className="w-4 h-4" /> White-label review
            </h3>
            <p className="text-sm text-muted-foreground">
              Gallery of tenant logos and accent colors for TOS / brand safety review.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-80 overflow-y-auto">
              {tenantConfigs.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-border/60 overflow-hidden bg-secondary/30"
                  style={{ borderTopColor: c.accent_color || "#333", borderTopWidth: 3 }}
                >
                  <div className="aspect-video flex items-center justify-center p-2 bg-black/20">
                    <img src={c.logo_url} alt="" className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="p-2 text-[10px] text-muted-foreground truncate">{c.tenant_name}</div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <div className={`${CS_PANEL} p-6 space-y-4 border border-border/60`}>
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Multi-factor authentication (TOTP)
            </h3>
            <p className="text-xs text-muted-foreground">
              Required for platform admins when <code className="text-[10px]">MFA_REQUIRED_FOR_ADMIN=true</code>. Use an authenticator app.
            </p>
            <Badge variant={user?.mfa_enabled ? "secondary" : "outline"} className="text-[10px]">
              {user?.mfa_enabled ? "MFA enabled" : "MFA off"}
            </Badge>
            {!user?.mfa_enabled ? (
              <div className="space-y-3 max-w-md">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const d = await maxikay.auth.mfaSetupInit();
                      setMfaSetupSecret(d.secret || "");
                      toast.success("Secret generated — add it to your authenticator app, then enter a 6-digit code below.");
                    } catch (e) {
                      toast.error(e?.message || "Could not start MFA setup");
                    }
                  }}
                >
                  Generate TOTP secret
                </Button>
                {mfaSetupSecret && (
                  <p className="text-[10px] font-mono break-all bg-secondary/40 p-2 rounded border border-border">
                    {mfaSetupSecret}
                  </p>
                )}
                <Input
                  placeholder="6-digit code"
                  value={mfaVerifyCode}
                  onChange={(e) => setMfaVerifyCode(e.target.value)}
                  className="bg-secondary/50"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!mfaSetupSecret || mfaVerifyCode.length < 6}
                  onClick={async () => {
                    try {
                      await maxikay.auth.mfaSetupVerify({ secret: mfaSetupSecret, code: mfaVerifyCode });
                      setMfaVerifyCode("");
                      setMfaSetupSecret("");
                      await checkAppState?.();
                      toast.success("MFA enabled");
                    } catch (e) {
                      toast.error(e?.message || "Verification failed");
                    }
                  }}
                >
                  Confirm & enable MFA
                </Button>
              </div>
            ) : (
              <div className="space-y-3 max-w-md">
                <Input
                  type="password"
                  placeholder="Account password"
                  value={mfaDisablePassword}
                  onChange={(e) => setMfaDisablePassword(e.target.value)}
                  className="bg-secondary/50"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!mfaDisablePassword}
                  onClick={async () => {
                    try {
                      await maxikay.auth.mfaDisable({ password: mfaDisablePassword });
                      setMfaDisablePassword("");
                      await checkAppState?.();
                      toast.success("MFA disabled");
                    } catch (e) {
                      toast.error(e?.message || "Could not disable MFA");
                    }
                  }}
                >
                  Disable MFA
                </Button>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className={`${CS_PANEL} p-6 space-y-4`}>
              <h3 className="font-display font-semibold flex items-center gap-2">
                <Ban className="w-4 h-4" /> Global ban list
              </h3>
              <p className="text-xs text-muted-foreground">
                Email: sends suspension notice (integration). HWID: stored platform-wide; login/register/MFA reject when the client sends{" "}
                <code className="text-[10px]">client_hwid</code> (see browser localStorage key arena_client_hwid — replace with real HWID
                from your anti-cheat client).
              </p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <AlertTriangle className="w-4 h-4" /> Ban user / identity
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Platform-wide ban</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-muted-foreground">Email (optional if HWID set)</label>
                      <Input
                        value={banEmail}
                        onChange={(e) => setBanEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="mt-1 bg-secondary/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Hardware ID (optional if email set)</label>
                      <Input
                        value={banHwid}
                        onChange={(e) => setBanHwid(e.target.value)}
                        placeholder="HWID / device fingerprint"
                        className="mt-1 bg-secondary/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Reason</label>
                      <textarea
                        value={banReason}
                        onChange={(e) => setBanReason(e.target.value)}
                        placeholder="Cheating, fraud, harassment…"
                        className="w-full mt-1 p-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground"
                        rows={3}
                      />
                    </div>
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => banUserMutation.mutate()}
                      disabled={
                        !banReason.trim() || (!banEmail.trim() && !banHwid.trim()) || banUserMutation.isPending
                      }
                    >
                      Confirm ban
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Persisted HWID bans ({hwidBans.length})</p>
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {hwidBans.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
                  {hwidBans.map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/30 px-2 py-1.5 text-xs"
                    >
                      <span className="font-mono truncate max-w-[200px]" title={b.hwid_norm}>
                        {b.hwid_norm}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] text-destructive"
                        disabled={hwidUnbanMutation.isPending}
                        onClick={() => hwidUnbanMutation.mutate(b.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`${CS_PANEL} p-6 space-y-4`}>
              <h3 className="font-display font-semibold flex items-center gap-2">
                <Gavel className="w-4 h-4" /> Dispute escalation
              </h3>
              <p className="text-xs text-muted-foreground">Match reports stuck in disputed — final ruling with evidence trail.</p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {disputedReports.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No escalated disputes</p>
                )}
                {disputedReports.map((r) => (
                  <div key={r.id} className="rounded-lg bg-secondary/40 p-3 text-sm space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-xs">{r.match_id}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Score {r.reported_score_a ?? "—"} – {r.reported_score_b ?? "—"} · {(r.screenshot_urls || []).length} screenshots
                    </p>
                    <Button size="sm" variant="outline" className="text-xs h-7 mt-1" onClick={() => setActiveDispute(r)}>
                      Review & rule
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${CS_PANEL} p-6 space-y-3`}>
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4" /> Audit log explorer
            </h3>
            <div className="max-h-80 overflow-y-auto space-y-1 text-xs font-mono">
              {auditLogs.length === 0 && <p className="text-muted-foreground text-center py-8">No audit rows returned</p>}
              {auditLogs.map((log) => (
                <div key={log.id} className="rounded-md bg-secondary/30 px-2 py-1.5 border border-border/40">
                  <span className="text-muted-foreground">{new Date(log.created_date).toLocaleString()}</span>{" "}
                  <span className="text-primary">{log.action}</span> · {log.actor_email}
                  {log.entity_type && (
                    <>
                      {" "}
                      → {log.entity_type}:{log.entity_id}
                    </>
                  )}
                  {log.details && <p className="text-[10px] text-muted-foreground truncate">{log.details}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className={`${CS_PANEL} p-6 space-y-4`}>
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Palette className="w-4 h-4" /> Branding override
            </h3>
            <p className="text-sm text-muted-foreground">Force CSS tokens for a tenant (violations, legal, testing).</p>
            <Button variant="outline" className="gap-2" size="sm" onClick={() => setBrandingOpen(true)}>
              <Palette className="w-4 h-4" /> Override branding
            </Button>
            <Dialog
              open={brandingOpen}
              onOpenChange={(open) => {
                setBrandingOpen(open);
                if (!open) setOverrideTenant(null);
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Override tenant branding</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Tenant</label>
                    <select
                      value={overrideTenant || ""}
                      onChange={(e) => setOverrideTenant(e.target.value || null)}
                      className="w-full mt-1 p-2 rounded-md bg-secondary/50 border border-border text-sm text-foreground"
                    >
                      <option value="">Choose tenant…</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Primary</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="color"
                        value={brandingOverride.primaryColor}
                        onChange={(e) => setBrandingOverride({ ...brandingOverride, primaryColor: e.target.value })}
                        className="h-10 w-20 rounded-md cursor-pointer"
                      />
                      <Input
                        value={brandingOverride.primaryColor}
                        onChange={(e) => setBrandingOverride({ ...brandingOverride, primaryColor: e.target.value })}
                        className="flex-1 bg-secondary/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Accent</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="color"
                        value={brandingOverride.accentColor}
                        onChange={(e) => setBrandingOverride({ ...brandingOverride, accentColor: e.target.value })}
                        className="h-10 w-20 rounded-md cursor-pointer"
                      />
                      <Input
                        value={brandingOverride.accentColor}
                        onChange={(e) => setBrandingOverride({ ...brandingOverride, accentColor: e.target.value })}
                        className="flex-1 bg-secondary/50"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      if (overrideTenant) {
                        overrideTenantBranding(overrideTenant, brandingOverride);
                        setOverrideTenant(null);
                        setBrandingOpen(false);
                        toast.success("Branding override applied (client store)");
                      }
                    }}
                    className="w-full"
                    disabled={!overrideTenant}
                  >
                    Apply override
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="infrastructure" className="space-y-4">
          <div className={`${CS_PANEL} p-4 border-primary/25 space-y-2 text-xs text-muted-foreground`}>
            <p className="font-semibold text-foreground">Using this tab</p>
            <p>
              Open <strong className="text-foreground">Central Station</strong> at{" "}
              <code className="text-[10px] text-foreground">/central-station</code> while signed in as a platform{" "}
              <code className="text-[10px] text-foreground">admin</code> (not <code className="text-[10px]">/super-admin</code>).
              Below: <strong className="text-foreground">(1)</strong> Email settings + Resend key,{" "}
              <strong className="text-foreground">(2)</strong> Payment toggles + publishable keys,{" "}
              <strong className="text-foreground">(3)</strong> Secrets vault for API secrets (Paystack/FW secret, Flutterwave hash, SMTP password).
              Server falls back to <code className="text-[10px]">server/.env</code> when vault values are missing.
            </p>
          </div>
          <div className={`${CS_PANEL} p-6 space-y-4`}>
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email (Resend or SMTP)
            </h3>
            <p className="text-xs text-muted-foreground">
              Outbound mail uses <code className="text-[10px]">platform_config.email_settings</code> plus vault{" "}
              <code className="text-[10px]">resend_api_key</code> or <code className="text-[10px]">smtp_password</code>. Env{" "}
              <code className="text-[10px]">RESEND_API_KEY</code> / <code className="text-[10px]">MAIL_FROM</code> are used when vault/config
              does not supply a key.
            </p>
            {emailStatus && (
              <p className="text-xs text-muted-foreground">
                Status: <span className="text-foreground font-mono">{emailStatus.provider}</span> · from{" "}
                <span className="text-foreground font-mono">{emailStatus.from}</span> ·{" "}
                {emailStatus.configured ? (
                  <span className="text-green-400">ready</span>
                ) : (
                  <span className="text-amber-400">not fully configured</span>
                )}
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[10px] text-muted-foreground">Provider</label>
                <select
                  value={emailForm.provider || "none"}
                  onChange={(e) => setEmailForm((f) => ({ ...f, provider: e.target.value }))}
                  className="w-full mt-1 h-9 rounded-md bg-secondary/80 border border-border px-2 text-foreground"
                >
                  <option value="none">None (log only / env Resend fallback)</option>
                  <option value="resend">Resend (API)</option>
                  <option value="smtp">SMTP</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">From name</label>
                <Input
                  value={emailForm.from_name || ""}
                  onChange={(e) => setEmailForm((f) => ({ ...f, from_name: e.target.value }))}
                  className="mt-1 h-9 bg-secondary/50 text-xs"
                  placeholder="Arena"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">From address</label>
                <Input
                  value={emailForm.from_address || ""}
                  onChange={(e) => setEmailForm((f) => ({ ...f, from_address: e.target.value }))}
                  className="mt-1 h-9 bg-secondary/50 text-xs"
                  placeholder="noreply@yourdomain.com"
                />
              </div>
            </div>
            <div className="rounded-lg border border-border/50 p-3 bg-secondary/20 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Resend API key (vault)</p>
              <p className="text-[11px] text-muted-foreground">
                Set provider to <strong className="text-foreground">Resend</strong> above, then save the key here (encrypted). Same as choosing{" "}
                <code className="text-[10px]">resend_api_key</code> in the vault form below.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] text-muted-foreground">re_… key</label>
                  <Input
                    type="password"
                    value={resendApiKeyInput}
                    onChange={(e) => setResendApiKeyInput(e.target.value)}
                    placeholder="Paste Resend API key"
                    className="mt-1 bg-secondary/50 font-mono text-[11px]"
                    autoComplete="off"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !resendApiKeyInput.trim() ||
                    saveResendApiKeyMutation.isPending ||
                    !vaultSecrets?.configured
                  }
                  onClick={() => saveResendApiKeyMutation.mutate(resendApiKeyInput.trim())}
                >
                  Save Resend key to vault
                </Button>
              </div>
              {!vaultSecrets?.configured && (
                <p className="text-[11px] text-amber-500/90">Configure SECRETS_MASTER_KEY on the API to enable vault saves (or use RESEND_API_KEY in env).</p>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-xs rounded-lg border border-border/50 p-3 bg-secondary/20">
              <p className="sm:col-span-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">SMTP (if provider = SMTP)</p>
              <div>
                <label className="text-[10px] text-muted-foreground">Host</label>
                <Input
                  value={emailForm.smtp?.host || ""}
                  onChange={(e) =>
                    setEmailForm((f) => ({ ...f, smtp: { ...f.smtp, host: e.target.value } }))
                  }
                  className="mt-1 h-8 bg-secondary/50 font-mono text-[11px]"
                  placeholder="smtp.example.com"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Port</label>
                <Input
                  type="number"
                  value={emailForm.smtp?.port ?? 587}
                  onChange={(e) =>
                    setEmailForm((f) => ({ ...f, smtp: { ...f.smtp, port: Number(e.target.value) || 587 } }))
                  }
                  className="mt-1 h-8 bg-secondary/50 text-[11px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">User</label>
                <Input
                  value={emailForm.smtp?.user || ""}
                  onChange={(e) =>
                    setEmailForm((f) => ({ ...f, smtp: { ...f.smtp, user: e.target.value } }))
                  }
                  className="mt-1 h-8 bg-secondary/50 text-[11px]"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!emailForm.smtp?.secure}
                    onChange={(e) =>
                      setEmailForm((f) => ({ ...f, smtp: { ...f.smtp, secure: e.target.checked } }))
                    }
                  />
                  TLS (secure / port 465)
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={savePlatformMutation.isPending}
                onClick={() => savePlatformMutation.mutate({ email_settings: emailForm })}
              >
                Save email settings
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={testEmailMutation.isPending}
                onClick={() => testEmailMutation.mutate({ to: user?.email })}
              >
                Send test to {user?.email || "me"}
              </Button>
            </div>
          </div>

          <div className={`${CS_PANEL} p-6 space-y-4`}>
            <h3 className="font-display font-semibold flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Payment gateways
            </h3>
            <p className="text-xs text-muted-foreground">
              Toggle rails and store <strong className="text-foreground">publishable</strong> keys in{" "}
              <code className="text-[10px]">payment_gateway_settings</code>. <strong className="text-foreground">Secret</strong> keys (
              <code className="text-[10px]">sk_…</code>, <code className="text-[10px]">FLWSECK_…</code>, Flutterwave hash) go in the{" "}
              <strong className="text-foreground">secrets vault</strong> below or in <code className="text-[10px]">server/.env</code>. Checkout is initialized
              server-side; public keys are optional for your own SDKs / future client use.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {[
                { k: "stripe_enabled", label: "Stripe" },
                { k: "paystack_enabled", label: "Paystack" },
                { k: "flutterwave_enabled", label: "Flutterwave" },
              ].map(({ k, label }) => (
                <div key={k} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <span className="font-medium">{label}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant={paymentForm[k] === false ? "outline" : "default"}
                    onClick={() => setPaymentForm((p) => ({ ...p, [k]: p[k] === false ? true : false }))}
                  >
                    {paymentForm[k] === false ? "OFF" : "ON"}
                  </Button>
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">Stripe publishable key (optional, pk_…)</label>
                <Input
                  value={paymentForm.stripe_publishable_key || ""}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, stripe_publishable_key: e.target.value }))}
                  className="mt-1 font-mono text-[11px] bg-secondary/50"
                  placeholder="pk_live_… or pk_test_…"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">Paystack public key (optional, pk_test_… / pk_live_…)</label>
                <Input
                  value={paymentForm.paystack_public_key || ""}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, paystack_public_key: e.target.value }))}
                  className="mt-1 font-mono text-[11px] bg-secondary/50"
                  placeholder="pk_test_…"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">Flutterwave public key (optional)</label>
                <Input
                  value={paymentForm.flutterwave_public_key || ""}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, flutterwave_public_key: e.target.value }))}
                  className="mt-1 font-mono text-[11px] bg-secondary/50"
                  placeholder="FLWPUBK_TEST-…"
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={savePlatformMutation.isPending}
              onClick={() => savePlatformMutation.mutate({ payment_gateway_settings: paymentForm })}
            >
              Save payment settings
            </Button>
          </div>

          <div className={`${CS_PANEL} p-6 space-y-4`}>
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Wrench className="w-4 h-4" /> Game API hub & secrets vault
            </h3>
            <p className="text-xs text-muted-foreground">
              Values are encrypted with <code className="text-[10px]">SECRETS_MASTER_KEY</code> and never returned to the browser.
              Integrations read them server-side only.
            </p>
            {!vaultSecrets?.configured && (
              <p className="text-xs text-amber-500/90">
                Vault not configured — generate a 32-byte hex key (64 chars) and set <code className="text-[10px]">SECRETS_MASTER_KEY</code> on the API process.
              </p>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { key: "riot_api", label: "Riot" },
                { key: "steam_api", label: "Steam" },
                { key: "ubisoft_api", label: "Ubisoft" },
                { key: "resend_api_key", label: "Resend API" },
                { key: "smtp_password", label: "SMTP password" },
                { key: "stripe_secret_key", label: "Stripe secret" },
                { key: "paystack_secret_key", label: "Paystack secret" },
                { key: "flutterwave_secret_key", label: "Flutterwave secret" },
                { key: "flutterwave_secret_hash", label: "Flutterwave hash" },
              ].map(({ key, label }) => (
                <div key={key} className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{label}</span>
                  <Badge variant={vaultKeySet.has(key) ? "secondary" : "outline"} className="text-[10px]">
                    {vaultKeySet.has(key) ? "In vault" : "Missing"}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] text-muted-foreground">Provider</label>
                <select
                  value={newSecretKey}
                  onChange={(e) => setNewSecretKey(e.target.value)}
                  className="w-full mt-1 text-xs rounded-md bg-secondary/80 border border-border px-2 py-2 text-foreground"
                >
                  <option value="riot_api">riot_api</option>
                  <option value="steam_api">steam_api</option>
                  <option value="ubisoft_api">ubisoft_api</option>
                  <option value="resend_api_key">resend_api_key</option>
                  <option value="smtp_password">smtp_password</option>
                  <option value="stripe_secret_key">stripe_secret_key</option>
                  <option value="paystack_secret_key">paystack_secret_key</option>
                  <option value="flutterwave_secret_key">flutterwave_secret_key</option>
                  <option value="flutterwave_secret_hash">flutterwave_secret_hash</option>
                </select>
              </div>
              <div className="flex-[2] min-w-[200px]">
                <label className="text-[10px] text-muted-foreground">Secret value</label>
                <Input
                  type="password"
                  value={newSecretValue}
                  onChange={(e) => setNewSecretValue(e.target.value)}
                  placeholder="Paste API key"
                  className="mt-1 bg-secondary/50"
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                className="gap-2"
                disabled={!newSecretValue.trim() || saveVaultSecretMutation.isPending || !vaultSecrets?.configured}
                onClick={() => saveVaultSecretMutation.mutate()}
              >
                <KeyRound className="w-4 h-4" /> Save to vault
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 p-3">
              <div>
                <p className="text-sm font-medium">Manual reporting mode</p>
                <p className="text-xs text-muted-foreground">Persisted in platform_config — fallback when vendor APIs are down</p>
              </div>
              <Button
                variant={manualReportingMode ? "default" : "outline"}
                size="sm"
                disabled={savePlatformMutation.isPending}
                onClick={() => savePlatformMutation.mutate({ manual_reporting_mode: !manualReportingMode })}
              >
                {manualReportingMode ? "ON" : "OFF"}
              </Button>
            </div>
          </div>

          <div className={`${CS_PANEL} p-6 space-y-3`}>
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4" /> Template builder (blueprints)
            </h3>
            <p className="text-xs text-muted-foreground">
              Canonical templates visible to all tenants (public catalog read). Only platform admins can create, edit, or delete rows.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-2 rounded-lg bg-secondary/30 p-3">
                <p className="font-semibold text-foreground">New blueprint</p>
                <Input
                  placeholder="Title"
                  value={tmplTitle}
                  onChange={(e) => setTmplTitle(e.target.value)}
                  className="h-8 bg-secondary/50 text-xs"
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Roster size</label>
                    <Input
                      type="number"
                      min={1}
                      value={tmplRoster}
                      onChange={(e) => setTmplRoster(Number(e.target.value))}
                      className="h-8 mt-0.5 bg-secondary/50 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Scoring</label>
                    <select
                      value={tmplScoring}
                      onChange={(e) => setTmplScoring(e.target.value)}
                      className="w-full mt-0.5 h-8 rounded-md bg-secondary/80 border border-border px-2 text-foreground"
                    >
                      {["best_of_1", "best_of_3", "best_of_5", "points"].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Map pool (comma-separated)</label>
                  <Input
                    value={tmplMaps}
                    onChange={(e) => setTmplMaps(e.target.value)}
                    placeholder="Map1, Map2"
                    className="h-8 mt-0.5 bg-secondary/50 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">rules_json</label>
                  <Input
                    value={tmplRulesJson}
                    onChange={(e) => setTmplRulesJson(e.target.value)}
                    className="h-8 mt-0.5 bg-secondary/50 text-xs font-mono"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  disabled={!tmplTitle.trim() || createTemplateMutation.isPending}
                  onClick={() => createTemplateMutation.mutate()}
                >
                  Create blueprint
                </Button>
              </div>
              <ul className="text-sm space-y-1 max-h-64 overflow-y-auto">
                {gameTemplates.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/30 px-2 py-1.5">
                    <div className="min-w-0">
                      <span className="font-medium">{g.title}</span>
                      <span className="text-xs text-muted-foreground block">
                        roster {g.roster_size} · {g.scoring_mode}
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditingTemplate(g)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive"
                        disabled={deleteTemplateMutation.isPending}
                        onClick={() => deleteTemplateMutation.mutate(g.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit blueprint</DialogTitle>
                </DialogHeader>
                {editingTemplate && (
                  <EditTemplateForm
                    template={editingTemplate}
                    onSave={(patch) => updateTemplateMutation.mutate({ id: editingTemplate.id, patch })}
                    onCancel={() => setEditingTemplate(null)}
                    pending={updateTemplateMutation.isPending}
                  />
                )}
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          <div className={`${CS_PANEL} p-5 border-primary/20 space-y-2`}>
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Landmark className="w-4 h-4" /> Stripe Connect (live balances)
            </h3>
            {stripeEscrow?.configured ? (
              <p className="text-sm text-muted-foreground">
                Available (USD):{" "}
                <span className="font-mono text-foreground font-semibold">${Number(stripeEscrow.available_usd || 0).toFixed(2)}</span>
                {" · "}
                Pending:{" "}
                <span className="font-mono text-foreground">${Number(stripeEscrow.pending_usd || 0).toFixed(2)}</span>
                {" · "}
                Connected accounts checked: {stripeEscrow.accounts_checked}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{stripeEscrow?.message || "Loading…"}</p>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className={`${CS_PANEL} p-4`}>
              <p className="text-2xl font-display font-bold text-primary">${escrowApprox.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Escrow proxy (wallet balances + pending prizes)</p>
            </div>
            <div className={`${CS_PANEL} p-4`}>
              <p className="text-2xl font-display font-bold text-accent">{payoutQueue.withdrawals.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Withdrawal queue (pending / processing)</p>
            </div>
            <div className={`${CS_PANEL} p-4`}>
              <p className="text-2xl font-display font-bold text-primary">{payoutQueue.bigPrizes.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Large prize rows (≥ ${LARGE_PAYOUT_USD})</p>
            </div>
          </div>

          <div className={`${CS_PANEL} p-6 space-y-4`}>
            <h3 className="font-display font-semibold">Payout queue & AML review</h3>
            <p className="text-[11px] text-muted-foreground">
              Withdrawals and large prizes carry <code className="text-[10px]">aml_status</code>: none · review · cleared · sar_flagged
              (compliance workflow — not legal advice).
            </p>
            <div className="space-y-4 max-h-72 overflow-y-auto">
              <p className="text-xs font-semibold text-muted-foreground">Withdrawals</p>
              {payoutQueue.withdrawals.map((w) => (
                <div key={w.id} className="flex flex-col gap-2 bg-secondary/40 rounded-lg p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs">{w.tenant_id}</p>
                      <p className="text-xs text-muted-foreground">
                        ${Number(w.amount).toFixed(2)} · {w.status}
                      </p>
                      <Badge variant="outline" className="text-[9px] mt-1">
                        AML: {w.aml_status || "none"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() =>
                          withdrawalReviewMutation.mutate({
                            id: w.id,
                            status: "processing",
                            aml_status: "cleared",
                            notes: "Approved (platform)",
                          })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-amber-500"
                        onClick={() =>
                          withdrawalReviewMutation.mutate({
                            id: w.id,
                            aml_status: "review",
                            notes: "Hold for AML review",
                          })
                        }
                      >
                        AML hold
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-emerald-500"
                        onClick={() => withdrawalReviewMutation.mutate({ id: w.id, aml_status: "cleared" })}
                      >
                        Clear AML
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-400"
                        onClick={() =>
                          withdrawalReviewMutation.mutate({
                            id: w.id,
                            aml_status: "sar_flagged",
                            notes: "SAR / escalation",
                          })
                        }
                      >
                        SAR flag
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-xs font-semibold text-muted-foreground pt-2">Large prize payments</p>
              {payoutQueue.bigPrizes.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 bg-secondary/40 rounded-lg p-3 text-sm">
                  <div>
                    <p className="font-semibold">{p.team_name || p.team_id}</p>
                    <p className="text-xs text-muted-foreground">
                      ${Number(p.prize_amount).toFixed(2)} · {p.tournament_id}
                    </p>
                    <Badge variant="outline" className="text-[9px] mt-1">
                      AML: {p.aml_status || "none"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-amber-500"
                      onClick={() =>
                        prizeAmlMutation.mutate({ id: p.id, aml_status: "review", notes: "Large prize — AML review" })
                      }
                    >
                      AML hold
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-emerald-500"
                      onClick={() => prizeAmlMutation.mutate({ id: p.id, aml_status: "cleared" })}
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-red-400"
                      onClick={() => prizeAmlMutation.mutate({ id: p.id, aml_status: "sar_flagged" })}
                    >
                      SAR
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${CS_PANEL} p-6 space-y-4`}>
            <h3 className="font-display font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Commission settings
            </h3>
            <p className="text-xs text-muted-foreground">
              Global platform cut on entry fees (stored as <code className="text-[10px]">entry_platform_fee_percent</code>).
            </p>
            <div className="space-y-3 max-w-md">
              <div className="flex justify-between text-sm">
                <span>Entry fee take rate</span>
                <span className="font-mono font-semibold">{entryFeePercentSafe}%</span>
              </div>
              <Slider
                value={[entryFeePercentSafe]}
                min={0}
                max={25}
                step={0.5}
                onValueChange={(v) => setEntryFeePercentDraft(v[0])}
              />
              <Button
                onClick={() => saveCommissionMutation.mutate()}
                disabled={saveCommissionMutation.isPending}
                className="w-full sm:w-auto"
              >
                Save commission
              </Button>
            </div>
          </div>

          <div className={`${CS_PANEL} p-6 space-y-2`}>
            <h3 className="font-display font-semibold">Recent ledger (sample)</h3>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {payments.slice(0, 12).map((payment) => (
                <div key={payment.id} className="flex items-center justify-between bg-secondary/40 rounded-lg p-3 text-sm">
                  <div>
                    <p className="font-semibold text-xs">{payment.type}</p>
                    <p className="text-[10px] text-muted-foreground">{payment.tenant_id}</p>
                  </div>
                  <p className="font-semibold text-primary">${Number(payment.amount).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!activeDispute} onOpenChange={(o) => !o && setActiveDispute(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dispute: {activeDispute?.match_id}</DialogTitle>
          </DialogHeader>
          {activeDispute && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground text-xs">
                Reported {activeDispute.reported_score_a ?? "—"} – {activeDispute.reported_score_b ?? "—"}
              </p>
              {activeDispute.notes && <p className="text-xs bg-secondary/40 rounded p-2">{activeDispute.notes}</p>}
              <div className="flex flex-wrap gap-2">
                {(activeDispute.screenshot_urls || []).map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                    evidence
                  </a>
                ))}
              </div>
              <textarea
                value={disputeNotes}
                onChange={(e) => setDisputeNotes(e.target.value)}
                placeholder="Ruling notes (visible to tenant admins when you expose them)"
                className="w-full p-2 rounded-md bg-secondary/50 border border-border text-sm min-h-[80px]"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() =>
                    resolveDisputeMutation.mutate({
                      id: activeDispute.id,
                      status: "rejected",
                      review_notes: disputeNotes,
                    })
                  }
                >
                  Reject report
                </Button>
                <Button
                  onClick={() =>
                    resolveDisputeMutation.mutate({
                      id: activeDispute.id,
                      status: "approved",
                      review_notes: disputeNotes,
                    })
                  }
                >
                  Approve report
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
