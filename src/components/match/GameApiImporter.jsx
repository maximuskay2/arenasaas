import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Zap, Search, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GAMES = [
  { value: "valorant", label: "Valorant", hint: "e.g. Team A vs Team B — paste score JSON or describe the match" },
  { value: "cs2", label: "CS2 / CS:GO", hint: "e.g. map: Mirage, score 16-9" },
  { value: "lol", label: "League of Legends", hint: "e.g. match ID or result description" },
  { value: "apex", label: "Apex Legends", hint: "e.g. placement & kill points" },
  { value: "other", label: "Other / Custom", hint: "Describe the match result in any format" },
];

export default function GameApiImporter({ match, onScoresImported }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState("valorant");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);

  const lookup = useMutation({
    mutationFn: async () => {
      const gameLabel = GAMES.find((g) => g.value === game)?.label || game;
      const prompt = `You are a tournament scoring assistant.

Game: ${gameLabel}
Match: ${match.team_a_name} vs ${match.team_b_name}
User input / match data: "${query}"

Based on the above, extract:
1. score_a: score/rounds/maps won by ${match.team_a_name} (integer)
2. score_b: score/rounds/maps won by ${match.team_b_name} (integer)  
3. winner: name of the winning team (exactly "${match.team_a_name}" or "${match.team_b_name}")
4. confidence: "high", "medium", or "low" — how confident you are in this extraction
5. notes: brief summary of what you found

If the data is ambiguous or missing, return your best guess with low confidence.`;

      return maxikay.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false,
        response_json_schema: {
          type: "object",
          properties: {
            score_a: { type: "number" },
            score_b: { type: "number" },
            winner: { type: "string" },
            confidence: { type: "string" },
            notes: { type: "string" },
          },
        },
      });
    },
    onSuccess: (data) => setResult(data),
    onError: () => toast.error("Failed to parse match result"),
  });

  const applyScores = useMutation({
    mutationFn: async () => {
      const winnerId = result.winner === match.team_a_name ? match.team_a_id : match.team_b_id;
      const winnerName = result.winner === match.team_a_name ? match.team_a_name : match.team_b_name;
      await maxikay.entities.Match.update(match.id, {
        score_a: result.score_a,
        score_b: result.score_b,
        winner_id: winnerId,
        winner_name: winnerName,
        status: "completed",
        notes: `Auto-imported (${GAMES.find((g) => g.value === game)?.label}): ${result.notes}`,
        expected_version: match.version ?? 1,
        expected_status: match.status,
      });
      await maxikay.entities.AuditLog.create({
        action: "score_auto_imported",
        entity_type: "match",
        entity_id: match.id,
        actor_email: "system",
        actor_role: "admin",
        tournament_id: match.tournament_id,
        details: JSON.stringify({ game, score_a: result.score_a, score_b: result.score_b, winner: winnerName, confidence: result.confidence }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match", match.id] });
      queryClient.invalidateQueries({ queryKey: ["tournament-matches", match.tournament_id] });
      toast.success("Scores applied and match marked as completed!");
      setOpen(false);
      setResult(null);
      setQuery("");
      onScoresImported?.();
    },
  });

  const gameHint = GAMES.find((g) => g.value === game)?.hint || "";
  const confidenceColor = { high: "text-green-400", medium: "text-yellow-400", low: "text-orange-400" }[result?.confidence] || "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setResult(null); setQuery(""); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10">
          <Zap className="w-3.5 h-3.5" /> Auto-Import Score
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Game Score Importer
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Paste match data, a score summary, or an API response and AI will extract the result.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Match</p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-sm">
              <span className="font-semibold text-foreground">{match.team_a_name}</span>
              <span className="text-muted-foreground">vs</span>
              <span className="font-semibold text-foreground">{match.team_b_name}</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Game</label>
            <Select value={game} onValueChange={(v) => { setGame(v); setResult(null); }}>
              <SelectTrigger className="mt-1 bg-secondary/50 text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GAMES.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Match result data / API output</label>
            <textarea
              value={query}
              onChange={(e) => { setQuery(e.target.value); setResult(null); }}
              placeholder={gameHint}
              rows={4}
              className="mt-1 w-full bg-secondary/50 border border-input rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Paste JSON, score lines, or a plain-text description of the result.</p>
          </div>

          <Button
            onClick={() => lookup.mutate()}
            disabled={!query.trim() || lookup.isPending}
            className="w-full gap-2 text-xs font-display"
          >
            {lookup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {lookup.isPending ? "Extracting…" : "Extract Scores"}
          </Button>

          {result && (
            <div className="space-y-3 border-t border-border/40 pt-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-display uppercase tracking-wider text-muted-foreground">Extracted Result</p>
                <span className={`text-[10px] font-semibold ml-auto ${confidenceColor}`}>
                  {result.confidence?.toUpperCase()} CONFIDENCE
                </span>
              </div>

              <div className="flex items-center justify-center gap-4 py-3 bg-secondary/40 rounded-xl">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground truncate max-w-[100px]">{match.team_a_name}</p>
                  <p className="text-3xl font-display font-bold text-primary">{result.score_a ?? "?"}</p>
                </div>
                <span className="text-muted-foreground font-display">:</span>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground truncate max-w-[100px]">{match.team_b_name}</p>
                  <p className="text-3xl font-display font-bold text-primary">{result.score_b ?? "?"}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-foreground">Winner: <strong>{result.winner}</strong></span>
              </div>

              {result.notes && (
                <p className="text-[11px] text-muted-foreground italic">{result.notes}</p>
              )}

              {result.confidence === "low" && (
                <div className="flex items-start gap-2 text-[11px] text-orange-400 px-3 py-2 rounded-lg bg-orange-400/10 border border-orange-400/20">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Low confidence — please verify the scores before applying.
                </div>
              )}

              <Button
                onClick={() => applyScores.mutate()}
                disabled={applyScores.isPending || result.score_a == null || result.score_b == null}
                className="w-full text-xs font-display gap-2"
              >
                {applyScores.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {applyScores.isPending ? "Applying…" : "Apply Scores & Complete Match"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}