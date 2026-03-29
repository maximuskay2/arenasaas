import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Trophy, CreditCard, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const PROVIDER_DEFS = [
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" },
  { value: "paystack", label: "Paystack" },
  { value: "flutterwave", label: "Flutterwave" },
  { value: "manual", label: "Manual / Bank Transfer" },
];

function providersForWalletCurrency(currency) {
  const cur = String(currency || "USD").toUpperCase();
  const order =
    cur === "NGN"
      ? ["paystack", "flutterwave", "stripe", "paypal", "manual"]
      : ["stripe", "paystack", "flutterwave", "paypal", "manual"];
  return order.map((v) => PROVIDER_DEFS.find((p) => p.value === v)).filter(Boolean);
}

export default function PayoutDialog({ wallet }) {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tournamentId, setTournamentId] = useState("");
  const [captainEmail, setCaptainEmail] = useState("");
  const [captainName, setCaptainName] = useState("");
  const [amount, setAmount] = useState("");
  const providerOptions = providersForWalletCurrency(wallet?.currency);
  const [provider, setProvider] = useState("stripe");

  useEffect(() => {
    const opts = providersForWalletCurrency(wallet?.currency);
    const first = opts[0]?.value || "stripe";
    setProvider((prev) => (opts.some((p) => p.value === prev) ? prev : first));
  }, [wallet?.currency]);
  const [reference, setReference] = useState("");

  const { data: tournaments = [] } = useQuery({
    queryKey: ["completed-tournaments", tenantId],
    queryFn: () =>
      tenantId
        ? maxikay.entities.Tournament.filter({ tenant_id: tenantId, status: "completed" }, "-start_date", 50)
        : [],
    enabled: open,
  });

  const { data: winnerTeams = [] } = useQuery({
    queryKey: ["winner-teams", tournamentId],
    queryFn: () =>
      maxikay.entities.Team.filter({ tournament_id: tournamentId, status: "winner" }),
    enabled: !!tournamentId,
    onSuccess: (teams) => {
      if (teams[0]) {
        setCaptainEmail(teams[0].captain_email || "");
        setCaptainName(teams[0].name || "");
      }
    },
  });

  const selectedTournament = tournaments.find((t) => t.id === tournamentId);
  const winnerTeam = winnerTeams[0];

  const payoutMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      // 1. Create ledger debit
      await maxikay.entities.PaymentLedger.create({
        tenant_id: tenantId,
        type: "debit",
        amount: amt,
        currency: wallet.currency || "USD",
        source: "withdrawal",
        tournament_id: tournamentId,
        team_id: winnerTeam?.id,
        status: "completed",
        reference: reference || `PAYOUT-${Date.now()}`,
        notes: `Prize payout to ${captainName || captainEmail} via ${provider}`,
      });

      // 2. Debit wallet balance
      await maxikay.entities.TenantWallet.update(wallet.id, {
        balance: (wallet.balance || 0) - amt,
        total_withdrawn: (wallet.total_withdrawn || 0) + amt,
      });

      // 3. Send email confirmation to winner
      if (captainEmail) {
        await maxikay.integrations.Core.SendEmail({
          to: captainEmail,
          subject: `🏆 Your prize payout of ${wallet.currency || "USD"} ${amt.toLocaleString()} is on its way!`,
          body: `Hi ${captainName || "Champion"},

Congratulations on your victory${selectedTournament ? ` in ${selectedTournament.name}` : ""}!

We're processing your prize payout:
• Amount: ${wallet.currency || "USD"} ${amt.toLocaleString("en", { minimumFractionDigits: 2 })}
• Provider: ${PROVIDER_DEFS.find((p) => p.value === provider)?.label || provider}
${reference ? `• Reference: ${reference}` : ""}

Please allow 1–5 business days for the funds to arrive. If you have any questions, please contact your tournament organizer.

Good luck in future tournaments! 🎮`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-wallet"] });
      queryClient.invalidateQueries({ queryKey: ["payment-ledger"] });
      toast.success(`Payout sent${captainEmail ? ` · Email sent to ${captainEmail}` : ""}`);
      setOpen(false);
      setTournamentId("");
      setCaptainEmail("");
      setCaptainName("");
      setAmount("");
      setReference("");
      setProvider("stripe");
    },
    onError: () => toast.error("Payout failed. Please try again."),
  });

  const amt = parseFloat(amount) || 0;
  const canSubmit = amt > 0 && amt <= (wallet?.balance || 0) && captainEmail;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 font-display text-xs tracking-wider bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30">
          <Trophy className="w-4 h-4" /> SEND PAYOUT
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Send className="w-4 h-4 text-yellow-400" /> Send Prize Payout
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Pay out prize winnings directly to a team captain.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tournament selector */}
          <div>
            <Label className="text-xs">Tournament (optional)</Label>
            <Select value={tournamentId} onValueChange={setTournamentId}>
              <SelectTrigger className="mt-1 bg-secondary/50">
                <SelectValue placeholder="Select a completed tournament…" />
              </SelectTrigger>
              <SelectContent>
                {tournaments.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Winner auto-fill */}
          {winnerTeam && (
            <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-yellow-300">{winnerTeam.name}</p>
                <p className="text-yellow-400/70">{winnerTeam.captain_email || "No captain email set"}</p>
              </div>
              {winnerTeam.captain_email && (
                <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto shrink-0" />
              )}
            </div>
          )}

          {/* Captain email */}
          <div>
            <Label className="text-xs">Captain Email *</Label>
            <Input
              type="email"
              value={captainEmail}
              onChange={(e) => setCaptainEmail(e.target.value)}
              className="mt-1 bg-secondary/50"
              placeholder="captain@team.com"
              required
            />
          </div>

          {/* Captain / recipient name */}
          <div>
            <Label className="text-xs">Recipient Name</Label>
            <Input
              value={captainName}
              onChange={(e) => setCaptainName(e.target.value)}
              className="mt-1 bg-secondary/50"
              placeholder="Team or captain name"
            />
          </div>

          {/* Amount */}
          <div>
            <Label className="text-xs">Payout Amount ({wallet?.currency || "USD"})</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              max={wallet?.balance || 0}
              min={1}
              className="mt-1 bg-secondary/50"
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Available: {wallet?.currency || "USD"} {(wallet?.balance || 0).toLocaleString("en", { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Provider */}
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> Payment Provider
            </Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="mt-1 bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* External reference */}
          <div>
            <Label className="text-xs">Payment Reference (optional)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1 bg-secondary/50"
              placeholder="e.g. Stripe transfer ID, tx hash…"
            />
          </div>

          {/* Summary */}
          {amt > 0 && captainEmail && (
            <div className="bg-secondary/50 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Payout to</span>
                <span className="text-foreground font-semibold">{captainName || captainEmail}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Amount</span>
                <span className="text-yellow-400 font-bold font-display">{wallet?.currency || "USD"} {amt.toLocaleString("en", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Via</span>
                <span>{PROVIDER_DEFS.find((p) => p.value === provider)?.label}</span>
              </div>
              <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/40">
                <span>Email confirmation</span>
                <span className="text-green-400">✓ Will be sent</span>
              </div>
            </div>
          )}

          <Button
            onClick={() => payoutMutation.mutate()}
            disabled={payoutMutation.isPending || !canSubmit}
            className="w-full font-display text-xs tracking-wider gap-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30"
          >
            <Send className="w-3.5 h-3.5" />
            {payoutMutation.isPending ? "Processing..." : "SEND PAYOUT & EMAIL"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}