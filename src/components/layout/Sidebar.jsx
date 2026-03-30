import { Link, useLocation, useNavigate } from "react-router-dom";
import { getEffectiveHubMode, isLeagueHostUser, setHubPreference } from "@/lib/routingLogic";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, Trophy, Swords, Users, Gamepad2,
  Settings, ScrollText, ChevronLeft, ChevronRight, Shield, Wallet, BarChart2, Compass, UserSearch, Star, ClipboardList, Sun, Moon, LogOut, Clock, Megaphone, Gavel, MessageSquare, Flame
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/lib/AuthContext";



export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { isSuperAdmin, isImpersonating } = useTenant();
  const { logout, user } = useAuth();
  const host = isLeagueHostUser(user);
  const hubMode = getEffectiveHubMode(user);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const organizerNavItems = [
    { path: "/", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/tournaments", icon: Compass, label: "Discover" },
    { path: "/rankings", icon: Flame, label: "Power ranks" },
    { path: "/community", icon: MessageSquare, label: "Community" },
    { path: "/league/tournaments", icon: Trophy, label: "My tournaments" },
    { path: "/free-agents", icon: UserSearch, label: "Free Agents" },
    { path: "/sponsorships", icon: Star, label: "Sponsorships" },
    { path: "/sponsor-insights", icon: Megaphone, label: "Sponsor insight" },
    { path: "/matches", icon: Swords, label: "Matches" },
    { path: "/league/disputes", icon: Gavel, label: "Disputes" },
    { path: "/teams", icon: Users, label: "Teams" },
    { path: "/games", icon: Gamepad2, label: "Game Templates" },
    { path: "/wallet", icon: Wallet, label: "Wallet" },
    { path: "/revenue", icon: BarChart2, label: "Revenue Report" },
    { path: "/audit-log", icon: ScrollText, label: "Audit Log" },
    { path: "/settings", icon: Settings, label: "Settings" },
    { path: "/dev-todos", icon: ClipboardList, label: "Dev Todos" },
    ...(isSuperAdmin ? [{ path: "/super-admin", icon: Shield, label: "Super Admin", accent: true }] : []),
  ];

  const playerNavItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Home" },
    { path: "/dashboard/matches", icon: Swords, label: "My matches" },
    { path: "/dashboard/teams", icon: Users, label: "My teams" },
    { path: "/dashboard/wallet", icon: Wallet, label: "Wallet" },
    { path: "/dashboard/settings", icon: Settings, label: "Hub settings" },
    { path: "/tournaments", icon: Compass, label: "Discover" },
    { path: "/rankings", icon: Flame, label: "Power ranks" },
    { path: "/community", icon: MessageSquare, label: "Community" },
    { path: "/matches", icon: Swords, label: "All matches" },
    { path: "/check-in", icon: Clock, label: "Check-in" },
  ];

  const allNavItems = hubMode === "player" ? playerNavItems : organizerNavItems;

  const itemIsActive = (itemPath) => {
    const p = location.pathname;
    if (itemPath === "/dashboard") return p === "/dashboard";
    if (itemPath === "/") return p === "/";
    return p === itemPath || p.startsWith(`${itemPath}/`);
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="h-screen sticky top-0 flex flex-col glass border-r border-border/50 z-50"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border/50">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="font-display text-sm font-bold tracking-wider text-foreground whitespace-nowrap overflow-hidden"
            >
              ARENA
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {allNavItems.map((item) => {
          const isActive = itemIsActive(item.path);
          return (
            <Link key={item.path} to={item.path}>
              <motion.div
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative
                  ${isActive 
                    ? "text-primary bg-primary/10" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"}
                `}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-lg bg-primary/10 glow-border-primary"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <item.icon className="w-5 h-5 flex-shrink-0 relative z-10" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm font-medium relative z-10 whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {host && (
        <div className="px-2 py-2 border-t border-border/40">
          <button
            type="button"
            onClick={() => {
              if (hubMode === "player") {
                setHubPreference("organizer");
                navigate("/");
              } else {
                setHubPreference("player");
                navigate("/dashboard");
              }
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
          >
            {hubMode === "player" ? "League organizer view" : "Player hub (compete)"}
          </button>
        </div>
      )}

      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="mx-2 mb-1 px-2 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30">
          <p className="text-[10px] text-orange-400 font-semibold text-center">🎭 Impersonating</p>
        </div>
      )}

      {/* Log out */}
      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={() => logout()}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive`}
          title="Sign out"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="whitespace-nowrap"
              >
                Log out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Theme toggle + Collapse */}
      <div className="p-2 border-t border-border/50 flex gap-1">
        <button
          onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex-1 flex items-center justify-center py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </motion.aside>
  );
}