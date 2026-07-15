import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { maxikay } from "@/api/maxikayClient";
import { joinMatchLiveRoom, leaveMatchLiveRoom, subscribeMatchLiveFeed } from "@/lib/realtimeClient";
import { joinMatchLobbyRoom, leaveMatchLobbyRoom, subscribeMatchLobbyChat } from "@/lib/realtimeClient";
import { ArrowLeft, Maximize2, Minimize2, Radio, Sparkles, MessageSquare, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import StatusBadge from "@/components/shared/StatusBadge";

const ReactPlayer = lazy(() => import("react-player/lazy"));

function formatTime(ts) {
  try {
    return new Date(ts || Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Event type → accent for richer kill-feed style tickers */
function feedTypeClass(type) {
  const t = String(type || "info").toLowerCase();
  if (t === "score" || t === "kill") return "border-l-red-500/70 bg-red-500/5";
  if (t === "bracket" || t === "advance") return "border-l-primary/70 bg-primary/5";
  if (t === "narrative" || t === "story") return "border-l-amber-400/60 bg-amber-500/5";
  if (t === "forfeit" || t === "dispute") return "border-l-orange-500/70 bg-orange-500/10";
  return "border-l-border bg-secondary/20";
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

  const streams = data?.streams || [];
  const [streamIndex, setStreamIndex] = useState(0);
  const streamUrl =
    streams[streamIndex]?.stream_url || data?.stream_url || streams[0]?.stream_url || "";
  const match = data?.match;

  useEffect(() => {
    setStreamIndex(0);
  }, [matchId, data?.stream_url, streams.length]);

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
        {
          type: "info",
          headline: "Match Center",
          body: "Connected — waiting for bracket / score events…",
          _t: Date.now(),
        },
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
        <LoadingSpinner label="Loading live center…" />
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <p className="text-muted-foreground">Could not load match or stream metadata.</p>
        <Button asChild variant="outline">
          <Link to="/matches">Back to matches</Link>
        </Button>
      </div>
    );
  }

  const shell = cinematic
    ? "fixed inset-0 z-[100] bg-background/98 backdrop-blur-xl flex flex-col arena-stage"
    : "max-w-[1600px] mx-auto space-y-5 pb-24";

  return (
    <div className={shell}>
      <div className={cinematic ? "arena-content flex flex-col flex-1 min-h-0" : ""}>
        <header
          className={`flex flex-wrap items-center justify-between gap-3 ${
            cinematic ? "shrink-0 px-4 md:px-6 py-3 border-b border-border/50 bg-background/60 backdrop-blur-xl" : ""
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {!cinematic && (
              <Button variant="ghost" size="icon" asChild className="shrink-0">
                <Link to={`/matches/${matchId}`}>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
            )}
            <div className="min-w-0">
              <p className="section-label flex items-center gap-2 text-primary mb-1">
                <span className="live-dot" />
                Live center
              </p>
              <h1 className="font-display font-bold text-lg md:text-2xl tracking-tight truncate">
                {match.team_a_name || "TBD"}{" "}
                <span className="text-muted-foreground font-normal text-base mx-1">vs</span>{" "}
                {match.team_b_name || "TBD"}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                {match.status && <StatusBadge status={match.status} />}
                <span className="text-xs font-display font-bold tabular-nums text-primary">
                  {match.score_a ?? 0} – {match.score_b ?? 0}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!cinematic && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/matches/${matchId}/lobby`}>Lobby</Link>
              </Button>
            )}
            <Button
              type="button"
              variant={cinematic ? "arena" : "outline"}
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => setCinematic((v) => !v)}
            >
              {cinematic ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              {cinematic ? "Exit cinematic" : "Cinematic"}
            </Button>
          </div>
        </header>

        <div
          className={`grid gap-4 ${
            cinematic ? "flex-1 min-h-0 grid-cols-1 lg:grid-cols-5 px-4 md:px-6 pb-4 pt-3" : "lg:grid-cols-5"
          }`}
        >
          <div className={`lg:col-span-3 space-y-2 ${cinematic ? "min-h-0 flex flex-col" : ""}`}>
            <div
              className={`relative rounded-3xl border border-border/60 bg-black overflow-hidden shadow-arena ring-1 ring-primary/10 ${
                cinematic ? "flex-1 min-h-[200px]" : "aspect-video"
              }`}
            >
              {streamUrl ? (
                <Suspense
                  fallback={
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      Loading player…
                    </div>
                  }
                >
                  <ReactPlayer url={streamUrl} width="100%" height="100%" controls playing muted={false} config={{}} />
                </Suspense>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-3 p-8 text-center bg-gradient-to-br from-card via-background to-primary/5">
                  <div className="h-14 w-14 rounded-2xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-primary/70" />
                  </div>
                  <p className="text-sm font-medium">No stream URL on this match yet</p>
                  <p className="text-xs opacity-70 max-w-xs">
                    Organizers can set <code className="text-primary/80">stream_url</code> on the match or tournament.
                  </p>
                </div>
              )}
              {streamUrl && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/70 border border-red-500/40 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-wider text-red-400">
                  <Radio className="w-3 h-3 animate-pulse" /> On air
                </div>
              )}
            </div>
            {streams.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {streams.map((s, i) => (
                  <button
                    key={s.id || i}
                    type="button"
                    onClick={() => setStreamIndex(i)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-display font-bold uppercase tracking-wide border transition-colors ${
                      streamIndex === i
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "bg-secondary/50 text-muted-foreground border-transparent hover:text-foreground"
                    }`}
                  >
                    {s.label || `Stream ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`lg:col-span-2 flex flex-col gap-3 ${cinematic ? "min-h-0" : ""}`}>
            <div
              className={`rounded-3xl border border-primary/25 glass overflow-hidden flex flex-col shadow-arena-card ${
                cinematic ? "flex-1 min-h-0" : "min-h-[240px] max-h-[42vh]"
              }`}
            >
              <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between bg-primary/5">
                <span className="text-xs font-display font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> Event log
                </span>
                <span className="text-[10px] text-muted-foreground">Kill-feed style</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-thin">
                {feed.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8 text-xs">No events yet.</p>
                ) : (
                  feed.map((item, i) => (
                    <div
                      key={`${item._t}-${i}`}
                      className={`rounded-xl border border-border/40 border-l-4 px-3 py-2 hover:border-primary/25 transition-colors ${feedTypeClass(item.type)}`}
                    >
                      <div className="flex justify-between gap-2 text-[10px] text-muted-foreground font-mono">
                        <span className="uppercase tracking-wide text-primary/80">{item.type || "evt"}</span>
                        <span>{formatTime(item._t)}</span>
                      </div>
                      <p className="text-foreground font-semibold text-sm mt-0.5">
                        {item.headline || item.message || "Update"}
                      </p>
                      {item.body ? (
                        <p className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">{item.body}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-border/50 glass flex flex-col min-h-[140px] max-h-[28vh] shadow-arena-card">
              <div className="px-4 py-2.5 border-b border-border/50 text-xs font-display font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-primary" /> Match lobby chat
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5 text-xs scrollbar-thin">
                {chatLines.length === 0 ? (
                  <p className="text-muted-foreground text-center py-6">No messages yet · same room as match lobby</p>
                ) : (
                  chatLines.map((c, i) => (
                    <div key={i} className="text-muted-foreground leading-relaxed">
                      <span className="text-primary font-semibold">{c.who}:</span> {c.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
