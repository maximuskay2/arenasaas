import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import moment from "moment";
import {
  Building2,
  ChevronRight,
  Clock,
  Gamepad2,
  Radio,
  TrendingUp,
  UsersRound,
  Trophy,
  Swords,
  Users,
  Sparkles,
} from "lucide-react";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import StatsCard from "@/components/shared/StatsCard";

function scrollToBrowse() {
  document.getElementById("browse-arena")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function MiniBars({ rows, valueKey, labelKey, gradientClass }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div className="mt-4 space-y-2.5">
      {rows.map((row, i) => {
        const v = Number(row[valueKey]) || 0;
        const pct = Math.round((v / max) * 100);
        return (
          <div key={`${row[labelKey]}-${i}`} className="space-y-1">
            <div className="flex justify-between text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground">
              <span className="truncate pr-2 text-foreground/80">{row[labelKey]}</span>
              <span className="shrink-0 text-primary tabular-nums">{v.toLocaleString()}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${gradientClass}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListCard({ title, icon: Icon, subtitle, children, onMore, live }) {
  return (
    <div className="flex flex-col glass rounded-3xl border border-border/50 p-5 shadow-arena-card">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold tracking-tight text-foreground truncate flex items-center gap-2">
              {live ? <span className="live-dot" /> : null}
              {title}
            </h3>
            {subtitle ? <p className="section-label mt-0.5">{subtitle}</p> : null}
          </div>
        </div>
        {onMore ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1 px-2 text-[10px] font-display font-bold uppercase text-primary hover:bg-primary/10"
            onClick={onMore}
          >
            More <ChevronRight className="h-3 w-3" />
          </Button>
        ) : null}
      </div>
      <div className="flex-1 space-y-0">{children}</div>
    </div>
  );
}

function TournamentRow({ t, dateLabel }) {
  const org = t.organizer_name || t.organizer_slug || "Organizer";
  const game = t.game_title || "—";
  return (
    <Link
      to={`/tournaments/${t.id}`}
      className="flex items-center gap-3 border-b border-border/40 py-3 last:border-0 hover:bg-primary/5 -mx-2 px-2 rounded-xl transition-colors"
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center ring-1 ring-primary/20">
        {t.banner_url ? (
          <img src={t.banner_url} alt="" className="h-full w-full object-cover opacity-80" />
        ) : (
          <Trophy className="h-4 w-4 text-primary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-display font-bold text-foreground">{t.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {game} · {org}
        </p>
      </div>
      {dateLabel ? (
        <span className="shrink-0 text-[10px] font-display font-bold uppercase tracking-wider text-muted-foreground">
          {dateLabel}
        </span>
      ) : null}
    </Link>
  );
}

function LiveMatchRow({ m }) {
  const a = m.team_a_name || "TBD";
  const b = m.team_b_name || "TBD";
  const tid = m.tournament_id;
  return (
    <Link
      to={`/tournaments/${tid}/lobby`}
      className="flex items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3 hover:bg-red-500/15 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-display font-bold text-foreground">
          {a} <span className="text-muted-foreground font-semibold">vs</span> {b}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{m.tournament_name}</p>
      </div>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/50 text-muted-foreground">
        <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function RankPanel({ title, subtitle, icon: Icon, iconClass, children, empty }) {
  return (
    <div className="glass rounded-3xl border border-border/50 p-5 shadow-arena-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${iconClass}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold tracking-tight text-foreground">{title}</h3>
            <p className="section-label mt-0.5">{subtitle}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-[10px] font-display font-bold uppercase text-primary"
          onClick={scrollToBrowse}
        >
          More <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
      {empty ? <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p> : children}
    </div>
  );
}

export default function DiscoveryDashboardWidgets() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["discovery-dashboard"],
    queryFn: () => maxikay.public.discoveryDashboard(),
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary/40" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-3xl bg-secondary/40" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="glass rounded-2xl border border-border/50 px-4 py-3 text-center text-sm text-muted-foreground">
        Discovery insights are temporarily unavailable.
      </p>
    );
  }

  const stats = data.stats || {};
  const recent = data.recent_tournaments || [];
  const upcoming = data.upcoming_tournaments || [];
  const live = data.live_matches || [];
  const orgs = data.top_organizations || [];
  const teams = data.top_teams || [];
  const games = data.top_games || [];

  return (
    <div className="space-y-8">
      {/* Platform pulse stats */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="section-label text-primary">Platform pulse</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button type="button" onClick={scrollToBrowse} className="text-left">
            <StatsCard icon={Trophy} label="Tournaments" value={Number(stats.tournaments || 0).toLocaleString()} delay={0} />
          </button>
          <button type="button" onClick={scrollToBrowse} className="text-left">
            <StatsCard icon={Swords} label="Matches" value={Number(stats.matches || 0).toLocaleString()} delay={0.03} />
          </button>
          <button type="button" onClick={scrollToBrowse} className="text-left">
            <StatsCard icon={Users} label="Teams" value={Number(stats.teams || 0).toLocaleString()} delay={0.06} />
          </button>
          <button type="button" onClick={scrollToBrowse} className="text-left">
            <StatsCard icon={UsersRound} label="Players" value={Number(stats.players || 0).toLocaleString()} delay={0.09} />
          </button>
          <button type="button" onClick={scrollToBrowse} className="text-left col-span-2 sm:col-span-1">
            <StatsCard icon={Gamepad2} label="Games" value={Number(stats.games || 0).toLocaleString()} delay={0.12} />
          </button>
        </div>
      </section>

      {/* Live ops rails */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="Recent tournaments" icon={Clock} subtitle="Recently finished" onMore={scrollToBrowse}>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No completed tournaments yet.</p>
          ) : (
            recent.map((t) => (
              <TournamentRow
                key={t.id}
                t={t}
                dateLabel={moment(t.end_date || t.created_date).format("D MMM YY")}
              />
            ))
          )}
        </ListCard>

        <ListCard title="Upcoming" icon={TrendingUp} subtitle="Starting soon" onMore={scrollToBrowse}>
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No scheduled starts in the catalog.</p>
          ) : (
            upcoming.map((t) => (
              <TournamentRow key={t.id} t={t} dateLabel={moment(t.start_date).format("D MMM YY")} />
            ))
          )}
        </ListCard>

        <ListCard title="Live matches" icon={Radio} subtitle="In progress" onMore={scrollToBrowse} live>
          {live.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing live right now — check back soon.</p>
          ) : (
            <div className="space-y-2">
              {live.slice(0, 5).map((m) => (
                <LiveMatchRow key={m.id} m={m} />
              ))}
            </div>
          )}
        </ListCard>
      </div>

      {/* Rankings */}
      <div className="grid gap-4 lg:grid-cols-3">
        <RankPanel
          title="Top organizations"
          subtitle="By tournament count"
          icon={Building2}
          iconClass="bg-sky-500/15 text-sky-400 ring-sky-500/25"
          empty={orgs.length === 0 ? "No organizer data yet." : null}
        >
          <MiniBars
            rows={orgs.map((o) => ({
              label: o.organizer_name,
              tournament_count: o.tournament_count,
            }))}
            valueKey="tournament_count"
            labelKey="label"
            gradientClass="from-sky-500 to-cyan-300"
          />
          <ol className="mt-4 space-y-2 border-t border-border/40 pt-4">
            {orgs.map((o, i) => (
              <li key={`${o.tenant_id}-${i}`} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-center text-xs font-display font-bold text-muted-foreground">{i + 1}</span>
                {o.organizer_logo_url ? (
                  <img src={o.organizer_logo_url} alt="" className="h-8 w-8 rounded-lg object-cover ring-1 ring-border/50" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 text-xs ring-1 ring-border/40">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {o.organizer_slug ? (
                    <Link
                      to={`/tournaments?organizer=${encodeURIComponent(o.organizer_slug)}`}
                      className="truncate font-semibold text-foreground hover:text-primary block"
                    >
                      {o.organizer_name}
                    </Link>
                  ) : (
                    <span className="truncate font-semibold text-foreground block">{o.organizer_name}</span>
                  )}
                </div>
                <span className="shrink-0 text-xs font-display font-bold text-primary tabular-nums">{o.tournament_count}</span>
              </li>
            ))}
          </ol>
        </RankPanel>

        <RankPanel
          title="Top teams"
          subtitle="By matches played"
          icon={UsersRound}
          iconClass="bg-emerald-500/15 text-emerald-400 ring-emerald-500/25"
          empty={teams.length === 0 ? "No match history yet." : null}
        >
          <MiniBars
            rows={teams.map((t) => ({ label: `${t.name} [${t.tag}]`, match_count: t.match_count }))}
            valueKey="match_count"
            labelKey="label"
            gradientClass="from-emerald-500 to-teal-300"
          />
          <ol className="mt-4 space-y-2 border-t border-border/40 pt-4">
            {teams.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-center text-xs font-display font-bold text-muted-foreground">{i + 1}</span>
                {t.logo_url ? (
                  <img src={t.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover ring-1 ring-border/50" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 text-[10px] font-display font-bold text-muted-foreground ring-1 ring-border/40">
                    {String(t.tag || "?").slice(0, 2)}
                  </span>
                )}
                <Link to={`/teams/p/${t.id}`} className="min-w-0 flex-1 truncate font-semibold text-foreground hover:text-primary">
                  {t.name}
                </Link>
                <span className="shrink-0 text-xs font-display font-bold text-emerald-400 tabular-nums">{t.match_count}</span>
              </li>
            ))}
          </ol>
        </RankPanel>

        <RankPanel
          title="Top games"
          subtitle="By match volume"
          icon={Gamepad2}
          iconClass="bg-fuchsia-500/15 text-fuchsia-400 ring-fuchsia-500/25"
          empty={games.length === 0 ? "No games in the catalog yet." : null}
        >
          <MiniBars
            rows={games.map((g) => ({
              label: g.game_title,
              match_count: g.match_count,
            }))}
            valueKey="match_count"
            labelKey="label"
            gradientClass="from-fuchsia-500 to-pink-300"
          />
          <ol className="mt-4 space-y-2 border-t border-border/40 pt-4">
            {games.map((g, i) => (
              <li key={`${g.game_title}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-semibold text-foreground">{g.game_title}</span>
                <span className="shrink-0 text-xs font-display font-bold text-fuchsia-400 tabular-nums">
                  {g.match_count.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </RankPanel>
      </div>
    </div>
  );
}
