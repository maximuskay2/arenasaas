import { useState, useEffect, useRef } from "react";
import { maxikay } from "@/api/maxikayClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tv, Youtube, Send, Settings, Eye, Radio, Square } from "lucide-react";
import moment from "moment";

// Parse a Twitch channel or YouTube video/channel from a URL or raw value
function parseStream(url) {
  if (!url) return null;
  const twitchMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  if (twitchMatch) return { type: "twitch", channel: twitchMatch[1] };
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return { type: "youtube", videoId: ytMatch[1] };
  const ytChannel = url.match(/youtube\.com\/(?:channel\/|@)([a-zA-Z0-9_-]+)/);
  if (ytChannel) return { type: "youtube_channel", channel: ytChannel[1] };
  // Raw channel name for Twitch
  if (/^[a-zA-Z0-9_]+$/.test(url.trim())) return { type: "twitch", channel: url.trim() };
  return null;
}

function StreamEmbed({ streamUrl }) {
  const parsed = parseStream(streamUrl);
  const hostname = window.location.hostname;

  if (!parsed) return (
    <div className="flex items-center justify-center h-64 bg-secondary/30 rounded-xl text-muted-foreground text-sm">
      Invalid stream URL
    </div>
  );

  if (parsed.type === "twitch") {
    return (
      <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
        <iframe
          src={`https://player.twitch.tv/?channel=${parsed.channel}&parent=${hostname}`}
          className="absolute inset-0 w-full h-full rounded-xl"
          allowFullScreen
          title="Twitch Stream"
        />
      </div>
    );
  }

  if (parsed.type === "youtube") {
    return (
      <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
        <iframe
          src={`https://www.youtube.com/embed/${parsed.videoId}?autoplay=0`}
          className="absolute inset-0 w-full h-full rounded-xl"
          allowFullScreen
          title="YouTube Stream"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-64 bg-secondary/30 rounded-xl text-muted-foreground text-sm">
      Unsupported stream format
    </div>
  );
}

function SpectatorChat({ tournamentId }) {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    maxikay.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: messages = [] } = useQuery({
    queryKey: ["spectator-chat", tournamentId],
    queryFn: () => maxikay.entities.ChatMessage.filter(
      { match_id: `tournament_${tournamentId}` },
      "created_date",
      100
    ),
    refetchInterval: 5000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMsg = useMutation({
    mutationFn: () => maxikay.entities.ChatMessage.create({
      match_id: `tournament_${tournamentId}`,
      tenant_id: tenantId,
      sender_email: user?.email || "spectator",
      sender_name: user?.full_name || "Spectator",
      message: message.trim(),
      role: "spectator",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spectator-chat", tournamentId] });
      setMessage("");
    },
  });

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (message.trim()) sendMsg.mutate(); }
  };

  return (
    <div className="glass rounded-xl flex flex-col h-[460px]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <Eye className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-display uppercase tracking-wider text-muted-foreground">Live Chat</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{messages.length} messages</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">No messages yet. Be the first to cheer!</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="text-xs">
            <span className={`font-semibold mr-1 ${msg.role === "organizer" ? "text-primary" : msg.role === "referee" ? "text-yellow-400" : "text-foreground"}`}>
              {msg.sender_name || msg.sender_email?.split("@")[0]}
              {msg.role === "organizer" && " 🛡️"}
            </span>
            <span className="text-muted-foreground">{msg.message}</span>
            <span className="text-[10px] text-muted-foreground/50 ml-1">{moment(msg.created_date).format("HH:mm")}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-border/50 flex gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKey}
          placeholder={user ? "Say something…" : "Log in to chat"}
          disabled={!user}
          className="bg-secondary/50 text-xs h-8"
        />
        <Button
          size="sm"
          onClick={() => sendMsg.mutate()}
          disabled={!message.trim() || sendMsg.isPending || !user}
          className="h-8 w-8 p-0"
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function LiveStreamTab({ tournamentId, tournament, isOrganizer }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState(tournament?.stream_url || "");

  const [isLive, setIsLive] = useState(!!tournament?.stream_url);

  const goLive = useMutation({
    mutationFn: async (url) => {
      await maxikay.entities.Tournament.update(tournamentId, { stream_url: url });
    },
    onSuccess: (_, url) => {
      queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setIsLive(true);
      setEditing(false);
    },
  });

  const endStream = useMutation({
    mutationFn: () => maxikay.entities.Tournament.update(tournamentId, { stream_url: "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setIsLive(false);
    },
  });

  const saveStream = useMutation({
    mutationFn: () => maxikay.entities.Tournament.update(tournamentId, { stream_url: draftUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setEditing(false);
    },
  });

  const streamUrl = tournament?.stream_url;
  const parsed = parseStream(streamUrl);

  return (
    <div className="space-y-4">
      {/* Stream URL editor (organizers only) */}
      {isOrganizer && (
        <div className="glass rounded-xl p-4 space-y-3">
          {/* Go Live / End Stream CTA */}
          {!streamUrl ? (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  className="bg-secondary/50 text-xs"
                  placeholder="Twitch: twitch.tv/channel — YouTube: youtube.com/watch?v=…"
                />
              </div>
              <Button
                onClick={() => goLive.mutate(draftUrl)}
                disabled={!draftUrl.trim() || goLive.isPending}
                className="gap-2 font-display text-xs tracking-wider bg-red-600 hover:bg-red-700 text-white"
              >
                <Radio className="w-3.5 h-3.5 animate-pulse" /> {goLive.isPending ? "Going Live…" : "GO LIVE"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/30">
                  <Radio className="w-3 h-3 text-red-400 animate-pulse" />
                  <span className="text-xs font-semibold text-red-400">LIVE</span>
                </span>
                {parsed?.type === "twitch" && <span className="text-xs text-muted-foreground"><Tv className="w-3 h-3 inline text-purple-400 mr-1" />{parsed.channel}</span>}
                {parsed?.type?.startsWith("youtube") && <span className="text-xs text-muted-foreground"><Youtube className="w-3 h-3 inline text-red-400 mr-1" />YouTube Live</span>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={() => { setDraftUrl(streamUrl || ""); setEditing(true); }}>
                  <Settings className="w-3.5 h-3.5" /> Change URL
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1 text-destructive border-destructive/30" onClick={() => endStream.mutate()}>
                  <Square className="w-3 h-3" /> End Stream
                </Button>
              </div>
            </div>
          )}
          {editing && streamUrl && (
            <div className="flex gap-2">
              <Input value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)} className="bg-secondary/50 text-xs" />
              <Button size="sm" onClick={() => saveStream.mutate()} disabled={saveStream.isPending} className="text-xs font-display">Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          )}
        </div>
      )}

      {/* Stream + Chat layout */}
      {streamUrl ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <StreamEmbed streamUrl={streamUrl} />
          </div>
          <SpectatorChat tournamentId={tournamentId} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center py-16 glass rounded-xl gap-3 text-muted-foreground">
            <Tv className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">No stream configured yet</p>
            {isOrganizer && <p className="text-xs">Use the panel above to add a Twitch or YouTube stream URL.</p>}
          </div>
          <SpectatorChat tournamentId={tournamentId} />
        </div>
      )}
    </div>
  );
}