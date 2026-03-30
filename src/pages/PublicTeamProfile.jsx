import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { ArrowLeft, Trophy, Users, DollarSign, Target, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import InsightsNode from "@/components/insights/InsightsNode";

export default function PublicTeamProfile() {
  const { teamId } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-team-profile", teamId],
    queryFn: () => maxikay.public.teamProfile(teamId),
    enabled: !!teamId,
    retry: false,
  });

  if (!teamId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-muted-foreground">
        Missing team id.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !data?.team) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 space-y-4 text-center">
        <p className="text-muted-foreground">Team not found or not visible on the public catalog.</p>
        <Button asChild variant="outline">
          <Link to="/tournaments">Back to discover</Link>
        </Button>
      </div>
    );
  }

  const { team, appearances = [], roster_stats: rosterStats = [], career_prize_total: prize = 0 } = data;
  const apex = !!team?.apex_tier;
  const globalElo = team?.global_elo != null ? Math.round(Number(team.global_elo)) : null;
  const roster = Array.isArray(team.roster) ? team.roster : [];
  const wins = Number(team.wins ?? 0);
  const losses = Number(team.losses ?? 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8 px-4 py-10 pb-24 text-slate-50">
      <Button variant="ghost" asChild className="text-slate-400 hover:text-white -ml-2 gap-2">
        <Link to={`/tournaments/${team.tournament_id}`}>
          <ArrowLeft className="h-4 w-4" /> Back to tournament
        </Link>
      </Button>

      <header className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 md:p-10 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Team profile</p>
            <h1 className="text-3xl md:text-5xl font-black italic uppercase tracking-tighter">{team.name}</h1>
            <p className="text-slate-500 font-bold text-sm mt-2 flex flex-wrap items-center gap-2">
              [{team.tag}] · {team.tournament_name || "Tournament"}
              {globalElo != null && (
                <span className="text-primary font-display text-xs border border-primary/40 px-2 py-0.5 rounded-md bg-primary/10">
                  Elo {globalElo}
                </span>
              )}
              {apex && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-primary border border-primary/50 px-2 py-0.5 rounded-full bg-primary/10">
                  <Crown className="w-3 h-3" /> Apex tier
                </span>
              )}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 font-bold uppercase tracking-widest">
            {team.organizer_name || team.organizer_slug || "Organizer"}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InsightsNode icon={Target} label="Record" value={`${wins}W — ${losses}L`} sub="This event" />
          <InsightsNode icon={DollarSign} label="Prize booked" value={`$${Number(prize).toLocaleString()}`} sub="Sent / confirmed" />
          <InsightsNode icon={Users} label="Roster" value={String(roster.length || rosterStats.length || "—")} sub="Listed players" />
          <InsightsNode icon={Trophy} label="Status" value={(team.status || "registered").replace(/_/g, " ")} sub="Registration" />
        </div>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
        <h2 className="text-lg font-black italic uppercase tracking-tight">Active roster</h2>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="p-3">Player</th>
                <th className="p-3">K</th>
                <th className="p-3">D</th>
                <th className="p-3">A</th>
                <th className="p-3">Won map</th>
              </tr>
            </thead>
            <tbody>
              {rosterStats.length === 0 && roster.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500 text-xs">
                    No K/D/A rows yet — stats appear when match reports are recorded for this squad.
                  </td>
                </tr>
              ) : null}
              {rosterStats.map((p) => (
                <tr key={p.player_email} className="border-b border-white/5">
                  <td className="p-3 text-white">{p.player_name || p.player_email}</td>
                  <td className="p-3">{p.kills ?? 0}</td>
                  <td className="p-3">{p.deaths ?? 0}</td>
                  <td className="p-3">{p.assists ?? 0}</td>
                  <td className="p-3 text-slate-400">{p.won_any ? "Yes" : "—"}</td>
                </tr>
              ))}
              {rosterStats.length === 0 &&
                roster.map((row, i) => (
                  <tr key={row.player_email || i} className="border-b border-white/5">
                    <td className="p-3 text-white">{row.player_name || row.player_email}</td>
                    <td className="p-3 text-slate-600" colSpan={4}>
                      Awaiting stats
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {appearances.length > 1 && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
          <h2 className="text-lg font-black italic uppercase tracking-tight">Same tag — other events</h2>
          <p className="text-xs text-slate-500">
            Squads sharing tag <span className="text-primary font-bold">{team.tag}</span> across the platform (public catalog).
          </p>
          <ul className="space-y-2">
            {appearances
              .filter((a) => String(a.id) !== String(team.id))
              .slice(0, 12)
              .map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm">
                  <span className="font-semibold text-white">{a.tournament_name}</span>
                  <span className="text-xs text-slate-500">
                    {a.wins ?? 0}W / {a.losses ?? 0}L · {a.tournament_status?.replace(/_/g, " ")}
                  </span>
                  <Button asChild variant="ghost" size="sm" className="text-[10px] font-black uppercase">
                    <Link to={`/teams/p/${a.id}`}>Profile</Link>
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
