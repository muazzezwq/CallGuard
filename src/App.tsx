import { useState } from "react";
import { motion } from "framer-motion";
import { Topbar } from "./components/Topbar";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { LiveFeed } from "./components/LiveFeed";
import { ProviderCard } from "./components/ProviderCard";
import { ParticleCanvas } from "./components/ParticleCanvas";
import { useProviders, useRecentActivity } from "./hooks/useSubgraph";
import { useAccount } from "wagmi";
import { clsx } from "clsx";

type Tab = "overview" | "providers" | "activity";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const { address } = useAccount();
  const { data: providers, isLoading: loadingProviders } = useProviders();
  const { data: activity, isLoading: loadingActivity } = useRecentActivity(30);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "overview",   label: "Overview",   icon: "◈" },
    { id: "providers",  label: "Providers",  icon: "🏗" },
    { id: "activity",   label: "Activity",   icon: "⚡" },
  ];

  return (
    <div className="min-h-screen bg-bg-0 text-white relative">
      <ParticleCanvas />

      <div className="relative z-10">
        <Topbar />

        {/* Hero section */}
        <Hero />

        {/* Tab navigation */}
        <div className="sticky top-14 z-40 border-b border-white/[0.05] bg-bg-0/90 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-5">
            <div className="flex gap-1 py-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                    tab === t.id
                      ? "bg-accent/10 text-accent border border-accent/20"
                      : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                  )}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  {t.id === "activity" && activity && activity.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-accent/20 text-accent text-[9px] flex items-center justify-center mono">
                      {Math.min(activity.length, 9)}
                    </span>
                  )}
                </button>
              ))}

              {/* Launch full app button */}
              <a
                href="./app/"
                className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                  bg-accent text-white hover:bg-accent-dim transition-colors"
              >
                Launch App →
              </a>
            </div>
          </div>
        </div>

        {/* Tab content */}
        <main className="max-w-6xl mx-auto px-5 py-10">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* OVERVIEW */}
            {tab === "overview" && (
              <div className="space-y-10">
                <HowItWorks />
                <div className="mt-12">
                  <h2 className="text-lg font-semibold text-white mb-4">Live Activity</h2>
                  <LiveFeed events={activity ?? []} loading={loadingActivity} />
                </div>
              </div>
            )}

            {/* PROVIDERS */}
            {tab === "providers" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-white">
                    Registered Providers
                    {providers && (
                      <span className="ml-2 mono text-sm text-white/30">({providers.length})</span>
                    )}
                  </h2>
                  <a href="./app/" className="text-sm text-accent hover:underline">Register as provider →</a>
                </div>

                {loadingProviders ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="glass rounded-2xl p-5 border border-white/[0.05] h-52 shimmer" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(providers ?? []).map((p) => (
                      <ProviderCard
                        key={p.id}
                        provider={p}
                        isSelf={address?.toLowerCase() === p.owner.toLowerCase()}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ACTIVITY */}
            {tab === "activity" && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-6">Network Activity</h2>
                <LiveFeed events={activity ?? []} loading={loadingActivity} />
              </div>
            )}
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/[0.05] mt-20 py-10 px-5">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-white/25 text-sm">CallGuard · On-chain SLA Marketplace · Arc Testnet</div>
            <div className="flex items-center gap-5 text-sm">
              <a href="./app/" className="text-accent hover:underline">Launch App</a>
              <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" className="text-white/30 hover:text-white/60">Explorer</a>
              <a href="https://github.com/muazzezwq/CallGuard" target="_blank" rel="noreferrer" className="text-white/30 hover:text-white/60">GitHub</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
