import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function PageHeader({ title, subtitle, actions, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8", className)}
    >
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
    </motion.div>
  );
}