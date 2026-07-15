import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { maxikay } from "@/api/maxikayClient";
import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import {
  Wallet as WalletIcon,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  History,
  ShieldCheck,
  Filter,
} from "lucide-react";
import PayoutDialog from "../components/wallet/PayoutDialog";
import StatsCard from "../components/shared/StatsCard";
import moment from "moment";

function ledgerIsCredit(entry) {
  const t = String(entry?.type || "").toLowerCase();
  if (t === "credit" || t === "entry_fee" || t === "prize_payout") return true;
  if (t === "debit" || t === "withdrawal" || t === "platform_fee") return false;
  return Number(entry?.amount) >= 0 && t !== "withdrawal";
}

function ledgerLabel(entry) {
  return (
    entry?.source?.replace(/_/g, " ") ||
    entry?.type?.replace(/_/g, " ") ||
    entry?.description ||
    "Transaction"
  );
}

export default function Wallet() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [ledgerFilter, setLedgerFilter] = useState("all");

  const { data: wallets = [], isLoading: loadingWallet } = useQuery({
    queryKey: ["tenant-wallet", tenantId],
    queryFn: () =>
      tenantId
        ? maxikay.entities.TenantWallet.filter({ tenant_id: tenantId })
        : maxikay.entities.TenantWallet.list(),
  });

  const { data: ledger = [], isLoading: loadingLedger } = useQuery({
    queryKey: ["payment-ledger", tenantId],
    queryFn: () =>
      tenantId
        ? maxikay.entities.PaymentLedger.filter({ tenant_id: tenantId }, "-created_date", 50)
        : maxikay.entities.PaymentLedger.list("-created_date", 100),
  });

  const { data: platformConfigs = [] } = useQuery({
    queryKey: ["platform-config"],
    queryFn: () => maxikay.entities.PlatformConfig.list(),
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["withdrawals", tenantId],
    queryFn: () =>
      tenantId
        ? maxikay.entities.WithdrawalRequest.filter({ tenant_id: tenantId }, "-created_date", 20)
        : maxikay.entities.WithdrawalRequest.list("-created_date", 100),
  });

  const wallet = wallets[0];
  const platformConfig = platformConfigs[0];
  const feePercent = platformConfig?.withdrawal_fee_percent ?? 5;
  const currency = wallet?.currency || "USD";

  const requestedAmount = parseFloat(amount) || 0;
  const feeAmount = (requestedAmount * feePercent) / 100 + (platformConfig?.withdrawal_fee_fixed || 0);
  const netAmount = requestedAmount - feeAmount;

  const withdrawMutation = useMutation({
    mutationFn: async (amt) => {
      const req = await maxikay.entities.WithdrawalRequest.create({
        tenant_id: tenantId,
        amount_requested: amt,
        fee_percent: feePercent,
        fee_fixed: platformConfig?.withdrawal_fee_fixed || 0,
        net_amount: amt - (amt * feePercent) / 100 - (platformConfig?.withdrawal_fee_fixed || 0),
        currency: wallet?.currency || "USD",
        status: "pending",
      });
      if (wallet) {
        await maxikay.entities.TenantWallet.update(wallet.id, {
          balance: (wallet.balance || 0) - amt,
          total_withdrawn: (wallet.total_withdrawn || 0) + amt,
        });
        await maxikay.entities.PaymentLedger.create({
          tenant_id: tenantId,
          type: "debit",
          amount: amt,
          currency: wallet.currency || "USD",
          source: "withdrawal",
          status: "pending",
          notes: `Withdrawal request #${req.id}`,
        });
      }
      return req;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-wallet"] });
      queryClient.invalidateQueries({ queryKey: ["payment-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["withdrawals"] });
      setWithdrawOpen(false);
      setAmount("");
    },
  });

  if (loadingWallet || loadingLedger) return <LoadingSpinner label="Loading vault…" />;

  const balance = wallet?.balance || 0;
  const credited = wallet?.total_credited || wallet?.total_earned || 0;
  const withdrawn = wallet?.total_withdrawn || 0;
  const pendingWithdrawals = withdrawals.filter((w) =>
    ["pending", "processing"].includes(String(w.status || "").toLowerCase())
  ).length;

  const filteredLedger = ledger.filter((entry) => {
    if (ledgerFilter === "all") return true;
    const credit = ledgerIsCredit(entry);
    if (ledgerFilter === "credit") return credit;
    if (ledgerFilter === "debit") return !credit;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="rounded-2xl border border-border/50 glass px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-muted-foreground">
          Looking for <strong className="text-foreground">player prize balance</strong>? That lives in the personal vault.
        </p>
        <Link to="/dashboard/wallet" className="text-primary font-semibold text-xs hover:underline shrink-0">
          Open player vault →
        </Link>
      </div>
      <PageHeader
        eyebrow="Organization finance"
        title={
          <>
            League <span className="text-gradient-primary">vault</span>
          </>
        }
        subtitle="Registration revenue, prize rails, and withdrawal history for your organization — not personal player winnings."
        actions={
          wallet && balance > 0 && tenantId ? (
            <div className="flex flex-wrap gap-2">
              <PayoutDialog wallet={wallet} />
              <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <ArrowUpRight className="w-4 h-4" /> Request withdrawal
                  </Button>
                </DialogTrigger>
                <DialogContent className="glass border-border/50 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-display">Request withdrawal</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/50 bg-secondary/30 p-4 text-sm space-y-2">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Available</span>
                        <span className="text-foreground font-semibold tabular-nums">
                          {currency} {balance.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Platform fee ({feePercent}%)</span>
                        <span className="text-accent tabular-nums">
                          −{currency} {feeAmount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
                        <span>You receive</span>
                        <span className="text-primary tabular-nums">
                          {currency} {netAmount > 0 ? netAmount.toFixed(2) : "0.00"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <Label className="section-label">Amount</Label>
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        max={balance}
                        min={platformConfig?.min_withdrawal_amount || 10}
                        className="mt-1.5 bg-background/40 border-border/60 rounded-xl h-11"
                        placeholder={`Min. ${platformConfig?.min_withdrawal_amount || 10}`}
                      />
                    </div>
                    <Button
                      variant="arena"
                      onClick={() => withdrawMutation.mutate(requestedAmount)}
                      disabled={
                        withdrawMutation.isPending ||
                        requestedAmount <= 0 ||
                        requestedAmount > balance
                      }
                      className="w-full"
                    >
                      {withdrawMutation.isPending ? "Submitting…" : "Submit request"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatsCard
          icon={WalletIcon}
          label="Available"
          value={`${currency} ${Number(balance).toLocaleString("en", { maximumFractionDigits: 0 })}`}
          delay={0}
        />
        <StatsCard
          icon={ArrowDownLeft}
          label="Credited"
          value={`${currency} ${Number(credited).toLocaleString("en", { maximumFractionDigits: 0 })}`}
          trendUp
          delay={0.04}
        />
        <StatsCard
          icon={ArrowUpRight}
          label="Withdrawn"
          value={`${currency} ${Number(withdrawn).toLocaleString("en", { maximumFractionDigits: 0 })}`}
          delay={0.08}
        />
        <StatsCard
          icon={Landmark}
          label="Pending"
          value={pendingWithdrawals}
          trend={pendingWithdrawals ? "Awaiting review" : "None open"}
          delay={0.12}
        />
      </div>

      {/* Hero balance */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-border/50 glass p-6 md:p-8 shadow-arena"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/4 h-32 w-32 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 ring-1 ring-primary/30 flex items-center justify-center shadow-arena-glow">
              <WalletIcon className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="section-label mb-1">Available balance</p>
              <p className="text-4xl md:text-5xl font-display font-bold tracking-tight tabular-nums">
                <span className="text-muted-foreground text-lg md:text-xl align-top mr-1">{currency}</span>
                {balance.toLocaleString("en", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Ledger-backed · platform fee {feePercent}% on withdrawal
              </p>
            </div>
          </div>
        </div>

        <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
              <span className="section-label text-emerald-400/80">Total credited</span>
            </div>
            <p className="text-2xl font-display font-bold text-emerald-400 tabular-nums">
              {currency} {Number(credited).toLocaleString("en", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-2xl border border-accent/25 bg-accent/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="w-4 h-4 text-accent" />
              <span className="section-label text-accent/80">Total withdrawn</span>
            </div>
            <p className="text-2xl font-display font-bold text-accent tabular-nums">
              {currency} {Number(withdrawn).toLocaleString("en", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </motion.div>

      {withdrawals.length > 0 && (
        <section className="glass rounded-3xl p-6 border border-border/50 space-y-4 shadow-arena-card">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            <h2 className="section-label text-primary">Withdrawal requests</h2>
            {pendingWithdrawals > 0 && (
              <span className="ml-auto text-[10px] font-display font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                {pendingWithdrawals} pending
              </span>
            )}
          </div>
          <div className="space-y-2">
            {withdrawals.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-border/40 bg-card/40 text-sm"
              >
                <div>
                  <p className="font-semibold tabular-nums">
                    {req.currency || currency}{" "}
                    {(req.amount_requested ?? req.amount)?.toLocaleString?.() ?? req.amount_requested}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Net: {req.currency || currency}{" "}
                    {req.net_amount != null ? Number(req.net_amount).toFixed(2) : "—"} ·{" "}
                    {moment(req.created_date).fromNow()}
                  </p>
                </div>
                <StatusBadge status={req.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="glass rounded-3xl p-6 border border-border/50 space-y-4 shadow-arena-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h2 className="section-label text-primary">Transaction ledger</h2>
          </div>
          <div className="flex gap-1.5 ml-auto">
            {[
              ["all", "All"],
              ["credit", "Credits"],
              ["debit", "Debits"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLedgerFilter(key)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-display font-bold uppercase tracking-wide border transition-colors ${
                  ledgerFilter === key
                    ? "bg-primary/15 text-primary border-primary/35"
                    : "border-border/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {ledger.length === 0 ? (
          <EmptyState
            icon={History}
            title="No transactions yet"
            description="Wallet credits when teams register for paid tournaments or prizes settle."
          />
        ) : filteredLedger.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
            <Filter className="w-4 h-4" /> No {ledgerFilter} entries in this view
          </p>
        ) : (
          <div className="space-y-2">
            {filteredLedger.map((entry, i) => {
              const credit = ledgerIsCredit(entry);
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-border/40 bg-card/40 text-sm glass-hover"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        credit ? "bg-emerald-500/15 ring-1 ring-emerald-500/25" : "bg-accent/15 ring-1 ring-accent/25"
                      }`}
                    >
                      {credit ? (
                        <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-accent" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium capitalize truncate">{ledgerLabel(entry)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.notes || entry.description || moment(entry.created_date).fromNow()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`font-display font-bold tabular-nums ${
                        credit ? "text-emerald-400" : "text-accent"
                      }`}
                    >
                      {credit ? "+" : "−"}
                      {entry.currency || currency}{" "}
                      {Number(entry.amount || 0).toLocaleString("en", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{entry.status || "completed"}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
