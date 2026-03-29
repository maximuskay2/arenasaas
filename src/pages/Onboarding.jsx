import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, ChevronRight, Gamepad2, Trophy, Users, Settings, Palette, Zap } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";

const steps = [
  {
    id: "game_template",
    icon: Gamepad2,
    title: "Create a Game Template",
    desc: "Define a game (Valorant, CS2, etc.) with roster size and scoring mode.",
    cta: "Go to Game Templates",
    path: "/games",
  },
  {
    id: "tournament",
    icon: Trophy,
    title: "Create Your First Tournament",
    desc: "Set up a tournament with format, teams cap, prize pool and dates.",
    cta: "Create Tournament",
    path: "/tournaments/new",
  },
  {
    id: "team",
    icon: Users,
    title: "Register a Team",
    desc: "Add at least one team so players can discover and join.",
    cta: "View Teams",
    path: "/teams",
  },
  {
    id: "settings",
    icon: Settings,
    title: "Configure Organization Settings",
    desc: "Set your Discord webhook, region, and payment provider.",
    cta: "Open Settings",
    path: "/settings",
  },
  {
    id: "branding",
    icon: Palette,
    title: "Customize Your Branding",
    desc: "Upload a logo, pick brand colors, and set your display font.",
    cta: "Branding Settings",
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
    queryFn: () => tenantId
      ? maxikay.entities.Tournament.filter({ tenant_id: tenantId }, "-created_date", 1)
      : maxikay.entities.Tournament.list("-created_date", 1),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams", tenantId],
    queryFn: () => tenantId
      ? maxikay.entities.Team.filter({ tenant_id: tenantId }, "-created_date", 1)
      : maxikay.entities.Team.list("-created_date", 1),
  });

  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant-config", tenantId],
    queryFn: () => tenantId
      ? maxikay.entities.TenantConfig.filter({ tenant_id: tenantId }).then((r) => r[0])
      : null,
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

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem("onboarding_dismissed", JSON.stringify(next));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="glass rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl">Getting Started</h1>
            <p className="text-xs text-muted-foreground">Complete these steps to launch your esports league</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{completedCount} of {steps.length} completed</span>
            <span>{Math.round((completedCount / steps.length) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / steps.length) * 100}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        </div>

        {allDone && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center text-sm text-green-400 font-semibold">
            🎉 All setup steps complete! Your league is ready to go.
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, i) => {
          const isDone = completed[step.id];
          const isDismissed = dismissed.includes(step.id) && !isDone;
          const Icon = step.icon;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`glass rounded-xl p-5 flex items-start gap-4 border transition-colors ${
                isDone
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-border/30 hover:border-primary/30"
              }`}
            >
              {/* Status icon */}
              <div className={`mt-0.5 flex-shrink-0 ${isDone ? "text-green-400" : "text-muted-foreground"}`}>
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Icon className={`w-4 h-4 ${isDone ? "text-green-400" : "text-primary"}`} />
                  <p className={`text-sm font-semibold ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {step.title}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </div>

              {/* Action */}
              {!isDone && (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs shrink-0 font-display"
                  onClick={() => navigate(step.path)}
                >
                  {step.cta} <ChevronRight className="w-3 h-3" />
                </Button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="glass rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Quick Links</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "📖 View Documentation", path: "/dev-todos" },
            { label: "🏆 Manage Tournaments", path: "/league/tournaments" },
            { label: "💰 Wallet & Payouts", path: "/wallet" },
            { label: "⚙️ Settings", path: "/settings" },
          ].map(({ label, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="text-left px-3 py-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}