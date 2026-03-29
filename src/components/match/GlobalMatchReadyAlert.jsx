import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Zap, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

function useCountdown(deadline) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const diff = new Date(deadline) - Date.now();
      if (diff <= 0) { setRemaining("Expired"); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  return remaining;
}

function MatchReadyCard({ match, onDismiss }) {
  const countdown = useCountdown(match.check_in_deadline);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="bg-card border border-primary/50 rounded-2xl shadow-2xl overflow-hidden glow-primary"
    >
      {/* Accent top bar */}
      <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-accent" />
      <div className="p-4 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 animate-pulse">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-display font-bold text-primary tracking-wide">⚡ CHECK-IN OPEN</p>
          <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
            {match.team_a_name || "TBD"} vs {match.team_b_name || "TBD"}
          </p>
          <p className="text-xs text-muted-foreground">Round {match.round} · {match.bracket_position || "—"}</p>

          {countdown && (
            <div className="flex items-center gap-1.5 mt-2">
              <Clock className="w-3.5 h-3.5 text-yellow-400" />
              <span className={`text-xs font-display font-bold ${countdown === "Expired" ? "text-destructive" : "text-yellow-400"}`}>
                {countdown === "Expired" ? "Check-in expired" : `${countdown} remaining`}
              </span>
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <Link to={`/matches/${match.id}`} onClick={() => onDismiss(match.id)}>
              <Button size="sm" className="h-8 font-display text-xs tracking-wider gap-1.5">
                <Zap className="w-3.5 h-3.5" /> CHECK IN NOW
              </Button>
            </Link>
          </div>
        </div>
        <button
          onClick={() => onDismiss(match.id)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

export default function GlobalMatchReadyAlert() {
  const { tenantId, isSuperAdmin } = useTenant();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(new Set());

  const { data: matches = [] } = useQuery({
    queryKey: ["global-checkin-matches", tenantId],
    queryFn: () =>
      tenantId && !isSuperAdmin
        ? maxikay.entities.Match.filter({ tenant_id: tenantId, status: "check_in_open" }, "-created_date", 10)
        : [],
    enabled: !!tenantId && !isSuperAdmin,
    refetchInterval: 30000,
  });

  // Subscribe to match changes globally
  useEffect(() => {
    const unsub = maxikay.entities.Match.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["global-checkin-matches", tenantId] });
    });
    return unsub;
  }, [tenantId, queryClient]);

  const dismiss = useCallback((id) => {
    setDismissed((prev) => new Set([...prev, id]));
  }, []);

  const visible = matches.filter((m) => !dismissed.has(m.id));

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 w-full max-w-sm pointer-events-none">
      <AnimatePresence>
        {visible.map((match) => (
          <div key={match.id} className="pointer-events-auto">
            <MatchReadyCard match={match} onDismiss={dismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}