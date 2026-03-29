import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Bell, Trophy, Swords, Flag, DollarSign, Mail, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import moment from "moment";
import { motion, AnimatePresence } from "framer-motion";

const TYPE_CONFIG = {
  tournament_started: { icon: Trophy, color: "text-yellow-400", bg: "bg-yellow-400/10" },
  match_scheduled: { icon: Swords, color: "text-primary", bg: "bg-primary/10" },
  score_reported: { icon: Flag, color: "text-green-400", bg: "bg-green-400/10" },
  score_disputed: { icon: Flag, color: "text-destructive", bg: "bg-destructive/10" },
  prize_payout: { icon: DollarSign, color: "text-yellow-400", bg: "bg-yellow-400/10" },
  invite: { icon: Mail, color: "text-primary", bg: "bg-primary/10" },
};

export default function NotificationCenter() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => { maxikay.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", currentUser?.email],
    queryFn: () => maxikay.entities.Notification.filter({ user_email: currentUser.email }, "-created_date", 30),
    enabled: !!currentUser?.email,
    refetchInterval: 15000,
  });

  // Subscribe to real-time new notifications
  useEffect(() => {
    if (!currentUser?.email) return;
    const unsub = maxikay.entities.Notification.subscribe((event) => {
      if (event.data?.user_email === currentUser.email) {
        queryClient.invalidateQueries({ queryKey: ["notifications", currentUser.email] });
      }
    });
    return unsub;
  }, [currentUser?.email, queryClient]);

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter((n) => !n.is_read);
      await Promise.all(unread.map((n) => maxikay.entities.Notification.update(n.id, { is_read: true })));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", currentUser?.email] }),
  });

  const markRead = (id) => {
    maxikay.entities.Notification.update(id, { is_read: true }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["notifications", currentUser?.email] })
    );
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="relative h-9 w-9"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent text-accent-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-11 z-50 w-80 glass border border-border/50 rounded-xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                <p className="text-sm font-display font-semibold text-foreground">Notifications</p>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-96 overflow-y-auto divide-y divide-border/20">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <Bell className="w-6 h-6 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.invite;
                    const Icon = cfg.icon;
                    const Wrapper = n.link ? Link : "div";
                    return (
                      <Wrapper
                        key={n.id}
                        to={n.link}
                        onClick={() => { markRead(n.id); if (n.link) setOpen(false); }}
                        className={`flex items-start gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors cursor-pointer ${!n.is_read ? "bg-primary/5" : ""}`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg}`}>
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${!n.is_read ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                          {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                          <p className="text-[10px] text-muted-foreground/60 mt-1">{moment(n.created_date).fromNow()}</p>
                        </div>
                        {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />}
                      </Wrapper>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}