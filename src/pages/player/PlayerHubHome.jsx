import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { maxikay } from "@/api/maxikayClient";
import { Trophy, Swords, Users, Wallet, Bell, ChevronRight, Gamepad2, Radio, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function PlayerHubHome() {
  const { user } = useAuth();
  const display =
    user?.full_name ||
    user?.email?.split("@")[0] ||
    "Competitor";

  const { data: accoladesRes } = useQuery({
    queryKey: ["me-accolades"],
    queryFn: () => maxikay.auth.meAccolades(),
    enabled: !!user,
  });
  const accolades = accoladesRes?.accolades ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-10 p-4 md:p-6">
      <header className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="space-y-1">
          <h1 className="text-3xl font-black uppercase italic tracking-tighter md:text-4xl">
            Welcome back, <span className="text-primary">{display}</span>
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Global player identity · One login across every ArenaSaaS organization
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/dashboard/wallet"
            className="rounded-2xl border border-border/60 bg-card/40 p-4 text-right backdrop-blur-sm transition hover:border-primary/40"
          >
            <p className="text-[10px] font-black uppercase text-muted-foreground">Wallet</p>
            <p className="text-xl font-black italic text-primary">View balance</p>
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/15 to-accent/10 p-6 md:p-8">
        <div className="mb-4 flex items-start gap-3">
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-sm font-black uppercase italic tracking-widest text-primary">
              Player &amp; team command center
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Tenant admins run the league; <strong className="text-foreground">you</strong> need a home for rosters,
              match history, check-in, score proof, and payouts. This hub is your global career view — same account on{" "}
              <strong className="text-foreground">app.*</strong> and on each org&apos;s subdomain.
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted-foreground">
              <li>
                <strong className="text-foreground">Match lobby</strong> — check-in (~15 min before), lobby chat, score +
                screenshot reporting (open a match → Match Lobby).
              </li>
              <li>
                <strong className="text-foreground">Teams</strong> — invites, squads, roles (starters / subs / coaches).
              </li>
              <li>
                <strong className="text-foreground">Vault</strong> — winnings, withdrawals, entry-fee history (Wallet).
              </li>
              <li>
                <strong className="text-foreground">Gaming passport</strong> — link Riot / Steam / PSN under Settings;
                some tournaments block Join until the required ID is set.
              </li>
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Push alerts (FCM) for &quot;match ready&quot; are on the integration roadmap; use Match Lobby for live
              coordination today.
            </p>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2rem] border border-primary/30 bg-gradient-to-r from-primary/20 to-accent/10 p-6 md:p-8">
        <div className="absolute right-4 top-4">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
        </div>
        <div className="relative z-10 flex flex-col items-center gap-8 md:flex-row md:justify-between">
          <div className="flex items-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background/30">
              <Swords className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter">Next match</h3>
              <p className="font-medium text-muted-foreground">
                Open <strong className="text-foreground">My Matches</strong> for fixtures, opponent context, and{" "}
                <strong className="text-foreground">Enter lobby</strong> for check-in &amp; scores.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Button size="lg" className="rounded-2xl font-black uppercase italic md:px-10" asChild>
              <Link to="/dashboard/matches">My matches</Link>
            </Button>
            <Button size="lg" variant="outline" className="rounded-2xl font-black uppercase italic md:px-8" asChild>
              <Link to="/check-in">Check-in hub</Link>
            </Button>
          </div>
        </div>
      </section>

      {accolades.length > 0 && (
        <section className="rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-6 md:p-8 space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase italic tracking-widest text-primary">
            <Sparkles className="h-4 w-4" /> Trophy case
          </h3>
          <p className="text-xs text-muted-foreground">
            Placements from finalized tournaments. Ranks 1–3 use gold / silver styling.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accolades.map((a) => {
              const meta = a.metadata && typeof a.metadata === "object" ? a.metadata : {};
              const opp = meta.final_opponent_team_id;
              return (
                <li
                  key={a.id}
                  title={JSON.stringify(a.metadata || {}, null, 2)}
                  className={`relative overflow-hidden rounded-2xl border p-4 space-y-1 ${
                    a.rank === 1
                      ? "border-amber-400/50 shadow-[0_0_24px_rgba(251,191,36,0.25)] bg-amber-500/10 trophy-shine-gold"
                      : a.rank === 2
                        ? "border-slate-300/40 bg-gradient-to-br from-slate-400/15 to-transparent"
                        : "border-border/60 bg-card/40"
                  }`}
                >
                  <span className="sr-only">
                    Trophy: {a.rank === 1 ? "First place" : a.rank === 2 ? "Second place" : `Rank ${a.rank}`},{" "}
                    {a.tournament_title || "tournament"}
                  </span>
                  <p className="text-[10px] font-black uppercase text-muted-foreground" aria-hidden="true">
                    {a.rank === 1 ? "1st place (gold tier)" : a.rank === 2 ? "2nd place (silver tier)" : `${a.rank}th place`}
                  </p>
                  <p className="font-black italic text-sm line-clamp-2 relative z-[1]">{a.tournament_title || "Tournament"}</p>
                  <p className="text-[10px] text-muted-foreground font-mono relative z-[1]">Badge: {a.badge_id}</p>
                  {opp ? (
                    <p className="text-[10px] text-muted-foreground relative z-[1]">
                      Finals opponent team id: {String(opp)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <h4 className="flex items-center gap-2 text-sm font-black uppercase italic tracking-widest">
            <Trophy className="h-4 w-4 text-primary" /> Discover &amp; compete
          </h4>
          <div className="space-y-4">
            <Link
              to="/tournaments"
              className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card/30 p-6 transition hover:border-primary/40"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-secondary/80" />
                <div>
                  <p className="text-lg font-black uppercase italic">Tournament discovery</p>
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    Join events across tenants · pay entry fees when required
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:text-primary" />
            </Link>
            <Link
              to="/matches"
              className="group flex items-center justify-between rounded-2xl border border-border/60 bg-card/30 p-6 transition hover:border-primary/40"
            >
              <div className="flex items-center gap-4">
                <Radio className="h-10 w-10 text-primary" />
                <div>
                  <p className="text-lg font-black uppercase italic">All fixtures</p>
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    Open any match → <strong className="text-foreground">Match Lobby</strong> for check-in &amp; results
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:text-primary" />
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="flex items-center gap-2 text-sm font-black uppercase italic tracking-widest">
            <Users className="h-4 w-4 text-primary" /> Your squads
          </h4>
          <div className="space-y-4 rounded-3xl border border-border/60 bg-card/30 p-6">
            <p className="text-xs text-muted-foreground">
              Captains manage rosters and invites; use Team Management for invites and join links.
            </p>
            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <p className="font-black uppercase italic tracking-tight">Teams</p>
              <Badge className="bg-emerald-500/15 text-[10px] text-emerald-600 dark:text-emerald-400">Roster tools</Badge>
            </div>
            <Button variant="ghost" className="h-auto w-full justify-start px-0 text-xs font-black uppercase italic text-muted-foreground hover:text-foreground" asChild>
              <Link to="/dashboard/teams">Manage squads &amp; invites</Link>
            </Button>
            <Button variant="ghost" className="h-auto w-full justify-start px-0 text-xs font-black uppercase italic text-muted-foreground hover:text-foreground" asChild>
              <Link to="/players/profile">
                <Gamepad2 className="mr-2 inline h-3 w-3" />
                Player profile &amp; game IDs
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
