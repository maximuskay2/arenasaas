import { useMemo } from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Megaphone, MousePointerClick, Eye } from "lucide-react";

const SPONSOR_CLICKS_KEY = "arena_sponsor_clicks_v1";
const BRACKET_VIEWS_KEY = "arena_bracket_views_v1";

function readMap(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export default function SponsorInsights() {
  const sponsorClicks = useMemo(() => readMap(SPONSOR_CLICKS_KEY), []);
  const bracketViews = useMemo(() => readMap(BRACKET_VIEWS_KEY), []);

  const clickRows = useMemo(() => {
    return Object.entries(sponsorClicks)
      .filter(([k]) => k !== "_by_tournament" && !k.startsWith("_"))
      .map(([id, count]) => ({ id, count: Number(count) || 0 }))
      .sort((a, b) => b.count - a.count);
  }, [sponsorClicks]);

  const bracketRows = useMemo(() => {
    return Object.entries(bracketViews)
      .map(([tournamentId, count]) => ({ tournamentId, count: Number(count) || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);
  }, [bracketViews]);

  const totalClicks = clickRows.reduce((s, r) => s + r.count, 0);
  const totalBracketViews = bracketRows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader
        title="Sponsor insight"
        subtitle="Client-side engagement signals (Pro tier can wire server analytics later)"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/sponsorships">Manage sponsors</Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-xl border border-border/50 p-5 flex gap-3">
          <div className="p-2 rounded-lg bg-primary/10 h-fit">
            <MousePointerClick className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sponsor bar clicks</p>
            <p className="text-3xl font-display font-bold">{totalClicks}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tracked when visitors use sponsor links on tournament pages (this browser storage).
            </p>
          </div>
        </div>
        <div className="glass rounded-xl border border-border/50 p-5 flex gap-3">
          <div className="p-2 rounded-lg bg-primary/10 h-fit">
            <Eye className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Bracket impressions</p>
            <p className="text-3xl font-display font-bold">{totalBracketViews}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Public bracket page loads (estimated logo exposure opportunities).
            </p>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl border border-border/50 p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-display font-semibold">
          <Megaphone className="h-4 w-4 text-primary" />
          Clicks by sponsor id
        </div>
        {clickRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clicks recorded yet — share a tournament with the sponsor bar visible.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {clickRows.map((r) => (
              <li key={r.id} className="flex justify-between border-b border-border/40 pb-2">
                <code className="text-xs text-muted-foreground">{r.id}</code>
                <span className="font-bold">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="glass rounded-xl border border-border/50 p-5 space-y-3">
        <p className="text-sm font-display font-semibold">Bracket views by tournament</p>
        {bracketRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Open a public bracket link to start counting impressions.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {bracketRows.map((r) => (
              <li key={r.tournamentId} className="flex justify-between border-b border-border/40 pb-2">
                <Link className="text-primary text-xs font-mono truncate max-w-[70%]" to={`/public/bracket/${r.tournamentId}`}>
                  {r.tournamentId}
                </Link>
                <span className="font-bold shrink-0">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
