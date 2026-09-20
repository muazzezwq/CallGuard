import { motion } from "framer-motion";
import { ConnectKitButton } from "connectkit";
import { StatCard } from "./StatCard";
import { useNetworkStats } from "../hooks/useSubgraph";
import { SparklineChart } from "./SparklineChart";

export function Hero() {
  const { data: stats, isLoading } = useNetworkStats();

  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center text-center px-5 overflow-hidden">
      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-blue-500/4 rounded-full blur-[100px] pointer-events-none" />

      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-2 bg-accent/8 border border-accent/15 rounded-full px-4 py-1.5 mb-6"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-glow" />
        <span className="mono text-[11px] text-accent font-semibold tracking-widest uppercase">Arc Testnet · Live</span>
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight mb-5 max-w-4xl"
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #10b981 55%, #60a5fa 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Pay-per-call,<br />enforced on-chain.
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-white/45 text-base sm:text-lg max-w-2xl leading-relaxed mb-8"
      >
        Service providers stake USDC and commit to an SLA. Callers pay per request
        and receive a cryptographically signed receipt. Miss the deadline — stake gets
        slashed automatically. No arbiter, no middleman.
      </motion.p>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mb-14"
      >
        <ConnectKitButton />
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="grid grid-cols-3 gap-4 w-full max-w-2xl mb-10"
      >
        <StatCard
          label="Providers"
          value={stats?.providerCount ?? 0}
          icon="🏗"
          color="green"
        />
        <StatCard
          label="Total Calls"
          value={stats?.totalCalls ?? 0}
          icon="📞"
          color="blue"
        />
        <StatCard
          label="Slashes"
          value={stats?.totalSlashes ?? 0}
          icon="⚡"
          color="red"
        />
      </motion.div>

      {/* Sparkline */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="w-full max-w-2xl"
      >
        <SparklineChart />
      </motion.div>
    </section>
  );
}
