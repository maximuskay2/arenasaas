import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { maxikay } from "@/api/maxikayClient";
import {
  Trophy,
  Swords,
  Users,
  Bell,
  ChevronRight,
  Gamepad2,
  Radio,
  Sparkles,
  Compass,
  Wallet,
  Settings,
  Clock,
  Flame,
  MessageSquare,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import StatsCard from "@/components/shared/StatsCard";

const QUICK = [
  { to: "/tournaments", label: "Discover", desc: "Find open cups", icon: Compass, accent: true },
  { to: "/dashboard/matches", label: "My matches", desc: "Fixtures & lobbies", icon: Swords },
  { to: "/dashboard/teams", label: "My teams", desc: "Squads & invites", icon: Users },
  { to: "/dashboard/wallet", label: "Vault", desc: "Winnings & fees", icon: Wallet },
  { to: "/rankings", label: "Power ranks", desc: "Elo ladder", icon: Flame },
  { to: "/community", label: "Community", desc: "War room", icon: MessageSquare },
  { to: "/check-in", label: "Check-in", desc: "Match ready", icon: Clock },
  { to: "/players/profile", label: "Passport", desc: "Game IDs", icon: Gamepad2 },
];

function formatMoney(amount, currency = "USD") {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

export default function PlayerHubHome() {
  const { user } = useAuth();
  const display = user?.full_name || user?.email?.split("@")[0] || "Competitor";
  const initials = display
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const { data: accoladesRes } = useQuery({
    queryKey: ["me-accolades"],
    queryFn: () => maxikay.auth.meAccolades(),
    enabled: !!user,
  });
  const accolades = accoladesRes?.accolades ?? [];

  const { data: hub } = useQuery({
    queryKey: ["me-hub"],
    queryFn: () => maxikay.auth.meHub(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: walletRes } = useQuery({
    queryKey: ["me-wallet"],
    queryFn: () => maxikay.auth.meWallet(),
    enabled: !!user,
    staleTime: 30_000,
  });
  const wallets = walletRes?.wallets ?? hub?.wallets ?? [];
  const primaryWallet = wallets[0];
  const balance = Number(primaryWallet?.balance) || 0;
  const currency = primaryWallet?.currency || "USD";
  const goldCount = accolades.filter((a) => a.rank === 1).length;

  const { data: discovery } = useQuery({
    queryKey: ["player-home-discovery"],
    queryFn: () => maxikay.public.discoveryTournaments({ page: 1, limit: 3, status: "registration_open" }),
    staleTime: 60_000,
    retry: 1,
  });
  const openEvents = discovery?.items ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-8">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-border/50 glass p-6 md:p-8 shadow-arena"
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/4 h-28 w-28 rounded-full bg-accent/15 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--border) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.4) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            maskImage: "radial-gradient(ellipse 75% 65% at 60% 40%, black, transparent)",
          }}
        />
        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/35 to-accent/25 ring-1 ring-primary/40 font-display text-lg font-bold text-primary shadow-arena-glow">
              {initials}
            </div>
            <div className="space-y-2">
              <p className="section-label">Player career hub</p>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight">
                Welcome back, <span className="text-gradient-primary">{display}</span>
              </h1>
              <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
                One identity across every organization — matches, squads, vault, and your gaming passport.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <Button asChild variant="arena" size="lg">
              <Link to="/tournaments">Discover events</Link>
            </Button>
            <Link
              to="/dashboard/wallet"
              className="rounded-2xl border border-primary/25 bg-primary/10 px-5 py-3 text-right transition hover:border-primary/50 hover:bg-primary/15 min-w-[140px] glass"
            >
              <p className="section-label">Vault balance</p>
              <p className="text-base font-display font-bold text-primary mt-0.5 tabular-nums">
                {formatMoney(balance, currency)}
              </p>
            </Link>
          </div>
        </div>
      </motion.header>

      {/* Career pulse */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatsCard
          icon={Wallet}
          label="Vault"
          value={formatMoney(balance, currency)}
          trend={wallets.length > 1 ? `${wallets.length} currencies` : currency}
          trendUp={balance > 0}
          delay={0}
        />
        <StatsCard
          icon={Award}
          label="Accolades"
          value={hub?.accolades_count ?? accolades.length}
          trend={goldCount > 0 ? `${goldCount} gold` : "Keep climbing"}
          trendUp={goldCount > 0}
          delay={0.05}
        />
        <StatsCard
          icon={Swords}
          label="Matches"
          value={hub?.match_count ?? "—"}
          trend={hub?.live_match_count ? `${hub.live_match_count} live` : "My fixtures"}
          trendUp={(hub?.live_match_count || 0) > 0}
          delay={0.1}
        />
        <StatsCard
          icon={Users}
          label="Squads"
          value={hub?.team_count ?? "—"}
          trend="My teams"
          delay={0.15}
        />
      </div>

      {/* Launch pad */}
      <section className="space-y-4">
        <h2 className="font-display font-semibold text-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Launch pad
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK.map((a, i) => (
            <motion.div
              key={a.to}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Link
                to={a.to}
                className={`group flex flex-col h-full glass rounded-2xl border p-4 shadow-arena-card glass-hover ${
                  a.accent ? "border-primary/40 ring-1 ring-primary/20" : "border-border/50"
                }`}
              >
                <div
                  className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ring-1 text-primary ${
                    a.accent ? "bg-primary/20 ring-primary/30" : "bg-primary/15 ring-primary/25"
                  }`}
                >
                  <a.icon className="h-5 w-5" />
                </div>
                <p className="font-display text-sm font-bold tracking-tight group-hover:text-primary transition-colors">
                  {a.label}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{a.desc}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Next match CTA */}
      <section className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-r from-primary/15 via-card/40 to-accent/10 p-6 md:p-8 shadow-arena-glow">
        <div className="absolute right-4 top-4">
          <span className="live-dot" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-6 md:flex-row md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background/40 ring-1 ring-primary/30">
              <Swords className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-2xl font-display font-bold tracking-tight">Match ready</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Open <strong className="text-foreground">My Matches</strong> for fixtures, then enter lobby for check-in
                and score reports.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Button size="lg" variant="arena" asChild>
              <Link to="/dashboard/matches">My matches</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/check-in">Check-in hub</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Open cups + command deck */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <Compass className="w-4 h-4 text-primary" />
              Open cups
            </h2>
            <Link to="/tournaments" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              Full discovery <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {openEvents.length === 0 ? (
            <div className="glass rounded-3xl border border-border/50 p-8 text-center">
              <p className="text-sm text-muted-foreground">No open registration right now</p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/tournaments">Browse marketplace</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {openEvents.map((t) => (
                <Link
                  key={t.id}
                  to={`/tournaments/${t.id}`}
                  className="group flex items-center justify-between glass rounded-2xl border border-border/50 p-4 shadow-arena-card glass-hover"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/25 to-accent/15 ring-1 ring-primary/25 flex items-center justify-center shrink-0">
                      <Trophy className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display font-bold tracking-tight truncate group-hover:text-primary transition-colors">
                        {t.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {t.game_title || "Multi-game"} · {t.organizer_name || t.organizer_slug || "Organizer"}
                        {t.prize_pool > 0
                          ? ` · ${t.currency || "USD"} ${Number(t.prize_pool).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-2 rounded-3xl border border-border/50 glass p-6 shadow-arena-card">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-primary/15 ring-1 ring-primary/25">
              <Bell className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-primary">
                Competitive command deck
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Leagues run the events — this hub is your global career home across every org.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                {[
                  ["Match lobby", "Check-in, chat, score + proof"],
                  ["Teams", "Invites, roles, squads"],
                  ["Vault", "Winnings & entry history"],
                  ["Passport", "Discord / Steam / Riot IDs"],
                ].map(([t, d]) => (
                  <li key={t} className="rounded-xl border border-border/40 bg-card/40 px-3 py-2.5">
                    <strong className="text-foreground">{t}</strong>
                    <span className="text-muted-foreground"> — {d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      {accolades.length > 0 && (
        <section className="rounded-3xl border border-primary/25 glass p-6 md:p-8 space-y-4 shadow-arena-card">
          <h3 className="flex items-center gap-2 section-label text-primary">
            <Sparkles className="h-4 w-4" /> Trophy case
          </h3>
          <p className="text-xs text-muted-foreground">Placements from finalized tournaments.</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accolades.map((a) => {
              const meta = a.metadata && typeof a.metadata === "object" ? a.metadata : {};
              const opp = meta.final_opponent_team_id;
              return (
                <li
                  key={a.id}
                  className={`relative overflow-hidden rounded-2xl border p-4 space-y-1 ${
                    a.rank === 1
                      ? "border-amber-400/50 shadow-[0_0_24px_rgba(251,191,36,0.25)] bg-amber-500/10 trophy-shine-gold"
                      : a.rank === 2
                        ? "border-slate-300/40 bg-gradient-to-br from-slate-400/15 to-transparent"
                        : "border-border/60 bg-card/40"
                  }`}
                >
                  <p className="section-label" aria-hidden="true">
                    {a.rank === 1 ? "1st · gold" : a.rank === 2 ? "2nd · silver" : `${a.rank}th`}
                  </p>
                  <p className="font-display font-bold text-sm line-clamp-2 relative z-[1]">
                    {a.tournament_title || "Tournament"}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono relative z-[1]">Badge: {a.badge_id}</p>
                  {opp ? (
                    <p className="text-[10px] text-muted-foreground relative z-[1]">Finals opp: {String(opp)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-3 md:col-span-2">
          <h4 className="section-label flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" /> Discover &amp; compete
          </h4>
          <Link
            to="/tournaments"
            className="group flex items-center justify-between glass rounded-2xl border border-border/50 p-5 shadow-arena-card glass-hover"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center">
                <Compass className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-display font-bold tracking-tight">Tournament discovery</p>
                <p className="text-xs text-muted-foreground">Join events across tenants · paid entry when required</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          </Link>
          <Link
            to="/matches"
            className="group flex items-center justify-between glass rounded-2xl border border-border/50 p-5 shadow-arena-card glass-hover"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center">
                <Radio className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-display font-bold tracking-tight">All fixtures</p>
                <p className="text-xs text-muted-foreground">Open Match Lobby for check-in &amp; results</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          </Link>
          <Link
            to="/rankings"
            className="group flex items-center justify-between glass rounded-2xl border border-border/50 p-5 shadow-arena-card glass-hover"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center">
                <Flame className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-display font-bold tracking-tight">Power rankings</p>
                <p className="text-xs text-muted-foreground">Elo ladder &amp; prestige across the grid</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          </Link>
        </div>

        <div className="space-y-3">
          <h4 className="section-label flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Squads
          </h4>
          <div className="glass rounded-3xl border border-border/50 p-6 space-y-4 shadow-arena-card">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <p className="font-display font-bold tracking-tight">Teams</p>
              <Badge className="bg-emerald-500/15 text-[10px] text-emerald-400 border-0">Roster tools</Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Captains manage rosters and invites from Team Management.
            </p>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/dashboard/teams">Manage squads</Link>
            </Button>
            <Button variant="ghost" className="w-full justify-start text-muted-foreground" asChild>
              <Link to="/dashboard/settings">
                <Settings className="mr-2 h-4 w-4" />
                Hub settings
              </Link>
            </Button>
            <Button variant="ghost" className="w-full justify-start text-muted-foreground" asChild>
              <Link to="/players/profile">
                <Gamepad2 className="mr-2 h-4 w-4" />
                Gaming passport
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
