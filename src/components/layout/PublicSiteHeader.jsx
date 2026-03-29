import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { maxikay } from "@/api/maxikayClient";
import { getOrganizerPortalOrigin } from "@/lib/routingLogic";
import LiveMatchTicker from "@/components/layout/LiveMatchTicker";

const navLinkClass =
  "text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SectionNavLink({ id, className, children, onNavigate }) {
  const { pathname } = useLocation();
  if (pathname === "/") {
    return (
      <a href={`#${id}`} className={className} onClick={onNavigate}>
        {children}
      </a>
    );
  }
  return (
    <Link to={`/#${id}`} className={className} onClick={onNavigate}>
      {children}
    </Link>
  );
}

export default function PublicSiteHeader() {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

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

      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground shadow-sm">
              🎮
            </div>
            <span className="font-display text-lg font-bold tracking-tight">ArenaSaaS</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
            <Link to="/tournaments" className={navLinkClass}>
              Competitions
            </Link>
            <SectionNavLink id="features" className={navLinkClass}>
              Features
            </SectionNavLink>
            <SectionNavLink id="pricing" className={navLinkClass}>
              Pricing
            </SectionNavLink>
            <SectionNavLink id="faq" className={navLinkClass}>
              FAQ
            </SectionNavLink>
            <Link to="/privacy" className={navLinkClass}>
              Privacy
            </Link>
            <Button variant="outline" size="sm" asChild>
              <a href={organizerLoginUrl}>Login</a>
            </Button>
            <Button size="sm" onClick={() => navigate("/register")}>
              Register
            </Button>
          </nav>

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(100vw-2rem,320px)] border-border/50">
              <SheetHeader>
                <SheetTitle className="font-display text-left">Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-8 flex flex-col gap-1" aria-label="Mobile">
                <Link
                  to="/tournaments"
                  className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-secondary/80"
                  onClick={closeMobileNav}
                >
                  Upcoming competitions
                </Link>
                <SectionNavLink
                  id="features"
                  className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-secondary/80"
                  onNavigate={closeMobileNav}
                >
                  Features
                </SectionNavLink>
                <SectionNavLink
                  id="pricing"
                  className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-secondary/80"
                  onNavigate={closeMobileNav}
                >
                  Pricing
                </SectionNavLink>
                <SectionNavLink
                  id="faq"
                  className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-secondary/80"
                  onNavigate={closeMobileNav}
                >
                  FAQ
                </SectionNavLink>
                <Link
                  to="/privacy"
                  className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-secondary/80"
                  onClick={closeMobileNav}
                >
                  Privacy
                </Link>
                <a
                  href={organizerLoginUrl}
                  className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-secondary/80"
                  onClick={closeMobileNav}
                >
                  Login
                </a>
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
      </header>
    </>
  );
}
