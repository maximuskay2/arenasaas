import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function GlassCard({ children, className = "", glow = false, hover = true, onClick }) {
  return (
    <motion.div
      whileHover={hover ? { y: -3, transition: { duration: 0.2 } } : undefined}
      onClick={onClick}
      className={cn(
        "glass rounded-2xl p-5 shadow-arena-card",
        hover && "glass-hover cursor-pointer",
        glow && "glow-primary",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
