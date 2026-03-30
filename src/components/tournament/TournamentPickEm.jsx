import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trophy, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/lib/AuthContext";

/**
 * Pick'Em bracket: click winner per match. Open only while tournament.status === registration_closed.
 * @param {string} tournamentTenantId — Organizing tenant (required for API RLS / tournament row lookup). Pass from `tournament.tenant_id` so fans outside that org can still play.
 */
export default function TournamentPickEm({ tournamentId, tournamentTenantId }) {
  const qc = useQueryClient();
  const [localPicks, setLocalPicks] = useState({});
  const { tenantId: userTenantId } = useTenant();
  const { isAuthenticated } = useAuth();
  const scopeTenantId = (tournamentTenantId != null && String(tournamentTenantId).trim()
    ? String(tournamentTenantId).trim()
    : null) || (userTenantId != null && String(userTenantId).trim() ? String(userTenantId).trim() : null);
  const apiOk = !!tournamentId && !!scopeTenantId && isAuthenticated;

  const q = useQuery({
    queryKey: ["pickem", tournamentId, scopeTenantId],
    queryFn: () => maxikay.matchEngine.getPickem(tournamentId, { tenantId: scopeTenantId }),
    enabled: apiOk,
  });

  const prediction = q.data?.prediction;
  const windowOpen = q.data?.windowOpen;
  const effLocked = !windowOpen || !!prediction?.locked;
  const serverPicks = prediction?.bracket_picks && typeof prediction.bracket_picks === "object" ? prediction.bracket_picks : {};

  const picks = useMemo(() => ({ ...serverPicks, ...localPicks }), [serverPicks, localPicks]);

  const saveMut = useMutation({
    mutationFn: (bracket_picks) =>
      maxikay.matchEngine.putPickem(tournamentId, { bracket_picks }, { tenantId: scopeTenantId }),
    onSuccess: () => {
      toast.success("Predictions saved");
      qc.invalidateQueries({ queryKey: ["pickem", tournamentId, scopeTenantId] });
      setLocalPicks({});
    },
    onError: (e) => toast.error(e?.message || "Save failed"),
  });

  const matches = q.data?.matches || [];
  const leaderboard = q.data?.leaderboard || [];

  if (!tournamentId) return null;

  if (!apiOk) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
        {isAuthenticated ? (
          <>
            This event&apos;s organizer scope is missing (no <code className="text-primary/90">tenant_id</code> on the
            tournament). Refresh the page or contact support if this persists.
          </>
        ) : (
          <>Sign in to make bracket predictions while registration is closed and play hasn&apos;t started.</>
        )}
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading Pick&apos;Em…
      </div>
    );
  }

  if (!windowOpen && q.data?.tournament?.status) {
    return (
      <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 text-sm text-muted-foreground">
        Pick&apos;Em opens when registration is <strong className="text-foreground">closed</strong> and before the event goes{" "}
        <strong className="text-foreground">live</strong>. (Current: {q.data.tournament.status.replace(/_/g, " ")}).
      </div>
    );
  }

  const setWinner = (matchId, teamId) => {
    if (effLocked) return;
    setLocalPicks((prev) => ({ ...prev, [String(matchId)]: String(teamId) }));
  };

  const mergedForSave = { ...serverPicks, ...localPicks };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-display font-semibold text-foreground">Pick&apos;Em</h3>
            <p className="text-xs text-muted-foreground">
              Click the team you think advances. Locked when the tournament goes live. Rewards credit after finalize.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={effLocked || saveMut.isPending || !Object.keys(localPicks).length}
          onClick={() => saveMut.mutate(mergedForSave)}
        >
          {saveMut.isPending ? "Saving…" : "Save picks"}
        </Button>
      </div>

      {effLocked && prediction?.locked && (
        <p className="text-xs text-amber-400/90 border border-amber-500/30 rounded-lg px-3 py-2 bg-amber-500/5">
          Predictions are locked for this event.
        </p>
      )}

      <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
        {matches.map((m) => {
          const mid = String(m.id);
          const aId = String(m.team_a_id || "");
          const bId = String(m.team_b_id || "");
          const chosen = picks[mid];
          return (
            <div
              key={mid}
              className="rounded-xl border border-border/50 bg-secondary/15 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Round {m.round} · Match {m.match_number}
              </div>
              <div />
              <button
                type="button"
                disabled={effLocked || !aId}
                aria-pressed={chosen === aId}
                onClick={() => setWinner(mid, aId)}
                className={`rounded-lg border px-3 py-3 text-left text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  chosen === aId
                    ? "border-primary shadow-[0_0_16px_rgba(56,189,248,0.45)] bg-primary/10 text-primary"
                    : "border-border/60 bg-background/40 text-foreground hover:border-primary/40"
                }`}
              >
                {m.team_a_name || "TBD"}
              </button>
              <button
                type="button"
                disabled={effLocked || !bId}
                aria-pressed={chosen === bId}
                onClick={() => setWinner(mid, bId)}
                className={`rounded-lg border px-3 py-3 text-left text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  chosen === bId
                    ? "border-primary shadow-[0_0_16px_rgba(56,189,248,0.45)] bg-primary/10 text-primary"
                    : "border-border/60 bg-background/40 text-foreground hover:border-primary/40"
                }`}
              >
                {m.team_b_name || "TBD"}
              </button>
            </div>
          );
        })}
      </div>

      {leaderboard.length > 0 && (
        <div>
          <h4 className="text-xs font-display uppercase tracking-wider text-muted-foreground mb-2">Top predictors</h4>
          <ul className="text-xs space-y-1 border border-border/40 rounded-lg divide-y divide-border/30">
            {leaderboard.map((row, i) => (
              <li key={row.user_id || i} className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground font-mono text-[11px]">
                  Predictor {String(row.user_id || "").slice(0, 8) || `#${i + 1}`}
                  {row.pickem_settled ? "" : " · pending"}
                </span>
                <span className="text-primary font-mono">{row.pickem_score ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
