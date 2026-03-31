import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, Trophy, Swords, Users, Menu, X, Shield, Wallet, LogOut
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { getEffectiveHubMode, isLeagueHostUser, setHubPreference } from "@/lib/routingLogic";

const organizerMobileItems = [
  { path: "/", icon: LayoutDashboard, label: "Home" },
  { path: "/league/tournaments", icon: Trophy, label: "League" },
  { path: "/matches", icon: Swords, label: "Matches" },
  { path: "/teams", icon: Users, label: "Teams" },
];

const playerMobileItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { path: "/dashboard/matches", icon: Swords, label: "Matches" },
  { path: "/dashboard/teams", icon: Users, label: "Teams" },
  { path: "/dashboard/wallet", icon: Wallet, label: "Wallet" },
];

const HOST_MENU_EXTRA = [
  { path: "/community", label: "💬 Community" },
  { path: "/free-agents", label: "🔍 Free Agents" },
  { path: "/sponsorships", label: "⭐ Sponsorships" },
  { path: "/team-management", label: "🛡️ Team Management" },
  { path: "/team-dashboard", label: "📊 Team Dashboard" },
  { path: "/revenue", label: "📈 Revenue Report" },
  { path: "/analytics", label: "🏆 Analytics" },
  { path: "/league/disputes", label: "⚖️ Disputes" },
  { path: "/games", label: "🎮 Game Templates" },
  { path: "/audit-log", label: "📋 Audit Log" },
  { path: "/settings", label: "⚙️ Org settings" },
  { path: "/dev-todos", label: "✅ Dev Todos" },
];

const PLAYER_MENU_EXTRA = [
  { path: "/community", label: "💬 Community" },
  { path: "/free-agents", label: "🔍 Free Agents" },
  { path: "/players/profile", label: "👤 Player profile" },
  { path: "/dashboard/settings", label: "⚙️ Hub settings" },
  { path: "/check-in", label: "✅ Check-in" },
];

export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout, user } = useAuth();
  const host = isLeagueHostUser(user);
  const hubMode = getEffectiveHubMode(user);
  const mobileItems = hubMode === "player" ? playerMobileItems : organizerMobileItems;

  const tabIsActive = (itemPath) => {
    const p = location.pathname;
    if (itemPath === "/dashboard") return p === "/dashboard";
    if (itemPath === "/") return p === "/";
    return p === itemPath || p.startsWith(`${itemPath}/`);
  };

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14 glass border-b border-border/50">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <span className="font-display text-sm font-bold tracking-wider">ARENA</span>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="p-2">
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Bottom tabs */}
      <div className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 md:hidden">
        <div className="flex justify-around py-2">
          {mobileItems.map((item) => {
            const isActive = tabIsActive(item.path);
            return (
              <Link key={item.path} to={item.path} className="flex flex-col items-center gap-0.5 px-3 py-1">
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[10px] ${isActive ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Dropdown menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-14 left-0 right-0 z-50 glass border-b border-border/50 p-4"
          >
            <div className="space-y-2">
              {host && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    if (hubMode === "player") {
                      setHubPreference("organizer");
                      navigate("/");
                    } else {
                      setHubPreference("player");
                      navigate("/dashboard");
                    }
                  }}
                  className="block w-full rounded-lg border border-border/50 px-3 py-2 text-left text-sm font-semibold text-primary"
                >
                  {hubMode === "player" ? "→ League organizer view" : "→ Player hub"}
                </button>
              )}
              {[
                { path: "/tournaments", label: "🧭 Discover tournaments" },
                { path: "/rankings", label: "🔥 Power ranks" },
                ...(host ? HOST_MENU_EXTRA : PLAYER_MENU_EXTRA),
                { path: "/wallet", label: "💰 Wallet" },
                ...(host ? [{ path: "/players/profile", label: "👤 Player profile" }] : []),
              ].map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                >
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}