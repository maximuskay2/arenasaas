import { motion, AnimatePresence } from "framer-motion";
import { Zap, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function MatchReadyBanner({ match }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (match?.status === "check_in_open" || match?.status === "in_progress") {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [match?.status]);

  if (!match) return null;

  const isCheckIn = match.status === "check_in_open";
  const isLive = match.status === "in_progress";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className={`rounded-xl p-4 border flex items-center justify-between gap-4 ${
            isLive
              ? "bg-primary/10 border-primary/40 glow-primary"
              : "bg-yellow-500/10 border-yellow-500/40"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center animate-pulse ${isLive ? "bg-primary/20" : "bg-yellow-500/20"}`}>
              <Zap className={`w-4 h-4 ${isLive ? "text-primary" : "text-yellow-400"}`} />
            </div>
            <div>
              <p className={`text-sm font-display font-bold tracking-wide ${isLive ? "text-primary" : "text-yellow-400"}`}>
                {isLive ? "⚡ Match is LIVE!" : "🔔 Check-in Open"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isLive
                  ? `${match.team_a_name} vs ${match.team_b_name} — Round ${match.round}`
                  : "Both teams must check in before the match can start"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/matches/${match.id}`}>
              <Button size="sm" className="font-display text-xs tracking-wider h-8">
                {isLive ? "OPEN MATCH" : "CHECK IN"}
              </Button>
            </Link>
            <button onClick={() => setVisible(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}