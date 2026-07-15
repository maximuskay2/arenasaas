import { motion } from "framer-motion";

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 px-4 text-center glass rounded-3xl border-dashed border-border/60"
    >
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 ring-1 ring-primary/25 flex items-center justify-center mb-5 shadow-arena-glow">
        {Icon ? <Icon className="w-8 h-8 text-primary" /> : null}
      </div>
      <h3 className="text-lg font-display font-bold text-foreground mb-2 tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">{description}</p>
      {action}
    </motion.div>
  );
}
