import { useEffect, useState } from "react";
import Navbar from "./Navbar";
import Hero from "./Hero";
import TrustBar from "./TrustBar";
import ProblemSection from "./ProblemSection";
import FeaturesGrid from "./FeaturesGrid";
import HowItWorks from "./HowItWorks";
import SLABuilder from "./SLABuilder";
import TransactionSim from "./TransactionSim";
import UseCases from "./UseCases";
import RoleCards from "./RoleCards";
import Architecture from "./Architecture";
import DevSection from "./DevSection";
import DashboardPreview from "./DashboardPreview";
import SecuritySection from "./SecuritySection";
import { LiveFeed } from "./LiveFeed";
import FinalCTA from "./FinalCTA";
import Footer from "./Footer";
import { useSubgraph } from "../hooks/useSubgraph";
import { CONFIG } from "../lib/config";
import type { CallEvent } from "../lib/subgraph";

// ── Goldsky query for live feed ──────────────────────────────────────────────
const LIVE_QUERY = `{
  calls(first: 20, orderBy: createdAt, orderDirection: desc) {
    id providerId caller amount status createdAt
  }
}`;

type GoldskyCalls = {
  calls: {
    id: string;
    providerId: string;
    caller: string;
    amount: string;
    status: string;
    createdAt: string;
  }[];
};

function mapToCallEvents(data: GoldskyCalls | undefined): CallEvent[] {
  if (!data?.calls) return [];
  return data.calls.map(c => ({
    id: c.id,
    callId: c.id,
    type: c.status === "SLASHED" ? "CallSlashed" as const : c.status === "COMPLETED" ? "ReceiptSubmitted" as const : "CallStarted" as const,
    caller: c.caller ?? "0x0000000000000000000000000000000000000000",
    providerId: parseInt(c.providerId ?? "0"),
    amount: c.amount ?? "0",
    timestamp: parseInt(c.createdAt ?? "0"),
    txHash: c.id,
  } satisfies CallEvent));
}

// ── Live stats bar ────────────────────────────────────────────────────────────
const STATS_QUERY = `{
  calls(first: 500, orderBy: createdAt, orderDirection: desc) { id status }
  providers(first: 100) { id active completedCalls slashedCalls }
}`;

type StatsData = {
  calls: { id: string; status: string }[];
  providers: { id: string; active: boolean; completedCalls: string; slashedCalls: string }[];
};

function LiveStatsBar() {
  const { data } = useSubgraph<StatsData>(STATS_QUERY, 30_000);
  const calls = data?.calls ?? [];
  const providers = data?.providers ?? [];

  const activeProviders = providers.filter(p => p.active).length || providers.length;
  const totalCalls = calls.length;
  const completed = calls.filter(c => c.status === "COMPLETED").length;
  const slashed = calls.filter(c => c.status === "SLASHED").length;
  const honorRate = totalCalls > 0
    ? Math.round(((completed + 2) / (totalCalls + 3)) * 100)
    : 0;

  return (
    <div style={{
      background: "#0a1628",
      borderBottom: "1px solid #1e3a5f",
      padding: "10px 48px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 40,
      flexWrap: "wrap",
    }}>
      {[
        { label: "Active Providers", value: activeProviders > 0 ? String(activeProviders) : "—", color: "#86efac" },
        { label: "Total Calls", value: totalCalls > 0 ? totalCalls.toLocaleString() : "—", color: "#93c5fd" },
        { label: "Slashes", value: slashed > 0 ? String(slashed) : "—", color: "#fca5a5" },
        { label: "Honor Rate", value: honorRate > 0 ? `${honorRate}%` : "—", color: "#6ee7b7" },
      ].map((s, i, arr) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: "var(--mono)", letterSpacing: "-0.02em" }}>
              {s.value}
            </div>
            <div style={{ fontSize: 9, color: "#4a7a6a", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
              {s.label}
            </div>
          </div>
          {i < arr.length - 1 && (
            <div style={{ width: 1, height: 28, background: "#1e3a5f" }} />
          )}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
          animation: "pulse-dot 2s infinite",
        }} />
        <span style={{ fontSize: 10, color: "#4a7a6a", fontFamily: "var(--mono)" }}>
          Arc Testnet · {CONFIG.chainId}
        </span>
      </div>
      <style>{`@keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.3)} }`}</style>
    </div>
  );
}

// ── Live feed section wrapper ─────────────────────────────────────────────────
function LiveSection() {
  const { data, isLoading } = useSubgraph<GoldskyCalls>(LIVE_QUERY, 15_000);
  const events = mapToCallEvents(data);

  return (
    <section style={{ padding: "64px 48px", background: "#0a1628", borderTop: "1px solid #1e3a5f" }}>
      <div style={{ maxWidth: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
            LIVE ON-CHAIN
          </div>
          <h2 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#e8eaed", margin: "0 0 12px" }}>
            Gerçek zamanlı ağ aktivitesi
          </h2>
          <p style={{ fontSize: 14, color: "#4a7a6a", maxWidth: 440, margin: "0 auto" }}>
            Goldsky subgraph'tan doğrudan çekilen canlı call akışı. Her 15 saniyede güncellenir.
          </p>
        </div>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <LiveFeed events={events} loading={isLoading} />
        </div>
      </div>
    </section>
  );
}

// ── Main LandingPage ──────────────────────────────────────────────────────────
export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div style={{
      background: "var(--bg, #fff)",
      minHeight: "100vh",
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      color: "#0a1628",
      overflowX: "hidden",
    }}>
      {/* Top announcement bar */}
      {mounted && <LiveStatsBar />}

      {/* Nav */}
      <Navbar />

      {/* Hero — animated SLA widget */}
      <Hero />

      {/* Trust bar */}
      <TrustBar />

      {/* Problem / Solution comparison */}
      <ProblemSection />

      {/* How it works — 3 steps */}
      <HowItWorks />

      {/* SLA builder interactive demo */}
      <SLABuilder />

      {/* Transaction simulation */}
      <TransactionSim />

      {/* Live on-chain activity */}
      {mounted && <LiveSection />}

      {/* Dashboard preview */}
      <DashboardPreview />

      {/* Full features grid */}
      <FeaturesGrid />

      {/* Architecture diagram */}
      <Architecture />

      {/* Use cases + testimonials */}
      <UseCases />

      {/* Role cards — caller vs provider */}
      <RoleCards />

      {/* Developer section */}
      <DevSection />

      {/* Security section */}
      <SecuritySection />

      {/* Final CTA */}
      <FinalCTA />

      {/* Footer */}
      <Footer />
    </div>
  );
}
