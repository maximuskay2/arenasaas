import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Radio, Star } from "lucide-react";

/**
 * Organizer multi-stream manager (main + co-streams / languages).
 */
export default function StreamManager({ tournamentId, canEdit }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("Main");
  const [url, setUrl] = useState("");

  const q = useQuery({
    queryKey: ["tournament-streams", tournamentId],
    queryFn: () => maxikay.tournaments.listStreams(tournamentId),
    enabled: !!tournamentId,
  });

  const streams = q.data?.streams || [];

  const addMut = useMutation({
    mutationFn: (body) => maxikay.tournaments.addStream(tournamentId, body),
    onSuccess: () => {
      toast.success("Stream added");
      setUrl("");
      qc.invalidateQueries({ queryKey: ["tournament-streams", tournamentId] });
    },
    onError: (e) => toast.error(e?.message || "Failed to add stream"),
  });

  const delMut = useMutation({
    mutationFn: (id) => maxikay.tournaments.deleteStream(id),
    onSuccess: () => {
      toast.success("Stream removed");
      qc.invalidateQueries({ queryKey: ["tournament-streams", tournamentId] });
    },
    onError: (e) => toast.error(e?.message || "Delete failed"),
  });

  const primaryMut = useMutation({
    mutationFn: (id) => maxikay.tournaments.updateStream(id, { is_primary: true }),
    onSuccess: () => {
      toast.success("Primary stream updated");
      qc.invalidateQueries({ queryKey: ["tournament-streams", tournamentId] });
    },
    onError: (e) => toast.error(e?.message || "Update failed"),
  });

  if (!tournamentId) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-secondary/10 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold uppercase tracking-wider">Broadcasts</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Main + co-streams (language, caster VODs). Shown on Match Live as selectable embeds.
      </p>

      {q.isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : streams.length === 0 ? (
        <p className="text-xs text-muted-foreground">No multi-stream rows yet — legacy tournament stream URL still works.</p>
      ) : (
        <ul className="space-y-2">
          {streams.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs"
            >
              <span className="font-semibold text-foreground">{s.label}</span>
              {s.is_primary ? (
                <span className="inline-flex items-center gap-0.5 text-primary text-[10px] uppercase">
                  <Star className="w-3 h-3" /> Primary
                </span>
              ) : null}
              <span className="text-muted-foreground truncate max-w-[220px] sm:max-w-md">{s.stream_url}</span>
              <span className="text-muted-foreground/70">{s.provider || ""}</span>
              {canEdit ? (
                <span className="ml-auto flex gap-1">
                  {!s.is_primary ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px]"
                      onClick={() => primaryMut.mutate(s.id)}
                    >
                      Set primary
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-red-400"
                    onClick={() => delMut.mutate(s.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] items-end pt-2 border-t border-white/5">
          <div>
            <Label className="text-[10px] uppercase">Label</Label>
            <Input
              className="mt-1 bg-secondary/50 h-9"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Main / EN / Co-stream"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase">URL</Label>
            <Input
              className="mt-1 bg-secondary/50 h-9"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://twitch.tv/… or YouTube"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1"
            disabled={!url.trim() || addMut.isPending}
            onClick={() =>
              addMut.mutate({
                label: label || "Stream",
                stream_url: url.trim(),
                is_primary: streams.length === 0,
                sort_order: streams.length,
              })
            }
          >
            {addMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
