import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";
import { clsx } from "clsx";

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  color: "green" | "blue" | "red" | "yellow";
  suffix?: string;
}

const colorMap = {
  green:  { val: "text-accent", glow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]", border: "border-accent/10", beam: "from-accent/0 via-accent/20 to-accent/0" },
  blue:   { val: "text-blue-400", glow: "shadow-[0_0_20px_rgba(59,130,246,0.12)]", border: "border-blue-500/10", beam: "from-blue-500/0 via-blue-500/20 to-blue-500/0" },
  red:    { val: "text-red-400", glow: "shadow-[0_0_20px_rgba(239,68,68,0.12)]", border: "border-red-500/10", beam: "from-red-500/0 via-red-500/20 to-red-500/0" },
  yellow: { val: "text-yellow-400", glow: "shadow-[0_0_20px_rgba(245,158,11,0.12)]", border: "border-yellow-500/10", beam: "from-yellow-500/0 via-yellow-500/20 to-yellow-500/0" },
};

function AnimatedNumber({ value }: { value: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    const controls = animate(count, value, { duration: 1.2, ease: "easeOut" });
    return controls.stop;
  }, [value]);
  return <motion.span>{rounded}</motion.span>;
}

export function StatCard({ label, value, icon, color, suffix }: StatCardProps) {
  const c = colorMap[color];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}
      transition={{ duration: 0.3 }}
      className={clsx(
        "relative glass rounded-2xl p-5 overflow-hidden border",
        c.border, c.glow
      )}
    >
      {/* Border beam */}
      <div className={clsx(
        "absolute top-0 left-0 right-0 h-px bg-gradient-to-r",
        c.beam
      )} />

      <div className="text-2xl mb-3">{icon}</div>
      <div className={clsx("mono text-3xl font-bold mb-1", c.val)}>
        <AnimatedNumber value={value} />{suffix}
      </div>
      <div className="text-[11px] text-white/35 uppercase tracking-wider font-medium">{label}</div>
    </motion.div>
  );
}
