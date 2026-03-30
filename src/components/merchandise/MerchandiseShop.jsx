import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { ShoppingCart, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function MerchandiseShop({ tournamentId, teamId, currentUser }) {
  const queryClient = useQueryClient();
  const [cart, setCart] = useState({});

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["merch-items", tournamentId],
    queryFn: () => maxikay.entities.MerchandiseItem.filter({ tournament_id: tournamentId, is_active: true }),
  });

  const checkout = useMutation({
    mutationFn: async () => {
      const orderItems = Object.entries(cart)
        .filter(([_, qty]) => qty > 0)
        .map(([itemId, qty]) => {
          const item = items.find((i) => i.id === itemId);
          return { item_id: itemId, item_name: item.name, qty, price_each: item.price };
        });

      if (orderItems.length === 0) {
        toast.error("Cart is empty");
        return;
      }

      const total = orderItems.reduce((sum, o) => sum + o.qty * o.price_each, 0);

      await maxikay.entities.MerchandiseOrder.create({
        tournament_id: tournamentId,
        tenant_id: currentUser.tenant_id,
        buyer_email: currentUser.email,
        buyer_name: currentUser.full_name,
        team_id: teamId,
        is_team_order: !!teamId,
        items: orderItems,
        total_amount: total,
        status: "pending",
      });

      // Send email
      await maxikay.integrations.Core.SendEmail({
        to: currentUser.email,
        subject: "📦 Order Received",
        body: `Your merchandise order has been received! Total: $${total.toFixed(2)}\n\nTrack your order in your dashboard.`,
      });

      setCart({});
      queryClient.invalidateQueries({ queryKey: ["user-orders", currentUser.email] });
      toast.success("Order placed! Check your email for details.");
    },
  });

  const total = Object.entries(cart).reduce((sum, [itemId, qty]) => {
    const item = items.find((i) => i.id === itemId);
    return sum + (item ? qty * item.price : 0);
  }, 0);

  if (isLoading) return <div className="py-6 text-center text-muted-foreground">Loading items...</div>;
  if (items.length === 0) return <div className="py-6 text-center text-muted-foreground">No merchandise available yet.</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((item, i) => {
          const qty = cart[item.id] || 0;
          return (
            <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="glass rounded-xl overflow-hidden p-3 hover:border-primary/50 transition-colors cursor-pointer">
              {item.image_url && <img src={item.image_url} alt={item.name} className="w-full h-32 object-cover rounded-lg mb-2" />}
              <h4 className="text-xs font-semibold text-foreground truncate">{item.name}</h4>
              <p className="text-[10px] text-muted-foreground">{item.category}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-display font-bold text-primary">${item.price.toFixed(2)}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => qty > 0 && setCart({ ...cart, [item.id]: qty - 1 })} className="p-0.5 hover:bg-secondary rounded">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-[11px] font-semibold w-5 text-center">{qty}</span>
                  <button onClick={() => setCart({ ...cart, [item.id]: qty + 1 })} className="p-0.5 hover:bg-secondary rounded">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {Object.values(cart).some((q) => q > 0) && (
        <div className="glass rounded-xl p-4 space-y-3 sticky bottom-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-display">Total:</span>
            <span className="text-lg font-display font-bold text-primary">${total.toFixed(2)}</span>
          </div>
          <Button onClick={() => checkout.mutate()} disabled={checkout.isPending} className="w-full gap-2 font-display">
            <ShoppingCart className="w-4 h-4" />
            {checkout.isPending ? "Processing..." : "Checkout"}
          </Button>
        </div>
      )}
    </div>
  );
}