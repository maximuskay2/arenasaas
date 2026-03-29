import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useAuth } from "@/lib/AuthContext";
import { ExternalLink } from "lucide-react";

const SPONSOR_CLICKS_KEY = "arena_sponsor_clicks_v1";

function trackSponsorClick(sponsorId, tournamentId) {
  try {
    const raw = localStorage.getItem(SPONSOR_CLICKS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    const sid = String(sponsorId);
    o[sid] = (Number(o[sid]) || 0) + 1;
    if (tournamentId) {
      o._by_tournament = o._by_tournament && typeof o._by_tournament === "object" ? o._by_tournament : {};
      const tid = String(tournamentId);
      o._by_tournament[tid] = (Number(o._by_tournament[tid]) || 0) + 1;
    }
    localStorage.setItem(SPONSOR_CLICKS_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

const TIER_CONFIG = {
  title: { label: "Title Sponsor", size: "h-14", border: "border-yellow-400/40", bg: "bg-yellow-400/5", textColor: "text-yellow-400" },
  gold: { label: "Gold", size: "h-11", border: "border-yellow-500/30", bg: "bg-yellow-500/5", textColor: "text-yellow-500" },
  silver: { label: "Silver", size: "h-9", border: "border-slate-400/30", bg: "bg-slate-400/5", textColor: "text-slate-400" },
  bronze: { label: "Bronze", size: "h-7", border: "border-orange-700/30", bg: "bg-orange-700/5", textColor: "text-orange-700" },
};

export default function SponsorBar({ tournamentId, tenantId }) {
  const { isAuthenticated } = useAuth();
  const { data: sponsors = [] } = useQuery({
    queryKey: ["sponsors", tournamentId, tenantId],
    queryFn: async () => {
      const [global, specific] = await Promise.all([
        tenantId
          ? maxikay.entities.Sponsor.filter({ tenant_id: tenantId, is_active: true })
          : Promise.resolve([]),
        tournamentId
          ? maxikay.entities.Sponsor.filter({ tournament_id: tournamentId, is_active: true })
          : Promise.resolve([]),
      ]);
      const all = [...global, ...specific];
      const seen = new Set();
      return all
        .filter((s) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        })
        .sort((a, b) => {
          const order = ["title", "gold", "silver", "bronze"];
          return order.indexOf(a.tier) - order.indexOf(b.tier) || (a.display_order || 0) - (b.display_order || 0);
        });
    },
    enabled: isAuthenticated && !!(tenantId || tournamentId),
  });

  if (sponsors.length === 0) return null;

  const tierGroups = ["title", "gold", "silver", "bronze"].map((tier) => ({
    tier,
    items: sponsors.filter((s) => s.tier === tier),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      {tierGroups.map(({ tier, items }) => {
        const cfg = TIER_CONFIG[tier];
        return (
          <div key={tier}>
            <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${cfg.textColor}`}>{cfg.label}</p>
            <div className={`flex flex-wrap gap-3 ${tier === "title" ? "justify-center" : "justify-start"}`}>
              {items.map((s) => (
                <a
                  key={s.id}
                  href={s.website_url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.name}
                  onClick={() => trackSponsorClick(s.id, tournamentId)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${cfg.border} ${cfg.bg} hover:opacity-80 transition-opacity group`}
                >
                  {s.logo_url ? (
                    <img src={s.logo_url} alt={s.name} className={`${cfg.size} w-auto object-contain`} />
                  ) : (
                    <span className={`font-display font-bold text-sm ${cfg.textColor}`}>{s.name}</span>
                  )}
                  {s.website_url && (
                    <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}