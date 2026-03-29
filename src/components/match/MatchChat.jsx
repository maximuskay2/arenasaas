import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function MatchChat({ matchId, tenantId }) {
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const bottomRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    maxikay.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: messages = [] } = useQuery({
    queryKey: ["chat", matchId],
    queryFn: () => maxikay.entities.ChatMessage.filter({ match_id: matchId }, "created_date", 100),
    refetchInterval: 5000,
  });

  // Real-time subscription
  useEffect(() => {
    const unsub = maxikay.entities.ChatMessage.subscribe((event) => {
      if (event.data?.match_id === matchId) {
        queryClient.invalidateQueries({ queryKey: ["chat", matchId] });
      }
    });
    return unsub;
  }, [matchId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: (msg) => maxikay.entities.ChatMessage.create({
      match_id: matchId,
      message: msg,
      sender_email: user?.email || "anonymous",
      sender_name: user?.full_name || user?.email?.split("@")[0] || "Anonymous",
      role: "player",
      ...(tenantId ? { tenant_id: tenantId } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", matchId] });
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    sendMutation.mutate(message.trim());
    setMessage("");
  };

  const roleColors = {
    referee: "text-accent",
    organizer: "text-primary",
    player: "text-foreground",
    spectator: "text-muted-foreground",
  };

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h3 className="font-display text-sm font-semibold tracking-wider uppercase text-muted-foreground">Match Chat</h3>
        <span className="text-xs text-muted-foreground ml-auto">{messages.length} messages</span>
      </div>

      <div className="h-64 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">No messages yet. Be the first!</div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2"
            >
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-muted-foreground">
                  {(msg.sender_name || "?")[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-semibold ${roleColors[msg.role] || "text-foreground"}`}>
                  {msg.sender_name || msg.sender_email}
                  {msg.role !== "player" && (
                    <span className="ml-1 text-[10px] bg-secondary px-1.5 py-0.5 rounded uppercase">{msg.role}</span>
                  )}
                </span>
                <p className="text-xs text-foreground/90 mt-0.5 break-words">{msg.message}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-border/50">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="bg-secondary/50 text-sm h-8"
            maxLength={500}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className="h-8 w-8 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}