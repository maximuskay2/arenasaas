import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import moment from "moment";
import {
  MessageSquare,
  Megaphone,
  Plus,
  Heart,
  MoreVertical,
  ShieldCheck,
  Trash2,
  Pin,
  UserX,
  Send,
  Loader2,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { maxikay } from "@/api/maxikayClient";
import { useAuth } from "@/lib/AuthContext";
import { useTenant } from "@/hooks/useTenant";
import {
  joinCommunityFeedRooms,
  leaveCommunityFeedRooms,
  subscribeCommunityFeed,
} from "@/lib/realtimeClient";
import { extractMatchIdFromMatchResultsMediaUrl } from "@/lib/matchResultsMediaUrl";
import PageHeader from "@/components/shared/PageHeader";
import PublicSiteHeader from "@/components/layout/PublicSiteHeader";

function FeedLink({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
        active
          ? "bg-primary font-black italic text-primary-foreground shadow-lg shadow-primary/20"
          : "font-bold text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-[10px] uppercase tracking-widest">{label}</span>
    </button>
  );
}

function TrendItem({ label, count }) {
  return (
    <div className="group cursor-pointer">
      <p className="text-[11px] font-black uppercase italic tracking-tighter transition-colors group-hover:text-primary">
        {label}
      </p>
      <p className="text-[9px] font-bold uppercase text-muted-foreground">{count}</p>
    </div>
  );
}

function MediaEmbed({ url }) {
  const u = typeof url === "string" ? url.trim() : "";
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i);

  // Strict production format only (MinIO/S3 URL template) to avoid false positives.
  const matchId = extractMatchIdFromMatchResultsMediaUrl(u);

  const { data: match, isLoading: matchLoading } = useQuery({
    queryKey: ["match-embed", matchId],
    enabled: !!matchId,
    queryFn: async () => {
      const rows = await maxikay.entities.Match.filter({ id: matchId });
      return rows?.[0] || null;
    },
  });

  if (!u) return null;
  if (yt) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border/50 bg-black/40">
        <iframe
          title="YouTube embed"
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${yt[1]}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  const twitchClip =
    u.match(/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/i) || u.match(/twitch\.tv\/\w+\/clip\/([A-Za-z0-9_-]+)/i);
  if (twitchClip) {
    const parent =
      typeof window !== "undefined" ? encodeURIComponent(window.location.hostname) : "localhost";
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border/50 bg-black/40">
        <iframe
          title="Twitch clip"
          className="h-full w-full"
          src={`https://clips.twitch.tv/embed?clip=${twitchClip[1]}&parent=${parent}`}
          allowFullScreen
        />
      </div>
    );
  }

  if (matchId) {
    if (matchLoading) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border/50 bg-black/30 p-4">
          <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">Loading match…</div>
        </div>
      );
    }
    if (match) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border/50 bg-black/30 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Match results</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{(match.status || "match").replace(/_/g, " ")}</span>
          </div>
          <div className="flex-1 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{match.team_a_name || "Team A"}</p>
              <p className="text-3xl font-black italic text-primary tabular-nums">{match.score_a ?? 0}</p>
            </div>
            <div className="text-muted-foreground font-black text-sm">VS</div>
            <div className="min-w-0 text-right">
              <p className="text-xs text-muted-foreground truncate">{match.team_b_name || "Team B"}</p>
              <p className="text-3xl font-black italic text-primary tabular-nums">{match.score_b ?? 0}</p>
            </div>
          </div>
          <a
            href={`/matches/${match.id}`}
            className="text-[10px] font-black uppercase tracking-wider text-primary hover:underline"
          >
            Open match
          </a>
        </div>
      );
    }
  }
  return (
    <a
      href={u}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-bold text-primary hover:underline"
    >
      {u}
    </a>
  );
}

function useFeedPermissions(scope, tenantId, user) {
  return useMemo(() => {
    const platform = user?.role === "admin" || user?.role === "super_admin";
    const memberships = Array.isArray(user?.tenant_memberships) ? user.tenant_memberships : [];
    const inTenant = tenantId
      ? memberships.filter((m) => String(m.tenant_id) === String(tenantId))
      : [];
    const tenantStaff = inTenant.some((m) =>
      ["organizer", "admin", "staff"].includes(m.role_in_tenant)
    );
    const canModTenant = platform || tenantStaff;
    const canAnnounce = platform || tenantStaff;
    const canShadowbanGlobal = platform;
    const canShadowbanTenant = canModTenant && tenantId;
    return {
      canAnnounce,
      canModTenant,
      canShadowbanGlobal,
      canShadowbanTenant,
      isPlatform: platform,
    };
  }, [scope, tenantId, user]);
}

export default function CommunityHub() {
  const { user, isAuthenticated, isLoadingAuth, navigateToLogin } = useAuth();
  const { tenantId, tenantConfig } = useTenant();
  const queryClient = useQueryClient();

  const [feedScope, setFeedScope] = useState(() => (tenantId ? "tenant" : "global"));
  const [category, setCategory] = useState("all");
  const [composerTitle, setComposerTitle] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerMedia, setComposerMedia] = useState("");
  const [composerType, setComposerType] = useState("strategy");
  const [expandedPost, setExpandedPost] = useState(null);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [shadowUserId, setShadowUserId] = useState("");
  const [shadowScope, setShadowScope] = useState("tenant");

  const effectiveTenant = feedScope === "tenant" ? tenantId : null;
  const perms = useFeedPermissions(feedScope, effectiveTenant, user);

  useEffect(() => {
    if (!perms.canAnnounce && composerType === "announcement") {
      setComposerType("strategy");
    }
  }, [perms.canAnnounce, composerType]);

  const readOnly = !isAuthenticated;

  useEffect(() => {
    if (feedScope === "tenant" && !tenantId) {
      setFeedScope("global");
    }
  }, [feedScope, tenantId]);

  const listParams = useMemo(() => {
    const p = { scope: feedScope, limit: 30, page: 1 };
    if (feedScope === "tenant" && tenantId) p.tenant_id = tenantId;
    if (category !== "all") p.post_type = category;
    return p;
  }, [feedScope, tenantId, category]);

  const { data, isLoading } = useQuery({
    queryKey: ["community-posts", listParams],
    queryFn: () =>
      readOnly ? maxikay.public.communityPosts(listParams) : maxikay.community.listPosts(listParams),
    enabled: feedScope === "global" || !!tenantId,
    staleTime: 10_000,
  });

  const items = data?.items ?? [];

  const invalidateFeed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["community-posts"] });
    queryClient.invalidateQueries({ queryKey: ["community-comments"] });
  }, [queryClient]);

  useEffect(() => {
    const isGlobal = feedScope === "global";
    joinCommunityFeedRooms({
      global: isGlobal,
      tenantId: !isGlobal ? tenantId || undefined : undefined,
    });
    const off = subscribeCommunityFeed((payload, meta) => {
      // Keep realtime updates deterministic: invalidate only the affected query keys.
      if (meta.event === "community:comment" || meta.event === "community:comment-removed") {
        const pid = payload?.post_id || payload?.comment?.post_id;
        if (pid) queryClient.invalidateQueries({ queryKey: ["community-comments", pid] });
        invalidateFeed(); // comment_count lives on the post row
        return;
      }

      if (
        meta.event === "community:post" ||
        meta.event === "community:post-updated" ||
        meta.event === "community:post-removed" ||
        meta.event === "community:like"
      ) {
        invalidateFeed();
        return;
      }

      // Fallback for any unknown event name.
      invalidateFeed();
    });
    return () => {
      off();
      leaveCommunityFeedRooms({
        global: isGlobal,
        tenantId: !isGlobal ? tenantId || undefined : undefined,
      });
    };
  }, [feedScope, tenantId, invalidateFeed, queryClient]);

  const createPostMut = useMutation({
    mutationFn: () =>
      maxikay.community.createPost(
        {
          title: composerTitle.trim(),
          content: composerBody.trim(),
          post_type: composerType,
          media_url: composerMedia.trim() || undefined,
          scope: feedScope,
          tenant_id: feedScope === "tenant" ? tenantId : undefined,
        },
        feedScope === "tenant" && tenantId ? { headers: { "X-Tenant-ID": tenantId } } : {}
      ),
    onSuccess: () => {
      setComposerTitle("");
      setComposerBody("");
      setComposerMedia("");
      invalidateFeed();
    },
  });

  const likeMut = useMutation({
    mutationFn: async ({ id, liked }) =>
      liked ? maxikay.community.unlikePost(id) : maxikay.community.likePost(id),
    onMutate: async ({ id, liked }) => {
      await queryClient.cancelQueries({ queryKey: ["community-posts"] });
      const prev = queryClient.getQueryData(["community-posts", listParams]);
      if (prev?.items) {
        queryClient.setQueryData(["community-posts", listParams], {
          ...prev,
          items: prev.items.map((p) =>
            p.id === id
              ? {
                  ...p,
                  liked_by_me: !liked,
                  like_count: Math.max(0, (p.like_count || 0) + (liked ? -1 : 1)),
                }
              : p
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["community-posts", listParams], ctx.prev);
    },
    onSettled: () => invalidateFeed(),
  });

  if (isLoadingAuth) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const orgLabel = tenantConfig?.tenant_name || "Your org";

  return (
    <div className="min-h-screen bg-background">
      {readOnly ? <PublicSiteHeader /> : null}
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <PageHeader
          title="Community"
          subtitle="War room — announcements, strategy, and recruitment"
        />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 p-6 font-sans selection:bg-primary/30 lg:grid-cols-4">
        <aside className="hidden space-y-6 lg:block">
          <div className="space-y-4 rounded-3xl border border-border/50 bg-card/40 p-6 backdrop-blur-sm">
            <h3 className="text-[10px] font-black uppercase italic tracking-[0.2em] text-muted-foreground">
              Command center
            </h3>
            <nav className="flex flex-col gap-2">
              <FeedLink
                icon={Megaphone}
                label="Platform feed"
                active={feedScope === "global"}
                onClick={() => setFeedScope("global")}
              />
              {tenantId ? (
                <FeedLink
                  icon={MessageSquare}
                  label={`${orgLabel}`}
                  active={feedScope === "tenant"}
                  onClick={() => setFeedScope("tenant")}
                />
              ) : null}
            </nav>
            <div className="border-t border-border/40 pt-4">
              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                Filter
              </p>
              <FeedLink
                icon={LayoutGrid}
                label="All types"
                active={category === "all"}
                onClick={() => setCategory("all")}
              />
              <FeedLink
                icon={Megaphone}
                label="Announcements"
                active={category === "announcement"}
                onClick={() => setCategory("announcement")}
              />
              <FeedLink
                icon={MessageSquare}
                label="Strategy"
                active={category === "strategy"}
                onClick={() => setCategory("strategy")}
              />
              <FeedLink
                icon={Plus}
                label="Recruitment"
                active={category === "recruitment"}
                onClick={() => setCategory("recruitment")}
              />
            </div>
          </div>
        </aside>

        <section className="space-y-6 lg:col-span-2">
          <div className="space-y-4 rounded-[2rem] border border-primary/20 bg-card/30 p-6 backdrop-blur-xl">
            <div className="flex gap-4">
              <div className="h-10 w-10 shrink-0 rounded-full border border-border/50 bg-muted" />
              <div className="min-w-0 flex-1 space-y-3">
                {readOnly ? (
                  <p className="text-xs text-muted-foreground">
                    Viewing as guest. <button type="button" className="text-primary font-bold hover:underline" onClick={navigateToLogin}>Log in</button>{" "}
                    to post, comment, like, or moderate.
                  </p>
                ) : null}
                {!readOnly && perms.canAnnounce ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={composerType === "announcement" ? "default" : "outline"}
                      className="text-[10px] font-black uppercase"
                      onClick={() => setComposerType("announcement")}
                    >
                      Official
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={composerType === "strategy" ? "default" : "outline"}
                      className="text-[10px] font-black uppercase"
                      onClick={() => setComposerType("strategy")}
                    >
                      Strategy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={composerType === "recruitment" ? "default" : "outline"}
                      className="text-[10px] font-black uppercase"
                      onClick={() => setComposerType("recruitment")}
                    >
                      LFT / LFP
                    </Button>
                  </div>
                ) : null}
                <Input
                  placeholder="Title (optional)"
                  value={composerTitle}
                  onChange={(e) => setComposerTitle(e.target.value)}
                  className="border-border/50 bg-background/50"
                  disabled={readOnly}
                />
                <Textarea
                  placeholder="Share a strategy, clip, or recruitment pitch…"
                  value={composerBody}
                  onChange={(e) => setComposerBody(e.target.value)}
                  className="min-h-[100px] resize-none border-0 bg-transparent text-sm font-medium focus-visible:ring-0"
                  disabled={readOnly}
                />
                <Input
                  placeholder="Media URL (YouTube, Twitch clip, or link)"
                  value={composerMedia}
                  onChange={(e) => setComposerMedia(e.target.value)}
                  className="border-border/50 bg-background/50 text-xs"
                  disabled={readOnly}
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border/40 pt-4">
              <span className="text-[10px] font-black uppercase italic text-muted-foreground">
                Posting to {feedScope === "global" ? "platform" : orgLabel} ·{" "}
                {perms.canAnnounce && composerType === "announcement" ? "staff" : "community"}
              </span>
              <Button
                size="sm"
                disabled={
                  readOnly ||
                  createPostMut.isPending ||
                  (!composerBody.trim() && !composerTitle.trim())
                }
                className="rounded-xl px-6 font-black uppercase italic"
                onClick={() => createPostMut.mutate()}
              >
                {createPostMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Transmit"}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-[2.5rem] bg-muted/30" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {items.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    user={user}
                    perms={perms}
                    feedScope={feedScope}
                    tenantId={tenantId}
                    readOnly={readOnly}
                    expanded={expandedPost === post.id}
                    onToggleExpand={() => setExpandedPost((x) => (x === post.id ? null : post.id))}
                    onInvalidate={invalidateFeed}
                    onLike={() => {
                      if (readOnly) return;
                      likeMut.mutate({ id: post.id, liked: !!post.liked_by_me });
                    }}
                    onOpenShadowban={() => {
                      setShadowUserId(String(post.author_id || ""));
                      setShadowScope(feedScope === "global" ? "global" : "tenant");
                      setShadowOpen(true);
                    }}
                  />
                ))}
              </AnimatePresence>
              {!items.length ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No posts yet. Open the mic.
                </p>
              ) : null}
            </div>
          )}
        </section>

        <aside className="hidden space-y-6 lg:block">
          <div className="space-y-4 rounded-3xl border border-border/50 bg-card/40 p-6">
            <h3 className="text-[10px] font-black uppercase italic tracking-[0.2em] text-primary">
              Live trends
            </h3>
            <div className="space-y-3">
              <TrendItem label="#TournamentMeta" count="Arena feed" />
              <TrendItem label="#LookingForTeam" count="Recruitment tab" />
              <TrendItem label="#ClipReview" count="Drop Twitch / YT links" />
            </div>
            {(perms.canShadowbanGlobal || perms.canShadowbanTenant) && (
              <Button
                variant="outline"
                size="sm"
                className="w-full font-black uppercase"
                onClick={() => {
                  setShadowUserId("");
                  setShadowScope(feedScope === "global" ? "global" : "tenant");
                  setShadowOpen(true);
                }}
              >
                <UserX className="mr-2 h-4 w-4" />
                Shadowban user
              </Button>
            )}
          </div>
        </aside>
      </div>

      <ShadowbanDialog
        open={shadowOpen}
        onOpenChange={setShadowOpen}
        userId={shadowUserId}
        onUserId={setShadowUserId}
        scope={shadowScope}
        onScope={setShadowScope}
        tenantId={tenantId}
        canGlobal={perms.canShadowbanGlobal}
        onDone={invalidateFeed}
      />
    </div>
  );
}

function PostCard({
  post,
  user,
  perms,
  feedScope,
  tenantId,
  readOnly,
  expanded,
  onToggleExpand,
  onInvalidate,
  onLike,
  onOpenShadowban,
}) {
  const queryClient = useQueryClient();
  const author =
    post.author_full_name?.trim() || post.author_email?.split("@")[0] || "Player";
  const isAuthor = String(post.author_id) === String(user?.id);
  const canMod =
    isAuthor ||
    perms.isPlatform ||
    (feedScope === "tenant" && tenantId && perms.canModTenant);

  const { data: commentsData } = useQuery({
    queryKey: ["community-comments", post.id],
    queryFn: () =>
      readOnly ? maxikay.public.communityComments(post.id) : maxikay.community.listComments(post.id),
    enabled: expanded,
  });
  const comments = commentsData?.items ?? [];

  const [reply, setReply] = useState("");

  const commentMut = useMutation({
    mutationFn: () => maxikay.community.createComment(post.id, { body: reply.trim() }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["community-comments", post.id] });
      onInvalidate();
    },
  });

  const deletePostMut = useMutation({
    mutationFn: () => maxikay.community.deletePost(post.id),
    onSuccess: onInvalidate,
  });

  const pinMut = useMutation({
    mutationFn: (pinned) => maxikay.community.pinPost(post.id, pinned),
    onSuccess: onInvalidate,
  });

  const deleteCommentMut = useMutation({
    mutationFn: (id) => maxikay.community.deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-comments", post.id] });
      onInvalidate();
    },
  });

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-[2.5rem] border border-border/50 bg-card/20 p-6 transition-all hover:border-border"
    >
      <header className="mb-4 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-primary to-accent" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black uppercase italic tracking-tighter">{author}</span>
              {post.post_type === "announcement" ? (
                <Badge variant="outline" className="h-5 border-primary/30 bg-primary/10 text-[8px] italic text-primary">
                  Official
                </Badge>
              ) : null}
              {post.pinned ? (
                <Badge variant="secondary" className="h-5 text-[8px]">
                  Pinned
                </Badge>
              ) : null}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {moment(post.created_date).fromNow()} · {post.post_type?.replace(/_/g, " ")}
            </span>
          </div>
        </div>
        {canMod || perms.isPlatform || (feedScope === "tenant" && perms.canModTenant) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {perms.canAnnounce ? (
                <DropdownMenuItem onClick={() => pinMut.mutate(!post.pinned)}>
                  <Pin className="mr-2 h-4 w-4" />
                  {post.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
              ) : null}
              {(perms.isPlatform || (feedScope === "tenant" && perms.canModTenant)) && !isAuthor ? (
                <DropdownMenuItem onClick={onOpenShadowban}>
                  <UserX className="mr-2 h-4 w-4" />
                  Shadowban author
                </DropdownMenuItem>
              ) : null}
              {canMod ? (
                <DropdownMenuItem className="text-destructive" onClick={() => deletePostMut.mutate()}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete post
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      <div className="mb-4 space-y-3">
        {post.title ? (
          <h2 className="text-xl font-black uppercase italic tracking-tighter">{post.title}</h2>
        ) : null}
        <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-muted-foreground">
          {post.content}
        </p>
        <MediaEmbed url={post.media_url} />
      </div>

      <footer className="flex flex-wrap gap-4 border-t border-border/40 pt-4">
        <button
          type="button"
          className={`flex items-center gap-2 text-[10px] font-black uppercase italic transition-colors ${
            post.liked_by_me ? "text-primary" : "text-muted-foreground hover:text-primary"
          }`}
          onClick={onLike}
          disabled={readOnly}
        >
          <Heart className={`h-4 w-4 ${post.liked_by_me ? "fill-primary" : ""}`} />
          {post.like_count ?? 0} Likes
        </button>
        <button
          type="button"
          className="flex items-center gap-2 text-[10px] font-black uppercase italic text-muted-foreground transition-colors hover:text-foreground"
          onClick={onToggleExpand}
        >
          <MessageSquare className="h-4 w-4" />
          {post.comment_count ?? 0} Comments
        </button>
        {post.author_role === "admin" || post.author_role === "super_admin" ? (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-primary">
            <ShieldCheck className="h-3 w-3" /> Staff
          </span>
        ) : null}
      </footer>

      <AnimatePresence>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/30"
          >
            <div className="space-y-3 py-4">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-border/30 bg-background/40 px-3 py-2"
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      {c.author_full_name || c.author_email?.split("@")[0]} ·{" "}
                      {moment(c.created_date).fromNow()}
                    </p>
                    <p className="text-sm">{c.body}</p>
                  </div>
                  {String(c.user_id) === String(user?.id) ||
                  perms.isPlatform ||
                  (feedScope === "tenant" && perms.canModTenant) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 text-destructive"
                      onClick={() => deleteCommentMut.mutate(c.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Live reply…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  className="border-border/50"
                  disabled={readOnly}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!readOnly && reply.trim()) commentMut.mutate();
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={readOnly || !reply.trim() || commentMut.isPending}
                  onClick={() => commentMut.mutate()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

function ShadowbanDialog({
  open,
  onOpenChange,
  userId,
  onUserId,
  scope,
  onScope,
  tenantId,
  canGlobal,
  onDone,
}) {
  const effectiveScope = canGlobal ? scope : "tenant";
  const banMut = useMutation({
    mutationFn: () => {
      if (effectiveScope === "tenant" && !tenantId) {
        return Promise.reject(new Error("Select an organization to apply a tenant shadowban."));
      }
      return maxikay.community.shadowban({
        user_id: userId.trim(),
        scope: effectiveScope,
        tenant_id: effectiveScope === "tenant" ? tenantId : null,
      });
    },
    onSuccess: () => {
      onOpenChange(false);
      onDone();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Shadowban (feed visibility)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>User ID (UUID)</Label>
            <Input value={userId} onChange={(e) => onUserId(e.target.value)} placeholder="author uuid" />
          </div>
          {canGlobal ? (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={scope === "global" ? "default" : "outline"}
                onClick={() => onScope("global")}
              >
                Global
              </Button>
              <Button
                type="button"
                size="sm"
                variant={scope === "tenant" ? "default" : "outline"}
                onClick={() => onScope("tenant")}
                disabled={!tenantId}
              >
                This org
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Applies to this organization&apos;s feed only.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={
              !userId.trim() ||
              banMut.isPending ||
              (effectiveScope === "tenant" && !tenantId)
            }
            onClick={() => banMut.mutate()}
          >
            Apply shadowban
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
