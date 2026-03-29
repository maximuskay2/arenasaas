import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, UserPlus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDiscoveryStatus, discoveryStatusClass } from "./discoveryStatus";
import { formatPrizeCardLine } from "@/lib/prizeDisplay";
import moment from "moment";

/**
 * Marketplace card — aligns with TRANSACTION_LAYER_TODO sketch + app tokens.
 */
export default function DiscoveryTournamentCard({
  tournament,
  featured = false,
  onJoin,
  compareMode = false,
  isSelected = false,
  onToggleCompare,
}) {
  const navigate = useNavigate();
  const { label, tone } = getDiscoveryStatus(tournament);
  const prize = tournament.prize_pool != null ? Number(tournament.prize_pool) : 0;
  const joined = tournament.joined_count ?? tournament.registered_teams ?? 0;
  const maxSlots = tournament.max_slots ?? tournament.max_teams ?? 0;
  const organizer = tournament.organizer_name || tournament.organizer_slug || "Organizer";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className={`group relative rounded-3xl bg-white/5 border p-5 transition-all overflow-hidden cursor-pointer ${
        isSelected ? "border-primary ring-2 ring-primary/40 shadow-lg shadow-primary/15" : "border-white/10 hover:border-primary/50"
      } ${featured ? "ring-1 ring-yellow-500/35" : ""}`}
      onClick={() => {
        if (compareMode) {
          onToggleCompare?.(tournament);
          return;
        }
        navigate(`/tournaments/${tournament.id}`);
      }}
    >
      {compareMode && (
        <div
          className={`absolute top-3 left-3 z-[2] flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-black ${
            isSelected ? "border-primary bg-primary text-primary-foreground" : "border-white/30 bg-black/50 text-slate-400"
          }`}
        >
          {isSelected ? "✓" : ""}
        </div>
      )}
      {compareMode && (
        <button
          type="button"
          className="absolute top-3 right-3 z-[2] rounded-lg bg-black/60 border border-white/15 p-1.5 text-slate-300 hover:text-primary"
          title="Open tournament"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/tournaments/${tournament.id}`);
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="relative h-24 rounded-2xl mb-4 bg-gradient-to-br from-primary/25 to-accent/20 flex items-center justify-center overflow-hidden">
        {tournament.banner_url ? (
          <img src={tournament.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        ) : (
          <Trophy className="w-10 h-10 text-primary/40 relative z-[1]" />
        )}
        {featured && (
          <span className="absolute top-2 right-2 text-[9px] font-black uppercase italic px-2 py-0.5 rounded-full bg-yellow-500/25 text-yellow-300 border border-yellow-500/40 z-[1]">
            Featured
          </span>
        )}
      </div>

      <div className="flex justify-between items-start mb-3 gap-2">
        <span
          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase italic border ${discoveryStatusClass(tone)}`}
        >
          {label}
        </span>
        <span className="text-primary font-black italic text-sm shrink-0">
          {prize > 0 ? `$${prize.toLocaleString()}` : "—"}
        </span>
      </div>

      <h3 className="text-lg font-black uppercase italic tracking-tighter text-foreground mb-1 line-clamp-2">
        {tournament.name}
      </h3>
      <p className="text-xs text-muted-foreground font-bold uppercase mb-1">{organizer}</p>
      {tournament.game_title && (
        <p className="text-[11px] text-primary/80 font-semibold mb-1">{tournament.game_title}</p>
      )}
      <p className="text-[10px] text-muted-foreground font-semibold leading-snug line-clamp-2 mb-4" title={formatPrizeCardLine(tournament)}>
        <span className="sr-only">Prize summary: </span>
        {formatPrizeCardLine(tournament)}
      </p>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
        <div className="text-xs text-muted-foreground">
          <span className="text-foreground font-bold">{joined}</span>
          <span className="mx-1">/</span>
          <span>{maxSlots}</span>
          <span className="ml-1 opacity-80">Teams</span>
        </div>
        {tournament.status === "registration_open" && (
          <Button
            size="sm"
            className="rounded-xl px-5 italic font-black uppercase text-[10px] h-8"
            onClick={(e) => {
              e.stopPropagation();
              onJoin?.(tournament);
            }}
          >
            <UserPlus className="w-3.5 h-3.5 mr-1" />
            Join
          </Button>
        )}
      </div>
      {tournament.start_date && (
        <p className="text-[10px] text-muted-foreground mt-2">{moment(tournament.start_date).format("MMM D, YYYY h:mm A")}</p>
      )}
    </motion.div>
  );
}
