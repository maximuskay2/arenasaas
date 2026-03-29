import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { Link } from "react-router-dom";
import { Zap, Trophy, AlertTriangle, ChevronRight, CreditCard, Loader2 } from "lucide-react";
import moment from "moment";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function PlanStatus({ compact = false }) {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [billingDialog, setBillingDialog] = useState(null);

  const { data: entitlements = [] } = useQuery({
    queryKey: ["entitlements", tenantId],
    queryFn: () => tenantId
      ? maxikay.entities.TenantEntitlement.filter({ tenant_id: tenantId })
      : [],
    enabled: !!tenantId,
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["plan-status-wallet", tenantId],
    queryFn: () =>
      tenantId ? maxikay.entities.TenantWallet.filter({ tenant_id: tenantId }) : [],
    enabled: !!tenantId,
    staleTime: 60_000,
  });
  const walletCurrency = String(wallets[0]?.currency || "USD").toUpperCase();

  const { data: tournaments = [] } = useQuery({
    queryKey: ["tournaments-count", tenantId],
    queryFn: () => maxikay.entities.Tournament.filter({ tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const { data: platformConfigs = [] } = useQuery({
    queryKey: ["platform-config-plan-status"],
    queryFn: () => maxikay.entities.PlatformConfig.list(),
    staleTime: 60_000,
  });

  const { data: paymentRails = {} } = useQuery({
    queryKey: ["payment-rails-plan", walletCurrency],
    queryFn: () => maxikay.public.paymentRails({ currency: walletCurrency }),
    staleTime: 120_000,
  });

  const pc = Object.fromEntries(platformConfigs.map((r) => [r.key, r.value]));
  const amountUsd = Number(pc.saas_monthly_amount_usd) || 29;
  const amountNgn = Number(pc.saas_monthly_amount_ngn) || 15000;
  const subAmount = walletCurrency === "NGN" ? amountNgn : amountUsd;
  const subCurrency = walletCurrency === "NGN" ? "ngn" : "usd";

  const railOrder = (() => {
    const ro = paymentRails.recommended_order;
    if (Array.isArray(ro) && ro.length) return ro.filter((k) => paymentRails[k]);
    return ["stripe", "paystack", "flutterwave"].filter((k) => paymentRails[k]);
  })();

  const subscribeMutation = useMutation({
    mutationFn: (provider) =>
      maxikay.payments.createSubscriptionSession({
        tenant_id: tenantId,
        amount: subAmount,
        currency: subCurrency,
        provider,
        success_url: `${window.location.origin}/settings?billing=success`,
        cancel_url: `${window.location.origin}/settings`,
      }),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
      else toast.error("No checkout URL returned");
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Checkout failed"),
  });

  const portalMutation = useMutation({
    mutationFn: () =>
      maxikay.payments.createPortalSession({
        tenant_id: tenantId,
        return_url: `${window.location.origin}/settings`,
      }),
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setBillingDialog(data);
      queryClient.invalidateQueries({ queryKey: ["entitlements", tenantId] });
    },
    onError: (e) => {
      const msg = e?.data?.error || e?.message;
      if (e?.status === 400 && e?.data?.needs_checkout) toast.error(msg || "Subscribe with a gateway below first.");
      else toast.error(msg || "Could not open billing");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (cancelAtEnd) =>
      maxikay.payments.subscriptionCancelAtPeriodEnd({
        tenant_id: tenantId,
        cancel_at_period_end: cancelAtEnd,
      }),
    onSuccess: (_, cancelAtEnd) => {
      toast.success(
        cancelAtEnd ? "Marked cancel at end of current period" : "Continuing past renewal — cancel flag cleared"
      );
      queryClient.invalidateQueries({ queryKey: ["entitlements", tenantId] });
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Update failed"),
  });

  if (!tenantId || entitlements.length === 0) {
    return (
      <Link to="/onboarding">
        <div className="glass rounded-xl p-4 border border-yellow-500/30 bg-yellow-500/5 flex items-center justify-between gap-3 hover:border-yellow-500/60 transition-all">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-yellow-400">No active plan</p>
              <p className="text-xs text-muted-foreground">Set up your organization to create tournaments</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </Link>
    );
  }

  const ent = entitlements[0];
  const isMonthly = ent.plan_type === "monthly";
  const isActive = ent.is_active;
  const tournamentsUsed = tournaments.length;
  const renewalDate = ent.subscription_expires_at ? moment(ent.subscription_expires_at).format("MMM D, YYYY") : null;
  const isExpiringSoon = renewalDate && moment(ent.subscription_expires_at).diff(moment(), "days") <= 7;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${isActive ? "bg-primary/10 text-primary border border-primary/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
        {isMonthly ? <Zap className="w-3 h-3" /> : <Trophy className="w-3 h-3" />}
        <span className="font-semibold">{isMonthly ? "Monthly" : "One-Shot"}</span>
        {!isActive && <span className="text-destructive">· Expired</span>}
      </div>
    );
  }

  return (
    <div className={`glass rounded-xl p-4 border ${isActive ? (isExpiringSoon ? "border-yellow-500/40" : "border-primary/20") : "border-destructive/30"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isActive ? "bg-primary/15" : "bg-destructive/15"}`}>
            {isMonthly ? <Zap className="w-4 h-4 text-primary" /> : <Trophy className="w-4 h-4 text-primary" />}
          </div>
          <div>
            <p className="text-sm font-semibold">{isMonthly ? "Monthly Subscription" : "One-Shot Hosting"}</p>
            <p className={`text-xs mt-0.5 ${isActive ? "text-green-400" : "text-destructive"}`}>
              {isActive ? "Active" : "Inactive / Expired"}
            </p>
          </div>
        </div>
        <Link to="/onboarding" className="text-xs text-primary hover:underline whitespace-nowrap">Upgrade →</Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        {isMonthly ? (
          <>
            <div>
              <p className="text-muted-foreground">Renews</p>
              <p className={`font-semibold ${isExpiringSoon ? "text-yellow-400" : "text-foreground"}`}>{renewalDate || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Tournaments</p>
              <p className="font-semibold">Unlimited</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-muted-foreground">Slots Remaining</p>
              <p className={`font-semibold ${ent.single_tournament_remaining === 0 ? "text-destructive" : "text-foreground"}`}>
                {ent.single_tournament_remaining} of 1
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Used</p>
              <p className="font-semibold">{tournamentsUsed} tournament{tournamentsUsed !== 1 ? "s" : ""}</p>
            </div>
          </>
        )}
      </div>

      {isExpiringSoon && (
        <p className="mt-3 text-xs text-yellow-400 bg-yellow-500/10 rounded-lg px-3 py-1.5">
          ⚠️ Subscription expires in {moment(ent.subscription_expires_at).diff(moment(), "days")} days
        </p>
      )}

      {isMonthly && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-display">
            <CreditCard className="w-3.5 h-3.5" />
            Platform hosting ({walletCurrency} {subAmount}/mo)
          </div>
          {ent.subscription_provider && (
            <p className="text-[11px] text-muted-foreground">
              Billing rail:{" "}
              <span className="text-foreground font-medium capitalize">{String(ent.subscription_provider)}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              className="text-[10px] font-display h-8 gap-1.5"
              disabled={portalMutation.isPending}
              onClick={() => portalMutation.mutate()}
            >
              {portalMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Manage billing
            </Button>
            {isActive && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-[10px] font-display h-8"
                disabled={cancelMutation.isPending}
                onClick={() =>
                  cancelMutation.mutate(!ent.subscription_cancel_at_period_end)
                }
              >
                {ent.subscription_cancel_at_period_end ? "Undo cancel at period end" : "Cancel at period end"}
              </Button>
            )}
          </div>
          {(!isActive || isExpiringSoon) && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">Subscribe (same fulfillment as entry fees — webhooks extend hosting)</p>
              <div className="flex flex-wrap gap-1.5">
                {railOrder.map((rail) => {
                  if (rail === "stripe" && paymentRails.stripe) {
                    return (
                      <Button
                        key="stripe"
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="text-[9px] font-display h-7"
                        disabled={subscribeMutation.isPending}
                        onClick={() => subscribeMutation.mutate("stripe")}
                      >
                        Stripe
                      </Button>
                    );
                  }
                  if (rail === "paystack" && paymentRails.paystack) {
                    return (
                      <Button
                        key="paystack"
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="text-[9px] font-display h-7"
                        disabled={subscribeMutation.isPending}
                        onClick={() => subscribeMutation.mutate("paystack")}
                      >
                        Paystack
                      </Button>
                    );
                  }
                  if (rail === "flutterwave" && paymentRails.flutterwave) {
                    return (
                      <Button
                        key="flutterwave"
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="text-[9px] font-display h-7"
                        disabled={subscribeMutation.isPending}
                        onClick={() => subscribeMutation.mutate("flutterwave")}
                      >
                        Flutterwave
                      </Button>
                    );
                  }
                  return null;
                })}
              </div>
              {railOrder.length === 0 && (
                <p className="text-[10px] text-amber-200/80">
                  Configure STRIPE_SECRET_KEY, PAYSTACK_SECRET_KEY, or FLUTTERWAVE_SECRET_KEY on the API for online checkout.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!billingDialog} onOpenChange={(open) => !open && setBillingDialog(null)}>
        <DialogContent className="glass border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-sm">Billing management</DialogTitle>
            <DialogDescription className="text-xs text-left leading-relaxed">
              {billingDialog?.manage?.message ||
                "Use the controls below for subscription preferences. Hosted Stripe Customer Portal opens in a new flow when you use Stripe."}
            </DialogDescription>
          </DialogHeader>
          {billingDialog?.manage && (
            <div className="text-[11px] space-y-2 text-muted-foreground">
              {billingDialog.manage.subscription_expires_at && (
                <p>
                  Current period ends:{" "}
                  <strong className="text-foreground">
                    {moment(billingDialog.manage.subscription_expires_at).format("MMM D, YYYY")}
                  </strong>
                </p>
              )}
              {billingDialog.manage.reference && (
                <p>
                  Reference: <code className="text-[10px] text-foreground">{billingDialog.manage.reference}</code>
                </p>
              )}
              <p>
                Cancel at period end:{" "}
                <strong className="text-foreground">{billingDialog.manage.cancel_at_period_end ? "Yes" : "No"}</strong>
              </p>
            </div>
          )}
          <Button type="button" className="w-full text-xs font-display" onClick={() => setBillingDialog(null)}>
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}