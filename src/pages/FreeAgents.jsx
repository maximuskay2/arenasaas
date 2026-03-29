import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { User, Search, Plus, Send, MapPin, Clock, Trophy, Edit, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";

const REGIONS = ["NA", "EU", "LATAM", "ASIA", "OCE", "AF", "ME"];
const AVAILABILITY = ["weekdays", "weekends", "anytime", "limited"];

const TIER_COLORS = {
  NA: "bg-blue-500/15 text-blue-400", EU: "bg-green-500/15 text-green-400",
  LATAM: "bg-yellow-500/15 text-yellow-400", ASIA: "bg-purple-500/15 text-purple-400",
  OCE: "bg-teal-500/15 text-teal-400", AF: "bg-orange-500/15 text-orange-400",
  ME: "bg-red-500/15 text-red-400",
};

function AgentCard({ agent, currentUser, onInvite, onEdit, onDelete }) {
  const isOwn = currentUser?.email === agent.player_email;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-5 space-y-3 border border-border/30 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-display font-bold text-sm text-foreground">{agent.display_name}</p>
            <p className="text-[10px] text-muted-foreground">{agent.player_email}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isOwn && (
            <>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(agent)}><Edit className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onDelete(agent.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </>
          )}
          {!isOwn && (
            <Button size="sm" onClick={() => onInvite(agent)} className="text-xs gap-1 h-7 font-display">
              <Send className="w-3 h-3" /> Invite
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${TIER_COLORS[agent.region] || "bg-secondary text-muted-foreground"}`}>
          <MapPin className="w-2.5 h-2.5 inline mr-0.5" />{agent.region}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground">
          <Clock className="w-2.5 h-2.5 inline mr-0.5" />{agent.availability}
        </span>
        {agent.rank && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">
            <Trophy className="w-2.5 h-2.5 inline mr-0.5" />{agent.rank}
          </span>
        )}
        {agent.discord_handle && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">
            Discord: {agent.discord_handle}
          </span>
        )}
      </div>

      {agent.preferred_games?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.preferred_games.map((g) => (
            <span key={g} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{g}</span>
          ))}
        </div>
      )}

      {agent.bio && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{agent.bio}</p>}

      <div className="flex gap-4 text-[10px] text-muted-foreground pt-1 border-t border-border/20">
        <span>{agent.wins || 0} wins</span>
        <span>{agent.tournaments_played || 0} tournaments</span>
      </div>
    </motion.div>
  );
}

function AgentForm({ initial, onSave, onClose, isPending }) {
  const [form, setForm] = useState({
    display_name: "", bio: "", preferred_games: "", rank: "", region: "NA",
    availability: "anytime", discord_handle: "",
    ...initial,
    preferred_games: initial?.preferred_games?.join(", ") || "",
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    onSave({
      ...form,
      preferred_games: form.preferred_games.split(",").map((s) => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label className="text-xs">Display Name *</Label><Input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} className="mt-1 bg-secondary/50 text-xs" /></div>
        <div><Label className="text-xs">Rank / Elo</Label><Input value={form.rank} onChange={(e) => set("rank", e.target.value)} className="mt-1 bg-secondary/50 text-xs" placeholder="e.g. Diamond, 1800 MMR" /></div>
        <div><Label className="text-xs">Region</Label>
          <Select value={form.region} onValueChange={(v) => set("region", v)}>
            <SelectTrigger className="mt-1 bg-secondary/50 text-xs h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Availability</Label>
          <Select value={form.availability} onValueChange={(v) => set("availability", v)}>
            <SelectTrigger className="mt-1 bg-secondary/50 text-xs h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{AVAILABILITY.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Discord Handle</Label><Input value={form.discord_handle} onChange={(e) => set("discord_handle", e.target.value)} className="mt-1 bg-secondary/50 text-xs" placeholder="user#1234" /></div>
        <div className="col-span-2"><Label className="text-xs">Preferred Games (comma-separated)</Label><Input value={form.preferred_games} onChange={(e) => set("preferred_games", e.target.value)} className="mt-1 bg-secondary/50 text-xs" placeholder="Valorant, LoL, CS2" /></div>
        <div className="col-span-2"><Label className="text-xs">Bio</Label><Textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} className="mt-1 bg-secondary/50 text-xs" rows={3} placeholder="Tell teams about yourself..." /></div>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={!form.display_name || isPending} className="flex-1 text-xs font-display">{isPending ? "Saving…" : "Save Profile"}</Button>
        <Button variant="ghost" onClick={onClose} className="text-xs">Cancel</Button>
      </div>
    </div>
  );
}

export default function FreeAgents() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  const [search, setSearch] = useState("");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterGame, setFilterGame] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => { maxikay.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["free-agents"],
    queryFn: () => maxikay.entities.FreeAgent.filter({ is_active: true }, "-created_date", 100),
  });

  const filtered = useMemo(() => agents.filter((a) => {
    if (search && !a.display_name?.toLowerCase().includes(search.toLowerCase()) && !a.player_email?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterRegion !== "all" && a.region !== filterRegion) return false;
    if (filterGame && !a.preferred_games?.some((g) => g.toLowerCase().includes(filterGame.toLowerCase()))) return false;
    return true;
  }), [agents, search, filterRegion, filterGame]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editing?.id) return maxikay.entities.FreeAgent.update(editing.id, data);
      return maxikay.entities.FreeAgent.create({ ...data, player_email: currentUser?.email, is_active: true });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["free-agents"] }); setFormOpen(false); setEditing(null); toast.success("Profile saved!"); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => maxikay.entities.FreeAgent.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["free-agents"] }); toast.success("Listing removed."); },
  });

  const inviteMutation = useMutation({
    mutationFn: async (agent) => {
      const senderName = currentUser?.full_name || currentUser?.email;
      const body = `${senderName} wants to recruit you! They found your free agent profile on ArenaSaaS. Reply to: ${currentUser?.email}`;
      // In-app notification
      await maxikay.entities.Notification.create({
        user_email: agent.player_email,
        type: "invite",
        title: "Team Recruitment Invite",
        body,
      });
      // Email notification
      await maxikay.integrations.Core.SendEmail({
        to: agent.player_email,
        from_name: "ArenaSaaS",
        subject: `🎮 Team Recruitment Invite from ${senderName}`,
        body: `Hi ${agent.display_name},\n\n${body}\n\n— ArenaSaaS`,
      });
    },
    onSuccess: () => toast.success("Invite sent via email!"),
  });

  const isListed = agents.some((a) => a.player_email === currentUser?.email);

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <PageHeader
        title="Free Agent Market"
        subtitle="Find available players or list your availability for team recruitment"
        actions={
          !isListed && currentUser && (
            <Dialog open={formOpen} onOpenChange={setFormOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 text-xs font-display"><Plus className="w-3.5 h-3.5" /> List Myself</Button>
              </DialogTrigger>
              <DialogContent className="glass border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle className="font-display">Create Free Agent Profile</DialogTitle></DialogHeader>
                <AgentForm onSave={(d) => saveMutation.mutate(d)} onClose={() => setFormOpen(false)} isPending={saveMutation.isPending} />
              </DialogContent>
            </Dialog>
          )
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players…" className="pl-9 bg-secondary/50 text-xs h-9" />
        </div>
        <Select value={filterRegion} onValueChange={setFilterRegion}>
          <SelectTrigger className="w-36 bg-secondary/50 text-xs h-9"><SelectValue placeholder="Region" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input value={filterGame} onChange={(e) => setFilterGame(e.target.value)} placeholder="Filter by game…" className="w-40 bg-secondary/50 text-xs h-9" />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center py-16 text-muted-foreground">
              <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No free agents listed yet.</p>
            </div>
          ) : filtered.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              currentUser={currentUser}
              onInvite={(ag) => inviteMutation.mutate(ag)}
              onEdit={(ag) => { setEditing(ag); setFormOpen(true); }}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Edit dialog */}
      {editing && (
        <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
          <DialogContent className="glass border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display">Edit Profile</DialogTitle></DialogHeader>
            <AgentForm initial={editing} onSave={(d) => saveMutation.mutate(d)} onClose={() => setEditing(null)} isPending={saveMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}