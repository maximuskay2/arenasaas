import { Link, useLocation, useNavigate } from "react-router-dom";
import { getEffectiveHubMode, isLeagueHostUser, setHubPreference } from "@/lib/routingLogic";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Trophy, Swords, Users, Gamepad2,
  Settings, ScrollText, ChevronLeft, ChevronRight, Shield, Wallet, BarChart2, Compass, UserSearch, Star, ClipboardList, LogOut, Clock, Megaphone, Gavel, MessageSquare, Flame, Zap, Activity, Tv
} from "lucide-react";
import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/lib/AuthContext";
import ThemeToggle from "@/components/theme/ThemeToggle";

function NavSection({ title, collapsed, children }) {
  return (
    <div className="mb-3">
      {!collapsed && (
        <p className="section-label px-3 mb-1.5 select-none">{title}</p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { isSuperAdmin, isImpersonating } = useTenant();
  const { logout, user } = useAuth();
  const host = isLeagueHostUser(user);
  const hubMode = getEffectiveHubMode(user);

  const organizerSections = [
    {
      title: "Compete",
      items: [
        { path: "/", icon: LayoutDashboard, label: "Command center" },
        { path: "/league/ops", icon: Activity, label: "Ops board" },
        { path: "/tournaments", icon: Compass, label: "Discover" },
        { path: "/watch", icon: Tv, label: "Watch live" },
        { path: "/rankings", icon: Flame, label: "Power ranks" },
        { path: "/community", icon: MessageSquare, label: "Community" },
        { path: "/matches", icon: Swords, label: "Match center" },
      ],
    },
    {
      title: "League ops",
      items: [
        { path: "/league/tournaments", icon: Trophy, label: "My tournaments" },
        { path: "/teams", icon: Users, label: "Teams" },
        { path: "/league/disputes", icon: Gavel, label: "Disputes" },
        { path: "/games", icon: Gamepad2, label: "Game templates" },
        { path: "/free-agents", icon: UserSearch, label: "Free agents" },
      ],
    },
    {
      title: "Business",
      items: [
        { path: "/wallet", icon: Wallet, label: "Wallet" },
        { path: "/revenue", icon: BarChart2, label: "Revenue" },
        { path: "/sponsorships", icon: Star, label: "Sponsorships" },
        { path: "/sponsor-insights", icon: Megaphone, label: "Sponsor insight" },
      ],
    },
    {
      title: "System",
      items: [
        { path: "/audit-log", icon: ScrollText, label: "Audit log" },
        { path: "/settings", icon: Settings, label: "Settings" },
        { path: "/dev-todos", icon: ClipboardList, label: "Dev todos" },
        ...(isSuperAdmin ? [{ path: "/super-admin", icon: Shield, label: "Super admin", accent: true }] : []),
      ],
    },
  ];

  const playerSections = [
    {
      title: "Career",
      items: [
        { path: "/dashboard", icon: LayoutDashboard, label: "Home" },
        { path: "/dashboard/matches", icon: Swords, label: "My matches" },
        { path: "/dashboard/teams", icon: Users, label: "My teams" },
        { path: "/dashboard/wallet", icon: Wallet, label: "Vault" },
        { path: "/check-in", icon: Clock, label: "Check-in" },
      ],
    },
    {
      title: "Arena",
      items: [
        { path: "/tournaments", icon: Compass, label: "Discover" },
        { path: "/watch", icon: Tv, label: "Watch live" },
        { path: "/rankings", icon: Flame, label: "Power ranks" },
        { path: "/community", icon: MessageSquare, label: "Community" },
        { path: "/matches", icon: Swords, label: "All matches" },
        { path: "/dashboard/settings", icon: Settings, label: "Hub settings" },
      ],
    },
  ];

  const sections = hubMode === "player" ? playerSections : organizerSections;

  const itemIsActive = (itemPath) => {
    const p = location.pathname;
    if (itemPath === "/dashboard") return p === "/dashboard";
    if (itemPath === "/") return p === "/";
    return p === itemPath || p.startsWith(`${itemPath}/`);
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 272 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="h-screen sticky top-0 flex flex-col z-50 border-r border-sidebar-border/80 bg-sidebar/90 backdrop-blur-xl shadow-arena"
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-[4.25rem] border-b border-sidebar-border/70">
        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center flex-shrink-0 ring-1 ring-primary/30 shadow-arena-glow">
          <Zap className="w-5 h-5 text-primary" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              className="min-w-0 overflow-hidden"
            >
              <p className="font-display text-[13px] font-bold tracking-[0.18em] text-foreground leading-none">
                ARENA
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 font-medium tracking-wide">
                Grid · Esports OS
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2.5 overflow-y-auto scrollbar-thin">
        {sections.map((section) => (
          <NavSection key={section.title} title={section.title} collapsed={collapsed}>
            {section.items.map((item) => {
              const isActive = itemIsActive(item.path);
              return (
                <Link key={item.path} to={item.path} title={collapsed ? item.label : undefined}>
                  <div
                    className={`
                      group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 relative
                      ${isActive
                        ? "text-primary nav-item-active"
                        : item.accent
                          ? "text-accent hover:bg-accent/10"
                          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80"}
                    `}
                  >
                    <item.icon className={`w-[1.15rem] h-[1.15rem] flex-shrink-0 relative z-10 ${isActive ? "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]" : ""}`} />
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-[13px] font-medium relative z-10 whitespace-nowrap"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </Link>
              );
            })}
          </NavSection>
        ))}
      </nav>

      {host && (
        <div className="px-2.5 py-2 border-t border-sidebar-border/60">
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
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20"
          >
            <Shield className="w-4 h-4 shrink-0" />
            {!collapsed && (hubMode === "player" ? "Organizer mode" : "Player mode")}
          </button>
        </div>
      )}

      {isImpersonating && (
        <div className="mx-2.5 mb-1 px-2 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30">
          <p className="text-[10px] text-orange-400 font-semibold text-center">Impersonating</p>
        </div>
      )}

      <div className="px-2.5 pb-1">
        <button
          type="button"
          onClick={() => logout()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          title="Sign out"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                Sign out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      <div className="p-2.5 border-t border-sidebar-border/60 flex gap-1 items-center">
        <ThemeToggle variant="menu" className="w-10 h-10 rounded-xl" />
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex-1 flex items-center justify-center py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </motion.aside>
  );
}
