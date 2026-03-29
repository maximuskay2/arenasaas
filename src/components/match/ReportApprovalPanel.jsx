import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { advanceWinner } from "../../lib/bracketAdvancement";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, ImageIcon, Clock } from "lucide-react";
import { useState } from "react";
import moment from "moment";
import { reportReviewedNotif } from "../../lib/notifications";

const statusColors = {
  pending: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  approved: "text-green-400 bg-green-400/10 border-green-400/30",
  rejected: "text-destructive bg-destructive/10 border-destructive/30",
};

export default function ReportApprovalPanel({ matchId, match, onApprove }) {
  const queryClient = useQueryClient();
  const [reviewNotes, setReviewNotes] = useState({});
  const [lightbox, setLightbox] = useState(null);

  const { data: reports = [] } = useQuery({
    queryKey: ["match-reports", matchId],
    queryFn: () => maxikay.entities.MatchReport.filter({ match_id: matchId }, "-created_date", 20),
  });

  const reviewReport = useMutation({
    mutationFn: ({ reportId, status, notes }) =>
      maxikay.entities.MatchReport.update(reportId, { status, review_notes: notes, reviewed_by: "organizer" }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["match-reports", matchId] });
      if (vars.status === "approved") onApprove?.(vars.reportId);
    },
  });

  const handleApprove = async (report) => {
    reviewReport.mutate({ reportId: report.id, status: "approved", notes: reviewNotes[report.id] || "" });
    reportReviewedNotif({ report, status: "approved", reviewNotes: reviewNotes[report.id], webhook: null });
    const winnerId = report.reported_score_a > report.reported_score_b ? match.team_a_id : match.team_b_id;
    const winnerName = report.reported_score_a > report.reported_score_b ? match.team_a_name : match.team_b_name;
    const completedMatch = {
      ...match,
      score_a: report.reported_score_a,
      score_b: report.reported_score_b,
      status: "completed",
      winner_id: winnerId,
      winner_name: winnerName,
    };
    await maxikay.entities.Match.update(matchId, {
      score_a: report.reported_score_a,
      score_b: report.reported_score_b,
      status: "completed",
      winner_id: winnerId,
      winner_name: winnerName,
      expected_version: match.version ?? 1,
      expected_status: match.status,
    });
    // Auto-advance winner to next match in bracket
    await advanceWinner(completedMatch, null);
    maxikay.entities.AuditLog.create({
      action: "report_approved",
      entity_type: "match",
      entity_id: matchId,
      actor_email: "organizer",
      actor_role: "organizer",
      details: `Score ${report.reported_score_a}:${report.reported_score_b} approved. Winner: ${winnerName} advanced.`,
      tournament_id: match.tournament_id,
    });
  };

  const handleReject = (report) => {
    reviewReport.mutate({ reportId: report.id, status: "rejected", notes: reviewNotes[report.id] || "" });
    reportReviewedNotif({ report, status: "rejected", reviewNotes: reviewNotes[report.id], webhook: null });
  };

  if (reports.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No score reports submitted yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <div key={report.id} className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Submitted by <span className="text-foreground">{report.submitted_by}</span></p>
              <p className="text-xs text-muted-foreground">{moment(report.created_date).fromNow()}</p>
            </div>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColors[report.status]}`}>
              {report.status === "pending" && <Clock className="w-3 h-3 inline mr-1" />}
              {report.status}
            </span>
          </div>

          {/* Reported scores */}
          <div className="flex items-center justify-center gap-4 py-2 bg-secondary/40 rounded-lg">
            <span className="font-display font-bold text-lg text-foreground">{match.team_a_name}</span>
            <span className="font-display font-black text-2xl text-primary">{report.reported_score_a} : {report.reported_score_b}</span>
            <span className="font-display font-bold text-lg text-foreground">{match.team_b_name}</span>
          </div>

          {report.notes && <p className="text-xs text-muted-foreground italic">"{report.notes}"</p>}

          {/* Screenshots */}
          {report.screenshot_urls?.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Screenshots</p>
              <div className="flex flex-wrap gap-2">
                {report.screenshot_urls.map((url, i) => (
                  <img
                    key={i} src={url} alt={`evidence-${i}`}
                    onClick={() => setLightbox(url)}
                    className="w-20 h-20 object-cover rounded-md border border-border/50 cursor-pointer hover:border-primary/50 transition-colors"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Review actions for pending reports */}
          {report.status === "pending" && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              <Textarea
                placeholder="Review notes (optional)..."
                rows={1}
                className="bg-secondary/50 text-xs"
                value={reviewNotes[report.id] || ""}
                onChange={(e) => setReviewNotes((prev) => ({ ...prev, [report.id]: e.target.value }))}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleApprove(report)}
                  disabled={reviewReport.isPending}
                  className="flex-1 gap-1.5 text-xs font-display tracking-wider bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> APPROVE & APPLY
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => handleReject(report)}
                  disabled={reviewReport.isPending}
                  className="flex-1 gap-1.5 text-xs text-destructive border-destructive/30"
                >
                  <XCircle className="w-3.5 h-3.5" /> REJECT
                </Button>
              </div>
            </div>
          )}

          {report.review_notes && report.status !== "pending" && (
            <p className="text-xs text-muted-foreground italic border-t border-border/40 pt-2">Review: "{report.review_notes}"</p>
          )}
        </div>
      ))}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="screenshot" className="max-h-[90vh] max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}