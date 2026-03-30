import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { advanceWinner } from "../../lib/bracketAdvancement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Send, X } from "lucide-react";

export default function ScoreReportForm({ match, currentUserEmail, tenantId, onSubmitted }) {
  const queryClient = useQueryClient();
  const [scoreA, setScoreA] = useState(match.score_a ?? 0);
  const [scoreB, setScoreB] = useState(match.score_b ?? 0);
  const [notes, setNotes] = useState("");
  const [screenshots, setScreenshots] = useState([]);
  const [uploading, setUploading] = useState(false);

  const { data: existingReports = [] } = useQuery({
    queryKey: ["match-reports", match.id],
    queryFn: () => maxikay.entities.MatchReport.filter({ match_id: match.id }, "-created_date", 10),
  });

  const submitReport = useMutation({
    mutationFn: async (data) => {
      const report = await maxikay.entities.MatchReport.create(data);
      // Auto-resolution: check if opponent submitted matching scores
      const pendingReports = [...existingReports, report].filter((r) => r.status !== "rejected");
      if (pendingReports.length >= 2) {
        const [r1, r2] = pendingReports;
        if (r1.reported_score_a === r2.reported_score_a && r1.reported_score_b === r2.reported_score_b) {
          // Scores match — auto-approve!
          const winnerId = r1.reported_score_a > r1.reported_score_b ? match.team_a_id : match.team_b_id;
          const winnerName = r1.reported_score_a > r1.reported_score_b ? match.team_a_name : match.team_b_name;
          await maxikay.entities.Match.update(match.id, {
            score_a: r1.reported_score_a,
            score_b: r1.reported_score_b,
            status: "completed",
            winner_id: winnerId,
            winner_name: winnerName,
            expected_version: match.version ?? 1,
            expected_status: match.status,
          });
          await maxikay.entities.MatchReport.update(r1.id, { status: "approved", review_notes: "Auto-approved: both teams agree" });
          await maxikay.entities.MatchReport.update(report.id, { status: "approved", review_notes: "Auto-approved: both teams agree" });
          // Advance winner in bracket
          await advanceWinner({ ...match, winner_id: winnerId, winner_name: winnerName }, null);
          await maxikay.entities.AuditLog.create({
            action: "score_auto_approved",
            entity_type: "match",
            entity_id: match.id,
            actor_email: "system",
            actor_role: "system",
            details: `Score ${r1.reported_score_a}:${r1.reported_score_b} auto-approved. Both teams agreed.`,
            tournament_id: match.tournament_id,
          });
        }
      }
      return report;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-reports", match.id] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      onSubmitted?.();
    },
  });

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      const { file_url } = await maxikay.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setScreenshots((prev) => [...prev, ...urls]);
    setUploading(false);
  };

  const handleSubmit = () => {
    submitReport.mutate({
      match_id: match.id,
      tournament_id: match.tournament_id,
      submitted_by: currentUserEmail,
      reported_score_a: Number(scoreA),
      reported_score_b: Number(scoreB),
      screenshot_urls: screenshots,
      notes,
      status: "pending",
      ...(tenantId ? { tenant_id: tenantId } : {}),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Submit your match result. An organizer will verify it.</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">{match.team_a_name || "Team A"} Score</Label>
          <Input
            type="number" min={0}
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            className="mt-1 bg-secondary/50 text-center text-xl font-display font-bold"
          />
        </div>
        <div>
          <Label className="text-xs">{match.team_b_name || "Team B"} Score</Label>
          <Input
            type="number" min={0}
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            className="mt-1 bg-secondary/50 text-center text-xl font-display font-bold"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Describe any special circumstances..."
          className="mt-1 bg-secondary/50"
          rows={2}
        />
      </div>

      {/* Screenshot upload */}
      <div>
        <Label className="text-xs">Evidence Screenshots</Label>
        <label className="mt-1 flex items-center gap-2 cursor-pointer border border-dashed border-border/60 rounded-lg p-3 hover:border-primary/40 transition-colors">
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{uploading ? "Uploading..." : "Click to upload screenshots"}</span>
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
        </label>
        {screenshots.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {screenshots.map((url, i) => (
              <div key={i} className="relative group">
                <img src={url} alt={`screenshot-${i}`} className="w-16 h-16 object-cover rounded-md border border-border/50" />
                <button
                  onClick={() => setScreenshots((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitReport.isPending || uploading}
        className="w-full gap-2 font-display text-xs tracking-wider"
      >
        <Send className="w-4 h-4" />
        {submitReport.isPending ? "Submitting..." : "SUBMIT SCORE REPORT"}
      </Button>
    </div>
  );
}