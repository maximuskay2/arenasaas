import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import SponsorBar from "../components/tournament/SponsorBar";
import { useTenant } from "@/hooks/useTenant";
import { Plus, Edit, Trash2, Star, Award, Medal, ExternalLink, Eye } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const TIER_CONFIG = {
  title: { label: "Title Sponsor", icon: Star, color: "text-yellow-400", border: "border-yellow-400/40", bg: "bg-yellow-400/5" },
  gold: { label: "Gold", icon: Award, color: "text-yellow-500", border: "border-yellow-500/30", bg: "bg-yellow-500/5" },
  silver: { label: "Silver", icon: Medal, color: "text-slate-400", border: "border-slate-400/30", bg: "bg-slate-400/5" },
  bronze: { label: "Bronze", icon: Medal, color: "text-orange-600", border: "border-orange-600/30", bg: "bg-orange-600/5" },
};

const PRICING = { title: "$5,000+", gold: "$2,000+", silver: "$500+", bronze: "$100+" };

function SponsorForm({ initial, tournaments, tenantId, onSave, onClose, isPending }) {
  const [form, setForm] = useState({
    name: "", logo_url: "", website_url: "", tier: "silver", tournament_id: "", display_order: 0, notes: "",
    ...initial,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label className="text-xs">Sponsor Name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1 bg-secondary/50 text-xs" /></div>
        <div><Label className="text-xs">Tier</Label>
          <Select value={form.tier} onValueChange={(v) => set("tier", v)}>
            <SelectTrigger className="mt-1 bg-secondary/50 text-xs h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TIER_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label} — {PRICING[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Display Order</Label><Input type="number" value={form.display_order} onChange={(e) => set("display_order", +e.target.value)} className="mt-1 bg-secondary/50 text-xs" /></div>
        <div className="col-span-2"><Label className="text-xs">Logo URL</Label><Input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} className="mt-1 bg-secondary/50 text-xs" placeholder="https://…/logo.png" /></div>
        <div className="col-span-2"><Label className="text-xs">Website URL</Label><Input value={form.website_url} onChange={(e) => set("website_url", e.target.value)} className="mt-1 bg-secondary/50 text-xs" placeholder="https://sponsor.com" /></div>
        <div className="col-span-2"><Label className="text-xs">Tournament (leave blank for global)</Label>
          <Select value={form.tournament_id || "global"} onValueChange={(v) => set("tournament_id", v === "global" ? "" : v)}>
            <SelectTrigger className="mt-1 bg-secondary/50 text-xs h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global (all tournaments)</SelectItem>
              {tournaments.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {form.logo_url && (
          <div className="col-span-2 flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-secondary/20">
            <img src={form.logo_url} alt="preview" className="h-10 object-contain" onError={(e) => e.target.style.display = "none"} />
            <p className="text-xs text-muted-foreground">Logo preview</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onSave({ ...form, tenant_id: tenantId, is_active: true })} disabled={!form.name || isPending} className="flex-1 text-xs font-display">
          {isPending ? "Saving…" : "Save Sponsor"}
        </Button>
        <Button variant="ghost" onClick={onClose} className="text-xs">Cancel</Button>
      </div>
    </div>
  );
}

export default function Sponsorships() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: sponsors = [], isLoading } = useQuery({
    queryKey: ["sponsors-admin", tenantId],
    queryFn: () => maxikay.entities.Sponsor.filter({ tenant_id: tenantId }, "-created_date", 100),
    enabled: !!tenantId,
  });

  const { data: tournaments = [] } = useQuery({
    queryKey: ["tournaments", tenantId],
    queryFn: () => maxikay.entities.Tournament.filter({ tenant_id: tenantId }, "-created_date", 50),
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing?.id ? maxikay.entities.Sponsor.update(editing.id, data) : maxikay.entities.Sponsor.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sponsors-admin", tenantId] }); queryClient.invalidateQueries({ queryKey: ["sponsors"] }); setFormOpen(false); setEditing(null); toast.success("Sponsor saved!"); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => maxikay.entities.Sponsor.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sponsors-admin", tenantId] }); queryClient.invalidateQueries({ queryKey: ["sponsors"] }); toast.success("Sponsor removed."); },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }) => maxikay.entities.Sponsor.update(id, { is_active: !is_active }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sponsors-admin", tenantId] }); queryClient.invalidateQueries({ queryKey: ["sponsors"] }); },
  });

  const tierGroups = ["title", "gold", "silver", "bronze"].map((tier) => ({
    tier, items: sponsors.filter((s) => s.tier === tier),
  })).filter((g) => g.items.length > 0);

  const totalByTier = Object.fromEntries(["title", "gold", "silver", "bronze"].map((t) => [t, sponsors.filter((s) => s.tier === t).length]));

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <PageHeader
        title="Sponsorships"
        subtitle="Manage sponsor tiers, logos and placements across your tournaments"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPreviewOpen(!previewOpen)} className="gap-1.5 text-xs">
              <Eye className="w-3.5 h-3.5" /> Preview Bar
            </Button>
            <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 text-xs font-display"><Plus className="w-3.5 h-3.5" /> Add Sponsor</Button>
              </DialogTrigger>
              <DialogContent className="glass border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle className="font-display">{editing ? "Edit Sponsor" : "Add Sponsor"}</DialogTitle></DialogHeader>
                <SponsorForm
                  initial={editing}
                  tournaments={tournaments}
                  tenantId={tenantId}
                  onSave={(d) => saveMutation.mutate(d)}
                  onClose={() => { setFormOpen(false); setEditing(null); }}
                  isPending={saveMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Tier KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(TIER_CONFIG).map(([tier, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={tier} className={`glass rounded-xl p-4 border ${cfg.border} ${cfg.bg}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${cfg.color}`} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{cfg.label}</span>
              </div>
              <p className={`text-2xl font-display font-bold ${cfg.color}`}>{totalByTier[tier] || 0}</p>
              <p className="text-[10px] text-muted-foreground">Suggested: {PRICING[tier]}</p>
            </div>
          );
        })}
      </div>

      {/* Live preview */}
      {previewOpen && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Live Sponsor Bar Preview</p>
          <SponsorBar tenantId={tenantId} />
        </div>
      )}

      {/* Sponsor list */}
      {isLoading ? <LoadingSpinner /> : tierGroups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No sponsors yet. Add your first sponsor to get started.</p>
        </div>
      ) : tierGroups.map(({ tier, items }) => {
        const cfg = TIER_CONFIG[tier];
        const Icon = cfg.icon;
        return (
          <div key={tier} className="space-y-3">
            <div className={`flex items-center gap-2 text-xs font-display uppercase tracking-wider ${cfg.color}`}>
              <Icon className="w-4 h-4" /> {cfg.label} ({items.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((s) => (
                <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={`glass rounded-xl p-4 border ${cfg.border} ${!s.is_active ? "opacity-50" : ""} space-y-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {s.logo_url ? (
                        <img src={s.logo_url} alt={s.name} className="h-10 w-auto object-contain" onError={(e) => e.target.style.display = "none"} />
                      ) : (
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
                          <Icon className={`w-5 h-5 ${cfg.color}`} />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-foreground">{s.name}</p>
                        {s.tournament_id ? (
                          <p className="text-[10px] text-muted-foreground">Tournament-specific</p>
                        ) : (
                          <p className="text-[10px] text-primary">Global sponsor</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.website_url && (
                        <a href={s.website_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ExternalLink className="w-3 h-3" /></Button>
                        </a>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(s); setFormOpen(true); }}><Edit className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteMutation.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${s.is_active ? "bg-green-500/15 text-green-400" : "bg-secondary text-muted-foreground"}`}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                    <button onClick={() => toggleActive.mutate(s)} className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
                      {s.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}