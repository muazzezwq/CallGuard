import { motion, AnimatePresence } from "framer-motion";
import { formatUnits } from "viem";
import type { CallEvent } from "../lib/subgraph";
import { CONFIG } from "../lib/config";

interface LiveFeedProps {
  events: CallEvent[];
  loading?: boolean;
}

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const typeConfig = {
  CallStarted:      { label: "CALL OPENED",   dot: "bg-accent",    text: "text-accent"    },
  ReceiptSubmitted: { label: "RECEIPT",        dot: "bg-blue-400",  text: "text-blue-400"  },
  CallSlashed:      { label: "SLASHED",        dot: "bg-red-400",   text: "text-red-400"   },
};

export function LiveFeed({ events, loading }: LiveFeedProps) {
  return (
    <div className="glass rounded-2xl border border-accent/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05] bg-accent/[0.03]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-glow" />
          <span className="text-[11px] font-bold text-accent tracking-widest uppercase">Live Activity</span>
        </div>
        <span className="mono text-[10px] text-white/25">streaming from chain</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/[0.03]">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="w-2 h-2 rounded-full shimmer flex-shrink-0" />
              <div className="h-3 w-32 rounded shimmer" />
              <div className="h-3 w-20 rounded shimmer ml-auto" />
            </div>
          ))
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-white/25 text-sm">No recent activity</div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const cfg = typeConfig[e.type] ?? typeConfig.CallStarted;
              const amount = formatUnits(BigInt(e.amount ?? 0), CONFIG.usdcDecimals);
              return (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  <div className={`mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.04] ${cfg.text}`}>
                    {cfg.label}
                  </div>
                  <div className="mono text-[11px] text-white/40 flex-1 truncate">
                    {e.caller.slice(0, 6)}…{e.caller.slice(-4)}
                    <span className="text-white/20 mx-1">→</span>
                    <span className="text-white/55">provider #{e.providerId}</span>
                  </div>
                  <div className="mono text-[11px] text-white/50 flex-shrink-0">{amount} USDC</div>
                  <div className="mono text-[10px] text-white/20 flex-shrink-0 hidden sm:block">
                    {timeAgo(e.timestamp)}
                  </div>
                  <a
                    href={CONFIG.explorerTx(e.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-white/20 hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
                  >
                    ↗
                  </a>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
