import { motion } from "framer-motion";
import { useState } from "react";
import { formatUnits } from "viem";
import { clsx } from "clsx";
import type { Provider } from "../lib/subgraph";
import { CONFIG } from "../lib/config";

interface ProviderCardProps {
  provider: Provider;
  isSelf?: boolean;
}

function RepRing({ value, color }: { value: number; color: string }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width="48" height="48" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform="rotate(-90 22 22)" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      <text x="22" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill={color} fontFamily="monospace">{value}</text>
    </svg>
  );
}

export function ProviderCard({ provider: p, isSelf }: ProviderCardProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const repColor = p.reputation >= 80 ? "#10b981" : p.reputation >= 50 ? "#f59e0b" : "#ef4444";
  const total = p.completedCalls + p.slashedCalls;
  const honorPct = total > 0 ? Math.round(p.completedCalls / total * 100) : 100;
  const honorColor = honorPct >= 80 ? "#10b981" : honorPct >= 50 ? "#f59e0b" : "#ef4444";
  const price = formatUnits(BigInt(p.pricePerCall), CONFIG.usdcDecimals);
  const stake = formatUnits(BigInt(p.stake), CONFIG.usdcDecimals);
  const hasNoSlash = p.slashBps === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientY - rect.top) / rect.height - 0.5) * 10;
        const y = -((e.clientX - rect.left) / rect.width - 0.5) * 10;
        setTilt({ x, y });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{ rotateX: tilt.x, rotateY: tilt.y, transformStyle: "preserve-3d" }}
      className={clsx(
        "glass rounded-2xl p-5 border flex flex-col gap-3 cursor-pointer",
        isSelf ? "border-accent/25 shadow-glow-sm" : "border-white/[0.06]",
        "hover:border-accent/15 hover:shadow-card-hover transition-shadow"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-white">Provider #{p.id}</span>
            {isSelf && <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded-full font-bold">YOU</span>}
          </div>
          <div className="mono text-[10px] text-white/25">{p.owner.slice(0, 6)}…{p.owner.slice(-4)}</div>
        </div>
        <RepRing value={p.reputation} color={repColor} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Price/call", value: `${price} USDC` },
          { label: "Stake", value: `${stake} USDC` },
          { label: "SLA", value: `${p.maxResponseTime}s` },
          { label: "Slash", value: `${(p.slashBps / 100).toFixed(0)}%` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/[0.03] rounded-xl p-2.5">
            <div className="text-[10px] text-white/30 mb-0.5">{label}</div>
            <div className="mono text-sm font-semibold text-white/80">{value}</div>
          </div>
        ))}
      </div>

      {/* Honor bar */}
      <div>
        <div className="flex justify-between text-[10px] mb-1.5">
          <span className="text-white/30">Honor rate</span>
          <span className="mono font-bold" style={{ color: honorColor }}>{honorPct}%</span>
        </div>
        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${honorPct}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: honorColor, boxShadow: `0 0 8px ${honorColor}` }}
          />
        </div>
      </div>

      {/* Status + warning */}
      <div className="flex items-center justify-between">
        <div className={clsx("flex items-center gap-1.5 text-[10px] font-bold",
          p.active ? "text-accent" : "text-white/25")}>
          <div className={clsx("w-1.5 h-1.5 rounded-full", p.active ? "bg-accent animate-pulse-glow" : "bg-white/20")} />
          {p.active ? "Active" : "Inactive"}
        </div>
        {hasNoSlash && (
          <div className="text-[9px] text-yellow-400/70 bg-yellow-400/8 border border-yellow-400/15 rounded-full px-2 py-0.5">
            ⚠ No slash
          </div>
        )}
      </div>

      {/* Call button */}
      {p.active && !isSelf && (
        <a
          href="./app/"
          className="mt-1 w-full text-center text-xs font-semibold py-2 rounded-xl border border-accent/20
            text-accent hover:bg-accent/10 transition-colors"
        >
          Call Service →
        </a>
      )}
    </motion.div>
  );
}
