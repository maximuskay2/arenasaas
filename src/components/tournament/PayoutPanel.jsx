import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { determinePlacements, calculatePayouts, recordPayouts } from "@/lib/payouts";
import { DollarSign, Trophy, Medal, Award, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";

const PLACE_ICONS = [Trophy, Medal, Award];
const PLACE_LABELS = ["Champion", "Runner-up", "3rd Place"];
const PLACE_COLORS = ["text-yellow-400", "text-slate-300", "text-orange-400"];
const PLACE_BG = ["bg-yellow-500/10 border-yellow-500/30", "bg-slate-400/10 border-slate-400/30", "bg-orange-500/10 border-orange-500/30"];

export default function PayoutPanel({ tournament, matches, teams }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();

  const placements = determinePlacements(matches, teams);
  const prizePool = tournament?.prize_pool || 0;
  const payouts = calculatePayouts(prizePool, placements);

  const payoutMutation = useMutation({
    mutationFn: async () => {
      await recordPayouts({
        payouts,
        tournamentId: tournament.id,
        tenantId,
        prizePool,
        currency: tournament.currency || "USD",
      });
      await maxikay.entities.Tournament.update(tournament.id, { status: "completed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament", tournament.id] });
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["rev-ledger"] });
      toast.success("Tournament completed & prizes distributed!");
      setOpen(false);
      setConfirmed(false);
    },
    onError: () => toast.error("Payout failed. Please try again."),
  });

  if (!prizePool || prizePool === 0) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="text-xs"
        onClick={async () => {
          await maxikay.entities.Tournament.update(tournament.id, { status: "completed" });
          queryClient.invalidateQueries({ queryKey: ["tournament", tournament.id] });
          toast.success("Tournament marked as completed.");
        }}
      >
        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Complete Tournament
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmed(false); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 font-display text-xs tracking-wider bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30">
          <DollarSign className="w-3.5 h-3.5" /> Distribute Prizes
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" /> Prize Distribution
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Review the final standings and confirm prize payouts to winning teams.
          </p>
        </DialogHeader>

        {/* Prize pool summary */}
        <div className="glass rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total Prize Pool</span>
          <span className="font-display font-bold text-xl text-yellow-400">
            {tournament.currency || "USD"} ${prizePool.toLocaleString()}
          </span>
        </div>

        {/* Placements */}
        {payouts.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-muted-foreground">
              No completed matches found. Finish the bracket before distributing prizes.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {payouts.map((p, idx) => {
              const Icon = PLACE_ICONS[idx] || Award;
              return (
                <div key={p.teamId} className={`flex items-center gap-3 rounded-xl p-3.5 border ${PLACE_BG[idx] || "bg-muted/10 border-border/30"}`}>
                  <Icon className={`w-5 h-5 ${PLACE_COLORS[idx] || "text-muted-foreground"} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{PLACE_LABELS[idx] || `${p.placement}th Place`}</p>
                    <p className="font-semibold text-sm text-foreground truncate">{p.teamName}</p>
                    {p.captainEmail && (
                      <p className="text-[11px] text-muted-foreground truncate">{p.captainEmail}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-display font-bold text-base ${PLACE_COLORS[idx] || "text-foreground"}`}>
                      ${p.amount.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{p.percentage}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="p-3 rounded-lg bg-secondary/40 text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Note:</strong> Payouts are recorded in the Payment Ledger. Stripe Connect integration for automated bank transfers requires a Builder+ plan with backend functions enabled.
        </div>

        {payouts.length > 0 && (
          <div className="space-y-2">
            {!confirmed ? (
              <Button className="w-full gap-2 font-display text-xs tracking-wider" onClick={() => setConfirmed(true)}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Review & Confirm
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-center text-muted-foreground">Confirm to record these payouts and mark the tournament as completed.</p>
                <Button
                  className="w-full gap-2 font-display text-xs tracking-wider bg-green-600 hover:bg-green-700"
                  onClick={() => payoutMutation.mutate()}
                  disabled={payoutMutation.isPending}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  {payoutMutation.isPending ? "Processing..." : "Confirm Payouts & Complete"}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}