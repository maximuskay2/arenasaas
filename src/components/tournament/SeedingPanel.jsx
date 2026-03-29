import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GripVertical, Wand2, Trophy, CheckCircle2, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { seedByElo, eloTier } from "@/lib/eloRating";

function winRate(team) {
  const w = team.wins || 0;
  const l = team.losses || 0;
  if (w + l === 0) return 0;
  return w / (w + l);
}

function autoSeed(teams) {
  return seedByElo(teams);
}

export default function SeedingPanel({ teams, tournamentId }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ordered, setOrdered] = useState([]);

  const openWithAutoSeed = () => {
    setOrdered(autoSeed(teams));
    setOpen(true);
  };

  const onDragEnd = useCallback((result) => {
    if (!result.destination) return;
    const next = [...ordered];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setOrdered(next);
  }, [ordered]);

  const applySeeds = useMutation({
    mutationFn: async () => {
      await Promise.all(
        ordered.map((team, idx) =>
          maxikay.entities.Team.update(team.id, { seed: idx + 1 })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tournament-teams", tournamentId] });
      toast.success("Seeds applied successfully");
      setOpen(false);
    },
  });

  if (teams.length < 2) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={openWithAutoSeed} className="gap-2 font-display text-xs tracking-wider border-primary/30 text-primary hover:bg-primary/10">
          <Wand2 className="w-3.5 h-3.5" /> SEED TEAMS
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Team Seeding
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Auto-ranked by Elo rating (K=32). Drag to manually reorder, then apply.
          </p>
        </DialogHeader>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="seeds">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="space-y-2 max-h-80 overflow-y-auto pr-1"
              >
                {ordered.map((team, idx) => (
                  <Draggable key={team.id} draggableId={team.id} index={idx}>
                    {(drag, snapshot) => (
                      <motion.div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors ${
                          snapshot.isDragging
                            ? "bg-primary/10 border-primary/40 shadow-lg"
                            : "glass border-border/40"
                        }`}
                      >
                        {/* Drag handle */}
                        <span {...drag.dragHandleProps} className="text-muted-foreground cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-4 h-4" />
                        </span>

                        {/* Seed badge */}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-display font-bold shrink-0 ${
                          idx === 0 ? "bg-yellow-500/20 text-yellow-400" :
                          idx === 1 ? "bg-slate-400/20 text-slate-300" :
                          idx === 2 ? "bg-orange-500/20 text-orange-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          #{idx + 1}
                        </div>

                        {/* Team info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{team.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {team.wins || 0}W – {team.losses || 0}L
                            {(team.wins || 0) + (team.losses || 0) > 0 && (
                              <span className="ml-1 text-primary">
                                ({Math.round(winRate(team) * 100)}%)
                              </span>
                            )}
                          </p>
                          {team.elo && (
                            <p className={`text-[11px] flex items-center gap-1 ${eloTier(team.elo).color}`}>
                              <Zap className="w-2.5 h-2.5" />
                              {team.elo} Elo · {eloTier(team.elo).label}
                            </p>
                          )}
                        </div>

                        {/* Tag chip */}
                        <span className="text-xs font-display font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md shrink-0">
                          {team.tag}
                        </span>
                      </motion.div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOrdered(autoSeed(teams))}
            className="gap-1.5 text-xs"
          >
            <Wand2 className="w-3.5 h-3.5" /> Re-Auto Seed
          </Button>
          <Button
            size="sm"
            onClick={() => applySeeds.mutate()}
            disabled={applySeeds.isPending}
            className="flex-1 gap-1.5 font-display text-xs tracking-wider"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {applySeeds.isPending ? "Applying..." : "Apply Seeds"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}