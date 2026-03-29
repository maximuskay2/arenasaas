import { motion } from "framer-motion";

export default function StatsCard({ icon: Icon, label, value, trend, trendUp, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="glass rounded-xl p-5 glass-hover"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-display font-bold mt-1 text-foreground">{value}</p>
          {trend && (
            <p className={`text-xs mt-1 ${trendUp ? "text-green-400" : "text-accent"}`}>
              {trend}
            </p>
          )}
        </div>
        <div className="p-2.5 rounded-lg bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </motion.div>
  );
}