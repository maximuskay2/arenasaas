import { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Button } from "@/components/ui/button";
import { Shield, GripVertical, AlertTriangle, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

function TeamSlot({ match, slot, team, index, isDragging }) {
  return (
    <Draggable draggableId={`${match.id}-${slot}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing
            ${snapshot.isDragging
              ? "border-primary/60 bg-primary/15 shadow-lg shadow-primary/20"
              : team ? "border-border/40 bg-secondary/50 hover:border-primary/30"
              : "border-dashed border-border/30 bg-secondary/20"
            }`}
        >
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            {team ? (
              <>
                <p className="text-xs font-semibold text-foreground truncate">{team.name}</p>
                <p className="text-[10px] text-muted-foreground">[{team.tag}] · Seed #{team.seed || "?"}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">Empty slot — drop team here</p>
            )}
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono shrink-0">
            {slot === "a" ? "P1" : "P2"}
          </span>
        </div>
      )}
    </Draggable>
  );
}

export default function BracketEditor({ matches, teams, tournamentId, onClose }) {
  const queryClient = useQueryClient();
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));

  // Local editable state: map of matchId -> { team_a_id, team_a_name, team_b_id, team_b_name }
  const [localMatches, setLocalMatches] = useState(() =>
    matches.map((m) => ({
      id: m.id,
      round: m.round,
      match_number: m.match_number,
      team_a_id: m.team_a_id,
      team_a_name: m.team_a_name,
      team_b_id: m.team_b_id,
      team_b_name: m.team_b_name,
      status: m.status,
    }))
  );
  const [dirty, setDirty] = useState(false);

  const rounds = [...new Set(localMatches.map((m) => m.round))].sort((a, b) => a - b);

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const [srcMatchId, srcSlot] = result.draggableId.split("-").slice(0, -1).concat(result.draggableId.split("-").slice(-1));
    // draggableId is `${match.id}-${slot}` but match.id may contain hyphens
    // Parse: last char is slot (a/b), rest is matchId
    const fullId = result.draggableId;
    const slotChar = fullId.slice(-1);
    const srcId = fullId.slice(0, -2);

    const destId = result.destination.droppableId.slice(0, -2);
    const destSlot = result.destination.droppableId.slice(-1);

    if (srcId === destId && slotChar === destSlot) return;

    setLocalMatches((prev) => {
      const updated = prev.map((m) => ({ ...m }));
      const srcMatch = updated.find((m) => m.id === srcId);
      const destMatch = updated.find((m) => m.id === destId);
      if (!srcMatch || !destMatch) return prev;

      const getTeam = (m, slot) => slot === "a"
        ? { id: m.team_a_id, name: m.team_a_name }
        : { id: m.team_b_id, name: m.team_b_name };

      const setTeam = (m, slot, teamId, teamName) => {
        if (slot === "a") { m.team_a_id = teamId; m.team_a_name = teamName; }
        else { m.team_b_id = teamId; m.team_b_name = teamName; }
      };

      const srcTeam = getTeam(srcMatch, slotChar);
      const destTeam = getTeam(destMatch, destSlot);

      // Swap
      setTeam(srcMatch, slotChar, destTeam.id, destTeam.name);
      setTeam(destMatch, destSlot, srcTeam.id, srcTeam.name);

      return updated;
    });
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const origById = Object.fromEntries(matches.map((m) => [m.id, m]));
      const changed = localMatches.filter((m) => {
        const orig = origById[m.id];
        return orig.team_a_id !== m.team_a_id || orig.team_b_id !== m.team_b_id;
      });
      await Promise.all(changed.map((m) => {
        const orig = origById[m.id];
        return maxikay.entities.Match.update(m.id, {
          team_a_id: m.team_a_id,
          team_a_name: m.team_a_name,
          team_b_id: m.team_b_id,
          team_b_name: m.team_b_name,
          // Reset score/status for restructured matches
          score_a: 0,
          score_b: 0,
          winner_id: null,
          winner_name: null,
          status: "pending",
          expected_version: orig?.version ?? 1,
          expected_status: orig?.status,
        });
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament-matches", tournamentId] });
      toast.success(`Bracket restructured. ${localMatches.filter(m => {
        const orig = matches.find(o => o.id === m.id);
        return orig?.team_a_id !== m.team_a_id || orig?.team_b_id !== m.team_b_id;
      }).length} match(es) updated.`);
      setDirty(false);
      onClose?.();
    },
  });

  const reset = () => {
    setLocalMatches(matches.map((m) => ({
      id: m.id, round: m.round, match_number: m.match_number,
      team_a_id: m.team_a_id, team_a_name: m.team_a_name,
      team_b_id: m.team_b_id, team_b_name: m.team_b_name,
      status: m.status,
    })));
    setDirty(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Warning banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-yellow-400">Admin Bracket Editor</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Drag team slots between matches to restructure the bracket. Moved matches will be reset to "pending". Use for walkovers, conflicts, or emergency restructuring.
          </p>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-6 overflow-x-auto pb-4">
          {rounds.map((round) => {
            const roundMatches = localMatches.filter((m) => m.round === round).sort((a, b) => a.match_number - b.match_number);
            return (
              <div key={round} className="flex-shrink-0 w-64 space-y-3">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Round {round}</p>
                {roundMatches.map((match) => {
                  const isModified = (() => {
                    const orig = matches.find((o) => o.id === match.id);
                    return orig?.team_a_id !== match.team_a_id || orig?.team_b_id !== match.team_b_id;
                  })();
                  return (
                    <div key={match.id} className={`glass rounded-xl p-3 space-y-2 border ${isModified ? "border-yellow-500/40" : "border-border/30"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-muted-foreground">M{match.match_number}</span>
                        {isModified && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-semibold">MODIFIED</span>}
                        {match.status !== "pending" && !isModified && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                            match.status === "completed" ? "bg-green-500/20 text-green-400" : "bg-primary/20 text-primary"
                          }`}>{match.status}</span>
                        )}
                      </div>
                      <Droppable droppableId={`${match.id}-a`}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps}
                            className={`rounded-lg transition-colors ${snapshot.isDraggingOver ? "ring-1 ring-primary/50 bg-primary/5" : ""}`}>
                            <TeamSlot match={match} slot="a" team={teamsById[match.team_a_id]} index={0} />
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                      <div className="text-center text-[10px] font-display text-muted-foreground/50">VS</div>
                      <Droppable droppableId={`${match.id}-b`}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps}
                            className={`rounded-lg transition-colors ${snapshot.isDraggingOver ? "ring-1 ring-primary/50 bg-primary/5" : ""}`}>
                            <TeamSlot match={match} slot="b" team={teamsById[match.team_b_id]} index={0} />
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <div className="flex items-center gap-3 pt-2 border-t border-border/40">
        <Button size="sm" variant="outline" onClick={reset} disabled={!dirty} className="gap-1.5 text-xs">
          <RotateCcw className="w-3.5 h-3.5" /> Reset Changes
        </Button>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          className="gap-1.5 text-xs font-display"
        >
          <Save className="w-3.5 h-3.5" /> {saveMutation.isPending ? "Saving..." : "Save Restructured Bracket"}
        </Button>
        {dirty && (
          <span className="text-[11px] text-yellow-400 ml-auto">Unsaved changes</span>
        )}
      </div>
    </motion.div>
  );
}