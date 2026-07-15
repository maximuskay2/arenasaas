import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function StatsCard({ icon: Icon, label, value, trend, trendUp, delay = 0, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden glass rounded-2xl p-5 glass-hover group",
        className
      )}
    >
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl group-hover:bg-primary/20 transition-colors" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-label">{label}</p>
          <p className="text-2xl md:text-3xl font-display font-bold mt-2 text-foreground tracking-tight truncate">
            {value}
          </p>
          {trend && (
            <p className={`text-xs mt-2 font-semibold ${trendUp ? "text-emerald-400" : "text-muted-foreground"}`}>
              {trend}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-xl bg-primary/10 ring-1 ring-primary/20 shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>
    </motion.div>
  );
}
