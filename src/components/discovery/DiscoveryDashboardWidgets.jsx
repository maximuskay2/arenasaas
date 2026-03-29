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
} from "lucide-react";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";

function scrollToBrowse() {
  document.getElementById("browse-arena")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function MiniBars({ rows, valueKey, labelKey, gradientClass }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div className="mt-4 space-y-2">
      {rows.map((row, i) => {
        const v = Number(row[valueKey]) || 0;
        const pct = Math.round((v / max) * 100);
        return (
          <div key={`${row[labelKey]}-${i}`} className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span className="truncate pr-2 text-slate-300">{row[labelKey]}</span>
              <span className="shrink-0 text-primary">{v.toLocaleString()}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
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

function ListCard({ title, icon: Icon, subtitle, children, onMore }) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-[#0f0f14] p-5 shadow-lg shadow-black/20">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-primary">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-sm font-black uppercase italic tracking-tight text-white truncate">{title}</h3>
            {subtitle ? <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {onMore ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1 px-2 text-[10px] font-black uppercase text-primary hover:bg-primary/10"
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
      className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0 hover:bg-white/[0.03] -mx-2 px-2 rounded-lg transition-colors"
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center text-lg">
        {t.banner_url ? (
          <img src={t.banner_url} alt="" className="h-full w-full object-cover opacity-80" />
        ) : (
          <span aria-hidden>🏆</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{t.name}</p>
        <p className="truncate text-[11px] text-slate-500">
          {game} · {org}
        </p>
      </div>
      {dateLabel ? (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">{dateLabel}</span>
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
      className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 hover:bg-red-500/10 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-white">
          {a} <span className="text-slate-500 font-bold">vs</span> {b}
        </p>
        <p className="truncate text-[11px] text-slate-500">{m.tournament_name}</p>
      </div>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400">
        <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
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
        <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
        <div className="grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-80 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-slate-500">
        Discovery insights are temporarily unavailable.
      </p>
    );
  }

  const stats = data.stats || {};
  const statItems = [
    { label: "Tournaments", value: stats.tournaments },
    { label: "Matches", value: stats.matches },
    { label: "Teams", value: stats.teams },
    { label: "Players", value: stats.players },
    { label: "Games", value: stats.games },
  ];

  const recent = data.recent_tournaments || [];
  const upcoming = data.upcoming_tournaments || [];
  const live = data.live_matches || [];
  const orgs = data.top_organizations || [];
  const teams = data.top_teams || [];
  const games = data.top_games || [];

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-white/10 bg-[#0f0f14] px-4 py-4 sm:px-6">
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Platform pulse</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {statItems.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={scrollToBrowse}
              className="flex flex-col items-start rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3 text-left transition hover:border-primary/30 hover:bg-white/[0.04]"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{s.label}</span>
              <span className="font-display text-2xl font-black tabular-nums text-white">
                {Number(s.value).toLocaleString()}
              </span>
              <span className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-black uppercase text-primary">
                Browse <ChevronRight className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="Recent tournaments" icon={Clock} subtitle="Recently finished" onMore={scrollToBrowse}>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No completed tournaments yet.</p>
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

        <ListCard title="Upcoming tournaments" icon={TrendingUp} subtitle="Starting soon" onMore={scrollToBrowse}>
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No scheduled starts in the catalog.</p>
          ) : (
            upcoming.map((t) => (
              <TournamentRow key={t.id} t={t} dateLabel={moment(t.start_date).format("D MMM YY")} />
            ))
          )}
        </ListCard>

        <ListCard title="Live matches" icon={Radio} subtitle="In progress" onMore={scrollToBrowse}>
          {live.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nothing live right now — check back soon.</p>
          ) : (
            <div className="space-y-2">
              {live.slice(0, 5).map((m) => (
                <LiveMatchRow key={m.id} m={m} />
              ))}
            </div>
          )}
        </ListCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0f0f14] p-5 shadow-lg shadow-black/20">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
                <Building2 className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-black uppercase italic tracking-tight text-white">Top organizations</h3>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">By tournament count</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-[10px] font-black uppercase text-primary"
              onClick={scrollToBrowse}
            >
              More <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          {orgs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No organizer data yet.</p>
          ) : (
            <>
              <MiniBars
                rows={orgs.map((o) => ({
                  label: o.organizer_name,
                  tournament_count: o.tournament_count,
                }))}
                valueKey="tournament_count"
                labelKey="label"
                gradientClass="from-sky-500 to-cyan-300"
              />
              <ol className="mt-4 space-y-2 border-t border-white/5 pt-4">
                {orgs.map((o, i) => (
                  <li key={`${o.tenant_id}-${i}`} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-center text-xs font-black text-slate-600">{i + 1}</span>
                    {o.organizer_logo_url ? (
                      <img src={o.organizer_logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs">🏢</span>
                    )}
                    <div className="min-w-0 flex-1">
                      {o.organizer_slug ? (
                        <Link
                          to={`/tournaments?organizer=${encodeURIComponent(o.organizer_slug)}`}
                          className="truncate font-bold text-white hover:text-primary"
                        >
                          {o.organizer_name}
                        </Link>
                      ) : (
                        <span className="truncate font-bold text-white">{o.organizer_name}</span>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-black text-primary">{o.tournament_count}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0f0f14] p-5 shadow-lg shadow-black/20">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <UsersRound className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-black uppercase italic tracking-tight text-white">Top teams</h3>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">By matches played</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-[10px] font-black uppercase text-primary"
              onClick={scrollToBrowse}
            >
              More <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          {teams.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No match history yet.</p>
          ) : (
            <>
              <MiniBars
                rows={teams.map((t) => ({ label: `${t.name} [${t.tag}]`, match_count: t.match_count }))}
                valueKey="match_count"
                labelKey="label"
                gradientClass="from-emerald-500 to-teal-300"
              />
              <ol className="mt-4 space-y-2 border-t border-white/5 pt-4">
                {teams.map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-center text-xs font-black text-slate-600">{i + 1}</span>
                    {t.logo_url ? (
                      <img src={t.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-black text-slate-400">
                        {String(t.tag || "?").slice(0, 2)}
                      </span>
                    )}
                    <Link to={`/teams/p/${t.id}`} className="min-w-0 flex-1 truncate font-bold text-white hover:text-primary">
                      {t.name}
                    </Link>
                    <span className="shrink-0 text-xs font-black text-emerald-400">{t.match_count}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0f0f14] p-5 shadow-lg shadow-black/20">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-400">
                <Gamepad2 className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-black uppercase italic tracking-tight text-white">Top esports games</h3>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">By match volume</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-[10px] font-black uppercase text-primary"
              onClick={scrollToBrowse}
            >
              More <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          {games.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No games in the catalog yet.</p>
          ) : (
            <>
              <MiniBars
                rows={games.map((g) => ({
                  label: g.game_title,
                  match_count: g.match_count,
                }))}
                valueKey="match_count"
                labelKey="label"
                gradientClass="from-fuchsia-500 to-pink-300"
              />
              <ol className="mt-4 space-y-2 border-t border-white/5 pt-4">
                {games.map((g, i) => (
                  <li key={`${g.game_title}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-bold text-white">{g.game_title}</span>
                    <span className="shrink-0 text-xs font-black text-fuchsia-400">{g.match_count.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
