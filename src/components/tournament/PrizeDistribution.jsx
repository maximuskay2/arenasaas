import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trophy, DollarSign, CheckCircle2, Clock, Send, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const PLACEMENT_CONFIG = [
  { place: 1, label: "Champion 🥇", pct: 60, color: "text-yellow-400", border: "border-yellow-400/30", bg: "bg-yellow-400/5" },
  { place: 2, label: "Runner-up 🥈", pct: 25, color: "text-slate-400", border: "border-slate-400/30", bg: "bg-slate-400/5" },
  { place: 3, label: "3rd Place 🥉", pct: 15, color: "text-orange-500", border: "border-orange-500/30", bg: "bg-orange-500/5" },
];

const STATUS_ICON = {
  pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  sent: <Send className="w-3.5 h-3.5 text-blue-400" />,
  confirmed: <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
  failed: <AlertCircle className="w-3.5 h-3.5 text-destructive" />,
};

function getTeamsByPlacement(matches, teams) {
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const finalMatch = matches.find((m) => m.status === "completed" && !matches.some((o) => o.next_match_id === m.id && o.status === "completed"));
  if (!finalMatch) return {};
  const champion = teamById[finalMatch.winner_id];
  const runnerUp = teamById[finalMatch.winner_id === finalMatch.team_a_id ? finalMatch.team_b_id : finalMatch.team_a_id];
  // Find 3rd: look for a completed loser's bracket match or the semi losing teams
  const semifinals = matches.filter((m) => {
    const loserId = m.winner_id === m.team_a_id ? m.team_b_id : m.team_a_id;
    return m.status === "completed" && m.next_match_id === finalMatch.id;
  });
  const thirdTeam = semifinals.length > 0 ? teamById[semifinals[0].winner_id === semifinals[0].team_a_id ? semifinals[0].team_b_id : semifinals[0].team_a_id] : null;
  return { 1: champion, 2: runnerUp, 3: thirdTeam };
}

export default function PrizeDistribution({ tournament, matches, teams, tenantId }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [references, setReferences] = useState({});

  const { data: payments = [] } = useQuery({
    queryKey: ["prize-payments", tournament.id],
    queryFn: () => maxikay.entities.PrizePayment.filter({ tournament_id: tournament.id }),
    enabled: open,
  });

  const paymentsByPlace = Object.fromEntries(payments.map((p) => [p.placement, p]));
  const placement = getTeamsByPlacement(matches, teams);
  const prizePool = tournament.prize_pool || 0;
  const currency = tournament.currency || "USD";

  const createPayment = useMutation({
    mutationFn: async ({ place, team, amount, method, reference }) => {
      const existing = paymentsByPlace[place];
      if (existing) {
        return maxikay.entities.PrizePayment.update(existing.id, {
          status: "sent",
          payment_method: method,
          payment_reference: reference,
        });
      }
      return maxikay.entities.PrizePayment.create({
        tournament_id: tournament.id,
        tenant_id: tenantId,
        team_id: team.id,
        team_name: team.name,
        captain_email: team.captain_email,
        placement: place,
        prize_amount: amount,
        currency,
        payment_method: method,
        payment_reference: reference,
        status: "sent",
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["prize-payments", tournament.id] }); toast.success("Payment marked as sent!"); },
  });

  const confirmPayment = useMutation({
    mutationFn: (id) => maxikay.entities.PrizePayment.update(id, { status: "confirmed" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["prize-payments", tournament.id] }); toast.success("Payment confirmed!"); },
  });

  const allConfirmed = PLACEMENT_CONFIG.every((cfg) => !placement[cfg.place] || paymentsByPlace[cfg.place]?.status === "confirmed");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs font-display bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30">
          <Trophy className="w-3.5 h-3.5" /> Prize Distribution
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" /> Prize Distribution
          </DialogTitle>
        </DialogHeader>

        {prizePool === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No prize pool configured for this tournament.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <span className="text-sm text-muted-foreground">Total Prize Pool</span>
              <span className="font-display font-bold text-yellow-400 text-lg">{currency} {prizePool.toLocaleString()}</span>
            </div>

            {allConfirmed && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs">
                <CheckCircle2 className="w-4 h-4" /> All prizes confirmed distributed!
              </div>
            )}

            {/* Placements */}
            {PLACEMENT_CONFIG.map(({ place, label, pct, color, border, bg }) => {
              const team = placement[place];
              const amount = Math.round(prizePool * pct / 100);
              const payment = paymentsByPlace[place];
              const [method, setMethod] = useState("paypal");

              if (!team) return (
                <div key={place} className={`rounded-xl p-4 border ${border} ${bg} opacity-50`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-display font-bold ${color}`}>{label}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{currency} {amount.toLocaleString()} ({pct}%)</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Team not yet determined</p>
                </div>
              );

              const paypalLink = `https://paypal.me/${team.captain_email?.split("@")[0]}/${amount}`;

              return (
                <div key={place} className={`rounded-xl p-4 border ${border} ${bg} space-y-3`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`text-xs font-display font-bold ${color}`}>{label}</span>
                      <p className="text-sm font-semibold text-foreground">{team.name}</p>
                      <p className="text-[10px] text-muted-foreground">{team.captain_email}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-display font-bold text-lg ${color}`}>{currency} {amount.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{pct}% of pool</p>
                    </div>
                  </div>

                  {payment ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs">
                        {STATUS_ICON[payment.status]}
                        <span className="capitalize text-muted-foreground">{payment.status}</span>
                        {payment.payment_reference && <span className="text-muted-foreground/60">· ref: {payment.payment_reference}</span>}
                      </div>
                      {payment.status === "sent" && (
                        <Button size="sm" className="h-6 text-[10px] gap-1 bg-green-500/20 text-green-400 hover:bg-green-500/30" onClick={() => confirmPayment.mutate(payment.id)}>
                          <CheckCircle2 className="w-3 h-3" /> Confirm Received
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Select value={method} onValueChange={setMethod}>
                          <SelectTrigger className="h-7 text-xs bg-secondary/50 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="paypal">PayPal</SelectItem>
                            <SelectItem value="stripe">Stripe</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="manual">Manual / Cash</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Reference / TX ID"
                          value={references[place] || ""}
                          onChange={(e) => setReferences((p) => ({ ...p, [place]: e.target.value }))}
                          className="h-7 text-xs bg-secondary/50 flex-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        {method === "paypal" && (
                          <a href={paypalLink} target="_blank" rel="noopener noreferrer" className="flex-1">
                            <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1 border-blue-500/30 text-blue-400">
                              <ExternalLink className="w-3 h-3" /> Open PayPal.me
                            </Button>
                          </a>
                        )}
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 flex-1"
                          onClick={() => createPayment.mutate({ place, team, amount, method, reference: references[place] || "" })}
                          disabled={createPayment.isPending}
                        >
                          <Send className="w-3 h-3" /> Mark as Sent
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <p className="text-[10px] text-muted-foreground text-center px-4">
              Stripe Connect and PayPal automated transfers require backend functions (Builder+ plan). Use the links above to send manually and mark as sent.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}