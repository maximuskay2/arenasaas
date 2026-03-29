import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { ArrowLeft, Plus, Edit2, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/shared/PageHeader";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { toast } from "sonner";
import { motion } from "framer-motion";

const CATEGORIES = ["jersey", "hat", "hoodie", "other"];

export default function MerchandiseDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const tournamentId = params.get("tournament_id");

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", category: "jersey", price: "", stock: "", image_url: "" });

  const { data: tournament } = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => maxikay.entities.Tournament.filter({ id: tournamentId }).then((r) => r[0]),
    enabled: !!tournamentId,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["merch-items", tournamentId],
    queryFn: () => maxikay.entities.MerchandiseItem.filter({ tournament_id: tournamentId }),
    enabled: !!tournamentId,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["merch-orders", tournamentId],
    queryFn: () => maxikay.entities.MerchandiseOrder.filter({ tournament_id: tournamentId }, "-created_date"),
    enabled: !!tournamentId,
  });

  const saveItem = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.price) {
        toast.error("Name and price required");
        return;
      }
      const data = {
        tournament_id: tournamentId,
        name: form.name,
        category: form.category,
        price: parseFloat(form.price),
        stock: parseInt(form.stock) || 0,
        image_url: form.image_url,
      };
      if (editId) {
        await maxikay.entities.MerchandiseItem.update(editId, data);
      } else {
        await maxikay.entities.MerchandiseItem.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merch-items", tournamentId] });
      setForm({ name: "", category: "jersey", price: "", stock: "", image_url: "" });
      setEditId(null);
      setShowForm(false);
      toast.success(editId ? "Item updated" : "Item added");
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id) => maxikay.entities.MerchandiseItem.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["merch-items", tournamentId] }),
  });

  const updateOrderStatus = useMutation({
    mutationFn: ({ orderId, status, trackingNumber }) =>
      maxikay.entities.MerchandiseOrder.update(orderId, { status, tracking_number: trackingNumber }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["merch-orders", tournamentId] }),
  });

  if (!tournamentId) return <div className="py-20 text-center text-muted-foreground">No tournament_id in URL</div>;
  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-0">
      <PageHeader
        title="Merchandise Manager"
        subtitle={tournament?.name}
        actions={<Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4" /></Button>}
      />

      {/* Items Section */}
      <div className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" /> Items ({items.length})
          </h3>
          <Button size="sm" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: "", category: "jersey", price: "", stock: "", image_url: "" }); }} className="gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> Add Item
          </Button>
        </div>

        {showForm && (
          <div className="border-t border-border/40 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-secondary/50 text-xs h-8" />
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="h-8 text-xs bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Price" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="bg-secondary/50 text-xs h-8" />
              <Input placeholder="Stock quantity" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="bg-secondary/50 text-xs h-8" />
              <Input placeholder="Image URL" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className="col-span-2 bg-secondary/50 text-xs h-8" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveItem.mutate()} disabled={saveItem.isPending} className="text-xs flex-1">
                {saveItem.isPending ? "Saving..." : editId ? "Update" : "Add Item"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="text-xs">
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {items.map((item) => (
            <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/30 hover:border-border/60">
              {item.image_url && <img src={item.image_url} alt={item.name} className="w-8 h-8 rounded object-cover mr-3" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">${item.price.toFixed(2)} · {item.category} · Stock: {item.stock}</p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditId(item.id); setForm(item); setShowForm(true); }}>
                  <Edit2 className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteItem.mutate(item.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Orders Section */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-display uppercase tracking-wider text-muted-foreground">Orders ({orders.length})</h3>
        {orders.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-6">No orders yet.</p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <motion.div key={order.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-3 py-2.5 rounded-lg border border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{order.buyer_name}</p>
                    <p className="text-[10px] text-muted-foreground">{order.buyer_email} · ${order.total_amount.toFixed(2)}</p>
                  </div>
                  <Select
                    value={order.status}
                    onValueChange={(status) => updateOrderStatus.mutate({ orderId: order.id, status })}
                  >
                    <SelectTrigger className="h-7 text-[10px] w-28 bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {order.status === "shipped" && (
                  <Input
                    placeholder="Tracking number"
                    value={order.tracking_number || ""}
                    onChange={(e) => updateOrderStatus.mutate({ orderId: order.id, status: order.status, trackingNumber: e.target.value })}
                    className="h-7 text-[10px] bg-secondary/50"
                  />
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}