import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useState } from "react";
import { Tv, Youtube, X, ChevronDown } from "lucide-react";

function parseStream(url) {
  if (!url) return null;
  const twitchMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  if (twitchMatch) return { type: "twitch", channel: twitchMatch[1] };
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return { type: "youtube", videoId: ytMatch[1] };
  if (/^[a-zA-Z0-9_]+$/.test(url.trim())) return { type: "twitch", channel: url.trim() };
  return null;
}

export default function StreamStatusBadge({ tournamentId }) {
  const [expanded, setExpanded] = useState(false);
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  const { data: tournament } = useQuery({
    queryKey: ["tournament-stream", tournamentId],
    queryFn: () => maxikay.entities.Tournament.filter({ id: tournamentId }),
    select: (d) => d[0],
    enabled: !!tournamentId,
  });

  const streamUrl = tournament?.stream_url;
  const parsed = parseStream(streamUrl);
  if (!parsed) return null;

  const isTwitch = parsed.type === "twitch";

  return (
    <div className="w-full">
      {/* Badge */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/40 bg-secondary/40 hover:border-primary/40 transition-colors text-xs w-full"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
        {isTwitch ? (
          <Tv className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        ) : (
          <Youtube className="w-3.5 h-3.5 text-red-400 shrink-0" />
        )}
        <span className="text-muted-foreground">
          {isTwitch ? `LIVE · twitch.tv/${parsed.channel}` : "LIVE · YouTube Stream"}
        </span>
        <span className="ml-auto flex items-center gap-1 text-primary font-semibold">
          {expanded ? <><X className="w-3 h-3" /> Hide</> : <><ChevronDown className="w-3 h-3" /> Watch</>}
        </span>
      </button>

      {/* Inline player */}
      {expanded && (
        <div className="mt-2 relative w-full rounded-xl overflow-hidden" style={{ paddingTop: "56.25%" }}>
          {isTwitch ? (
            <iframe
              src={`https://player.twitch.tv/?channel=${parsed.channel}&parent=${hostname}`}
              className="absolute inset-0 w-full h-full"
              allowFullScreen
              title="Twitch Stream"
            />
          ) : (
            <iframe
              src={`https://www.youtube.com/embed/${parsed.videoId}?autoplay=0`}
              className="absolute inset-0 w-full h-full"
              allowFullScreen
              title="YouTube Stream"
            />
          )}
        </div>
      )}
    </div>
  );
}