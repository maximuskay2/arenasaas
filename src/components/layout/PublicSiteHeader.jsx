import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, AlertTriangle, Info, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { topNavLinkClass, topNavTriggerClass } from "@/components/layout/navBarStyles";
import { maxikay } from "@/api/maxikayClient";
import { getOrganizerPortalOrigin } from "@/lib/routingLogic";
import { useAuth } from "@/lib/AuthContext";
import LiveMatchTicker from "@/components/layout/LiveMatchTicker";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { scrollToSection } from "@/lib/scrollToSection";

/**
 * Navigate to a landing-page section. On `/`, scroll immediately (RR hash links often no-op).
 * Off home, go to `/#id` so PublicLanding can scroll after mount.
 */
function useGoToLandingSection() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return useCallback(
    (id, { after } = {}) => {
      const sectionId = String(id || "").replace(/^#/, "");
      if (!sectionId) return;
      if (pathname === "/" || pathname === "") {
        const ok = scrollToSection(sectionId);
        if (!ok) {
          // Section not in DOM yet — still set hash for effect retry
          window.location.hash = sectionId;
        }
        after?.();
        return;
      }
      navigate(`/#${sectionId}`);
      after?.();
    },
    [navigate, pathname]
  );
}

function SectionNavLink({ id, className, children, onNavigate = () => {} }) {
  const go = useGoToLandingSection();
  return (
    <button
      type="button"
      className={className}
      onClick={() => go(id, { after: onNavigate })}
    >
      {children}
    </button>
  );
}

/** Dropdown item that scrolls to landing section (fixes RR hash + radix menu). */
function DropdownSectionLink({ id, children }) {
  const go = useGoToLandingSection();
  return (
    <DropdownMenuItem
      onSelect={() => {
        // Do not preventDefault — allow Radix to close the menu, then scroll.
        // Use rAF so scroll runs after menu unmount focus restore.
        requestAnimationFrame(() => go(id));
      }}
    >
      {children}
    </DropdownMenuItem>
  );
}

export default function PublicSiteHeader() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const goSection = useGoToLandingSection();

  const organizerLoginUrl = `${getOrganizerPortalOrigin()}/login`;

  const { data: platformStatus } = useQuery({
    queryKey: ["public-platform-status"],
    queryFn: () => maxikay.public.platformStatus(),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  const showMaintenanceBanner = platformStatus?.platform_maintenance === true;
  const showManualReportingBanner =
    platformStatus?.manual_reporting_mode === true && !showMaintenanceBanner;

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {showMaintenanceBanner && (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-orange-500/50 bg-orange-500/15 px-4 py-3 text-center text-sm text-orange-950 dark:text-orange-100"
        >
          <span className="inline-flex flex-wrap items-center justify-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Platform maintenance is in progress. Organizer APIs and live features may be unavailable — please try again shortly.
          </span>
        </div>
      )}
      {showManualReportingBanner && (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-sky-500/35 bg-sky-500/10 px-4 py-2.5 text-center text-xs text-sky-950/90 dark:text-sky-100/90"
        >
          <span className="inline-flex flex-wrap items-center justify-center gap-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
            Manual reporting mode is active across the platform. Live scores may be entered by organizers while game APIs recover.
          </span>
        </div>
      )}

      <LiveMatchTicker />

      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/40 to-accent/30 ring-1 ring-primary/35 shadow-arena-glow font-display text-sm font-bold text-primary">
              A
            </div>
            <div className="leading-tight">
              <span className="font-display text-sm font-bold tracking-[0.16em]">ARENA</span>
              <span className="hidden sm:block text-[10px] text-muted-foreground font-medium">Esports OS</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex lg:gap-2" aria-label="Primary">
            <DropdownMenu>
              <DropdownMenuTrigger className={topNavTriggerClass}>
                Compete
                <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Tournaments &amp; live
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to="/tournaments">All competitions</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/rankings">Power rankings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/watch">Watch live</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={isAuthenticated ? "/matches" : "/login"}>Match center</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/tournaments" title="Pick'Em tab on each event">
                    Pick&apos;Em <span className="text-muted-foreground text-xs">(per event)</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={isAuthenticated ? "/dashboard" : "/login"}>Career hub</Link>
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

            <DropdownMenu>
              <DropdownMenuTrigger className={topNavTriggerClass}>
                Resources
                <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownSectionLink id="features">Features</DropdownSectionLink>
                <DropdownSectionLink id="resources">Resources</DropdownSectionLink>
                <DropdownSectionLink id="pricing">Pricing</DropdownSectionLink>
                <DropdownSectionLink id="faq">FAQ</DropdownSectionLink>
                <DropdownSectionLink id="contact">Contact</DropdownSectionLink>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/rankings">Power rankings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/free-agents">Free agent market</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/community">Community</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/watch">Watch live</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={isAuthenticated ? "/dashboard" : "/login"}>Career hub</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/privacy">Privacy</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/terms">Terms</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <ThemeToggle variant="menu" className="ml-1" />
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <a href={organizerLoginUrl}>Login</a>
            </Button>
            <Button size="sm" className="shrink-0" onClick={() => navigate("/register")}>
              Register
            </Button>
          </nav>

          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle variant="icon" />
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(100vw-2rem,320px)] border-border/50">
              <SheetHeader>
                <SheetTitle className="font-display text-left">Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-1" aria-label="Mobile">
                <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Compete
                </p>
                <Link
                  to="/tournaments"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary/80 text-left"
                  onClick={closeMobileNav}
                >
                  All competitions
                </Link>
                <Link
                  to="/rankings"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary/80 text-left"
                  onClick={closeMobileNav}
                >
                  Power rankings
                </Link>
                <Link
                  to="/watch"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary/80 text-left"
                  onClick={closeMobileNav}
                >
                  Watch live
                </Link>
                <Link
                  to={isAuthenticated ? "/matches" : "/login"}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary/80 text-left"
                  onClick={closeMobileNav}
                >
                  Match center
                </Link>
                <Link
                  to={isAuthenticated ? "/dashboard" : "/login"}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary/80 text-left"
                  onClick={closeMobileNav}
                >
                  Career hub
                </Link>
                <Link
                  to="/free-agents"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary/80 text-left"
                  onClick={closeMobileNav}
                >
                  Free agent market
                </Link>

                <p className="px-3 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t border-border/40 mt-3">
                  Social
                </p>
                <Link
                  to="/community"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary/80 text-left"
                  onClick={closeMobileNav}
                >
                  Community
                </Link>

                <p className="px-3 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t border-border/40 mt-1">
                  Resources
                </p>
                {[
                  ["features", "Features"],
                  ["resources", "Resources"],
                  ["pricing", "Pricing"],
                  ["faq", "FAQ"],
                  ["contact", "Contact"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary/80 text-left w-full"
                    onClick={() => {
                      closeMobileNav();
                      // Sheet close animation — slight delay so section is visible
                      setTimeout(() => goSection(id), 50);
                    }}
                  >
                    {label}
                  </button>
                ))}
                <Link
                  to="/privacy"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary/80 text-left"
                  onClick={closeMobileNav}
                >
                  Privacy
                </Link>
                <Link
                  to="/terms"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary/80 text-left"
                  onClick={closeMobileNav}
                >
                  Terms
                </Link>
                <a
                  href={organizerLoginUrl}
                  className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-secondary/80"
                  onClick={closeMobileNav}
                >
                  Login
                </a>
                <div className="mt-4 flex items-center justify-between gap-2 px-1 border-t border-border/40 pt-4">
                  <span className="text-xs text-muted-foreground">Appearance</span>
                  <ThemeToggle variant="menu" showLabel />
                </div>
                <Button
                  className="mt-4 w-full"
                  onClick={() => {
                    closeMobileNav();
                    navigate("/register");
                  }}
                >
                  Register
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}
