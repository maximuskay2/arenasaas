import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Trophy, Swords, Users, Menu, X, Wallet, LogOut, Zap, Compass, MessageSquare
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { getEffectiveHubMode, isLeagueHostUser, setHubPreference } from "@/lib/routingLogic";
import NotificationCenter from "./NotificationCenter";
import ThemeToggle from "@/components/theme/ThemeToggle";

const organizerMobileItems = [
  { path: "/", icon: LayoutDashboard, label: "Home" },
  { path: "/tournaments", icon: Compass, label: "Discover" },
  { path: "/league/tournaments", icon: Trophy, label: "League" },
  { path: "/matches", icon: Swords, label: "Matches" },
];

const playerMobileItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { path: "/tournaments", icon: Compass, label: "Discover" },
  { path: "/dashboard/matches", icon: Swords, label: "Matches" },
  { path: "/dashboard/wallet", icon: Wallet, label: "Vault" },
];

const HOST_MENU_EXTRA = [
  { path: "/league/ops", label: "Ops board" },
  { path: "/watch", label: "Watch live" },
  { path: "/community", label: "Community" },
  { path: "/free-agents", label: "Free agents" },
  { path: "/sponsorships", label: "Sponsorships" },
  { path: "/team-management", label: "Team management" },
  { path: "/revenue", label: "Revenue" },
  { path: "/analytics", label: "Analytics" },
  { path: "/league/disputes", label: "Disputes" },
  { path: "/games", label: "Game templates" },
  { path: "/settings", label: "Org settings" },
];

const PLAYER_MENU_EXTRA = [
  { path: "/watch", label: "Watch live" },
  { path: "/community", label: "Community" },
  { path: "/rankings", label: "Power ranks" },
  { path: "/free-agents", label: "Free agents" },
  { path: "/players/profile", label: "Player profile" },
  { path: "/dashboard/wallet", label: "Player vault" },
  { path: "/dashboard/settings", label: "Hub settings" },
  { path: "/check-in", label: "Check-in" },
];

export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout, user } = useAuth();
  const host = isLeagueHostUser(user);
  const hubMode = getEffectiveHubMode(user);
  const mobileItems = hubMode === "player" ? playerMobileItems : organizerMobileItems;
  const extras = hubMode === "player" ? PLAYER_MENU_EXTRA : HOST_MENU_EXTRA;

  const tabIsActive = (itemPath) => {
    const p = location.pathname;
    if (itemPath === "/dashboard") return p === "/dashboard";
    if (itemPath === "/") return p === "/";
    return p === itemPath || p.startsWith(`${itemPath}/`);
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 h-14 glass border-b border-border/50 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="font-display text-sm font-bold tracking-[0.16em]">ARENA</span>
        </div>
        <div className="flex items-center gap-0.5">
          <ThemeToggle variant="icon" />
          <NotificationCenter />
          <button type="button" onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded-lg hover:bg-secondary/60" aria-label="Menu">
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/85 backdrop-blur-xl md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around py-2 px-1">
          {mobileItems.map((item) => {
            const isActive = tabIsActive(item.path);
            return (
              <Link key={item.path} to={item.path} className="flex flex-col items-center gap-0.5 px-3 py-1 min-w-[4rem]">
                <div className={`p-1.5 rounded-xl transition-colors ${isActive ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <span className={`text-[10px] font-semibold ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-14 left-0 right-0 z-50 glass border-b border-border/50 p-4 max-h-[70vh] overflow-y-auto"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-1 border border-border/40 bg-card/30">
                <span className="text-xs font-semibold text-muted-foreground">Theme</span>
                <ThemeToggle variant="menu" showLabel />
              </div>
              {extras.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  {item.label}
                </Link>
              ))}
              {host && (
                <button
                  type="button"
                  className="w-full text-left rounded-xl px-3 py-2.5 text-sm font-semibold text-primary"
                  onClick={() => {
                    if (hubMode === "player") {
                      setHubPreference("organizer");
                      navigate("/");
                    } else {
                      setHubPreference("player");
                      navigate("/dashboard");
                    }
                    setMenuOpen(false);
                  }}
                >
                  Switch to {hubMode === "player" ? "organizer" : "player"} mode
                </button>
              )}
              <button
                type="button"
                onClick={() => logout()}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
