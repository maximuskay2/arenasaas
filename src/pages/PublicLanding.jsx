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
  BarChart3,
  Send,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { maxikay } from "@/api/maxikayClient";
import PublicSiteHeader from "@/components/layout/PublicSiteHeader";

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function PublicLanding() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
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
        from_name: "ArenaSaaS Support",
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
      q: "What games does ArenaSaaS support?",
      a: "We support any competitive game. Our platform is game-agnostic, allowing you to configure rosters, scoring modes, and maps for any title.",
    },
    {
      q: "Can I customize the tournament format?",
      a: "Yes. Single/double elimination, round-robin, Swiss—pick your format and our system auto-generates brackets.",
    },
    {
      q: "Is there a mobile app?",
      a: "Yes. The same React codebase compiles to iOS and Android. Players can check in, view schedules, and submit scores on mobile.",
    },
    {
      q: "How do payouts work?",
      a: "Organizers link their Stripe account. Prize pools are distributed automatically when a tournament ends.",
    },
    {
      q: "Can I white-label ArenaSaaS?",
      a: "Absolutely. Each organization gets a custom subdomain, logo, and branding colors. Players see only your brand.",
    },
  ];

  const features = [
    { icon: Zap, title: "Auto-Brackets", desc: "Seeding, advancement, and bracket generation done instantly." },
    { icon: Users, title: "Team Management", desc: "Invite players, assign roles, track rosters across tournaments." },
    { icon: Trophy, title: "Real-Time Scoring", desc: "Captains report scores, organizers approve. Disputes resolved instantly." },
    { icon: Smartphone, title: "Mobile App", desc: "Native iOS & Android with check-in, notifications, and live updates." },
    { icon: Shield, title: "Secure & Scalable", desc: "Bank-grade security with multi-tenant isolation and audit logs." },
    { icon: BarChart3, title: "Live Analytics", desc: "Visualize match stats, player KDA, and revenue trends in real-time." },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicSiteHeader />

      <main id="main-content">
        {/* Hero */}
        <section className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-16">
          <div className="pointer-events-none absolute inset-0 bg-gradient-surface" />
          <div className="absolute left-10 top-24 h-72 w-72 animate-pulse rounded-full bg-primary/10 blur-3xl motion-reduce:animate-none" />
          <div className="absolute bottom-24 right-10 h-72 w-72 animate-pulse rounded-full bg-accent/10 blur-3xl motion-reduce:animate-none" />

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.8 }}
            className="relative z-10 mx-auto max-w-4xl space-y-8 text-center"
          >
            <motion.h1
              className="font-display text-4xl font-black tracking-tight sm:text-6xl md:text-7xl"
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.15 }}
            >
              <span className="text-gradient-primary">Run Your</span>
              <br />
              Esports League
              <br />
              <span className="text-accent">In Minutes</span>
            </motion.h1>

            <motion.p
              className="mx-auto max-w-2xl text-base text-muted-foreground md:text-xl"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduceMotion ? 0 : 0.35 }}
            >
              ArenaSaaS is the   for tournament organizers. Auto-brackets, live scoring,
              team management, and payouts—without the headache.
            </motion.p>

            <motion.div
              className="relative z-20 flex flex-col justify-center gap-4 sm:flex-row sm:flex-wrap"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduceMotion ? 0 : 0.5 }}
            >
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="inline-flex h-12 min-h-[3rem] w-full items-center justify-center gap-2 rounded-md border-0 bg-accent px-8 text-base font-semibold text-accent-foreground shadow-[0_4px_28px_-6px_hsl(var(--accent)/0.55)] transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto sm:min-w-[220px]"
              >
                Start Your League <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
              </button>
              <Button
                size="lg"
                variant="outline"
                type="button"
                className="border-border/60 bg-background/50 backdrop-blur-sm"
                onClick={() => scrollToId("features")}
              >
                Watch demo
              </Button>
              <Button
                size="lg"
                variant="secondary"
                type="button"
                className="border-border/60 bg-background/70 backdrop-blur-sm"
                asChild
              >
                <Link to="/tournaments">Browse competitions</Link>
              </Button>
            </motion.div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => scrollToId("features")}
                className="mx-auto flex flex-col items-center gap-1 rounded-lg p-2 text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Scroll to features"
              >
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Explore</span>
                <motion.div
                  animate={reduceMotion ? {} : { y: [0, 6, 0] }}
                  transition={{ duration: 2, repeat: reduceMotion ? 0 : Infinity, ease: "easeInOut" }}
                >
                  <ChevronDown className="h-6 w-6" aria-hidden />
                </motion.div>
              </button>
            </div>
          </motion.div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
          <div className="mx-auto max-w-6xl space-y-12">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              className="space-y-2 text-center"
            >
              <h2 className="font-display text-3xl font-bold md:text-4xl">Powerful features</h2>
              <p className="text-muted-foreground">Everything you need to run professional tournaments</p>
            </motion.div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.05 }}
                  className="group space-y-3 rounded-xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm transition hover:border-primary/30 hover:shadow-md"
                >
                  <f.icon className="h-8 w-8 text-primary transition-transform group-hover:scale-105" aria-hidden />
                  <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing — subscription vs one-tournament (wired to /register?plan=) */}
        <section id="pricing" className="scroll-mt-20 border-y border-border/50 bg-secondary/20 px-4 py-20">
          <div className="mx-auto max-w-5xl space-y-10">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="space-y-4 text-center"
            >
              <h2 className="font-display text-3xl font-bold md:text-4xl">Choose how you host</h2>
              <p className="text-muted-foreground">
                Monthly subscription for recurring leagues, or a one-time payment for a single tournament. Prices follow your organizer wallet currency after signup.
              </p>
              <div
                className="inline-flex rounded-full border border-neutral-300/70 bg-neutral-200/70 p-1 shadow-inner dark:border-neutral-600 dark:bg-neutral-800/90"
                role="group"
                aria-label="Pricing currency"
              >
                <button
                  type="button"
                  onClick={() => setPricingCurrency("USD")}
                  className={`rounded-full px-4 py-1.5 text-xs font-display font-semibold transition ${
                    pricingCurrency === "USD"
                      ? "bg-green-600 text-white shadow-sm"
                      : "bg-white text-neutral-900 shadow-sm hover:bg-neutral-50 dark:bg-white dark:text-neutral-900"
                  }`}
                >
                  USD
                </button>
                <button
                  type="button"
                  onClick={() => setPricingCurrency("NGN")}
                  className={`rounded-full px-4 py-1.5 text-xs font-display font-semibold transition ${
                    pricingCurrency === "NGN"
                      ? "bg-green-600 text-white shadow-sm"
                      : "bg-white text-neutral-900 shadow-sm hover:bg-neutral-50 dark:bg-white dark:text-neutral-900"
                  }`}
                >
                  NGN
                </button>
              </div>
            </motion.div>
            <div className="grid gap-6 lg:grid-cols-3">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="flex flex-col space-y-5 rounded-2xl border border-border/50 bg-card/20 p-6"
              >
                <div>
                  <p className="mb-1 font-display text-xs uppercase tracking-widest text-muted-foreground">
                    One tournament
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-black">{oneShotDisplay}</span>
                    <span className="text-sm text-muted-foreground">once</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Single credit to create and run one full tournament. Ideal for one-off events.
                  </p>
                </div>
                <ul className="flex-1 space-y-2">
                  {[
                    "One tournament credit (decrements when you publish)",
                    "Full bracket tooling & public pages",
                    "White-label subdomain",
                    "Platform billing via Stripe / Paystack / Flutterwave when enabled",
                  ].map((f) => (
                    <li key={f} className="flex gap-2 text-sm">
                      <span className="shrink-0 text-primary" aria-hidden>
                        ✓
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => goRegisterWithPlan("one_shot")}
                  className="w-full border-border/80 bg-background/80 font-display text-xs tracking-wider text-foreground backdrop-blur-sm hover:bg-background"
                >
                  Register — one tournament
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.05 }}
                className="flex flex-col space-y-5 rounded-2xl border border-primary/50 bg-primary/5 p-6 shadow-lg shadow-primary/10 ring-1 ring-primary/20 lg:scale-[1.02]"
              >
                <div>
                  <p className="mb-1 font-display text-xs uppercase tracking-widest text-primary">
                    Monthly subscription
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-black">{monthlyDisplay}</span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Best for leagues that run events all season. Billed through platform checkout when configured.
                  </p>
                </div>
                <ul className="flex-1 space-y-2">
                  {[
                    "Unlimited tournaments while subscribed",
                    "All bracket formats & roster sizes your plan allows",
                    "Prize rails & entry fees (Stripe / Paystack / Flutterwave)",
                    "Analytics, sponsors, and organizer dashboard",
                  ].map((f) => (
                    <li key={f} className="flex gap-2 text-sm">
                      <span className="shrink-0 text-primary" aria-hidden>
                        ✓
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => goRegisterWithPlan("monthly")}
                  className="w-full border-2 border-border bg-foreground font-display text-xs font-semibold tracking-wider text-background shadow-md hover:bg-foreground/90 hover:text-background"
                >
                  Register — subscription
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="flex flex-col space-y-5 rounded-2xl border border-border/50 bg-card/20 p-6 lg:col-span-1"
              >
                <div>
                  <p className="mb-1 font-display text-xs uppercase tracking-widest text-muted-foreground">
                    Enterprise
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl font-black">Custom</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Custom domains, SLAs, and dedicated support for large organizers.
                  </p>
                </div>
                <ul className="flex-1 space-y-2">
                  {[
                    "Everything in subscription tier",
                    "Custom domain & branding packages",
                    "API access & multi-org roles",
                    "Dedicated support & SLA options",
                  ].map((f) => (
                    <li key={f} className="flex gap-2 text-sm">
                      <span className="shrink-0 text-primary" aria-hidden>
                        ✓
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => scrollToId("contact")}
                  className="w-full border-border/80 bg-background/80 font-display text-xs tracking-wider text-foreground backdrop-blur-sm hover:bg-background"
                >
                  Contact sales
                </Button>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="border-t border-border/50 px-4 py-20">
          <div className="mx-auto max-w-5xl space-y-10">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="space-y-2 text-center"
            >
              <h2 className="font-display text-3xl font-bold">Trusted by organizers</h2>
              <p className="text-muted-foreground">What league admins and players say about ArenaSaaS</p>
            </motion.div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  name: "Carlos M.",
                  role: "League Organizer · NA",
                  avatar: "CM",
                  text: "We ran our first 64-team Valorant tournament in a weekend. The bracket auto-generated, scores were reported by captains, and prize payouts went out the same night. Unbelievable.",
                  rating: 5,
                },
                {
                  name: "Priya S.",
                  role: "Esports Director · EU",
                  avatar: "PS",
                  text: "The white-labeling is flawless. Our players see our branding, our domain, our colors. Nobody even knows it's ArenaSaaS under the hood — which is exactly what we wanted.",
                  rating: 5,
                },
                {
                  name: "Jordan K.",
                  role: "Community Manager · LATAM",
                  avatar: "JK",
                  text: "Discord webhooks + live bracket sharing turned our small weekly cups into a real event. Player engagement went through the roof once spectators could follow matches live.",
                  rating: 5,
                },
              ].map((t) => (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="space-y-4 rounded-xl border border-border/40 bg-card/20 p-6"
                >
                  <div className="flex gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <span key={i} className="text-sm text-amber-400">
                        ★
                      </span>
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">&ldquo;{t.text}&rdquo;</p>
                  <div className="flex items-center gap-3 border-t border-border/30 pt-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/15 font-display text-xs font-bold text-primary">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 px-4 py-20">
          <div className="mx-auto max-w-3xl space-y-8">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="space-y-2 text-center"
            >
              <h2 className="font-display text-3xl font-bold">Frequently asked questions</h2>
              <p className="text-sm text-muted-foreground">Tap a question to expand the answer.</p>
            </motion.div>

            <div className="space-y-2">
              {faqs.map((faq, i) => {
                const open = expandedFaq === i;
                const panelId = `faq-answer-${i}`;
                return (
                  <motion.div
                    key={faq.q}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true, margin: "-20px" }}
                    className="overflow-hidden rounded-xl border border-border/40 bg-card/20"
                  >
                    <button
                      type="button"
                      id={`faq-trigger-${i}`}
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => setExpandedFaq(open ? -1 : i)}
                      className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="font-semibold">{faq.q}</span>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </button>
                    {open && (
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={`faq-trigger-${i}`}
                        className="border-t border-border/40 px-4 pb-4 pt-3 text-sm leading-relaxed text-muted-foreground"
                      >
                        {faq.a}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-20 border-t border-border/50 px-4 py-20">
          <div className="mx-auto max-w-2xl space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="space-y-2 text-center"
            >
              <h2 className="font-display text-3xl font-bold">Get in touch</h2>
              <p className="text-muted-foreground">Questions? We&apos;re here to help.</p>
            </motion.div>

            {contactForm.submitted ? (
              <div
                className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center"
                role="status"
              >
                <p className="font-semibold text-primary">Message sent</p>
                <p className="text-sm text-muted-foreground">We&apos;ll get back to you within 24 hours.</p>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleContactSubmit} noValidate>
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
                    className="min-h-[120px] resize-y"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  variant="default"
                  disabled={contactSending}
                  aria-busy={contactSending}
                  className="group relative z-10 h-12 w-full overflow-hidden rounded-xl border-2 border-white/20 bg-gradient-to-r from-accent via-primary to-accent bg-[length:200%_100%] font-display text-base font-bold tracking-wide text-white shadow-[0_0_0_1px_hsl(var(--accent)/0.35),0_8px_36px_-6px_hsl(var(--accent)/0.55),0_4px_20px_-4px_hsl(var(--primary)/0.4)] transition-[box-shadow,transform,background-position,filter] duration-300 hover:border-white/35 hover:bg-[position:100%_0] hover:brightness-110 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_12px_44px_-6px_hsl(var(--primary)/0.5),0_6px_24px_-4px_hsl(var(--accent)/0.35)] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 disabled:grayscale disabled:shadow-none [&_svg]:text-white"
                >
                  {contactSending ? (
                    <>
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 shrink-0 opacity-95 transition group-hover:translate-x-0.5" aria-hidden />
                      Send message
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-border/50 bg-secondary/20 px-4 py-10">
        <div className="mx-auto max-w-6xl space-y-6 text-center">
          <p className="text-sm text-muted-foreground">© 2026 ArenaSaaS. All rights reserved.</p>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs" aria-label="Footer">
            <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-muted-foreground hover:text-foreground">
              Terms of Service
            </Link>
            <a href="#contact" className="text-muted-foreground hover:text-foreground">
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
