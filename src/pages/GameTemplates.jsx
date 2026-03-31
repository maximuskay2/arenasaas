import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Gamepad2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PageHeader from "../components/shared/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import LoadingSpinner from "../components/shared/LoadingSpinner";

export default function GameTemplates() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", roster_size: 5, scoring_mode: "best_of_1", map_pool: "" });

  const { data: games = [], isLoading } = useQuery({
    queryKey: ["game-templates"],
    queryFn: () => maxikay.entities.GameTemplate.list("-created_date"),
  });

  const createGame = useMutation({
    mutationFn: (data) => {
      const roster = Number(data.roster_size);
      const roster_size = Number.isFinite(roster) && roster >= 1 ? Math.floor(roster) : 5;
      const map_pool = data.map_pool
        ? String(data.map_pool)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      return maxikay.entities.GameTemplate.create({
        title: String(data.title || "").trim(),
        roster_size,
        scoring_mode: data.scoring_mode || "best_of_1",
        map_pool,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["game-templates"] });
      setOpen(false);
      setForm({ title: "", roster_size: 5, scoring_mode: "best_of_1", map_pool: "" });
    },
  });

  const deleteGame = useMutation({
    mutationFn: (id) => maxikay.entities.GameTemplate.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["game-templates"] }),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <PageHeader
        title="Game Templates"
        subtitle="Configure games for your tournaments"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 font-display text-xs tracking-wider">
                <Plus className="w-4 h-4" /> ADD GAME
              </Button>
            </DialogTrigger>
            <DialogContent className="glass border-border/50">
              <DialogHeader>
                <DialogTitle className="font-display">Add Game Template</DialogTitle>
                <DialogDescription>
                  Reusable rules for your league. Roster size and scoring apply when you pick this template for a tournament.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createGame.mutate(form); }} className="space-y-4">
                <div>
                  <Label>Game Title</Label>
                  <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} required className="mt-1 bg-secondary/50" placeholder="e.g. Valorant" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Roster Size</Label>
                    <Input
                      type="number"
                      value={form.roster_size}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setForm((p) => ({ ...p, roster_size: Number.isFinite(n) && n >= 1 ? n : 1 }));
                      }}
                      min={1}
                      className="mt-1 bg-secondary/50"
                    />
                  </div>
                  <div>
                    <Label>Scoring Mode</Label>
                    <Select value={form.scoring_mode} onValueChange={(v) => setForm(p => ({ ...p, scoring_mode: v }))}>
                      <SelectTrigger className="mt-1 bg-secondary/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="best_of_1">Best of 1</SelectItem>
                        <SelectItem value="best_of_3">Best of 3</SelectItem>
                        <SelectItem value="best_of_5">Best of 5</SelectItem>
                        <SelectItem value="points">Points</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Map Pool (comma separated)</Label>
                  <Input value={form.map_pool} onChange={(e) => setForm(p => ({ ...p, map_pool: e.target.value }))} className="mt-1 bg-secondary/50" placeholder="e.g. Ascent, Bind, Haven" />
                </div>
                <Button type="submit" disabled={createGame.isPending} className="w-full">
                  {createGame.isPending ? "Adding..." : "Add Game"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {games.length === 0 ? (
        <EmptyState icon={Gamepad2} title="No game templates" description="Add a game template to use in your tournaments" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-xl p-5 glass-hover relative group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Gamepad2 className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{game.title}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{game.scoring_mode?.replace(/_/g, " ")}</p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Roster: {game.roster_size} players</p>
                {game.map_pool?.length > 0 && (
                  <p>Maps: {game.map_pool.join(", ")}</p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-3 right-3 h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={() => deleteGame.mutate(game.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}