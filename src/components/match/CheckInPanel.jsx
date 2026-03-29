import { Button } from "@/components/ui/button";
import { UserCheck, Clock } from "lucide-react";
import { motion } from "framer-motion";

export default function CheckInPanel({ match, onCheckIn, isLoading }) {
  const aChecked = match.team_a_checked_in;
  const bChecked = match.team_b_checked_in;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center gap-2 text-yellow-400">
        <Clock className="w-4 h-4" />
        <span className="text-sm font-display font-semibold tracking-wider">CHECK-IN REQUIRED</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          disabled={aChecked || isLoading}
          onClick={() => onCheckIn("a")}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
            aChecked
              ? "border-green-500/50 bg-green-500/10 text-green-400"
              : "border-border/50 bg-secondary/50 hover:border-primary/40 text-foreground"
          }`}
        >
          <UserCheck className={`w-5 h-5 ${aChecked ? "text-green-400" : "text-muted-foreground"}`} />
          <span className="text-xs font-semibold">{match.team_a_name || "Team A"}</span>
          <span className="text-[10px] uppercase tracking-wider">{aChecked ? "Checked In ✓" : "Check In"}</span>
        </button>

        <button
          disabled={bChecked || isLoading}
          onClick={() => onCheckIn("b")}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
            bChecked
              ? "border-green-500/50 bg-green-500/10 text-green-400"
              : "border-border/50 bg-secondary/50 hover:border-primary/40 text-foreground"
          }`}
        >
          <UserCheck className={`w-5 h-5 ${bChecked ? "text-green-400" : "text-muted-foreground"}`} />
          <span className="text-xs font-semibold">{match.team_b_name || "Team B"}</span>
          <span className="text-[10px] uppercase tracking-wider">{bChecked ? "Checked In ✓" : "Check In"}</span>
        </button>
      </div>

      {aChecked && bChecked && (
        <p className="text-center text-xs text-green-400 font-semibold">Both teams checked in — match ready to start!</p>
      )}
    </motion.div>
  );
}