import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, DollarSign, Trophy, TrendingUp, TrendingDown, CreditCard, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import moment from "moment";
import { motion } from "framer-motion";

const STATUS_CONFIG = {
  completed: { icon: CheckCircle2, color: "text-green-400", bg: "bg-green-400/10" },
  pending: { icon: Clock, color: "text-yellow-400", bg: "bg-yellow-400/10" },
  failed: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
  reversed: { icon: TrendingDown, color: "text-orange-400", bg: "bg-orange-400/10" },
};

const SOURCE_LABELS = {
  registration: "Entry Fee",
  withdrawal: "Prize Payout",
  refund: "Refund",
  platform_fee: "Platform Fee",
};

function MetricCard({ label, value, icon: Icon, color = "text-primary", sub }) {
  return (
    <div className="glass rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-lg font-display font-bold ${color}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function TeamFinance() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const teamId = params.get("team_id");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => { maxikay.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const { data: team, isLoading: loadingTeam } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => maxikay.entities.Team.filter({ id: teamId }).then((r) => r[0]),
    enabled: !!teamId,
  });

  const { data: tournament } = useQuery({
    queryKey: ["tournament", team?.tournament_id],
    queryFn: () => maxikay.entities.Tournament.filter({ id: team.tournament_id }).then((r) => r[0]),
    enabled: !!team?.tournament_id,
  });

  const { data: ledger = [], isLoading: loadingLedger } = useQuery({
    queryKey: ["team-ledger", teamId],
    queryFn: () => maxikay.entities.PaymentLedger.filter({ team_id: teamId }, "-created_date", 100),
    enabled: !!teamId,
  });

  const { data: prizePayments = [] } = useQuery({
    queryKey: ["team-prize-payments", teamId],
    queryFn: () => maxikay.entities.PrizePayment.filter({ team_id: teamId }, "-created_date", 20),
    enabled: !!teamId,
  });

  if (!teamId) return <div className="text-center py-20 text-muted-foreground">No team specified. Use ?team_id=…</div>;
  if (loadingTeam || loadingLedger) return <LoadingSpinner />;
  if (!team) return <div className="text-center py-20 text-muted-foreground">Team not found.</div>;

  const isCaptain = currentUser?.email === team.captain_email;

  const totalPaid = ledger.filter((l) => l.source === "registration" && l.type === "credit").reduce((s, l) => s + (l.amount || 0), 0);
  const totalPrizesReceived = ledger.filter((l) => l.source === "withdrawal" && l.type === "debit").reduce((s, l) => s + (l.amount || 0), 0)
    + prizePayments.filter((p) => p.status === "confirmed").reduce((s, p) => s + (p.prize_amount || 0), 0);
  const pendingPrizes = prizePayments.filter((p) => p.status === "pending" || p.status === "sent").reduce((s, p) => s + (p.prize_amount || 0), 0);
  const currency = tournament?.currency || "USD";

  const allTransactions = [
    ...ledger.map((l) => ({ ...l, _type: "ledger" })),
    ...prizePayments.map((p) => ({
      id: p.id,
      _type: "prize",
      created_date: p.created_date,
      source: "withdrawal",
      type: "debit",
      amount: p.prize_amount,
      status: p.status === "confirmed" ? "completed" : p.status === "failed" ? "failed" : "pending",
      notes: `Prize — ${["🥇", "🥈", "🥉"][p.placement - 1] || ""} #${p.placement} place via ${p.payment_method}`,
      reference: p.payment_reference,
    })),
  ].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 md:pb-0">
      <PageHeader
        title={`${team.name} · Finances`}
        subtitle={tournament ? `Tournament: ${tournament.name}` : "All tournaments"}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        }
      />

      {!isCaptain && (
        <div className="px-4 py-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-xs text-yellow-400">
          You are viewing this as a non-captain. Some details may be restricted.
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard label="Entry Fee Paid" value={`${currency} ${totalPaid.toLocaleString()}`} icon={CreditCard} color="text-muted-foreground" />
        <MetricCard label="Prizes Received" value={`${currency} ${totalPrizesReceived.toLocaleString()}`} icon={Trophy} color="text-yellow-400" />
        <MetricCard label="Pending Payout" value={`${currency} ${pendingPrizes.toLocaleString()}`} icon={Clock} color="text-primary" sub={pendingPrizes > 0 ? "Awaiting transfer" : "None pending"} />
      </div>

      {/* Net position */}
      {(totalPaid > 0 || totalPrizesReceived > 0) && (
        <div className={`glass rounded-xl p-4 flex items-center gap-3 ${totalPrizesReceived - totalPaid >= 0 ? "border border-green-500/30" : "border border-destructive/30"}`}>
          {totalPrizesReceived - totalPaid >= 0 ? <TrendingUp className="w-5 h-5 text-green-400" /> : <TrendingDown className="w-5 h-5 text-destructive" />}
          <div>
            <p className="text-xs text-muted-foreground">Net position (prizes − entry fees)</p>
            <p className={`font-display font-bold text-lg ${totalPrizesReceived - totalPaid >= 0 ? "text-green-400" : "text-destructive"}`}>
              {totalPrizesReceived - totalPaid >= 0 ? "+" : ""}{currency} {(totalPrizesReceived - totalPaid).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Prize payments status */}
      {prizePayments.length > 0 && (
        <div className="glass rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Prize Payment Status</h3>
          {prizePayments.map((p) => {
            const cfg = STATUS_CONFIG[p.status === "confirmed" ? "completed" : p.status === "failed" ? "failed" : "pending"] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <div key={p.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border border-border/30 ${cfg.bg}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {["🥇 Champion", "🥈 Runner-up", "🥉 3rd Place"][p.placement - 1] || `#${p.placement} Place`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{p.payment_method} {p.payment_reference ? `· ${p.payment_reference}` : ""}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-display font-bold text-sm ${cfg.color}`}>{p.currency || currency} {(p.prize_amount || 0).toLocaleString()}</p>
                  <p className={`text-[10px] capitalize ${cfg.color}`}>{p.status}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transaction history */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Transaction History</h3>
        {allTransactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No transactions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {allTransactions.map((tx, i) => {
              const cfg = STATUS_CONFIG[tx.status] || STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const isIncoming = tx.type === "credit";
              return (
                <motion.div
                  key={tx.id + i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex items-center justify-between py-2 px-3 rounded-lg border border-border/20 hover:border-border/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg} shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{SOURCE_LABELS[tx.source] || tx.source}</p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                        {tx.notes || tx.reference || moment(tx.created_date).format("MMM D, YYYY h:mm A")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-display font-bold text-sm ${isIncoming ? "text-green-400" : "text-foreground"}`}>
                      {isIncoming ? "+" : "-"}{currency} {(tx.amount || 0).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{moment(tx.created_date).fromNow()}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}