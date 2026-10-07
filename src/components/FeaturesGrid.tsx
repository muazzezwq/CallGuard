/**
 * FeaturesGrid — full feature list, animated cards
 */
import { useState } from "react";

const FEATURES = [
  {
    icon: "⚡",
    category: "PAYMENTS",
    title: "Pay-per-call USDC",
    desc: "Full escrow for every API call. USDC stays locked until the provider responds. Successful response → automatic release.",
    tags: ["EIP-712", "USDC", "Escrow"],
    color: "#16a34a",
  },
  {
    icon: "🔒",
    category: "SLA ENFORCEMENT",
    title: "On-chain SLA",
    desc: "Providers back their response time and price commitment with stake. Miss the deadline — stake is automatically slashed. No arbiter.",
    tags: ["Auto-slash", "Stake", "No arbiter"],
    color: "#0ea5e9",
  },
  {
    icon: "✍️",
    category: "RECEIPTS",
    title: "EIP-712 Signed Receipts",
    desc: "Provider generates a cryptographic signature for every response. Caller verifies on-chain. Fake success is impossible.",
    tags: ["EIP-712", "Typed Data", "Verification"],
    color: "#8b5cf6",
  },
  {
    icon: "🤖",
    category: "AI AGENTS",
    title: "MCP & ERC-8004",
    desc: "Native support for AI agents. Via Model Context Protocol, Claude, GPT, and other LLMs can call CallGuard services directly.",
    tags: ["MCP", "ERC-8004", "Agents"],
    color: "#f59e0b",
  },
  {
    icon: "🌉",
    category: "CROSS-CHAIN",
    title: "CCTP Bridge",
    desc: "Ethereum, Base, Polygon → Arc. USDC bridging via Circle CCTP. Attestation + relay fully automatic.",
    tags: ["CCTP", "Cross-chain", "Circle"],
    color: "#06b6d4",
  },
  {
    icon: "💰",
    category: "NANOPAYMENTS",
    title: "Circle Gateway",
    desc: "Payments smaller than 0.001 USDC. Gasless micropayments with EIP-3009 off-chain signature. x402 HTTP protocol support.",
    tags: ["EIP-3009", "x402", "Gasless"],
    color: "#10b981",
  },
  {
    icon: "📊",
    category: "REPUTATION",
    title: "Bayesian Reputation",
    desc: "Each provider's historical performance is scored with Bayesian estimation. Fair starting score for new providers.",
    tags: ["Reputation", "Scoring", "Goldsky"],
    color: "#ec4899",
  },
  {
    icon: "⚖️",
    category: "DISPUTES",
    title: "DisputeQuality System",
    desc: "Community arbitration for SLA violation claims. USDC bond for spam protection. 48-hour voting window.",
    tags: ["Voting", "Bond", "Community"],
    color: "#ef4444",
  },
  {
    icon: "📈",
    category: "FUTURES",
    title: "SLA Futures",
    desc: "Invest in future SLA slots. Hedge provider performance or take a position on uptime.",
    tags: ["DeFi", "Futures", "NFT"],
    color: "#f97316",
  },
  {
    icon: "🏦",
    category: "LENDING",
    title: "Reputation Loans",
    desc: "Providers with high honor rates can borrow USDC using their reputation as collateral.",
    tags: ["DeFi", "Lending", "Reputation"],
    color: "#84cc16",
  },
  {
    icon: "💼",
    category: "JOBS",
    title: "ERC-8183 Jobs",
    desc: "Job system for long-term service agreements. Triple-role model: Client → Provider → Evaluator.",
    tags: ["ERC-8183", "Jobs", "Workflow"],
    color: "#6366f1",
  },
  {
    icon: "🔐",
    category: "AGENT WALLET",
    title: "AgentWallet",
    desc: "Programmable USDC wallet for AI agents. Spending limits, whitelist, and auto-routing built in.",
    tags: ["Smart Wallet", "Agent", "Limits"],
    color: "#14b8a6",
  },
];

export default function FeaturesGrid() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section id="features" style={{ padding: "80px 48px", background: "#fff", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
            FULL FEATURE SET
          </div>
          <h2 style={{ fontSize: "clamp(26px, 3.5vw, 44px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: "0 0 16px", lineHeight: 1.1 }}>
            Everything. One protocol.
          </h2>
          <p style={{ fontSize: 15, color: "#6b8a7a", maxWidth: 560, margin: "0 auto", lineHeight: 1.65 }}>
            CallGuard provides a complete on-chain infrastructure for the API economy. Payments, SLA, identity, bridge, and more — in a single smart contract set.
          </p>
        </div>

        {/* Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                background: hovered === i ? "#f7faf8" : "#fff",
                border: `1px solid ${hovered === i ? f.color + "40" : "#dde8e1"}`,
                borderRadius: 16,
                padding: "24px",
                cursor: "default",
                transition: "all 0.2s ease",
                transform: hovered === i ? "translateY(-2px)" : "none",
                boxShadow: hovered === i ? `0 8px 24px ${f.color}15` : "none",
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: f.color, textTransform: "uppercase", marginBottom: 10 }}>
                {f.category}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: f.color + "15",
                  border: `1px solid ${f.color}25`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0a1628", lineHeight: 1.2 }}>
                  {f.title}
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#6b8a7a", lineHeight: 1.6, margin: "0 0 14px" }}>
                {f.desc}
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {f.tags.map(t => (
                  <span key={t} style={{
                    fontSize: 10, fontWeight: 600,
                    color: f.color, background: f.color + "10",
                    border: `1px solid ${f.color}25`,
                    borderRadius: 4, padding: "2px 8px",
                    fontFamily: "var(--mono)",
                  }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom stats */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 1,
          background: "#dde8e1",
          border: "1px solid #dde8e1",
          borderRadius: 16,
          overflow: "hidden",
          marginTop: 48,
        }}>
          {[
            { num: "11", label: "Smart Contracts" },
            { num: "66/66", label: "Tests Passing" },
            { num: "12", label: "API Endpoints" },
            { num: "30+", label: "UI Panels" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", padding: "24px", textAlign: "center" }}>
              <div style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#16a34a", fontFamily: "var(--mono)" }}>
                {s.num}
              </div>
              <div style={{ fontSize: 11, color: "#6b8a7a", marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
