import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { subscribeLiveTicker } from "@/lib/realtimeClient";

function formatTickerLine(evt) {
  const a = evt.team_a || "TBD";
  const b = evt.team_b || "TBD";
  const v = evt.viewers != null ? ` (${Number(evt.viewers).toLocaleString()} viewers)` : "";
  return `[LIVE] ${a} vs ${b}${v}`;
}

export default function LiveMatchTicker({ className = "" }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    return subscribeLiveTicker((payload) => {
      if (!payload?.tournament_id) return;
      setEvents((prev) => {
        const id = String(payload.match_id || `${payload.tournament_id}-${payload.at}`);
        const row = {
          id,
          tournamentId: String(payload.tournament_id),
          text: formatTickerLine(payload),
          at: payload.at || Date.now(),
        };
        return [row, ...prev.filter((e) => e.id !== id)].slice(0, 12);
      });
    });
  }, []);

  const line = useMemo(() => {
    if (!events.length) {
      return "Arena live feed — when a match goes in progress, it surfaces here for the whole platform.";
    }
    return events.map((e) => e.text).join("   ·   ");
  }, [events]);

  const durationSec = Math.min(90, Math.max(32, 20 + events.length * 12));

  return (
    <div
      className={`relative overflow-hidden border-b border-white/10 bg-[#06060a]/95 text-[11px] font-bold uppercase tracking-wider text-slate-300 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="shrink-0 flex items-center gap-1.5 text-red-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          Live
        </span>
        <div className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_5%,black_95%,transparent)]">
          <div
            className="flex w-max gap-16 whitespace-nowrap motion-reduce:animate-none"
            style={{
              animation: `arenaTickerMarquee ${durationSec}s linear infinite`,
            }}
          >
            <span>{line}</span>
            <span aria-hidden>{line}</span>
          </div>
        </div>
        <Link to="/tournaments" className="shrink-0 text-primary hover:underline text-[10px]">
          Discover
        </Link>
      </div>
      <style>{`
        @keyframes arenaTickerMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
