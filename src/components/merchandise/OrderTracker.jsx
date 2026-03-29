import { useQuery } from "@tanstack/react-query";
import { maxikay } from "@/api/maxikayClient";
import { Package, CheckCircle2, Clock, Truck } from "lucide-react";
import moment from "moment";
import { motion } from "framer-motion";

const STATUS_CONFIG = {
  pending: { icon: Clock, color: "text-yellow-400", label: "Pending" },
  processing: { icon: Clock, color: "text-blue-400", label: "Processing" },
  shipped: { icon: Truck, color: "text-primary", label: "Shipped" },
  delivered: { icon: CheckCircle2, color: "text-green-400", label: "Delivered" },
  cancelled: { icon: Package, color: "text-destructive", label: "Cancelled" },
};

export default function OrderTracker({ userEmail }) {
  const { data: orders = [] } = useQuery({
    queryKey: ["user-orders", userEmail],
    queryFn: () => maxikay.entities.MerchandiseOrder.filter({ buyer_email: userEmail }, "-created_date", 50),
    enabled: !!userEmail,
  });

  if (orders.length === 0) return <p className="text-xs text-muted-foreground text-center py-6">No orders yet.</p>;

  return (
    <div className="space-y-3">
      {orders.map((order, i) => {
        const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
        const Icon = cfg.icon;
        return (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-xl p-4 border border-border/30 hover:border-border/60 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Order #{order.id?.slice(-8).toUpperCase()}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{moment(order.created_date).format("MMM D, YYYY · h:mm A")}</p>
              </div>
              <div className={`flex items-center gap-1.5 ${cfg.color}`}>
                <Icon className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wider">{cfg.label}</span>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground mb-2">
              {order.items.map((item) => (
                <div key={item.item_id}>{item.qty}x {item.item_name} — ${(item.qty * item.price_each).toFixed(2)}</div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/20">
              <span className="text-xs font-semibold text-foreground">Total: ${order.total_amount.toFixed(2)}</span>
              {order.tracking_number && <span className="text-[10px] text-primary font-mono">{order.tracking_number}</span>}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}