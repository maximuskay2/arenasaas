import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import PayoutDialog from "../components/wallet/PayoutDialog";
import moment from "moment";

export default function Wallet() {
  const { tenantId, isSuperAdmin } = useTenant();
  const queryClient = useQueryClient();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");

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
      // Debit from wallet
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

  if (loadingWallet || loadingLedger) return <LoadingSpinner />;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <PageHeader
        title="Wallet"
        subtitle="Registration revenue and withdrawal history"
        actions={
          wallet && (wallet.balance || 0) > 0 && tenantId
            ? (
          <div className="flex gap-2">
            <PayoutDialog wallet={wallet} />
            <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 font-display text-xs tracking-wider">
                  <ArrowUpRight className="w-4 h-4" /> REQUEST WITHDRAWAL
                </Button>
              </DialogTrigger>
              <DialogContent className="glass border-border/50">
                <DialogHeader>
                  <DialogTitle className="font-display">Request Withdrawal</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="bg-secondary/50 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Available balance</span>
                      <span className="text-foreground font-semibold">{wallet?.currency || "USD"} {(wallet?.balance || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Platform fee ({feePercent}%)</span>
                      <span className="text-accent">-{wallet?.currency || "USD"} {feeAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold pt-1 border-t border-border/50">
                      <span>You receive</span>
                      <span className="text-primary">{wallet?.currency || "USD"} {netAmount > 0 ? netAmount.toFixed(2) : "0.00"}</span>
                    </div>
                  </div>
                  <div>
                    <Label>Amount to withdraw</Label>
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      max={wallet?.balance || 0}
                      min={platformConfig?.min_withdrawal_amount || 10}
                      className="mt-1 bg-secondary/50"
                      placeholder={`Min. ${platformConfig?.min_withdrawal_amount || 10}`}
                    />
                  </div>
                  <Button
                    onClick={() => withdrawMutation.mutate(requestedAmount)}
                    disabled={withdrawMutation.isPending || requestedAmount <= 0 || requestedAmount > (wallet?.balance || 0)}
                    className="w-full font-display text-xs tracking-wider"
                  >
                    {withdrawMutation.isPending ? "Requesting..." : "SUBMIT REQUEST"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
            )
            : null
        }
      />

      {/* Balance Card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <WalletIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-display">Available Balance</p>
            <p className="text-3xl font-display font-bold text-foreground">
              {wallet?.currency || "USD"} {(wallet?.balance || 0).toLocaleString("en", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Credited</span>
            </div>
            <p className="text-lg font-display font-bold text-green-400">
              {wallet?.currency || "USD"} {(wallet?.total_credited || 0).toLocaleString("en", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Withdrawn</span>
            </div>
            <p className="text-lg font-display font-bold text-accent">
              {wallet?.currency || "USD"} {(wallet?.total_withdrawn || 0).toLocaleString("en", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Withdrawal Requests */}
      {withdrawals.length > 0 && (
        <div className="glass rounded-xl p-6 space-y-4">
          <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">Withdrawal Requests</h2>
          <div className="space-y-2">
            {withdrawals.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-secondary/40 rounded-lg text-sm">
                <div>
                  <p className="font-semibold">{req.currency} {req.amount_requested?.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Net: {req.currency} {req.net_amount?.toFixed(2)} · {moment(req.created_date).fromNow()}</p>
                </div>
                <StatusBadge status={req.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ledger */}
      <div className="glass rounded-xl p-6 space-y-4">
        <h2 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">Transaction Ledger</h2>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No transactions yet. Wallet credits when teams register for paid tournaments.</p>
        ) : (
          <div className="space-y-2">
            {ledger.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between p-3 bg-secondary/40 rounded-lg text-sm"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${entry.type === "credit" ? "bg-green-500/15" : "bg-accent/15"}`}>
                    {entry.type === "credit"
                      ? <ArrowDownLeft className="w-3.5 h-3.5 text-green-400" />
                      : <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
                    }
                  </div>
                  <div>
                    <p className="font-medium capitalize">{entry.source?.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">{entry.notes || moment(entry.created_date).fromNow()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-display font-bold ${entry.type === "credit" ? "text-green-400" : "text-accent"}`}>
                    {entry.type === "credit" ? "+" : "-"}{entry.currency} {entry.amount?.toLocaleString("en", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{entry.status}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}