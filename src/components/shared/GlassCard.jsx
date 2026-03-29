import { motion } from "framer-motion";

export default function GlassCard({ children, className = "", glow = false, hover = true, onClick }) {
  return (
    <motion.div
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
      onClick={onClick}
      className={`
        glass rounded-xl p-5
        ${hover ? "glass-hover cursor-pointer" : ""}
        ${glow ? "glow-primary" : ""}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}