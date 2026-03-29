import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Tv, Youtube, Radio } from "lucide-react";

function parseStream(url) {
  if (!url) return null;
  const twitchMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  if (twitchMatch) return { type: "twitch", channel: twitchMatch[1] };
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return { type: "youtube", videoId: ytMatch[1] };
  if (/^[a-zA-Z0-9_]+$/.test(url.trim())) return { type: "twitch", channel: url.trim() };
  return null;
}

export default function MatchStreamEmbed({ tournamentId, preferStreamUrl }) {
  const { data: tournament } = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => maxikay.entities.Tournament.filter({ id: tournamentId }).then((r) => r[0]),
    enabled: !!tournamentId,
  });

  const streamUrl = preferStreamUrl || tournament?.stream_url;
  const parsed = parseStream(streamUrl);

  if (!parsed) return null;

  const hostname = window.location.hostname;

  return (
    <div className="glass rounded-xl overflow-hidden border border-primary/20">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-red-500/10">
        <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
        <span className="text-xs font-display uppercase tracking-wider text-red-400 font-semibold">Live Stream</span>
        {parsed.type === "twitch" ? (
          <span className="flex items-center gap-1 ml-auto text-[10px] text-purple-400">
            <Tv className="w-3 h-3" /> Twitch · {parsed.channel}
          </span>
        ) : (
          <span className="flex items-center gap-1 ml-auto text-[10px] text-red-400">
            <Youtube className="w-3 h-3" /> YouTube Live
          </span>
        )}
      </div>
      <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
        {parsed.type === "twitch" ? (
          <iframe
            src={`https://player.twitch.tv/?channel=${parsed.channel}&parent=${hostname}&autoplay=false`}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            title="Match Stream"
          />
        ) : (
          <iframe
            src={`https://www.youtube.com/embed/${parsed.videoId}?autoplay=0`}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            title="Match Stream"
          />
        )}
      </div>
    </div>
  );
}