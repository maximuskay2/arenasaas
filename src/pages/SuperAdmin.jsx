import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { maxikay } from "@/api/maxikayClient";
import { motion } from "framer-motion";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  AlertTriangle,
  Building2,
  Cpu,
  CreditCard,
  DollarSign,
  Gavel,
  Landmark,
  Layers,
  Lock,
  LogOut,
  Mail,
  Palette,
  Search,
  Server,
  Shield,
  ToggleRight,
  Trash2,
  Wrench,
  Plus,
  Pause,
  Play,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";
import { isSystemAdmin } from "@/lib/routingLogic";
import moment from "moment";

const PLAN_LIMITS = { free: 5, starter: 20, pro: 100, enterprise: 9999 };
const PLAN_COLORS = {
  free: "text-muted-foreground bg-muted",
  starter: "text-blue-400 bg-blue-500/10 border border-blue-500/30",
  pro: "text-primary bg-primary/10 border border-primary/30",
  enterprise: "text-yellow-400 bg-yellow-500/10 border border-yellow-500/30",
};

/**
 * Tenant Super Admin — "League command post" (/super-admin).
 * Same section names as Central Station (SystemAdmin), scoped to your league — not the multi-tenant platform.
 */
export default function SuperAdmin() {
  const { isSuperAdmin, tenantId, tenantConfig } = useTenant();
  const { logout, user, checkAppState } = useAuth();
  const queryClient = useQueryClient();
  const [mfaSetupSecret, setMfaSetupSecret] = useState("");
  const [mfaVerifyCode, setMfaVerifyCode] = useState("");
  const [mfaDisablePassword, setMfaDisablePassword] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    owner_email: "",
    plan: "free",
    region: "us",
    payment_provider: "stripe",
  });

  const { data: tenants = [], isLoading: loadingTenants } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => maxikay.entities.Tenant.list("-created_date", 100),
    enabled: isSuperAdmin,
  });

  const { data: allTournaments = [] } = useQuery({
    queryKey: ["all-tournaments"],
    queryFn: () => maxikay.entities.Tournament.list("-created_date", 200),
    enabled: isSuperAdmin,
  });

  const { data: allTeams = [] } = useQuery({
    queryKey: ["all-teams"],
    queryFn: () => maxikay.entities.Team.list("-created_date", 400),
    enabled: isSuperAdmin,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["sa-matches"],
    queryFn: () => maxikay.entities.Match.list("-updated_date", 400),
    enabled: isSuperAdmin,
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["sa-audit"],
    queryFn: () => maxikay.entities.AuditLog.list("-created_date", 150),
    enabled: isSuperAdmin,
  });

  const { data: matchReports = [] } = useQuery({
    queryKey: ["sa-match-reports"],
    queryFn: () => maxikay.entities.MatchReport.list("-created_date", 200),
    enabled: isSuperAdmin,
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["sa-withdrawals"],
    queryFn: () => maxikay.entities.WithdrawalRequest.list("-created_date", 100),
    enabled: isSuperAdmin,
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["sa-wallets"],
    queryFn: () => maxikay.entities.TenantWallet.list("-updated_date", 50),
    enabled: isSuperAdmin,
  });

  const { data: prizePayments = [] } = useQuery({
    queryKey: ["sa-prize-payments"],
    queryFn: () => maxikay.entities.PrizePayment.list("-created_date", 100),
    enabled: isSuperAdmin,
  });

  const { data: gameTemplates = [] } = useQuery({
    queryKey: ["sa-game-templates"],
    queryFn: () => maxikay.entities.GameTemplate.list("-updated_date", 50),
    enabled: isSuperAdmin,
  });

  const { data: tenantConfigs = [] } = useQuery({
    queryKey: ["sa-tenant-configs"],
    queryFn: () => maxikay.entities.TenantConfig.list("-updated_date", 80),
    enabled: isSuperAdmin,
  });

  const createTenant = useMutation({
    mutationFn: (data) => maxikay.entities.Tenant.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setCreateOpen(false);
      setForm({ name: "", slug: "", owner_email: "", plan: "free", region: "us", payment_provider: "stripe" });
    },
  });

  const updateTenantStatus = useMutation({
    mutationFn: ({ id, status }) => maxikay.entities.Tenant.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });

  const updateTenantMaint = useMutation({
    mutationFn: ({ id, maintenance_mode }) => maxikay.entities.Tenant.update(id, { maintenance_mode }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });

  const updatePlan = useMutation({
    mutationFn: ({ id, plan }) => maxikay.entities.Tenant.update(id, { plan, max_tournaments: PLAN_LIMITS[plan] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });

  const deleteTenant = useMutation({
    mutationFn: (id) => maxikay.entities.Tenant.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });

  const scopeId = tenantId || null;
  const scopeName = tenantConfig?.tenant_name || "your league";

  const scopedTournaments = useMemo(
    () => (scopeId ? allTournaments.filter((t) => t.tenant_id === scopeId) : allTournaments),
    [allTournaments, scopeId]
  );
  const scopedTeams = useMemo(
    () => (scopeId ? allTeams.filter((t) => t.tenant_id === scopeId) : allTeams),
    [allTeams, scopeId]
  );
  const liveTournamentIds = useMemo(() => {
    const s = new Set();
    for (const t of scopedTournaments) {
      if (t.status === "in_progress") s.add(t.id);
    }
    return s;
  }, [scopedTournaments]);
  const playersInLive = useMemo(() => {
    let n = 0;
    for (const tm of scopedTeams) {
      if (!liveTournamentIds.has(tm.tournament_id)) continue;
      const r = tm.roster;
      n += Array.isArray(r) ? r.length : 0;
    }
    return n;
  }, [scopedTeams, liveTournamentIds]);
  const liveMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          (m.status === "in_progress" || m.status === "check_in_open") &&
          (!scopeId || scopedTournaments.some((t) => t.id === m.tournament_id))
      ),
    [matches, scopeId, scopedTournaments]
  );

  const scopedAudit = useMemo(
    () => (scopeId ? auditLogs.filter((l) => l.tenant_id === scopeId) : auditLogs),
    [auditLogs, scopeId]
  );
  const scopedDisputes = useMemo(
    () =>
      matchReports.filter(
        (r) => r.status === "disputed" && (!scopeId || r.tenant_id === scopeId)
      ),
    [matchReports, scopeId]
  );
  const scopedWithdrawals = useMemo(
    () => (scopeId ? withdrawals.filter((w) => w.tenant_id === scopeId) : withdrawals),
    [withdrawals, scopeId]
  );
  const scopedPrizes = useMemo(
    () => (scopeId ? prizePayments.filter((p) => p.tenant_id === scopeId) : prizePayments),
    [prizePayments, scopeId]
  );
  const scopedWallet = useMemo(
    () => (scopeId ? wallets.find((w) => w.tenant_id === scopeId) : null),
    [wallets, scopeId]
  );

  const filtered = tenants.filter((t) => {
    const matchSearch =
      !search ||
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.slug?.toLowerCase().includes(search.toLowerCase()) ||
      t.owner_email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <Shield className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-display font-bold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground text-sm">League command post is restricted to tenant Super Admins.</p>
      </div>
    );
  }

  if (loadingTenants) return <LoadingSpinner />;

  const activeInScope = scopeId ? tenants.filter((t) => t.id === scopeId && t.status === "active").length : tenants.filter((t) => t.status === "active").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="px-2 py-0.5 rounded text-[10px] font-display font-bold tracking-widest bg-accent/20 text-accent border border-accent/30">
              TENANT SUPER ADMIN
            </span>
            <span>League command post</span>
          </span>
        }
        subtitle={`Same layout as Central Station — scoped to ${scopeName}. Platform-wide bans, commission %, API vault, and Stripe escrow live in Central Station only.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => logout()} className="gap-2">
              <LogOut className="w-4 h-4" /> Log out
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 font-display text-xs tracking-wider">
                  <Plus className="w-4 h-4" /> New organization
                </Button>
              </DialogTrigger>
              <DialogContent className="glass border-border/50">
                <DialogHeader>
                  <DialogTitle className="font-display">Create organization</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createTenant.mutate(form);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <Label>Organization name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      required
                      className="mt-1 bg-secondary/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Slug *</Label>
                      <Input
                        value={form.slug}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))
                        }
                        required
                        className="mt-1 bg-secondary/50 font-mono"
                      />
                    </div>
                    <div>
                      <Label>Plan</Label>
                      <Select value={form.plan} onValueChange={(v) => setForm((p) => ({ ...p, plan: v }))}>
                        <SelectTrigger className="mt-1 bg-secondary/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Owner email *</Label>
                    <Input
                      type="email"
                      value={form.owner_email}
                      onChange={(e) => setForm((p) => ({ ...p, owner_email: e.target.value }))}
                      required
                      className="mt-1 bg-secondary/50"
                    />
                  </div>
                  <Button type="submit" disabled={createTenant.isPending} className="w-full">
                    {createTenant.isPending ? "Creating…" : "Create"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="glass rounded-xl p-4 border border-border/60 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-primary" /> Naming
        </p>
        <p>
          <span className="text-foreground font-medium">Central Station</span> (platform <code className="text-[10px]">admin</code>) is
          the multi-tenant god view. This page is the <span className="text-foreground font-medium">League command post</span> (
          <code className="text-[10px]">super_admin</code>) for brackets, payouts, and branding inside one ecosystem.
        </p>
      </div>

      <Tabs defaultValue="pulse" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
          <TabsTrigger value="pulse" className="gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Pulse
          </TabsTrigger>
          <TabsTrigger value="organizations" className="gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> Organizations
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Security
          </TabsTrigger>
          <TabsTrigger value="infrastructure" className="gap-1.5">
            <Server className="w-3.5 h-3.5" /> Infrastructure
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5">
            <Landmark className="w-3.5 h-3.5" /> Financial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pulse" className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass rounded-lg p-4">
              <p className="text-2xl font-display font-bold text-primary">{activeInScope}</p>
              <p className="text-xs text-muted-foreground mt-1">Active orgs (visible scope)</p>
            </div>
            <div className="glass rounded-lg p-4">
              <p className="text-2xl font-display font-bold text-accent">{playersInLive}</p>
              <p className="text-xs text-muted-foreground mt-1">Players in live brackets (roster count)</p>
            </div>
            <div className="glass rounded-lg p-4">
              <p className="text-2xl font-display font-bold text-primary">
                ${scopedTournaments.reduce((s, t) => s + (Number(t.prize_pool) || 0), 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Prize pool (scoped tournaments)</p>
            </div>
            <div className="glass rounded-lg p-4">
              <p className="text-2xl font-display font-bold text-foreground">{liveMatches.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Open / in-progress matches</p>
            </div>
          </div>
          <div className="glass rounded-xl p-5 flex items-start gap-3">
            <Cpu className="w-5 h-5 text-primary mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">League health</p>
              <p className="text-xs mt-1">
                Tournaments in scope: {scopedTournaments.length} · Teams in scope: {scopedTeams.length}. Platform API latency lives in
                Central Station Pulse.
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="organizations" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search organizations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-secondary/50 border-border/50"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {["all", "active", "suspended", "pending"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === s ? "bg-primary/15 text-primary border border-primary/30" : "bg-secondary/50 text-muted-foreground"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="glass rounded-xl p-16 text-center text-muted-foreground text-sm">No organizations in this view.</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map((tenant, i) => (
                <motion.div
                  key={tenant.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`glass rounded-xl p-5 ${tenant.status === "suspended" ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-foreground">{tenant.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{tenant.slug}</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-display font-bold uppercase ${PLAN_COLORS[tenant.plan] || PLAN_COLORS.free}`}
                    >
                      {tenant.plan}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4 text-center text-sm">
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="font-display font-bold">{allTournaments.filter((t) => t.tenant_id === tenant.id).length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Tournaments</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="font-display font-bold">{allTeams.filter((t) => t.tenant_id === tenant.id).length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Teams</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-[11px] font-semibold uppercase">{tenant.region || "us"}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Region</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/50">
                    <Select value={tenant.plan} onValueChange={(plan) => updatePlan.mutate({ id: tenant.id, plan })}>
                      <SelectTrigger className="h-8 text-xs bg-secondary/50 flex-1 min-w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                    {tenant.status === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => updateTenantStatus.mutate({ id: tenant.id, status: "suspended" })}
                      >
                        <Pause className="w-3 h-3" /> Suspend
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => updateTenantStatus.mutate({ id: tenant.id, status: "active" })}
                      >
                        <Play className="w-3 h-3" /> Activate
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={tenant.maintenance_mode ? "destructive" : "outline"}
                      className="h-8 text-xs gap-1"
                      onClick={() =>
                        updateTenantMaint.mutate({ id: tenant.id, maintenance_mode: !tenant.maintenance_mode })
                      }
                    >
                      <ToggleRight className="w-3 h-3" />
                      {tenant.maintenance_mode ? "League maint" : "League maint"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{tenant.name}”?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Removes the tenant record only — clean up tournaments and teams first if needed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteTenant.mutate(tenant.id)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">Created {moment(tenant.created_date).fromNow()}</p>
                </motion.div>
              ))}
            </div>
          )}

          <div className="glass rounded-xl p-6 space-y-3">
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Palette className="w-4 h-4" /> White-label (scoped)
            </h3>
            <p className="text-xs text-muted-foreground">Logos and accents for organizations you can see.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
              {tenantConfigs.map((c) => (
                <div key={c.id} className="rounded-lg border border-border/60 overflow-hidden bg-secondary/30">
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
          <div className="glass rounded-xl p-6 space-y-4 border border-border/60">
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Multi-factor authentication (TOTP)
            </h3>
            <p className="text-xs text-muted-foreground">
              Same authenticator flow as Central Station. Required for your account when{" "}
              <code className="text-[10px]">MFA_REQUIRED_FOR_SUPER_ADMIN=true</code> on the API.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Status:</span>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                  user?.mfa_enabled ? "border-primary/40 text-primary bg-primary/10" : "border-border text-muted-foreground"
                }`}
              >
                {user?.mfa_enabled ? "MFA on" : "MFA off"}
              </span>
            </div>
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
                      toast.success("Add the secret to your authenticator app, then enter a 6-digit code below.");
                    } catch (e) {
                      toast.error(e?.message || "Could not start MFA setup");
                    }
                  }}
                >
                  Generate TOTP secret
                </Button>
                {mfaSetupSecret && (
                  <p className="text-[10px] font-mono break-all bg-secondary/40 p-2 rounded border border-border">{mfaSetupSecret}</p>
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

          <div className="glass rounded-xl p-5 border border-border/50">
            <h3 className="font-display font-semibold flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4" /> Ban & escalations
            </h3>
            <p className="text-xs text-muted-foreground mt-2">
              Platform-wide HWID bans and final dispute rulings are owned by{" "}
              <span className="text-foreground">Central Station</span>. Here you see league-scoped audit and dispute signals.
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="glass rounded-xl p-6 space-y-3">
              <h3 className="font-display font-semibold flex items-center gap-2">
                <Gavel className="w-4 h-4" /> Disputes (scoped)
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto text-sm">
                {scopedDisputes.length === 0 && <p className="text-muted-foreground text-center py-6 text-xs">No disputed reports</p>}
                {scopedDisputes.map((r) => (
                  <div key={r.id} className="rounded-lg bg-secondary/40 p-3 text-xs font-mono">
                    {r.match_id} · {(r.screenshot_urls || []).length} screenshots
                  </div>
                ))}
              </div>
            </div>
            <div className="glass rounded-xl p-6 space-y-3">
              <h3 className="font-display font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4" /> Audit trail (scoped)
              </h3>
              <div className="max-h-64 overflow-y-auto space-y-1 text-[10px] font-mono">
                {scopedAudit.length === 0 && <p className="text-muted-foreground text-center py-6">No rows</p>}
                {scopedAudit.map((log) => (
                  <div key={log.id} className="rounded-md bg-secondary/30 px-2 py-1 border border-border/40">
                    {new Date(log.created_date).toLocaleString()} {log.action} · {log.actor_email}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="infrastructure" className="space-y-4">
          <div className="glass rounded-xl p-6 space-y-4 border border-primary/15">
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Server className="w-4 h-4" /> Resend, Paystack &amp; Flutterwave (where to configure)
            </h3>
            <p className="text-xs text-muted-foreground">
              Tenant <strong className="text-foreground">Super Admin</strong> does not include platform secrets. Those live in{" "}
              <strong className="text-foreground">Central Station</strong> — platform admin only (
              <code className="text-[10px]">admin.</code> subdomain or, in dev,{" "}
              <code className="text-[10px]">VITE_SIMULATE_ENTRY=admin</code> + route{" "}
              <code className="text-[10px]">/central-station</code>).
            </p>
            <ul className="text-xs text-muted-foreground space-y-2.5 list-none">
              <li className="flex gap-2">
                <Mail className="w-4 h-4 shrink-0 text-primary mt-0.5" />
                <span>
                  <strong className="text-foreground">Resend:</strong> Central Station → <em>Infrastructure</em> → &quot;Email (Resend
                  or SMTP)&quot;. Set provider to Resend, from address/name, <strong className="text-foreground">Save email settings</strong>.
                  Paste the API key in <strong className="text-foreground">Secrets vault</strong> as{" "}
                  <code className="text-[10px] text-foreground">resend_api_key</code>, or set{" "}
                  <code className="text-[10px]">RESEND_API_KEY</code> on the API server (see <code className="text-[10px]">server/.env.example</code>
                  ).
                </span>
              </li>
              <li className="flex gap-2">
                <CreditCard className="w-4 h-4 shrink-0 text-primary mt-0.5" />
                <span>
                  <strong className="text-foreground">Paystack / Flutterwave:</strong> same tab → &quot;Payment gateways&quot; (toggle rails
                  on, save). <strong className="text-foreground">Secret</strong> keys go in the vault as{" "}
                  <code className="text-[10px] text-foreground">paystack_secret_key</code>,{" "}
                  <code className="text-[10px] text-foreground">flutterwave_secret_key</code>, and{" "}
                  <code className="text-[10px] text-foreground">flutterwave_secret_hash</code> (or the matching env vars in{" "}
                  <code className="text-[10px]">server/.env</code>). This app starts checkout <strong className="text-foreground">server-side</strong>
                  , so there is no separate &quot;public key&quot; field for Paystack/Flutterwave in the dashboard — only Stripe has an optional
                  publishable key row there.
                </span>
              </li>
            </ul>
            {isSystemAdmin() && (
              <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
                <Link to="/central-station">Open Central Station</Link>
              </Button>
            )}
          </div>
          <div className="glass rounded-xl p-6 space-y-3">
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Wrench className="w-4 h-4" /> Game API hub
            </h3>
            <p className="text-xs text-muted-foreground">
              Vendor keys and manual reporting mode are configured in <span className="text-foreground">Central Station</span> (secrets
              vault + platform_config). You operate brackets here; platform operators own the keys.
            </p>
          </div>
          <div className="glass rounded-xl p-6 space-y-3">
            <h3 className="font-display font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4" /> Template builder (blueprints)
            </h3>
            <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
              {gameTemplates.map((g) => (
                <li key={g.id} className="flex justify-between rounded-md bg-secondary/30 px-2 py-1.5">
                  <span>{g.title}</span>
                  <span className="text-xs text-muted-foreground">
                    roster {g.roster_size} · {g.scoring_mode}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          <div className="glass rounded-xl p-4 border border-amber-500/20">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Global entry-fee commission and Stripe Connect escrow totals are managed in Central Station — not here.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="glass rounded-lg p-4">
              <p className="text-2xl font-display font-bold text-primary">
                ${Number(scopedWallet?.balance || 0).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Wallet balance (scoped tenant)</p>
            </div>
            <div className="glass rounded-lg p-4">
              <p className="text-2xl font-display font-bold text-accent">{scopedWithdrawals.filter((w) => w.status === "pending").length}</p>
              <p className="text-xs text-muted-foreground mt-1">Pending withdrawals (scoped)</p>
            </div>
            <div className="glass rounded-lg p-4">
              <p className="text-2xl font-display font-bold text-primary">
                ${scopedPrizes.filter((p) => p.status === "pending").reduce((s, p) => s + (Number(p.prize_amount) || 0), 0).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Pending prizes (scoped)</p>
            </div>
          </div>
          <div className="glass rounded-xl p-6 space-y-2">
            <h3 className="font-display font-semibold text-sm">Withdrawals (scoped)</h3>
            <div className="max-h-48 overflow-y-auto space-y-2 text-sm">
              {scopedWithdrawals.slice(0, 12).map((w) => (
                <div key={w.id} className="flex justify-between bg-secondary/40 rounded-lg p-2">
                  <span className="font-mono text-xs">{w.tenant_id}</span>
                  <span>${Number(w.amount).toFixed(2)} · {w.status}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
