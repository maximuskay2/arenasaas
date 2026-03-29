import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import moment from "moment";

const ROLE_COLORS = {
  organizer: "text-primary",
  player: "text-green-400",
  spectator: "text-muted-foreground",
};

export default function FeedComments({ postId, tournamentId }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => { maxikay.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const { data: comments = [] } = useQuery({
    queryKey: ["feed-comments", postId],
    queryFn: () => maxikay.entities.FeedComment.filter({ post_id: postId }, "created_date", 50),
    refetchInterval: 10000,
  });

  const createComment = useMutation({
    mutationFn: () => maxikay.entities.FeedComment.create({
      post_id: postId,
      tournament_id: tournamentId,
      author_email: currentUser?.email || "anonymous",
      author_name: currentUser?.full_name || currentUser?.email?.split("@")[0] || "Anonymous",
      content: text.trim(),
      role: "player",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-comments", postId] });
      setText("");
    },
  });

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim()) createComment.mutate(); }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border/30">
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2 text-xs">
          <span className={`font-semibold shrink-0 ${ROLE_COLORS[c.role] || ROLE_COLORS.spectator}`}>
            {c.author_name || c.author_email?.split("@")[0]}
          </span>
          <span className="text-foreground/80 flex-1">{c.content}</span>
          <span className="text-muted-foreground/50 shrink-0">{moment(c.created_date).fromNow(true)}</span>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={currentUser ? "Add a comment…" : "Log in to comment"}
          disabled={!currentUser}
          className="bg-secondary/50 text-xs h-7"
        />
        <Button size="sm" className="h-7 w-7 p-0" onClick={() => createComment.mutate()} disabled={!text.trim() || !currentUser || createComment.isPending}>
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}