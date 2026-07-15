import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wallet as WalletIcon, ArrowUpRight, ShieldCheck, Building2, Trophy } from "lucide-react";
import { maxikay } from "@/api/maxikayClient";
import { useAuth } from "@/lib/AuthContext";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/shared/PageHeader";
import StatsCard from "@/components/shared/StatsCard";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { toast } from "sonner";

function formatMoney(amount, currency = "USD") {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

/**
 * Player personal vault — prize winnings (user_wallets), separate from org league vault.
 */
export default function PlayerVault() {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");

  const { data: walletRes, isLoading } = useQuery({
    queryKey: ["me-wallet"],
    queryFn: () => maxikay.auth.meWallet(),
    enabled: !!user,
  });
  const { data: kyc } = useQuery({
    queryKey: ["me-prize-kyc"],
    queryFn: () => maxikay.auth.mePrizePayoutKyc(),
    enabled: !!user,
  });
  const { data: hub } = useQuery({
    queryKey: ["me-hub"],
    queryFn: () => maxikay.auth.meHub(),
    enabled: !!user,
  });

  const wallets = walletRes?.wallets ?? [];
  const primary = wallets.find((w) => w.currency === currency) || wallets[0];
  const balance = Number(primary?.balance) || 0;
  const cur = primary?.currency || currency;

  const withdraw = useMutation({
    mutationFn: () =>
      maxikay.auth.meWithdrawalRequest(
        { amount: Number(amount), currency: cur },
        { tenantId }
      ),
    onSuccess: () => {
      toast.success("Withdrawal request submitted");
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["me-wallet"] });
      queryClient.invalidateQueries({ queryKey: ["me-hub"] });
    },
    onError: (err) => {
      toast.error(err?.data?.error || err?.message || "Withdrawal failed");
    },
  });

  if (isLoading) return <LoadingSpinner label="Loading player vault…" />;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      <PageHeader
        eyebrow="Player vault"
        title={
          <>
            Your <span className="text-gradient-primary">winnings</span>
          </>
        }
        subtitle="Personal prize balance across events — separate from your organization's league vault."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/wallet">
              <Building2 className="h-4 w-4" /> Org vault
            </Link>
          </Button>
        }
      />

      <div className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm flex gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary mt-0.5" />
        <p className="text-muted-foreground">
          <strong className="text-foreground">Clarity:</strong> this page is your{" "}
          <strong className="text-foreground">player vault</strong> (prize credits). League organizers manage entry
          fees and org payouts under <Link to="/wallet" className="text-primary hover:underline">Org vault</Link>.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatsCard
          icon={WalletIcon}
          label="Available"
          value={formatMoney(balance, cur)}
          trend={wallets.length > 1 ? `${wallets.length} currencies` : cur}
          trendUp={balance > 0}
        />
        <StatsCard
          icon={Trophy}
          label="Accolades"
          value={hub?.accolades_count ?? 0}
          trend="Trophy case"
        />
        <StatsCard
          icon={ShieldCheck}
          label="KYC"
          value={hub?.kyc_cleared || kyc?.kyc_cleared ? "Cleared" : "Pending"}
          trend={kyc?.threshold_usd != null ? `Gate @ $${kyc.threshold_usd}` : "Prize withdrawals"}
        />
      </div>

      {wallets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {wallets.map((w) => (
            <button
              key={w.currency}
              type="button"
              onClick={() => setCurrency(w.currency)}
              className={`px-3 py-1.5 rounded-xl text-xs font-display font-bold ${
                cur === w.currency
                  ? "bg-primary/15 text-primary border border-primary/35"
                  : "bg-secondary/50 text-muted-foreground border border-transparent"
              }`}
            >
              {w.currency} · {formatMoney(w.balance, w.currency)}
            </button>
          ))}
        </div>
      )}

      <section className="glass rounded-3xl border border-border/50 p-6 space-y-4 shadow-arena-card">
        <h2 className="font-display font-bold tracking-tight flex items-center gap-2">
          <ArrowUpRight className="h-4 w-4 text-primary" />
          Request withdrawal
        </h2>
        <p className="text-xs text-muted-foreground">
          Requires prize credits under the current organization context
          {tenantId ? " (tenant linked)." : " — select an org tenant or open from an event context."}
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Amount ({cur})</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-background/40 border-border/60 rounded-xl h-11"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="arena"
              className="w-full h-11"
              disabled={!tenantId || withdraw.isPending || !(Number(amount) > 0) || Number(amount) > balance}
              onClick={() => withdraw.mutate()}
            >
              {withdraw.isPending ? "Submitting…" : "Submit withdrawal"}
            </Button>
          </div>
        </div>
        {!tenantId && (
          <p className="text-[11px] text-amber-500">
            No tenant context — withdrawals need X-Tenant-ID of the org that credited your prizes.
          </p>
        )}
      </section>
    </div>
  );
}
