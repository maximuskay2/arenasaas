import { Eye, Radio, Clock, TrendingUp } from "lucide-react";
import InsightsNode from "./InsightsNode";
import { simulatedViewershipForTournament } from "@/lib/simulatedViewership";

function fmtInt(n) {
  return Number(n || 0).toLocaleString();
}

export default function TournamentViewershipPanel({ tournamentId, streamUrl, gameTitle }) {
  const v = simulatedViewershipForTournament(tournamentId, streamUrl);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">Viewership hub</h3>
          <p className="text-xs text-slate-500 font-medium mt-1 max-w-2xl">
            Simulated engagement metrics for sponsor decks. When you connect Twitch/YouTube APIs, these nodes can swap to live
            pulls from the official broadcast{gameTitle ? ` (${gameTitle})` : ""}.
          </p>
        </div>
        {streamUrl ? (
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/30">
            Stream linked
          </span>
        ) : (
          <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/5 text-slate-500 border border-white/10">
            No stream URL
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightsNode icon={Eye} label="Peak viewers" value={fmtInt(v.peak)} trend={v.trendPct} sub="Simulated peak" />
        <InsightsNode icon={Radio} label="Average viewers" value={fmtInt(v.average)} sub="Simulated avg CCV" />
        <InsightsNode icon={Clock} label="Hours watched" value={`${v.hoursWatched.toLocaleString()}h`} sub="Est. watch time" />
        <InsightsNode icon={TrendingUp} label="Engagement index" value={`${(v.peak / Math.max(1, v.average)).toFixed(2)}×`} sub="Peak / avg ratio" />
      </div>
    </div>
  );
}
