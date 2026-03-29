import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Zap, Pin, Heart, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";
import { motion } from "framer-motion";

export default function MatchHighlightsFeed({ tournamentId, matchId, isOrganizer }) {
  const queryClient = useQueryClient();
  const [pollingActive, setPollingActive] = useState(true);

  const { data: highlights = [] } = useQuery({
    queryKey: ["match-highlights", matchId],
    queryFn: () => maxikay.entities.MatchHighlight.filter({ match_id: matchId }, "-created_date", 100),
    refetchInterval: pollingActive ? 10000 : false,
  });

  // Simulate Game API polling (in production, this would fetch from actual game API)
  useEffect(() => {
    if (!pollingActive || !matchId) return;
    const pollGameAPI = async () => {
      // Placeholder: would call actual Game API integration here
      // For now, highlights are created manually via clip pinning
    };
    const interval = setInterval(pollGameAPI, 10000);
    return () => clearInterval(interval);
  }, [pollingActive, matchId]);

  const pinClip = useMutation({
    mutationFn: async (highlightId) => {
      await maxikay.entities.MatchHighlight.update(highlightId, { is_pinned: true, pinned_by: await maxikay.auth.me().then((u) => u.email) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-highlights", matchId] });
      toast.success("Clipped to feed!");
    },
  });

  const toggleLike = useMutation({
    mutationFn: async (highlightId) => {
      const h = highlights.find((x) => x.id === highlightId);
      await maxikay.entities.MatchHighlight.update(highlightId, { likes: (h.likes || 0) + 1 });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["match-highlights", matchId] }),
  });

  const pinnedHighlights = highlights.filter((h) => h.is_pinned);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" /> Live Highlights
        </h3>
        {isOrganizer && (
          <button
            onClick={() => setPollingActive(!pollingActive)}
            className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            {pollingActive ? "⏸ Polling" : "▶ Resume"}
          </button>
        )}
      </div>

      {pinnedHighlights.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <Zap className="w-6 h-6 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No highlights yet. Game moments will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pinnedHighlights.map((h, i) => (
            <motion.div key={h.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="glass rounded-xl overflow-hidden">
              {h.clip_url && (
                <div className="relative w-full bg-secondary/50 aspect-video flex items-center justify-center">
                  <img src={h.clip_url} alt={h.title} className="w-full h-full object-cover" />
                  <button className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors">
                    <Play className="w-6 h-6 text-white" />
                  </button>
                </div>
              )}
              <div className="p-3 space-y-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">{h.title}</p>
                  {h.player_name && <p className="text-[10px] text-primary">{h.player_name}</p>}
                </div>
                <p className="text-[10px] text-muted-foreground">{moment(h.created_date).fromNow()}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleLike.mutate(h.id)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-accent transition-colors">
                    <Heart className="w-3 h-3" /> {h.likes || 0}
                  </button>
                  {isOrganizer && !h.is_pinned && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[10px] h-5 gap-1 ml-auto"
                      onClick={() => pinClip.mutate(h.id)}
                      disabled={pinClip.isPending}
                    >
                      <Pin className="w-3 h-3" /> Pin
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}