import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { Save, Palette, Bell, CreditCard, Landmark, Wallet } from "lucide-react";
import PlanStatus from "../components/shared/PlanStatus";
import { sendDiscordNotification } from "../lib/discord";
import { motion } from "framer-motion";
import { useTenant } from "@/hooks/useTenant";

const DEFAULT_PAYOUT_SETTINGS = {
  primary_rail: "stripe",
  paystack_subaccount_code: "",
  flutterwave_subaccount_id: "",
  settlement_currency: "USD",
  internal_notes: "",
};

export default function Settings() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["tenant-config"],
    queryFn: () => maxikay.entities.TenantConfig.list(),
  });

  const { data: platformConfigRows = [] } = useQuery({
    queryKey: ["platform-config-read"],
    queryFn: () => maxikay.entities.PlatformConfig.list(),
    staleTime: 60_000,
  });

  const config = configs[0];
  const platformFeePct = platformConfigRows[0]?.entry_platform_fee_percent;

  const { data: stripeConnect } = useQuery({
    queryKey: ["stripe-connect-status", tenantId, config?.stripe_account_id],
    queryFn: () => maxikay.payments.stripeConnectStatus(),
    enabled: Boolean(tenantId && config?.stripe_account_id),
    staleTime: 60_000,
    retry: 1,
  });

  const [form, setForm] = useState({
    tenant_name: "",
    logo_url: "https://mails.bybata.com/logomail.png",
    primary_color: "#00d4ff",
    secondary_color: "#0a0e1a",
    accent_color: "#ff4655",
    display_font: "Orbitron",
    custom_domain: "",
    discord_webhook_url: "",
    social_links: { twitter: "", discord: "", twitch: "", youtube: "" },
    payout_settings: { ...DEFAULT_PAYOUT_SETTINGS },
  });

  useEffect(() => {
    if (config) {
      const rawPayout = config.payout_settings;
      const payoutObj =
        rawPayout && typeof rawPayout === "object" && !Array.isArray(rawPayout) ? rawPayout : {};
      const rawSocial =
        config.social_links && typeof config.social_links === "object" && !Array.isArray(config.social_links)
          ? config.social_links
          : {};
      const payout_settings = { ...DEFAULT_PAYOUT_SETTINGS };
      for (const key of Object.keys(DEFAULT_PAYOUT_SETTINGS)) {
        const v = payoutObj[key];
        payout_settings[key] = v == null || v === undefined ? DEFAULT_PAYOUT_SETTINGS[key] : String(v);
      }
      setForm({
        tenant_name: config.tenant_name ?? "",
        logo_url: config.logo_url || "https://mails.bybata.com/logomail.png",
        primary_color: config.primary_color || "#00d4ff",
        secondary_color: config.secondary_color || "#0a0e1a",
        accent_color: config.accent_color || "#ff4655",
        display_font: config.display_font || "Orbitron",
        custom_domain: config.custom_domain ?? "",
        discord_webhook_url: config.discord_webhook_url ?? "",
        social_links: {
          twitter: rawSocial.twitter ?? "",
          discord: rawSocial.discord ?? "",
          twitch: rawSocial.twitch ?? "",
          youtube: rawSocial.youtube ?? "",
        },
        payout_settings,
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data };
      if (config) return maxikay.entities.TenantConfig.update(config.id, payload);
      if (tenantId) payload.tenant_id = tenantId;
      return maxikay.entities.TenantConfig.create(payload);
    },
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["tenant-config"] });
      queryClient.invalidateQueries({ queryKey: ["stripe-connect-status"] });
    },
  });

  const testWebhook = async () => {
    await sendDiscordNotification(form.discord_webhook_url, {
      title: "🔔 Arena SaaS — Test Notification",
      description: `Webhook successfully connected for **${form.tenant_name || "your org"}**!`,
      color: 0x00d4ff,
    });
    alert("Discord test notification sent!");
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const updateSocial = (field, value) => setForm(prev => ({ ...prev, social_links: { ...prev.social_links, [field]: value } }));
  const updatePayout = (field, value) =>
    setForm((prev) => ({
      ...prev,
      payout_settings: { ...prev.payout_settings, [field]: value },
    }));

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 md:pb-0">
      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Plan & Billing
        </h2>
        <PlanStatus />
      </div>

      <PageHeader
        title="Settings"
        subtitle="Configure your organization branding"
        actions={
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="gap-2 font-display text-xs tracking-wider">
            <Save className="w-4 h-4" /> {saveMutation.isPending ? "Saving..." : "SAVE"}
          </Button>
        }
      />

      <div className="glass rounded-xl p-6 space-y-5">
        <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-2">
          <Palette className="w-4 h-4" /> Branding
        </h2>
        
        <div>
          <Label>Organization Name</Label>
          <Input
            value={form.tenant_name ?? ""}
            onChange={(e) => update("tenant_name", e.target.value)}
            className="mt-1 bg-secondary/50"
            placeholder="Your org name"
          />
        </div>

        <div>
          <Label>Logo URL</Label>
          <Input value={form.logo_url ?? ""} onChange={(e) => update("logo_url", e.target.value)} className="mt-1 bg-secondary/50" />
          {form.logo_url && (
            <div className="mt-3 w-16 h-16 rounded-xl bg-secondary/50 p-2 flex items-center justify-center">
              <img src={form.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Primary Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={form.primary_color ?? "#000000"} onChange={(e) => update("primary_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0" />
              <Input value={form.primary_color ?? ""} onChange={(e) => update("primary_color", e.target.value)} className="bg-secondary/50 font-mono text-xs" />
            </div>
          </div>
          <div>
            <Label>Secondary Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={form.secondary_color ?? "#000000"} onChange={(e) => update("secondary_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0" />
              <Input value={form.secondary_color ?? ""} onChange={(e) => update("secondary_color", e.target.value)} className="bg-secondary/50 font-mono text-xs" />
            </div>
          </div>
          <div>
            <Label>Accent Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={form.accent_color ?? "#000000"} onChange={(e) => update("accent_color", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0" />
              <Input value={form.accent_color ?? ""} onChange={(e) => update("accent_color", e.target.value)} className="bg-secondary/50 font-mono text-xs" />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div>
          <Label className="text-xs">Theme Preview</Label>
          <motion.div 
            className="mt-2 rounded-xl p-4 border border-border/50"
            style={{ background: form.secondary_color }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: form.primary_color + "22" }}>
                <div className="w-3 h-3 rounded" style={{ background: form.primary_color }} />
              </div>
              <span className="font-display text-xs font-bold tracking-wider" style={{ color: form.primary_color }}>
                {form.tenant_name || "ARENA"}
              </span>
            </div>
            <div className="flex gap-2">
              <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: form.primary_color, color: form.secondary_color }}>
                Primary
              </div>
              <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: form.accent_color, color: "#fff" }}>
                Accent
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="glass rounded-xl p-6 space-y-5">
        <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">Domain & Integrations</h2>
        
        <div>
          <Label>Custom Domain</Label>
          <Input value={form.custom_domain ?? ""} onChange={(e) => update("custom_domain", e.target.value)} className="mt-1 bg-secondary/50" placeholder="e.g. tournaments.yourorg.com" />
        </div>

        <div>
          <Label>Discord Webhook URL</Label>
          <div className="flex gap-2 mt-1">
            <Input value={form.discord_webhook_url ?? ""} onChange={(e) => update("discord_webhook_url", e.target.value)} className="bg-secondary/50" placeholder="https://discord.com/api/webhooks/..." />
            {form.discord_webhook_url && (
              <Button type="button" variant="outline" size="sm" onClick={testWebhook} className="gap-1.5 text-xs whitespace-nowrap">
                <Bell className="w-3 h-3" /> Test
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-2">
            <Landmark className="w-4 h-4" /> Payouts & payment rails
          </h2>
          <Button variant="outline" size="sm" asChild className="gap-2 text-xs font-display">
            <Link to="/wallet">
              <Wallet className="w-3.5 h-3.5" /> Open wallet
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Choose the default rail for prize releases and reconciliation. Actual transfers still run from{" "}
          <strong className="text-foreground">Wallet → Send payout</strong> (Stripe Connect, Paystack Transfer, Flutterwave, or manual).
          Platform secrets and webhooks stay server-side; store only non-secret references here.
        </p>
        {platformFeePct != null && Number.isFinite(Number(platformFeePct)) && (
          <p className="text-[11px] rounded-md border border-border/50 bg-secondary/30 px-3 py-2 text-muted-foreground">
            Platform entry fee (reference): <strong className="text-foreground">{Number(platformFeePct)}%</strong> — surfaced from live{" "}
            <code className="text-[10px]">platform_config</code>; settlement still follows your rail above.
          </p>
        )}
        <div className="text-[11px] text-muted-foreground space-y-1.5">
          <p>
            Stripe Connect:{" "}
            <span className="text-foreground font-medium">
              {config?.stripe_account_id ? "Connected account on file" : "Not connected — finish registration / Connect onboarding"}
            </span>
            . Status below is read from Stripe on the server (requires <code className="text-[10px]">STRIPE_SECRET_KEY</code> on the API).
          </p>
          {config?.stripe_account_id && stripeConnect?.ok && stripeConnect.connected_account_id && (
            <div className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <span>
                Charges:{" "}
                <strong className={stripeConnect.charges_enabled ? "text-green-400" : "text-amber-300"}>
                  {stripeConnect.charges_enabled ? "enabled" : "not enabled"}
                </strong>
              </span>
              <span>
                Payouts:{" "}
                <strong className={stripeConnect.payouts_enabled ? "text-green-400" : "text-amber-300"}>
                  {stripeConnect.payouts_enabled ? "enabled" : "pending / restricted"}
                </strong>
              </span>
              <span>Onboarding: {stripeConnect.details_submitted ? "details submitted" : "incomplete"}</span>
              {stripeConnect.country && <span>Country: {String(stripeConnect.country).toUpperCase()}</span>}
              {stripeConnect.disabled_reason && (
                <span className="sm:col-span-2 text-destructive">Stripe: {stripeConnect.disabled_reason}</span>
              )}
            </div>
          )}
          {config?.stripe_account_id && stripeConnect && !stripeConnect.ok && stripeConnect.reason === "stripe_not_configured" && (
            <p className="text-amber-200/80">Set STRIPE_SECRET_KEY on the API to load live Connect flags.</p>
          )}
          {config?.stripe_account_id && stripeConnect && !stripeConnect.ok && stripeConnect.reason === "stripe_retrieve_failed" && (
            <p className="text-amber-200/80">Could not load Connect account: {stripeConnect.error || "Stripe error"}</p>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Player entry fees: Discover supports <strong className="text-foreground">Stripe</strong>, <strong className="text-foreground">Paystack</strong>, and{" "}
          <strong className="text-foreground">Flutterwave</strong> when the matching API keys are configured (see server <code className="text-[9px]">.env</code>).
        </p>
        <div>
          <Label>Primary rail</Label>
          <Select
            value={form.payout_settings.primary_rail || "stripe"}
            onValueChange={(v) => updatePayout("primary_rail", v)}
          >
            <SelectTrigger className="mt-1 bg-secondary/50">
              <SelectValue placeholder="Select rail" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stripe">Stripe Connect (escrow / transfers)</SelectItem>
              <SelectItem value="paystack">Paystack (NGN &amp; regional)</SelectItem>
              <SelectItem value="flutterwave">Flutterwave (multi-currency)</SelectItem>
              <SelectItem value="manual">Manual / bank (ledger only)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Stripe Connect account ID</Label>
          <Input
            value={config?.stripe_account_id || ""}
            readOnly
            disabled
            className="mt-1 bg-secondary/30 font-mono text-xs text-muted-foreground"
            placeholder="Not connected — complete registration or Connect onboarding"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Managed via tenant registration / Connect; not editable here.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Paystack subaccount / split code (reference)</Label>
            <Input
              value={form.payout_settings.paystack_subaccount_code || ""}
              onChange={(e) => updatePayout("paystack_subaccount_code", e.target.value)}
              className="mt-1 bg-secondary/50 font-mono text-xs"
              placeholder="e.g. ACCT_xxx or split code"
            />
          </div>
          <div>
            <Label>Flutterwave subaccount ID (reference)</Label>
            <Input
              value={form.payout_settings.flutterwave_subaccount_id || ""}
              onChange={(e) => updatePayout("flutterwave_subaccount_id", e.target.value)}
              className="mt-1 bg-secondary/50 font-mono text-xs"
              placeholder="Subaccount ID from dashboard"
            />
          </div>
        </div>
        <div>
          <Label>Settlement currency (display / default)</Label>
          <Input
            value={form.payout_settings.settlement_currency || "USD"}
            onChange={(e) => updatePayout("settlement_currency", e.target.value.toUpperCase().slice(0, 8))}
            className="mt-1 bg-secondary/50 font-mono text-xs max-w-[120px]"
            placeholder="USD"
          />
          {String(form.payout_settings.settlement_currency || "").toUpperCase() === "NGN" && (
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              NGN: configure <strong className="text-foreground">PAYSTACK_SECRET_KEY</strong> and/or <strong className="text-foreground">FLUTTERWAVE_SECRET_KEY</strong> on the API so entry-fee checkout matches Stripe-style flows; set subaccount references above for splits.
            </p>
          )}
        </div>
        <div>
          <Label>Internal notes (payouts / finance)</Label>
          <Input
            value={form.payout_settings.internal_notes || ""}
            onChange={(e) => updatePayout("internal_notes", e.target.value)}
            className="mt-1 bg-secondary/50 text-sm"
            placeholder="e.g. Use Paystack for Lagos events; Stripe for international"
          />
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/20 p-4 space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p className="font-display font-bold text-foreground text-[11px] uppercase tracking-wider">Typical settlement timelines</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>
              <strong className="text-foreground">Stripe Connect</strong> — payouts to connected accounts often 2–7 business days after transfer;
              instant payouts where enabled. Escrow / separate charges depend on your Connect configuration.
            </li>
            <li>
              <strong className="text-foreground">Paystack</strong> — Nigerian settlements frequently T+1 (business days); cross-border and KYC state can vary.
            </li>
            <li>
              <strong className="text-foreground">Flutterwave</strong> — settlement timing varies by country and payout method; check the Flutterwave dashboard for the subaccount.
            </li>
          </ul>
          <p className="text-[10px] pt-1">
            API keys and webhooks never belong in this form — only non-secret references (subaccount IDs, split codes). Prize release still runs through{" "}
            <strong className="text-foreground">Wallet → Send payout</strong> and server-side ledger entries.
          </p>
        </div>
      </div>

      <div className="glass rounded-xl p-6 space-y-5">
        <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">Social Links</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Twitter</Label>
            <Input value={form.social_links.twitter ?? ""} onChange={(e) => updateSocial("twitter", e.target.value)} className="mt-1 bg-secondary/50" placeholder="https://twitter.com/..." />
          </div>
          <div>
            <Label>Discord</Label>
            <Input value={form.social_links.discord ?? ""} onChange={(e) => updateSocial("discord", e.target.value)} className="mt-1 bg-secondary/50" placeholder="https://discord.gg/..." />
          </div>
          <div>
            <Label>Twitch</Label>
            <Input value={form.social_links.twitch ?? ""} onChange={(e) => updateSocial("twitch", e.target.value)} className="mt-1 bg-secondary/50" placeholder="https://twitch.tv/..." />
          </div>
          <div>
            <Label>YouTube</Label>
            <Input value={form.social_links.youtube ?? ""} onChange={(e) => updateSocial("youtube", e.target.value)} className="mt-1 bg-secondary/50" placeholder="https://youtube.com/..." />
          </div>
        </div>
      </div>

      {saveMutation.isSuccess && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-green-400 text-center">
          Settings saved successfully!
        </motion.p>
      )}
    </div>
  );
}