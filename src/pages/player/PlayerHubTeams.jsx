import { Link } from "react-router-dom";
import { Users, UserPlus, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlayerHubTeams() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-black uppercase italic tracking-tighter">My teams</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Squad builder, invitation mailbox, and role tags (starters, substitutes, coaches) live in team tools.
          Captains invite by email or share join links; you accept from Team Management.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-3">
          <Users className="h-8 w-8 text-primary" />
          <h2 className="font-black uppercase italic">Team list &amp; rosters</h2>
          <p className="text-sm text-muted-foreground">Browse teams you belong to and edit roster when you&apos;re captain.</p>
          <Button variant="outline" className="font-black uppercase italic" asChild>
            <Link to="/teams">Open teams</Link>
          </Button>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-3">
          <UserPlus className="h-8 w-8 text-primary" />
          <h2 className="font-black uppercase italic">Invites &amp; join flow</h2>
          <p className="text-sm text-muted-foreground">Pending invitations and join-link handling.</p>
          <Button variant="outline" className="font-black uppercase italic" asChild>
            <Link to="/team-management">Team management</Link>
          </Button>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-3">
          <LayoutDashboard className="h-8 w-8 text-primary" />
          <h2 className="font-black uppercase italic">Team dashboard</h2>
          <p className="text-sm text-muted-foreground">Squad-level schedule and finance shortcuts.</p>
          <Button variant="outline" className="font-black uppercase italic" asChild>
            <Link to="/team-dashboard">Team dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
