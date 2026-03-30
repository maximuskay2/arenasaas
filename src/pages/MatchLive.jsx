import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { maxikay } from "@/api/maxikayClient";
import { joinMatchLiveRoom, leaveMatchLiveRoom, subscribeMatchLiveFeed } from "@/lib/realtimeClient";
import { joinMatchLobbyRoom, leaveMatchLobbyRoom, subscribeMatchLobbyChat } from "@/lib/realtimeClient";
import { ArrowLeft, Maximize2, Minimize2, Radio, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

const ReactPlayer = lazy(() => import("react-player/lazy"));

function formatTime(ts) {
  try {
    return new Date(ts || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

export default function MatchLive() {
  const { matchId: matchIdParam, id: idParam } = useParams();
  const matchId = matchIdParam || idParam;
  const [cinematic, setCinematic] = useState(false);
  const [feed, setFeed] = useState([]);
  const [chatLines, setChatLines] = useState([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["match-watch", matchId],
    queryFn: () => maxikay.public.matchWatchMeta(matchId),
    enabled: !!matchId,
    retry: 1,
  });

  const streamUrl = data?.stream_url || "";
  const match = data?.match;

  useEffect(() => {
    if (!matchId) return;
    joinMatchLiveRoom(matchId);
    const unsub = subscribeMatchLiveFeed((payload) => {
      if (payload?.matchId && String(payload.matchId) !== String(matchId)) return;
      setFeed((prev) => [{ ...payload, _t: payload.at || Date.now() }, ...prev].slice(0, 80));
    });
    return () => {
      unsub();
      leaveMatchLiveRoom(matchId);
    };
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    joinMatchLobbyRoom(matchId);
    const unsub = subscribeMatchLobbyChat(matchId, (row) => {
      const who = row.author_email || row.submitted_by || "Fan";
      const text = row.body || row.message || "";
      setChatLines((prev) => [...prev.slice(-60), { who, text, t: Date.now() }]);
    });
    return () => {
      unsub();
      leaveMatchLobbyRoom(matchId);
    };
  }, [matchId]);

  const appendDemoPing = useCallback(() => {
    setFeed((prev) =>
      [
        { type: "info", headline: "Match Center", body: "Connected — waiting for bracket / score events…", _t: Date.now() },
        ...prev,
      ].slice(0, 80)
    );
  }, []);

  useEffect(() => {
    appendDemoPing();
  }, [matchId, appendDemoPing]);

  if (!matchId) {
    return <p className="text-center text-muted-foreground py-16">Missing match id.</p>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <p className="text-muted-foreground">Could not load match or stream metadata.</p>
        <Button asChild variant="outline">
          <Link to="/matches">Back</Link>
        </Button>
      </div>
    );
  }

  const shell = cinematic
    ? "fixed inset-0 z-[100] bg-background/98 backdrop-blur-md flex flex-col"
    : "max-w-[1600px] mx-auto px-3 md:px-5 py-4 space-y-4 pb-24";

  return (
    <div className={shell}>
      <header className={`flex flex-wrap items-center justify-between gap-3 ${cinematic ? "shrink-0 px-4 py-3 border-b border-border/60" : ""}`}>
        <div className="flex items-center gap-2 min-w-0">
          {!cinematic && (
            <Button variant="ghost" size="sm" asChild className="shrink-0 -ml-2">
              <Link to={`/matches/${matchId}`}>
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
          )}
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-primary font-display flex items-center gap-1">
              <Radio className="w-3 h-3 animate-pulse" /> Live center
            </p>
            <h1 className="font-display font-bold text-lg md:text-xl truncate">
              {match.team_a_name || "TBD"} <span className="text-muted-foreground font-normal">vs</span>{" "}
              {match.team_b_name || "TBD"}
            </h1>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 shrink-0 border-primary/40"
          onClick={() => setCinematic((v) => !v)}
        >
          {cinematic ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          {cinematic ? "Exit cinematic" : "Cinematic"}
        </Button>
      </header>

      <div className={`grid gap-4 ${cinematic ? "flex-1 min-h-0 grid-cols-1 lg:grid-cols-5 px-4 pb-4" : "lg:grid-cols-5"}`}>
        <div className={`lg:col-span-3 space-y-2 ${cinematic ? "min-h-0 flex flex-col" : ""}`}>
          <div
            className={`rounded-2xl border border-border/60 bg-black/40 overflow-hidden ${
              cinematic ? "flex-1 min-h-[200px]" : "aspect-video"
            }`}
          >
            {streamUrl ? (
              <Suspense
                fallback={
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Loading player…</div>
                }
              >
                <ReactPlayer url={streamUrl} width="100%" height="100%" controls playing muted={false} config={{}} />
              </Suspense>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2 p-8 text-center">
                <Sparkles className="w-8 h-8 text-primary/60" />
                <p className="text-sm">No stream URL on this match or tournament yet.</p>
                <p className="text-xs opacity-70">Organizers can set `stream_url` on the match or tournament.</p>
              </div>
            )}
          </div>
        </div>

        <div className={`lg:col-span-2 flex flex-col gap-3 ${cinematic ? "min-h-0" : ""}`}>
          <div
            className={`rounded-2xl border border-primary/25 bg-secondary/20 overflow-hidden flex flex-col ${
              cinematic ? "flex-1 min-h-0" : "min-h-[220px] max-h-[42vh]"
            }`}
          >
            <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between bg-secondary/30">
              <span className="text-xs font-display uppercase tracking-wider text-primary">Event log</span>
              <span className="text-[10px] text-muted-foreground">Kill-feed style</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 font-mono text-xs">
              {feed.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">No events yet.</p>
              ) : (
                feed.map((item, i) => (
                  <div
                    key={`${item._t}-${i}`}
                    className="rounded-lg border border-border/40 bg-background/50 px-2 py-1.5"
                  >
                    <div className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                      <span>{item.type || "evt"}</span>
                      <span>{formatTime(item._t)}</span>
                    </div>
                    <p className="text-foreground font-semibold">{item.headline || item.message || "Update"}</p>
                    {item.body ? <p className="text-muted-foreground text-[11px] mt-0.5">{item.body}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-secondary/15 flex flex-col min-h-[140px] max-h-[28vh]">
            <div className="px-3 py-2 border-b border-border/50 text-xs font-display uppercase tracking-wider text-muted-foreground">
              Match lobby chat
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
              {chatLines.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No messages yet. Same room as match lobby.</p>
              ) : (
                chatLines.map((c, i) => (
                  <div key={i} className="text-muted-foreground">
                    <span className="text-primary font-medium">{c.who}:</span> {c.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
