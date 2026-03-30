import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Image, Video, Send, Pin, Trophy, Zap, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import FeedComments from "./FeedComments";
import { toast } from "sonner";
import moment from "moment";

const ROLE_COLORS = {
  organizer: "text-primary border-primary/30 bg-primary/10",
  player: "text-green-400 border-green-500/30 bg-green-500/10",
  spectator: "text-muted-foreground border-border/30 bg-secondary/50",
};

const ROLE_ICONS = { organizer: Trophy, player: Zap, spectator: MessageSquare };

const REACTIONS = [
  { emoji: "❤️", key: "likes" },
  { emoji: "🔥", key: "fire" },
  { emoji: "👏", key: "claps" },
  { emoji: "🎉", key: "party" },
];

function FeedCard({ post, onReact, onPin, isAdmin, tournamentId }) {
  const Icon = ROLE_ICONS[post.role] || MessageSquare;
  const [showComments, setShowComments] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass rounded-xl p-4 space-y-3 border ${post.pinned ? "border-primary/40 glow-border-primary" : "border-border/30"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Icon className={`w-3.5 h-3.5 ${post.role === "organizer" ? "text-primary" : post.role === "player" ? "text-green-400" : "text-muted-foreground"}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{post.author_name || post.author_email?.split("@")[0]}</p>
            <p className="text-[11px] text-muted-foreground">{moment(post.created_date).fromNow()}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {post.pinned && <span className="text-[10px] text-primary font-semibold uppercase tracking-wider">📌 Pinned</span>}
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider ${ROLE_COLORS[post.role] || ROLE_COLORS.spectator}`}>
            {post.role}
          </span>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>

      {/* Media */}
      {post.media_url && (
        <div className="rounded-xl overflow-hidden border border-border/30">
          {post.media_type === "image" ? (
            <img src={post.media_url} alt="Post media" className="w-full max-h-64 object-cover" />
          ) : (
            <video src={post.media_url} controls className="w-full max-h-64" />
          )}
        </div>
      )}

      {/* Reactions */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        {REACTIONS.map((r) => (
          <button
            key={r.key}
            onClick={() => onReact(post, r.key)}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary/60 hover:bg-secondary border border-border/30 hover:border-primary/30 transition-all"
          >
            <span>{r.emoji}</span>
            <span className="text-muted-foreground">{post[r.key] || 0}</span>
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => onPin(post)}
            className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border transition-all ${post.pinned ? "text-primary border-primary/30 bg-primary/10" : "text-muted-foreground border-border/30 hover:border-primary/30"}`}
          >
            <Pin className="w-3 h-3" />
            {post.pinned ? "Unpin" : "Pin"}
          </button>
        )}
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Comments
          {showComments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Comments */}
      {showComments && <FeedComments postId={post.id} tournamentId={tournamentId} />}
    </motion.div>
  );
}

export default function TournamentFeed({ tournamentId, tenantId, isAdmin, currentUser }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [role, setRole] = useState(isAdmin ? "organizer" : "player");
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["feed-posts", tournamentId],
    queryFn: () => maxikay.entities.FeedPost.filter({ tournament_id: tournamentId }, "-created_date", 50),
    refetchInterval: 8000,
  });

  useEffect(() => {
    const unsub = maxikay.entities.FeedPost.subscribe((event) => {
      if (event.data?.tournament_id === tournamentId) {
        queryClient.invalidateQueries({ queryKey: ["feed-posts", tournamentId] });
      }
    });
    return unsub;
  }, [tournamentId, queryClient]);

  // Pinned posts first, then rest by date
  const sorted = [...posts].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.created_date) - new Date(a.created_date);
  });

  const createPost = useMutation({
    mutationFn: () =>
      maxikay.entities.FeedPost.create({
        tournament_id: tournamentId,
        tenant_id: tenantId,
        author_email: currentUser?.email || "anonymous",
        author_name: currentUser?.full_name || currentUser?.email?.split("@")[0] || "Anonymous",
        role,
        content: content.trim(),
        ...(mediaUrl ? { media_url: mediaUrl, media_type: mediaType } : {}),
        likes: 0,
        pinned: false,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts", tournamentId] });
      setContent(""); setMediaUrl(""); setShowMediaInput(false);
    },
    onError: () => toast.error("Failed to post"),
  });

  const reactPost = useMutation({
    mutationFn: ({ post, key }) => maxikay.entities.FeedPost.update(post.id, { [key]: (post[key] || 0) + 1 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed-posts", tournamentId] }),
  });

  const pinPost = useMutation({
    mutationFn: (post) => maxikay.entities.FeedPost.update(post.id, { pinned: !post.pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed-posts", tournamentId] }),
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await maxikay.integrations.Core.UploadFile({ file });
    setMediaUrl(file_url);
    setMediaType(file.type.startsWith("video") ? "video" : "image");
    setShowMediaInput(false);
    setUploading(false);
    toast.success("Media uploaded!");
  };

  return (
    <div className="space-y-4">
      {/* Compose */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Post an Update</p>
          {isAdmin && (
            <div className="flex gap-1">
              {["organizer", "player", "spectator"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider transition-colors ${role === r ? ROLE_COLORS[r] : "text-muted-foreground border-border/30"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share a highlight, update, or match moment..."
          className="bg-secondary/50 resize-none text-sm"
          rows={3}
        />

        {mediaUrl && (
          <div className="flex items-center gap-2 text-xs text-primary">
            <Image className="w-3.5 h-3.5" /> Media attached
            <button onClick={() => setMediaUrl("")} className="text-destructive hover:underline ml-1">Remove</button>
          </div>
        )}

        {showMediaInput && (
          <Input
            placeholder="Paste image/video URL..."
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            className="bg-secondary/50 text-xs"
          />
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMediaInput(!showMediaInput)}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Add media URL"
          >
            <Image className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Upload file"
          >
            <Video className="w-4 h-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
          <Button
            size="sm"
            className="ml-auto gap-1.5 text-xs font-display tracking-wider"
            disabled={!content.trim() || createPost.isPending || uploading}
            onClick={() => createPost.mutate()}
          >
            <Send className="w-3.5 h-3.5" />
            {createPost.isPending ? "Posting..." : uploading ? "Uploading..." : "Post"}
          </Button>
        </div>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading feed...</div>
      ) : sorted.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center space-y-2">
          <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No posts yet. Be the first to share an update!</p>
        </div>
      ) : (
        <AnimatePresence>
          <div className="space-y-3">
            {sorted.map((post) => (
              <FeedCard
                key={post.id}
                post={post}
                isAdmin={isAdmin}
                tournamentId={tournamentId}
                onReact={(p, k) => reactPost.mutate({ post: p, key: k })}
                onPin={(p) => pinPost.mutate(p)}
              />
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}