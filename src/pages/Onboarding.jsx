import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  Gamepad2,
  Trophy,
  Users,
  Settings,
  Palette,
  Zap,
  BookOpen,
  Wallet,
  ListOrdered,
} from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import PageHeader from "@/components/shared/PageHeader";

const steps = [
  {
    id: "game_template",
    icon: Gamepad2,
    title: "Create a game template",
    desc: "Define a game (Valorant, CS2, etc.) with roster size and scoring mode.",
    cta: "Game templates",
    path: "/games",
  },
  {
    id: "tournament",
    icon: Trophy,
    title: "Create your first tournament",
    desc: "Set up format, team cap, prize pool, and dates.",
    cta: "Create tournament",
    path: "/tournaments/new",
  },
  {
    id: "team",
    icon: Users,
    title: "Register a team",
    desc: "Add at least one team so players can discover and join.",
    cta: "View teams",
    path: "/teams",
  },
  {
    id: "settings",
    icon: Settings,
    title: "Configure organization settings",
    desc: "Set Discord webhook, domain, and payment rails.",
    cta: "Open settings",
    path: "/settings",
  },
  {
    id: "branding",
    icon: Palette,
    title: "Customize branding",
    desc: "Upload a logo, pick brand colors, and set your display font.",
    cta: "Branding",
    path: "/settings",
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const [dismissed, setDismissed] = useState(() => {
    const d = localStorage.getItem("onboarding_dismissed");
    return d ? JSON.parse(d) : [];
  });

  const { data: gameTemplates = [] } = useQuery({
    queryKey: ["game-templates"],
    queryFn: () => maxikay.entities.GameTemplate.list("-created_date", 1),
  });

  const { data: tournaments = [] } = useQuery({
    queryKey: ["tournaments", tenantId],
    queryFn: () =>
      tenantId
        ? maxikay.entities.Tournament.filter({ tenant_id: tenantId }, "-created_date", 1)
        : maxikay.entities.Tournament.list("-created_date", 1),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams", tenantId],
    queryFn: () =>
      tenantId
        ? maxikay.entities.Team.filter({ tenant_id: tenantId }, "-created_date", 1)
        : maxikay.entities.Team.list("-created_date", 1),
  });

  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant-config", tenantId],
    queryFn: () =>
      tenantId ? maxikay.entities.TenantConfig.filter({ tenant_id: tenantId }).then((r) => r[0]) : null,
    enabled: !!tenantId,
  });

  const completed = {
    game_template: gameTemplates.length > 0,
    tournament: tournaments.length > 0,
    team: teams.length > 0,
    settings: !!tenantConfig?.discord_webhook_url || !!tenantConfig?.primary_color,
    branding: !!tenantConfig?.logo_url,
  };

  const allDone = Object.values(completed).every(Boolean);
  const completedCount = Object.values(completed).filter(Boolean).length;
  const pct = Math.round((completedCount / steps.length) * 100);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem("onboarding_dismissed", JSON.stringify(next));
  };

  const quickLinks = [
    { label: "Documentation / todos", path: "/dev-todos", icon: BookOpen },
    { label: "Manage tournaments", path: "/league/tournaments", icon: ListOrdered },
    { label: "Wallet & payouts", path: "/wallet", icon: Wallet },
    { label: "Settings", path: "/settings", icon: Settings },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 md:pb-8">
      <PageHeader
        eyebrow="Launch checklist"
        title={
          <>
            Getting <span className="text-gradient-primary">started</span>
          </>
        }
        subtitle="Complete these steps to launch your esports league on Arena Grid"
      />

      {/* Progress hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden glass rounded-3xl p-6 md:p-7 border border-border/50 shadow-arena space-y-4"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 ring-1 ring-primary/30 flex items-center justify-center shadow-arena-glow">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="section-label mb-0.5">Setup progress</p>
            <p className="font-display font-bold text-lg tracking-tight">
              {completedCount} of {steps.length} complete
              <span className="text-muted-foreground font-normal text-sm ml-2 tabular-nums">{pct}%</span>
            </p>
          </div>
        </div>

        <div className="relative h-2.5 rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>

        {allDone && (
          <div className="relative rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-sm text-emerald-400 font-semibold">
            All setup steps complete — your league is ready to go.
          </div>
        )}
      </motion.div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, i) => {
          const isDone = completed[step.id];
          const Icon = step.icon;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`glass rounded-2xl p-5 flex items-start gap-4 border transition-all shadow-arena-card ${
                isDone
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-border/50 hover:border-primary/35 glass-hover"
              }`}
            >
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  isDone
                    ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                    : "bg-primary/10 text-primary ring-1 ring-primary/25"
                }`}
              >
                {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5 opacity-60" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 shrink-0 ${isDone ? "text-emerald-400" : "text-primary"}`} />
                  <p
                    className={`text-sm font-semibold ${
                      isDone ? "line-through text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {step.title}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>

              {!isDone && (
                <Button size="sm" variant="arena" className="gap-1.5 shrink-0" onClick={() => navigate(step.path)}>
                  {step.cta} <ChevronRight className="w-3 h-3" />
                </Button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="glass rounded-3xl p-5 md:p-6 space-y-4 border border-border/50 shadow-arena-card">
        <h3 className="section-label">Quick links</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {quickLinks.map(({ label, path, icon: QIcon }) => (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className="flex items-center gap-3 text-left px-4 py-3 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all"
            >
              <QIcon className="w-4 h-4 text-primary shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
