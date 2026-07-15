import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, UserPlus, ExternalLink, Users, Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDiscoveryStatus, discoveryStatusClass } from "./discoveryStatus";
import { formatPrizeCardLine } from "@/lib/prizeDisplay";
import moment from "moment";

/**
 * Marketplace card — world-class competition tile.
 */
export default function DiscoveryTournamentCard({
  tournament,
  featured = false,
  onJoin,
  compareMode = false,
  isSelected = false,
  onToggleCompare,
  watched = false,
  onToggleWatch,
  showWatch = false,
}) {
  const navigate = useNavigate();
  const { label, tone } = getDiscoveryStatus(tournament);
  const prize = tournament.prize_pool != null ? Number(tournament.prize_pool) : 0;
  const joined = tournament.joined_count ?? tournament.registered_teams ?? 0;
  const maxSlots = tournament.max_slots ?? tournament.max_teams ?? 0;
  const organizer = tournament.organizer_name || tournament.organizer_slug || "Organizer";
  const currency = tournament.currency || "USD";
  const fill = maxSlots > 0 ? Math.min(100, Math.round((joined / maxSlots) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25 }}
      className={`group relative rounded-3xl glass p-0 overflow-hidden cursor-pointer transition-all ${
        isSelected
          ? "ring-2 ring-primary/50 border-primary/50 shadow-arena-glow"
          : "border border-border/50 hover:border-primary/40 hover:shadow-arena-glow"
      } ${featured ? "ring-1 ring-amber-500/40" : ""}`}
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
          className={`absolute top-3 left-3 z-[2] flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-display font-bold ${
            isSelected
              ? "border-primary bg-primary text-primary-foreground shadow-arena-glow"
              : "border-border/60 bg-background/80 text-muted-foreground"
          }`}
        >
          {isSelected ? "✓" : ""}
        </div>
      )}
      {compareMode && (
        <button
          type="button"
          className="absolute top-3 right-3 z-[2] rounded-lg bg-background/80 border border-border/50 p-1.5 text-muted-foreground hover:text-primary hover:border-primary/40"
          title="Open tournament"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/tournaments/${tournament.id}`);
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="relative h-28 bg-gradient-to-br from-primary/30 via-card to-accent/20 flex items-center justify-center overflow-hidden">
        {tournament.banner_url ? (
          <img src={tournament.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-55 group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <Trophy className="w-11 h-11 text-primary/50 relative z-[1]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
        {featured && (
          <span className="absolute top-3 right-3 text-[9px] font-display font-bold uppercase px-2.5 py-1 rounded-full bg-amber-500/25 text-amber-200 border border-amber-500/40 z-[1]">
            Featured
          </span>
        )}
      </div>

      <div className="p-5 space-y-3">
        <div className="flex justify-between items-start gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-display font-bold uppercase border ${discoveryStatusClass(tone)}`}>
            {label}
          </span>
          <span className="text-primary font-display font-bold text-sm shrink-0 tabular-nums">
            {prize > 0 ? `${currency} ${prize.toLocaleString()}` : "Free entry"}
          </span>
        </div>

        <div>
          <h3 className="text-base md:text-lg font-display font-bold tracking-tight text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {tournament.name}
          </h3>
          <p className="text-xs text-muted-foreground font-semibold mt-1">{organizer}</p>
          {tournament.game_title && (
            <p className="text-[11px] text-primary/90 font-semibold mt-0.5">{tournament.game_title}</p>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2" title={formatPrizeCardLine(tournament)}>
          {formatPrizeCardLine(tournament)}
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {joined}
              {maxSlots ? ` / ${maxSlots}` : ""} slots
            </span>
            {tournament.start_date && (
              <span>{moment(tournament.start_date).format("MMM D")}</span>
            )}
          </div>
          {maxSlots > 0 && (
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
                style={{ width: `${fill}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          {showWatch && onToggleWatch ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 px-2.5"
              title={watched ? "Remove from watchlist" : "Watchlist"}
              onClick={() => onToggleWatch(tournament)}
            >
              {watched ? (
                <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Bookmark className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate(`/tournaments/${tournament.id}`)}
          >
            Details
          </Button>
          <Button
            type="button"
            size="sm"
            variant="arena"
            className="flex-1"
            onClick={() => onJoin?.(tournament)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Join
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
