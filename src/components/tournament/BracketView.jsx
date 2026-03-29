import { useState } from "react";
import { motion } from "framer-motion";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Swords, ZoomIn, ZoomOut, Maximize2, Radio } from "lucide-react";
import EmptyState from "../shared/EmptyState";
import StatusBadge from "../shared/StatusBadge";
import { Link } from "react-router-dom";

export default function BracketView({ matches, tournamentId, onMatchClick }) {
  const [selectedRound, setSelectedRound] = useState(null);

  if (!matches || matches.length === 0) {
    return (
      <EmptyState
        icon={Swords}
        title="No bracket yet"
        description="Generate the bracket from the tournament controls above"
      />
    );
  }

  // Group matches by round
  const rounds = {};
  matches.forEach((m) => {
    const r = m.round || 1;
    if (!rounds[r]) rounds[r] = [];
    rounds[r].push(m);
  });

  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  const maxRound = Math.max(...roundNumbers);
  const activeRound = selectedRound || roundNumbers[0];

  const getRoundLabel = (round) => {
    if (round === maxRound) return "Finals";
    if (round === maxRound - 1) return "Semis";
    if (round === maxRound - 2) return "Quarters";
    return `Round ${round}`;
  };

  return (
    <div className="space-y-4">
      {/* Round selector - always visible, primary nav on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {roundNumbers.map((round) => (
          <button
            key={round}
            onClick={() => setSelectedRound(round)}
            className={`px-4 py-2 rounded-lg text-xs font-display font-semibold tracking-wider whitespace-nowrap transition-all ${
              activeRound === round
                ? "bg-primary/15 text-primary border border-primary/30 glow-border-primary"
                : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {getRoundLabel(round)}
            <span className="ml-2 text-muted-foreground">({rounds[round]?.length || 0})</span>
          </button>
        ))}
      </div>

      {/* Desktop: Full bracket tree with pan/zoom */}
      <div className="hidden lg:block">
        <TransformWrapper
          initialScale={1}
          minScale={0.3}
          maxScale={2}
          centerOnInit
          wheel={{ step: 0.1 }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              <div className="flex gap-2 mb-2 justify-end">
                <button onClick={() => zoomIn()} className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"><ZoomIn className="w-4 h-4" /></button>
                <button onClick={() => zoomOut()} className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"><ZoomOut className="w-4 h-4" /></button>
                <button onClick={() => resetTransform()} className="p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"><Maximize2 className="w-4 h-4" /></button>
              </div>
              <TransformComponent wrapperStyle={{ width: "100%", overflow: "hidden", borderRadius: "0.75rem", background: "hsl(var(--card)/0.3)", border: "1px solid hsl(var(--border)/0.5)" }}>
                <div className="flex gap-8 min-w-max py-6 px-4">
                  {roundNumbers.map((round) => (
                    <div key={round} className="flex flex-col gap-4" style={{ minWidth: 260 }}>
                      <h3 className="text-xs font-display font-semibold tracking-wider text-muted-foreground uppercase text-center">
                        {getRoundLabel(round)}
                      </h3>
                      <div className="flex flex-col justify-around gap-4 flex-1">
                        {(rounds[round] || [])
                          .sort((a, b) => a.match_number - b.match_number)
                          .map((match) => (
                           <MatchNode key={match.id} match={match} onMatchClick={onMatchClick} />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>

      {/* Mobile: Vertical list for selected round */}
      <div className="lg:hidden space-y-3">
        {(rounds[activeRound] || [])
          .sort((a, b) => a.match_number - b.match_number)
          .map((match, i) => (
            <motion.div
              key={match.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <MatchCard match={match} onMatchClick={onMatchClick} />
            </motion.div>
          ))}
      </div>
    </div>
  );
}

function MatchNode({ match, onMatchClick }) {
  const isLive = match.status === "in_progress";
  const isCompleted = match.status === "completed";
  const hasBypass = match.status === "completed" && match.next_match_id;
  const hasStream = !!match.stream_url;

  const inner = (
    <div className={`glass rounded-lg p-3 glass-hover min-w-[240px] ${isLive ? "glow-border-primary" : ""}`}>
      <div className="space-y-1.5">
        <TeamRow name={match.team_a_name || "TBD"} score={match.score_a} isWinner={isCompleted && match.winner_id === match.team_a_id} />
        <div className="border-t border-border/30" />
        <TeamRow name={match.team_b_name || "TBD"} score={match.score_b} isWinner={isCompleted && match.winner_id === match.team_b_id} />
      </div>
      <div className="mt-2 flex items-center justify-between">            <span className="text-[10px] text-muted-foreground">{match.bracket_position}</span>
        <div className="flex items-center gap-1.5">
          {hasStream && (
            <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 font-semibold">
              <Radio className="w-2.5 h-2.5 animate-pulse" /> WATCH
            </span>
          )}
          <StatusBadge status={match.status} />
        </div>
      </div>
      {hasBypass && (
        <div className="mt-1.5 text-[10px] text-primary/60 flex items-center gap-1">
          <span>→</span><span className="truncate">Winner advances</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative space-y-1">
      {onMatchClick ? (
        <button type="button" className="w-full text-left" onClick={() => onMatchClick(match)}>
          {inner}
        </button>
      ) : (
        <>
          <Link to={`/matches/${match.id}/lobby`} className="block">
            {inner}
          </Link>
          <div className="flex justify-end px-0.5">
            <Link
              to={`/matches/${match.id}`}
              className="text-[9px] uppercase tracking-wider text-muted-foreground hover:text-primary font-semibold"
            >
              Console →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function MatchCard({ match, onMatchClick }) {
  const isLive = match.status === "in_progress";
  const isCompleted = match.status === "completed";

  const inner = (
    <div className={`glass rounded-xl p-4 glass-hover ${isLive ? "glow-border-primary" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-display tracking-wider text-muted-foreground">{match.bracket_position}</span>
        <StatusBadge status={match.status} />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1 text-right">
          <p className={`text-sm font-semibold ${isCompleted && match.winner_id === match.team_a_id ? "text-primary" : "text-foreground"}`}>
            {match.team_a_name || "TBD"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-display font-bold text-primary">{match.score_a}</span>
          <span className="text-xs text-muted-foreground">-</span>
          <span className="text-xl font-display font-bold text-primary">{match.score_b}</span>
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${isCompleted && match.winner_id === match.team_b_id ? "text-primary" : "text-foreground"}`}>
            {match.team_b_name || "TBD"}
          </p>
        </div>
      </div>
    </div>
  );

  return onMatchClick ? (
    <button type="button" className="w-full text-left" onClick={() => onMatchClick(match)}>
      {inner}
    </button>
  ) : (
    <div className="space-y-1">
      <Link to={`/matches/${match.id}/lobby`} className="block">
        {inner}
      </Link>
      <div className="flex justify-end px-0.5">
        <Link
          to={`/matches/${match.id}`}
          className="text-[9px] uppercase tracking-wider text-muted-foreground hover:text-primary font-semibold"
        >
          Console →
        </Link>
      </div>
    </div>
  );
}

function TeamRow({ name, score, isWinner }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs truncate max-w-[160px] ${isWinner ? "text-primary font-semibold" : "text-foreground"}`}>
        {isWinner && "▶ "}{name}
      </span>
      <span className={`text-sm font-display font-bold ${isWinner ? "text-primary" : "text-muted-foreground"}`}>
        {score}
      </span>
    </div>
  );
}