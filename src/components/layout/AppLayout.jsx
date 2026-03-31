import { Link, Outlet } from "react-router-dom";
import { ChevronDown } from "lucide-react";
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

export default function AppLayout() {
  const { isAuthenticated } = useAuth();
  return (
    <TenantThemeProvider>
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      {isAuthenticated ? (
        <div className="hidden md:block">
          <Sidebar />
        </div>
      ) : null}
      
      {/* Main content */}
      <main className="flex-1 min-w-0">
        {isAuthenticated ? (
          <>
            <div className="md:hidden">
              <MobileNav />
            </div>
            {/* Top bar with notification bell (desktop) */}
            <div className="hidden md:flex items-center justify-between gap-4 px-8 pt-3 pb-2 border-b border-border/40">
              <nav className="flex flex-wrap items-center gap-1 min-w-0" aria-label="Quick nav">
                <DropdownMenu>
                  <DropdownMenuTrigger className={topNavTriggerClass}>
                    Explore
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Arena ecosystem
                    </DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link to="/rankings">Power rankings</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/matches">Match center</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/tournaments">Competitions &amp; Pick&apos;Em</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard">Career hub</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/free-agents">Free agent market</Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Link to="/free-agents" className={topNavLinkClass}>
                  Agents
                </Link>
                <Link to="/community" className={topNavLinkClass}>
                  Community
                </Link>
              </nav>
              <div className="shrink-0">
                <NotificationCenter />
              </div>
            </div>
          </>
        ) : null}
        <div className="p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
    <GlobalMatchReadyAlert />
    </TenantThemeProvider>
  );
}