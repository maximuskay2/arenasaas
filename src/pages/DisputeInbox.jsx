import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { maxikay } from "@/api/maxikayClient";
import { useTenant } from "@/hooks/useTenant";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { toast } from "sonner";
import { Gavel } from "lucide-react";
import { LEAGUE_HOST_ROLES } from "@/lib/routingLogic";

export default function DisputeInbox() {
  const { tenantId, user } = useTenant();
  const queryClient = useQueryClient();
  const [scores, setScores] = useState({});

  const canViewDisputes = (() => {
    if (!tenantId) return false;
    const role = user?.role;
    if (role === "admin" || role === "super_admin") return true;
    const memberships = user?.tenant_memberships;
    if (!Array.isArray(memberships) || memberships.length === 0) return false;
    const hostRoles = new Set(LEAGUE_HOST_ROLES);
    return memberships.some(
      (m) => String(m?.tenant_id || "") === String(tenantId) && hostRoles.has(String(m?.role_in_tenant || ""))
    );
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["match-engine-disputes", tenantId],
    queryFn: () => maxikay.matchEngine.listDisputes(),
    enabled: canViewDisputes,
    retry: false,
  });

  const disputes = data?.disputes ?? [];

  const resolveMutation = useMutation({
    mutationFn: ({ matchId, score_a, score_b, review_notes }) =>
      maxikay.matchEngine.resolveDispute(matchId, { score_a, score_b, review_notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-engine-disputes"] });
      queryClient.invalidateQueries({ queryKey: ["match"] });
      toast.success("Dispute resolved");
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Resolve failed"),
  });

  if (!tenantId) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Select a tenant context to load disputes.</p>
      </div>
    );
  }

  if (!canViewDisputes) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Dispute inbox is available to organization staff only (organizer/admin/staff).
        </p>
      </div>
    );
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-8 pb-20 md:pb-8 max-w-4xl mx-auto p-4 md:p-6">
      <PageHeader
        title="Dispute inbox"
        subtitle="Matches under dispute or with disputed score reports — staff ruling updates the bracket."
      />

      {disputes.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card/30 p-10 text-center text-muted-foreground text-sm">
          No open disputes for this organization.
        </div>
      ) : (
        <ul className="space-y-6">
          {disputes.map((m) => {
            const mid = String(m.id);
            const s = scores[mid] || { a: "", b: "", notes: "" };
            return (
              <li
                key={mid}
                className="rounded-2xl border border-border/50 bg-card/40 p-6 space-y-4 backdrop-blur-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                      <Gavel className="w-3.5 h-3.5" />
                      {m.tournament_name || "Tournament"}
                    </p>
                    <p className="mt-1 font-display font-bold text-foreground">
                      {m.team_a_name || "A"} vs {m.team_b_name || "B"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      R{m.round} · Match #{m.match_number} · {m.status}
                      {m.disputed_report_count ? ` · ${m.disputed_report_count} disputed report(s)` : ""}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild className="font-display text-[10px] uppercase">
                    <Link to={`/matches/${mid}/lobby`}>Open lobby</Link>
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Score A</Label>
                    <Input
                      type="number"
                      min={0}
                      value={s.a}
                      onChange={(e) =>
                        setScores((prev) => ({ ...prev, [mid]: { ...s, a: e.target.value } }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Score B</Label>
                    <Input
                      type="number"
                      min={0}
                      value={s.b}
                      onChange={(e) =>
                        setScores((prev) => ({ ...prev, [mid]: { ...s, b: e.target.value } }))
                      }
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-[10px] uppercase text-muted-foreground">Staff notes</Label>
                    <Input
                      value={s.notes}
                      placeholder="Ruling notes (optional)"
                      onChange={(e) =>
                        setScores((prev) => ({ ...prev, [mid]: { ...s, notes: e.target.value } }))
                      }
                    />
                  </div>
                </div>
                <Button
                  className="w-full md:w-auto font-display uppercase italic text-xs"
                  disabled={resolveMutation.isPending || s.a === "" || s.b === ""}
                  onClick={() =>
                    resolveMutation.mutate({
                      matchId: mid,
                      score_a: Number(s.a),
                      score_b: Number(s.b),
                      review_notes: s.notes || undefined,
                    })
                  }
                >
                  Apply ruling &amp; complete match
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
