import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Swords, ExternalLink, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { getOrganizerPortalOrigin } from "@/lib/routingLogic";

/**
 * Tenant-scoped player entry: {tenant}.host/my-matches
 * Same auth session as the main app; deep links back to global Player Hub on app origin.
 */
export default function TenantMyMatches({ tenantSlug }) {
  const appOrigin = getOrganizerPortalOrigin();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant-by-slug", tenantSlug],
    queryFn: () => maxikay.entities.Tenant.filter({ slug: tenantSlug }).then((r) => r[0]),
    enabled: !!tenantSlug,
  });

  if (!tenantSlug) return null;

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/80 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="gap-2 font-display" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              {tenant?.name || "League"} home
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="text-xs font-semibold" asChild>
            <a href={`${appOrigin}/dashboard`} rel="noreferrer">
              Global player hub <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-black md:text-3xl">My matches · {tenant?.name || tenantSlug}</h1>
          <p className="text-sm text-muted-foreground">
            Org-specific participation view. Your <strong className="text-foreground">global identity</strong> is the
            same everywhere — open the full Player Hub on the main app for cross-league fixtures, wallet, and settings.
          </p>
        </div>

        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Swords className="h-6 w-6 text-primary" />
            <h2 className="font-display font-bold">Match lobby</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Check-in, lobby coordination, and score reporting with screenshots happen in each match&apos;s{" "}
            <strong className="text-foreground">Match Lobby</strong>. From the app, go to{" "}
            <strong className="text-foreground">Matches</strong>, pick your fixture, then enter the lobby.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={`${appOrigin}/dashboard/matches`}>Open my matches (app)</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`${appOrigin}/matches`}>All matches</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`${appOrigin}/check-in`}>Check-in</a>
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Log in on <code className="rounded bg-muted px-1">app.*</code> first if links ask you to sign in — sessions
          are shared across subdomains on the same parent domain.
        </p>
      </main>
    </div>
  );
}
