import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Zap,
  Users,
  Trophy,
  Smartphone,
  Shield,
  ArrowRight,
  Send,
  Loader2,
  Swords,
  Radio,
  Wallet,
  Globe,
  Check,
  Sparkles,
  Layers,
  Flame,
  Building2,
  Gamepad2,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { maxikay } from "@/api/maxikayClient";
import PublicSiteHeader from "@/components/layout/PublicSiteHeader";
import DiscoveryTournamentCard from "@/components/discovery/DiscoveryTournamentCard";
import { useAuth } from "@/lib/AuthContext";
import { tournamentJoinReturnPath } from "@/lib/tournamentJoinIntent";

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Live match center preview — prefers registered live matches from API */
function HeroProductMock({ reduceMotion, match }) {
  const a = match?.team_a_name || "TBD";
  const b = match?.team_b_name || "TBD";
  const sa = match?.score_a ?? 0;
  const sb = match?.score_b ?? 0;
  const round = match?.round != null ? `Round ${match.round}` : "Live desk";
  const status = match?.status || "in_progress";
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: reduceMotion ? 0 : 0.45, duration: 0.7 }}
      className="relative mx-auto mt-12 w-full max-w-3xl"
    >
      <div className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-r from-primary/20 via-transparent to-accent/20 blur-2xl" />
      <div className="relative glass rounded-3xl border border-border/60 shadow-arena overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3 bg-card/40">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 text-[10px] font-display font-bold uppercase tracking-widest text-muted-foreground">
            arena.grid · live from DB
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-display font-bold uppercase text-red-400">
            <span className="live-dot" /> {String(status).replace(/_/g, " ")}
          </span>
        </div>
        <div className="grid md:grid-cols-5 gap-0">
          <div className="md:col-span-3 p-5 md:p-6 space-y-4 border-b md:border-b-0 md:border-r border-border/40">
            <div className="flex items-center justify-between">
              <p className="section-label text-primary">Match center</p>
              <span className="text-[10px] font-mono text-muted-foreground">{round}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="text-left min-w-0 flex-1">
                <p className="font-display font-bold text-sm md:text-base truncate">{a}</p>
                <p className="text-[10px] text-muted-foreground">Registered team</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-3xl md:text-4xl font-display font-bold text-primary tabular-nums">{sa}</span>
                <span className="text-[10px] font-display text-muted-foreground">VS</span>
                <span className="text-3xl md:text-4xl font-display font-bold text-primary tabular-nums">{sb}</span>
              </div>
              <div className="text-right min-w-0 flex-1">
                <p className="font-display font-bold text-sm md:text-base truncate">{b}</p>
                <p className="text-[10px] text-muted-foreground">Registered team</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {match?.id ? (
                <Link
                  to={`/matches/${match.id}/live`}
                  className="rounded-lg bg-primary/15 text-primary text-[10px] font-display font-bold uppercase px-2.5 py-1 ring-1 ring-primary/25 hover:bg-primary/25"
                >
                  Open watch desk
                </Link>
              ) : (
                <Link
                  to="/watch"
                  className="rounded-lg bg-primary/15 text-primary text-[10px] font-display font-bold uppercase px-2.5 py-1 ring-1 ring-primary/25"
                >
                  Watch hub
                </Link>
              )}
              <Link
                to="/tournaments"
                className="rounded-lg bg-secondary/60 text-muted-foreground text-[10px] font-display font-bold uppercase px-2.5 py-1 hover:text-foreground"
              >
                Discovery
              </Link>
            </div>
          </div>
          <div className="md:col-span-2 p-4 md:p-5 space-y-2 bg-card/30">
            <p className="section-label mb-2">Live board</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Scores and streams come from matches registered in the arena database — not mock placeholders.
            </p>
            <Button asChild size="sm" variant="outline" className="w-full mt-2">
              <Link to="/watch">See all live</Link>
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const GAMES = [
  "Valorant",
  "League of Legends",
  "CS2",
  "Dota 2",
  "Rocket League",
  "Apex Legends",
  "Fortnite",
  "Mobile Legends",
  "FIFA / EA FC",
  "Call of Duty",
];

export default function PublicLanding() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [expandedFaq, setExpandedFaq] = useState(-1);
  const [contactForm, setContactForm] = useState({ email: "", message: "", submitted: false });
  const [contactError, setContactError] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [pricingCurrency, setPricingCurrency] = useState("USD");

  const { data: publicPricing } = useQuery({
    queryKey: ["public-pricing"],
    queryFn: () => maxikay.public.pricing(),
    staleTime: 300_000,
    retry: 1,
  });

  const { data: discovery } = useQuery({
    queryKey: ["landing-discovery"],
    queryFn: () => maxikay.public.discoveryTournaments({ page: 1, limit: 6 }),
    staleTime: 60_000,
    retry: 1,
  });
  const featuredEvents = discovery?.items ?? [];

  const { data: dash } = useQuery({
    queryKey: ["landing-dashboard"],
    queryFn: () => maxikay.public.discoveryDashboard(),
    staleTime: 60_000,
    retry: 1,
  });

  const { data: liveRes } = useQuery({
    queryKey: ["landing-live"],
    queryFn: () => maxikay.public.liveMatches({ limit: 6 }),
    staleTime: 30_000,
    retry: 1,
  });
  const liveMatches = liveRes?.matches ?? liveRes?.items ?? (Array.isArray(liveRes) ? liveRes : []);

  const { data: ranksRes } = useQuery({
    queryKey: ["landing-rankings"],
    queryFn: () => maxikay.public.powerRankings({ limit: 8, kind: "team" }),
    staleTime: 60_000,
    retry: 1,
  });
  const rankings = ranksRes?.rankings ?? [];

  const { data: freeAgents = [] } = useQuery({
    queryKey: ["landing-free-agents"],
    queryFn: () => maxikay.entities.FreeAgent.list(),
    staleTime: 60_000,
    retry: 1,
  });
  const agentList = Array.isArray(freeAgents) ? freeAgents : freeAgents?.items ?? [];

  const { data: communityRes } = useQuery({
    queryKey: ["landing-community"],
    queryFn: () => maxikay.public.communityPosts({ limit: 6 }),
    staleTime: 60_000,
    retry: 1,
  });
  const communityPosts = communityRes?.posts ?? communityRes?.items ?? (Array.isArray(communityRes) ? communityRes : []);

  const monthlyDisplay =
    pricingCurrency === "NGN"
      ? `₦${Number(publicPricing?.saas_monthly_amount_ngn ?? 15000).toLocaleString()}`
      : `$${Number(publicPricing?.saas_monthly_amount_usd ?? 29).toLocaleString()}`;
  const oneShotDisplay =
    pricingCurrency === "NGN"
      ? `₦${Number(publicPricing?.saas_one_shot_amount_ngn ?? 45000).toLocaleString()}`
      : `$${Number(publicPricing?.saas_one_shot_amount_usd ?? 79).toLocaleString()}`;

  const goRegisterWithPlan = (plan) => {
    navigate(`/register?plan=${plan}&type=organizer`);
  };

  const handleJoinIntent = (t) => {
    if (!t?.id) return;
    if (isLoadingAuth) return;
    if (!isAuthenticated) {
      maxikay.auth.redirectToLogin(tournamentJoinReturnPath(t.id));
      return;
    }
    navigate(`/tournaments/${t.id}`);
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    setContactError("");
    if (!contactForm.email?.trim() || !contactForm.message?.trim()) {
      setContactError("Please fill in all fields");
      return;
    }
    setContactSending(true);
    try {
      await maxikay.integrations.Core.SendEmail({
        to: "support@arenasaas.com",
        from_name: "Arena Grid Support",
        subject: `New inquiry from ${contactForm.email}`,
        body: `Contact: ${contactForm.email}\n\nMessage:\n${contactForm.message}`,
      });
      setContactForm({ email: "", message: "", submitted: true });
      setTimeout(() => setContactForm((prev) => ({ ...prev, submitted: false })), 4000);
    } catch {
      setContactError("Failed to send message. Please try again.");
    } finally {
      setContactSending(false);
    }
  };

  const faqs = [
    {
      q: "What games does Arena Grid support?",
      a: "Any competitive title. Configure rosters, scoring modes, and maps per game — or use our taxonomy of platforms, genres, and titles.",
    },
    {
      q: "Can I customize the tournament format?",
      a: "Yes. Single/double elimination, round-robin, Swiss — pick a format and the system generates brackets with optimistic locking and forfeit workers.",
    },
    {
      q: "How do players join and get paid?",
      a: "Discover → join (solo or team), pay entry via Stripe / Paystack / Flutterwave or wallet, then compete. Prize payouts credit player vaults with ledger idempotency.",
    },
    {
      q: "Is multi-tenant white-label included?",
      a: "Each organization gets branding, optional custom domain, and RLS isolation so tenants never see each other’s data.",
    },
    {
      q: "Who is Central Station for?",
      a: "Platform operators. Super admins run league command posts; platform admins run Central Station for global pulse, bans, and commission.",
    },
  ];

  const features = [
    { icon: Layers, title: "Multi-tenant OS", desc: "Leagues on subdomains with RLS isolation, branding, and entitlements." },
    { icon: Zap, title: "Auto-brackets", desc: "Seeding, advancement, and formats — engine-owned, UI-thin clients." },
    { icon: Swords, title: "Live match center", desc: "Check-in, scores, disputes, streams, and kill-feed style event logs." },
    { icon: Wallet, title: "Money rails", desc: "Entry fees, wallets, prize jobs, and Stripe / Paystack / Flutterwave." },
    { icon: Flame, title: "Prestige & ranks", desc: "Elo power rankings, accolades, and career hub across orgs." },
    { icon: Globe, title: "Discovery marketplace", desc: "Global catalog, filters, live slots, and one-click join." },
    { icon: Shield, title: "Security first", desc: "MFA, HWID bans, audit logs, rate limits, and Central Station controls." },
    { icon: Radio, title: "Realtime", desc: "Socket rooms for brackets, lobbies, community feed, and live watch." },
    { icon: Smartphone, title: "Player hub", desc: "Career home: matches, teams, vault, check-in, and game passport." },
  ];

  const pillars = [
    { step: "01", title: "Host", body: "Create orgs, brand your league, set payout rails, publish tournaments." },
    { step: "02", title: "Compete", body: "Players discover, join, check in, report scores, and climb rankings." },
    { step: "03", title: "Settle", body: "Finalize events, run prize jobs, credit vaults, withdraw with fees." },
  ];

  const audiences = [
    {
      icon: Building2,
      title: "Organizers",
      tag: "Command Center",
      body: "Launch leagues, manage brackets, live ops, sponsors, and vaults — without spreadsheet chaos.",
      cta: "Start your league",
      action: () => navigate("/register?type=organizer"),
    },
    {
      icon: Gamepad2,
      title: "Players",
      tag: "Career hub",
      body: "One identity across every org. Discover cups, check in, climb Elo, collect trophies, cash out.",
      cta: "Browse competitions",
      action: () => navigate("/tournaments"),
    },
    {
      icon: Crown,
      title: "Platform ops",
      tag: "Central Station",
      body: "Global pulse, tenant approvals, commissions, bans, and system health for the whole grid.",
      cta: "See how it works",
      action: () => scrollToId("how"),
    },
  ];

  // Live platform stats from registered data (fallback only if API empty)
  const stats = [
    {
      label: "Open cups",
      value: String(dash?.stats?.open_tournaments ?? dash?.open_tournaments ?? featuredEvents.length ?? "—"),
    },
    {
      label: "Live matches",
      value: String(dash?.stats?.live_matches ?? liveMatches.length ?? "—"),
    },
    {
      label: "Free agents",
      value: String(agentList.filter((a) => a.is_active !== false).length || "—"),
    },
    {
      label: "Ranked teams",
      value: String(rankings.length || "—"),
    },
  ];

  const resources = [
    {
      title: "Career hub",
      desc: "Matches, teams, vault, check-in, and game passport for registered players.",
      to: isAuthenticated ? "/dashboard" : "/login",
      cta: isAuthenticated ? "Open hub" : "Sign in",
    },
    {
      title: "Free agent market",
      desc: `${agentList.length} listings from registered competitors looking for rosters.`,
      to: "/free-agents",
      cta: "Browse agents",
    },
    {
      title: "Community war room",
      desc: `${communityPosts.length} live posts — announcements, recruitment, and strategy.`,
      to: "/community",
      cta: "Join conversation",
    },
    {
      title: "Watch live",
      desc: `${liveMatches.length} match(es) on-air with multi-stream embeds.`,
      to: "/watch",
      cta: "Watch now",
    },
    {
      title: "Power rankings",
      desc: "Elo ladder from completed and active competitive results.",
      to: "/rankings",
      cta: "View ladder",
    },
    {
      title: "Privacy & terms",
      desc: "How we handle account, tournament, and payment data.",
      to: "/privacy",
      cta: "Read policy",
    },
  ];

  return (
    <div className="min-h-screen arena-stage flex flex-col">
      <div className="arena-content flex flex-col min-h-screen w-full">
        <PublicSiteHeader />

        <main id="main-content" className="flex-1">
          {/* ─── HERO ─── */}
          <section className="relative overflow-hidden px-4 pt-12 pb-16 md:pt-16 md:pb-24">
            <div className="pointer-events-none absolute inset-0 bg-gradient-hero" />
            <div className="absolute left-[8%] top-20 h-72 w-72 animate-pulse rounded-full bg-primary/15 blur-3xl motion-reduce:animate-none" />
            <div className="absolute right-[5%] bottom-10 h-80 w-80 animate-pulse rounded-full bg-accent/12 blur-3xl motion-reduce:animate-none" />
            <div
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "linear-gradient(hsl(var(--border) / 0.45) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.45) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
                maskImage: "radial-gradient(ellipse 70% 55% at 50% 35%, black, transparent)",
              }}
            />

            <div className="relative z-10 mx-auto max-w-6xl">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto max-w-4xl space-y-7 text-center"
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-[11px] font-display font-bold uppercase tracking-widest text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Arena Grid · World-class esports OS
                </div>
                <h1 className="font-display text-4xl font-bold tracking-tight sm:text-6xl md:text-7xl leading-[1.05]">
                  <span className="text-gradient-primary">One platform.</span>
                  <br />
                  Infinite leagues.
                  <br />
                  <span className="text-foreground/90">Zero spreadsheet chaos.</span>
                </h1>
                <p className="mx-auto max-w-2xl text-base md:text-lg text-muted-foreground leading-relaxed">
                  Host multi-tenant tournaments, run live match centers, settle prizes, and give players a career hub —
                  the same stack powering discovery, wallets, and Central Station.
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3">
                  <Button size="xl" variant="arena" type="button" onClick={() => navigate("/register")} className="sm:min-w-[200px]">
                    Start your league <ArrowRight className="h-5 w-5" />
                  </Button>
                  <Button size="xl" variant="outline" type="button" asChild>
                    <Link to="/tournaments">Browse competitions</Link>
                  </Button>
                  <Button size="xl" variant="secondary" type="button" onClick={() => scrollToId("audiences")}>
                    Who it&apos;s for
                  </Button>
                </div>
              </motion.div>

              <HeroProductMock reduceMotion={reduceMotion} match={liveMatches[0]} />

              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : 0.65 }}
                className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto"
              >
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="glass rounded-2xl border border-border/50 px-4 py-3 text-center shadow-arena-card"
                  >
                    <p className="font-display font-bold text-xl md:text-2xl text-primary tabular-nums">{s.value}</p>
                    <p className="section-label mt-1 !tracking-wider">{s.label}</p>
                  </div>
                ))}
              </motion.div>
            </div>
          </section>

          {/* ─── GAMES MARQUEE ─── */}
          <section className="border-t border-border/50 py-6 overflow-hidden bg-secondary/10" aria-label="Supported games">
            <div className="flex w-max gap-3 animate-[arenaTickerMarquee_40s_linear_infinite] motion-reduce:animate-none px-4">
              {[...GAMES, ...GAMES].map((g, i) => (
                <span
                  key={`${g}-${i}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border/50 glass px-4 py-1.5 text-xs font-display font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                >
                  <Gamepad2 className="h-3.5 w-3.5 text-primary" />
                  {g}
                </span>
              ))}
            </div>
          </section>

          {/* ─── AUDIENCES ─── */}
          <section id="audiences" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
            <div className="mx-auto max-w-6xl space-y-12">
              <div className="text-center space-y-3">
                <p className="section-label text-primary">Built for everyone on the grid</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                  Three homes. One OS.
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  Organizers run Command Center. Players live in the career hub. Platform ops own Central Station.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-5">
                {audiences.map((a, i) => (
                  <motion.div
                    key={a.title}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="glass rounded-3xl border border-border/50 p-6 md:p-7 shadow-arena-card glass-hover flex flex-col"
                  >
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25 text-primary">
                      <a.icon className="h-6 w-6" />
                    </div>
                    <p className="section-label text-primary mb-1">{a.tag}</p>
                    <h3 className="font-display text-xl font-bold tracking-tight mb-2">{a.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-5">{a.body}</p>
                    <Button variant={i === 0 ? "arena" : "outline"} className="w-full" onClick={a.action}>
                      {a.cta} <ArrowRight className="h-4 w-4" />
                    </Button>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* ─── HOW IT WORKS ─── */}
          <section id="how" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
            <div className="mx-auto max-w-6xl space-y-12">
              <div className="text-center space-y-3">
                <p className="section-label text-primary justify-center">Playbook</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                  Host. Compete. Settle.
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  End-to-end competition — from discovery to prize vault — in three moves.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-5">
                {pillars.map((p, i) => (
                  <motion.div
                    key={p.step}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="glass rounded-3xl border border-border/50 p-6 md:p-7 shadow-arena-card relative overflow-hidden"
                  >
                    <span className="font-display text-5xl font-bold text-primary/15 absolute right-4 top-2">
                      {p.step}
                    </span>
                    <p className="section-label text-primary mb-2">Step {p.step}</p>
                    <h3 className="font-display text-xl font-bold tracking-tight mb-2">{p.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* ─── FEATURES ─── */}
          <section id="features" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
            <div className="mx-auto max-w-6xl space-y-12">
              <div className="text-center space-y-3">
                <p className="section-label text-primary">Platform</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                  Everything a world-class arena needs
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Designed for organizers, players, and platform operators — not bolted-on tools.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {features.map((f, i) => (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ delay: i * 0.04 }}
                    className="group glass rounded-3xl border border-border/50 p-6 shadow-arena-card glass-hover"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25 text-primary group-hover:shadow-arena-glow transition-shadow">
                      <f.icon className="h-5 w-5" aria-hidden />
                    </div>
                    <h3 className="font-display text-base font-bold tracking-tight mb-1.5">{f.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* ─── LIVE MARKETPLACE ─── */}
          <section id="marketplace" className="scroll-mt-20 border-t border-border/50 px-4 py-20 bg-secondary/10">
            <div className="mx-auto max-w-6xl space-y-10">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2">
                  <p className="section-label text-primary flex items-center gap-2">
                    <span className="live-dot" /> Marketplace
                  </p>
                  <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                    Compete tonight
                  </h2>
                  <p className="text-muted-foreground max-w-lg">
                    Live discovery from the public catalog — join as a player or host your own.
                  </p>
                </div>
                <Button asChild variant="arena">
                  <Link to="/tournaments">
                    Open discovery <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              {featuredEvents.length === 0 ? (
                <div className="glass rounded-3xl border border-border/50 p-10 text-center text-muted-foreground text-sm">
                  No open tournaments right now — be the first to{" "}
                  <button type="button" className="text-primary font-semibold hover:underline" onClick={() => navigate("/register")}>
                    host one
                  </button>
                  .
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {featuredEvents.slice(0, 6).map((t, i) => (
                    <DiscoveryTournamentCard
                      key={t.id}
                      tournament={t}
                      featured={i === 0 && (t.prize_pool || 0) > 0}
                      onJoin={handleJoinIntent}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ─── WATCH LIVE ─── */}
          <section id="watch" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
            <div className="mx-auto max-w-6xl space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2">
                  <p className="section-label text-primary flex items-center gap-2">
                    <span className="live-dot" /> Watch live
                  </p>
                  <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">On-air right now</h2>
                  <p className="text-muted-foreground max-w-lg text-sm">
                    Matches with status <code className="text-primary/90">in_progress</code> from registered leagues.
                  </p>
                </div>
                <Button asChild variant="arena">
                  <Link to="/watch">
                    Open watch hub <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              {liveMatches.length === 0 ? (
                <div className="glass rounded-3xl border border-border/50 p-8 text-center text-sm text-muted-foreground">
                  No live matches yet — when organizers start brackets, they appear here automatically.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveMatches.slice(0, 6).map((m) => (
                    <Link
                      key={m.id}
                      to={`/matches/${m.id}/live`}
                      className="glass rounded-2xl border border-border/50 p-5 hover:border-primary/40 transition-colors shadow-arena-card"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="live-dot" />
                        <span className="text-[10px] font-display font-bold uppercase text-red-400">Live</span>
                      </div>
                      <p className="font-display font-bold text-sm">
                        {m.team_a_name || "TBD"} <span className="text-muted-foreground font-normal">vs</span>{" "}
                        {m.team_b_name || "TBD"}
                      </p>
                      <p className="text-primary font-display font-bold tabular-nums mt-1">
                        {m.score_a ?? 0} – {m.score_b ?? 0}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-2 truncate">
                        {m.tournament_name || m.tournament_id || "Tournament"}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ─── RANKINGS ─── */}
          <section id="rankings" className="scroll-mt-20 border-t border-border/50 px-4 py-20 bg-secondary/10">
            <div className="mx-auto max-w-6xl space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2">
                  <p className="section-label text-primary">Power rankings</p>
                  <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Prestige ladder</h2>
                  <p className="text-muted-foreground text-sm max-w-lg">
                    Elo entities linked to registered teams and solo players — not invented names.
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link to="/rankings">Full ladder</Link>
                </Button>
              </div>
              {rankings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Rankings appear after teams compete and Elo is applied.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border/50 glass">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="p-3">#</th>
                        <th className="p-3">Team</th>
                        <th className="p-3">Elo</th>
                        <th className="p-3">Record</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankings.slice(0, 8).map((r) => (
                        <tr key={r.id} className="border-b border-border/30 hover:bg-secondary/20">
                          <td className="p-3 tabular-nums text-muted-foreground">{r.global_rank}</td>
                          <td className="p-3 font-semibold">
                            {r.display_name}{" "}
                            <span className="text-muted-foreground text-xs">[{r.tag}]</span>
                            {r.apex_tier ? (
                              <span className="ml-2 text-[10px] text-primary font-display uppercase">Apex</span>
                            ) : null}
                          </td>
                          <td className="p-3 font-display font-bold text-primary tabular-nums">
                            {Math.round(Number(r.elo) || 0)}
                          </td>
                          <td className="p-3 text-muted-foreground tabular-nums">
                            {r.wins}W – {r.losses}L
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* ─── FREE AGENTS ─── */}
          <section id="free-agents" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
            <div className="mx-auto max-w-6xl space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2">
                  <p className="section-label text-primary">Free agent market</p>
                  <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                    Registered competitors
                  </h2>
                  <p className="text-muted-foreground text-sm max-w-lg">
                    Listings use real account emails and profiles from signed-up players.
                  </p>
                </div>
                <Button asChild variant="arena">
                  <Link to="/free-agents">Open market</Link>
                </Button>
              </div>
              {agentList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No free agents yet — register and list yourself on the free agent board.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agentList.slice(0, 6).map((a) => (
                    <div
                      key={a.id || a.player_email}
                      className="glass rounded-2xl border border-border/50 p-5 space-y-2 shadow-arena-card"
                    >
                      <p className="font-display font-bold text-sm">{a.display_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{a.player_email}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {a.region ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary">{a.region}</span>
                        ) : null}
                        {a.rank ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            {a.rank}
                          </span>
                        ) : null}
                      </div>
                      {Array.isArray(a.preferred_games) && a.preferred_games.length > 0 ? (
                        <p className="text-[11px] text-muted-foreground">{a.preferred_games.join(" · ")}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ─── COMMUNITY ─── */}
          <section id="community" className="scroll-mt-20 border-t border-border/50 px-4 py-20 bg-secondary/10">
            <div className="mx-auto max-w-6xl space-y-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2">
                  <p className="section-label text-primary">Community</p>
                  <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">War room</h2>
                  <p className="text-muted-foreground text-sm max-w-lg">
                    Posts authored by registered user accounts on this platform.
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link to="/community">Open community</Link>
                </Button>
              </div>
              {communityPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No community posts yet.</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {communityPosts.slice(0, 4).map((p) => (
                    <div
                      key={p.id}
                      className="glass rounded-2xl border border-border/50 p-5 space-y-2 shadow-arena-card"
                    >
                      <div className="flex items-center gap-2">
                        {p.pinned ? (
                          <span className="text-[10px] font-display uppercase text-primary">Pinned</span>
                        ) : null}
                        <span className="text-[10px] uppercase text-muted-foreground">{p.post_type || "post"}</span>
                      </div>
                      <p className="font-display font-bold text-sm">{p.title || "Update"}</p>
                      <p className="text-xs text-muted-foreground line-clamp-3">{p.content || p.body}</p>
                      <p className="text-[11px] text-primary/80">
                        {p.author_email || p.author_name || p.author_display_name || "Member"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ─── RESOURCES ─── */}
          <section id="resources" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
            <div className="mx-auto max-w-6xl space-y-10">
              <div className="text-center space-y-3">
                <p className="section-label text-primary">Resources</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                  Everything players & hosts need
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
                  Career hub, markets, and policy — all wired to live registered data.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {resources.map((r) => (
                  <Link
                    key={r.title}
                    to={r.to}
                    className="group glass rounded-3xl border border-border/50 p-6 shadow-arena-card hover:border-primary/40 transition-colors"
                  >
                    <h3 className="font-display font-bold text-base mb-2 group-hover:text-primary transition-colors">
                      {r.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">{r.desc}</p>
                    <span className="text-xs font-display font-bold uppercase tracking-wider text-primary inline-flex items-center gap-1">
                      {r.cta} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* ─── PRICING ─── */}
          <section id="pricing" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
            <div className="mx-auto max-w-5xl space-y-10">
              <div className="space-y-4 text-center">
                <p className="section-label text-primary">Pricing</p>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Choose how you host</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  Monthly for recurring leagues, or one-shot for a single event. Wallet currency after signup.
                </p>
                <div
                  className="inline-flex rounded-full border border-border/60 glass p-1"
                  role="group"
                  aria-label="Pricing currency"
                >
                  {["USD", "NGN"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPricingCurrency(c)}
                      className={`rounded-full px-4 py-1.5 text-xs font-display font-bold transition ${
                        pricingCurrency === c
                          ? "bg-primary text-primary-foreground shadow-arena-glow"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="flex flex-col space-y-5 glass rounded-3xl border border-border/50 p-6 shadow-arena-card">
                  <div>
                    <p className="section-label mb-2">One tournament</p>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-bold">{oneShotDisplay}</span>
                      <span className="text-sm text-muted-foreground">once</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Single credit for one full event.</p>
                  </div>
                  <ul className="flex-1 space-y-2">
                    {["One publish credit", "Full brackets & public pages", "White-label subdomain", "Platform checkout when enabled"].map(
                      (f) => (
                        <li key={f} className="flex gap-2 text-sm">
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                          <span>{f}</span>
                        </li>
                      )
                    )}
                  </ul>
                  <Button size="lg" variant="outline" onClick={() => goRegisterWithPlan("one_shot")} className="w-full">
                    Register — one tournament
                  </Button>
                </div>

                <div className="flex flex-col space-y-5 glass rounded-3xl border border-primary/40 p-6 shadow-arena-glow ring-1 ring-primary/20 lg:scale-[1.02]">
                  <div>
                    <p className="section-label text-primary mb-2">Monthly</p>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-bold text-gradient-primary">{monthlyDisplay}</span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Unlimited events while subscribed.</p>
                  </div>
                  <ul className="flex-1 space-y-2">
                    {[
                      "Unlimited tournaments while active",
                      "All formats & prize rails",
                      "Analytics & sponsors",
                      "Organizer command center",
                    ].map((f) => (
                      <li key={f} className="flex gap-2 text-sm">
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button size="lg" variant="arena" onClick={() => goRegisterWithPlan("monthly")} className="w-full">
                    Register — subscription
                  </Button>
                </div>

                <div className="flex flex-col space-y-5 glass rounded-3xl border border-border/50 p-6 shadow-arena-card">
                  <div>
                    <p className="section-label mb-2">Enterprise</p>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-bold">Custom</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Domains, SLAs, multi-org roles.</p>
                  </div>
                  <ul className="flex-1 space-y-2">
                    {["Everything in monthly", "Custom domain packages", "API & multi-org roles", "Dedicated support"].map(
                      (f) => (
                        <li key={f} className="flex gap-2 text-sm">
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                          <span>{f}</span>
                        </li>
                      )
                    )}
                  </ul>
                  <Button size="lg" variant="outline" onClick={() => scrollToId("contact")} className="w-full">
                    Contact sales
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* ─── SOCIAL PROOF ─── */}
          <section className="border-t border-border/50 px-4 py-20">
            <div className="mx-auto max-w-5xl space-y-10">
              <div className="text-center space-y-2">
                <p className="section-label text-primary">Proof</p>
                <h2 className="font-display text-3xl font-bold tracking-tight">Trusted by organizers</h2>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                {[
                  {
                    name: "Carlos M.",
                    role: "League Organizer · NA",
                    avatar: "CM",
                    text: "64-team Valorant cup in a weekend. Bracket auto-generated, captains reported scores, prizes same night.",
                  },
                  {
                    name: "Priya S.",
                    role: "Esports Director · EU",
                    avatar: "PS",
                    text: "White-label is flawless. Players only see our brand, domain, and colors.",
                  },
                  {
                    name: "Jordan K.",
                    role: "Community Manager · LATAM",
                    avatar: "JK",
                    text: "Live bracket + lobby chat turned weekly cups into a real event.",
                  },
                ].map((t) => (
                  <div
                    key={t.name}
                    className="glass rounded-3xl border border-border/50 p-6 space-y-4 shadow-arena-card"
                  >
                    <div className="flex gap-0.5 text-amber-400" aria-label="5 stars">
                      {"★★★★★".split("").map((s, i) => (
                        <span key={i}>{s}</span>
                      ))}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">&ldquo;{t.text}&rdquo;</p>
                    <div className="flex items-center gap-3 border-t border-border/40 pt-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/15 font-display text-xs font-bold text-primary">
                        {t.avatar}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t.name}</p>
                        <p className="text-[11px] text-muted-foreground">{t.role}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ─── FAQ ─── */}
          <section id="faq" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
            <div className="mx-auto max-w-3xl space-y-8">
              <div className="text-center space-y-2">
                <p className="section-label text-primary">FAQ</p>
                <h2 className="font-display text-3xl font-bold tracking-tight">Questions, answered</h2>
              </div>
              <div className="space-y-2">
                {faqs.map((faq, i) => {
                  const open = expandedFaq === i;
                  const panelId = `faq-answer-${i}`;
                  return (
                    <div
                      key={faq.q}
                      className="overflow-hidden rounded-2xl glass border border-border/50 shadow-arena-card"
                    >
                      <button
                        type="button"
                        id={`faq-trigger-${i}`}
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => setExpandedFaq(open ? -1 : i)}
                        className="flex w-full items-center justify-between gap-4 p-4 md:p-5 text-left transition-colors hover:bg-primary/5"
                      >
                        <span className="font-semibold text-sm md:text-base">{faq.q}</span>
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 text-primary transition-transform ${open ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </button>
                      {open && (
                        <div
                          id={panelId}
                          role="region"
                          aria-labelledby={`faq-trigger-${i}`}
                          className="border-t border-border/40 px-4 md:px-5 pb-4 pt-3 text-sm leading-relaxed text-muted-foreground"
                        >
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ─── CONTACT ─── */}
          <section id="contact" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
            <div className="mx-auto max-w-xl space-y-6">
              <div className="text-center space-y-2">
                <p className="section-label text-primary">Contact</p>
                <h2 className="font-display text-3xl font-bold tracking-tight">Get in touch</h2>
                <p className="text-muted-foreground text-sm">Enterprise, partnerships, or support — we reply fast.</p>
              </div>

              {contactForm.submitted ? (
                <div className="glass rounded-3xl border border-primary/30 p-8 text-center space-y-2" role="status">
                  <p className="font-display font-bold text-primary">Message sent</p>
                  <p className="text-sm text-muted-foreground">We&apos;ll get back to you within 24 hours.</p>
                </div>
              ) : (
                <form className="glass rounded-3xl border border-border/50 p-6 md:p-8 space-y-4 shadow-arena" onSubmit={handleContactSubmit} noValidate>
                  {contactError ? <p className="text-sm text-destructive">{contactError}</p> : null}
                  <div className="space-y-2">
                    <Label htmlFor="contact-email">Email</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      className="bg-background/40 border-border/60 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-message">Message</Label>
                    <Textarea
                      id="contact-message"
                      name="message"
                      placeholder="How can we help?"
                      rows={5}
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      className="min-h-[120px] resize-y bg-background/40 border-border/60 rounded-xl"
                    />
                  </div>
                  <Button type="submit" size="lg" variant="arena" disabled={contactSending} className="w-full" aria-busy={contactSending}>
                    {contactSending ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" /> Sending…
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5" /> Send message
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </section>

          {/* CTA band */}
          <section className="border-t border-border/50 px-4 py-16">
            <div className="mx-auto max-w-4xl relative overflow-hidden glass rounded-3xl border border-primary/30 p-8 md:p-12 text-center shadow-arena-glow">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/25 blur-3xl" />
              <div className="pointer-events-none absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
              <div className="relative space-y-4">
                <h2 className="font-display text-2xl md:text-4xl font-bold tracking-tight">
                  Ready to run the arena?
                </h2>
                <p className="text-muted-foreground max-w-lg mx-auto text-sm md:text-base">
                  Spin up a league in minutes. Players join the same night.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button size="xl" variant="arena" onClick={() => navigate("/register")}>
                    Create free account <ArrowRight className="h-5 w-5" />
                  </Button>
                  <Button size="xl" variant="outline" asChild>
                    <Link to="/login">Sign in</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="mt-auto border-t border-border/50 bg-background/60 backdrop-blur-md px-4 py-12">
          <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/40 to-accent/30 ring-1 ring-primary/35 flex items-center justify-center font-display text-sm font-bold text-primary">
                A
              </div>
              <div>
                <p className="font-display text-sm font-bold tracking-[0.16em]">ARENA GRID</p>
                <p className="text-[10px] text-muted-foreground">Esports operating system</p>
              </div>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs" aria-label="Footer">
              <Link to="/tournaments" className="text-muted-foreground hover:text-foreground">
                Discover
              </Link>
              <Link to="/rankings" className="text-muted-foreground hover:text-foreground">
                Rankings
              </Link>
              <Link to="/free-agents" className="text-muted-foreground hover:text-foreground">
                Free agents
              </Link>
              <Link to="/community" className="text-muted-foreground hover:text-foreground">
                Community
              </Link>
              <Link to="/watch" className="text-muted-foreground hover:text-foreground">
                Watch
              </Link>
              <a href="#features" className="text-muted-foreground hover:text-foreground">
                Features
              </a>
              <a href="#pricing" className="text-muted-foreground hover:text-foreground">
                Pricing
              </a>
              <a href="#resources" className="text-muted-foreground hover:text-foreground">
                Resources
              </a>
              <a href="#faq" className="text-muted-foreground hover:text-foreground">
                FAQ
              </a>
              <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
                Privacy
              </Link>
              <Link to="/terms" className="text-muted-foreground hover:text-foreground">
                Terms
              </Link>
              <a href="#contact" className="text-muted-foreground hover:text-foreground">
                Contact
              </a>
            </nav>
            <p className="text-xs text-muted-foreground">© 2026 Arena Grid</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
