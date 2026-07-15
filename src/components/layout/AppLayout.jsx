import { Link, Outlet } from "react-router-dom";
import { ChevronDown, Search, Compass, Flame, Swords, Users, MessageSquare } from "lucide-react";
import TenantThemeProvider from "./TenantThemeProvider";
import GlobalMatchReadyAlert from "../match/GlobalMatchReadyAlert";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import NotificationCenter from "./NotificationCenter";
import { useAuth } from "@/lib/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { topNavLinkClass, topNavTriggerClass } from "@/components/layout/navBarStyles";
import ThemeToggle from "@/components/theme/ThemeToggle";

export default function AppLayout() {
  const { isAuthenticated, user } = useAuth();
  const display = user?.full_name || user?.email?.split("@")[0] || "Competitor";

  return (
    <TenantThemeProvider>
      <div className="flex min-h-screen arena-stage">
        {isAuthenticated ? (
          <div className="hidden md:block arena-content">
            <Sidebar />
          </div>
        ) : null}

        <main className="flex-1 min-w-0 arena-content flex flex-col">
          {isAuthenticated ? (
            <>
              <div className="md:hidden">
                <MobileNav />
              </div>

              {/* Desktop command bar */}
              <header className="hidden md:flex sticky top-0 z-40 items-center justify-between gap-4 px-6 lg:px-8 h-14 border-b border-border/50 bg-background/55 backdrop-blur-xl">
                <nav className="flex flex-wrap items-center gap-1 min-w-0" aria-label="Quick nav">
                  <DropdownMenu>
                    <DropdownMenuTrigger className={topNavTriggerClass}>
                      <Compass className="h-3.5 w-3.5 text-primary" />
                      Explore
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 glass border-border/60">
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        Arena ecosystem
                      </DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link to="/rankings" className="gap-2">
                          <Flame className="h-4 w-4 text-orange-400" /> Power rankings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/matches" className="gap-2">
                          <Swords className="h-4 w-4 text-primary" /> Match center
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/tournaments" className="gap-2">
                          <Compass className="h-4 w-4 text-accent" /> Competitions
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/dashboard">Career hub</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/free-agents" className="gap-2">
                          <Users className="h-4 w-4" /> Free agent market
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Link to="/tournaments" className={topNavLinkClass}>
                    Discover
                  </Link>
                  <Link to="/community" className={topNavLinkClass}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    Community
                  </Link>
                </nav>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <Link
                    to="/tournaments"
                    className="hidden lg:flex items-center gap-2 h-9 px-3 rounded-xl border border-border/60 bg-card/40 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors min-w-[200px]"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Search tournaments…
                  </Link>
                  <ThemeToggle variant="menu" />
                  <NotificationCenter />
                  <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border/50">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 ring-1 ring-primary/30 flex items-center justify-center text-[11px] font-display font-bold text-primary">
                      {String(display).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="leading-tight max-w-[120px]">
                      <p className="text-xs font-semibold truncate">{display}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Online</p>
                    </div>
                  </div>
                </div>
              </header>
            </>
          ) : null}

          <div className="flex-1 p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
            <Outlet />
          </div>
        </main>
      </div>
      <GlobalMatchReadyAlert />
    </TenantThemeProvider>
  );
}
