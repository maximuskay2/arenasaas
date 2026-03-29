import { Button } from "@/components/ui/button";
import { Shield, RotateCcw, Trophy } from "lucide-react";
import { motion } from "framer-motion";

export default function DisputeResolver({ match, onResolve, onReinstate, isLoading }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-6 space-y-4 border border-orange-500/30"
    >
      <div className="flex items-center gap-2 text-orange-400">
        <Shield className="w-4 h-4" />
        <span className="text-sm font-display font-semibold tracking-wider uppercase">Dispute Resolution</span>
      </div>

      <p className="text-xs text-muted-foreground">
        This match is under dispute. Assign the winner manually or reinstate the match to continue play.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Button
          disabled={isLoading}
          onClick={() => onResolve(match.team_a_id, match.team_a_name)}
          variant="outline"
          className="flex-col h-auto py-3 gap-1 border-primary/30 hover:border-primary/60"
        >
          <Trophy className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">{match.team_a_name || "Team A"}</span>
          <span className="text-[10px] text-muted-foreground">Force Win</span>
        </Button>

        <Button
          disabled={isLoading}
          onClick={() => onResolve(match.team_b_id, match.team_b_name)}
          variant="outline"
          className="flex-col h-auto py-3 gap-1 border-primary/30 hover:border-primary/60"
        >
          <Trophy className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">{match.team_b_name || "Team B"}</span>
          <span className="text-[10px] text-muted-foreground">Force Win</span>
        </Button>
      </div>

      <Button
        disabled={isLoading}
        onClick={onReinstate}
        variant="ghost"
        className="w-full gap-2 text-muted-foreground text-xs"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Reinstate to In Progress
      </Button>
    </motion.div>
  );
}