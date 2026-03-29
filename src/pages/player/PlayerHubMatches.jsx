import { Link } from "react-router-dom";
import { Swords, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlayerHubMatches() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-black uppercase italic tracking-tighter">My matches</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Historical and upcoming fixtures tied to your account. For each match, open the{" "}
          <strong className="text-foreground">Match Lobby</strong> to check in, chat, and submit scores with proof.
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          The full match list uses the same data as <strong className="text-foreground">Matches</strong> in the app.
          When you&apos;re rostered on a team, your games appear there; tap through to the lobby for the active
          competition flow.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button className="font-black uppercase italic" asChild>
            <Link to="/matches">
              Open matches <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" className="font-black uppercase italic" asChild>
            <Link to="/check-in">Check-in</Link>
          </Button>
            <Button variant="ghost" className="font-black uppercase italic" asChild>
              <Link to="/tournaments" className="inline-flex items-center gap-1">
                Discover tournaments <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">
        <div className="flex gap-2">
          <Swords className="h-4 w-4 shrink-0 text-primary" />
          <p>
            <strong className="text-foreground">Tenant sites:</strong> on{" "}
            <code className="rounded bg-muted px-1">{'{tenant}'}.yourdomain</code>, use{" "}
            <strong className="text-foreground">/my-matches</strong> for org-scoped participation (same login session
            as the main app when you use the global player hub).
          </p>
        </div>
      </div>
    </div>
  );
}
