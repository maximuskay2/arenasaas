import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function PageHeader({ title, subtitle, actions, className, eyebrow }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn("flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8", className)}
    >
      <div className="min-w-0">
        {eyebrow && <p className="section-label mb-2">{eyebrow}</p>}
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-display font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">{actions}</div>}
    </motion.div>
  );
}
