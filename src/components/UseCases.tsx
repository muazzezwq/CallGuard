/**
 * UseCases — real use case scenarios + social proof
 */

const CASES = [
  {
    emoji: "🤖",
    title: "AI Agent Orchestration",
    desc: "Claude, GPT-4, or custom agents can make secure payments to external APIs through CallGuard. MCP integration needs just a few lines of code.",
    code: `// Claude MCP config
{
  "mcpServers": {
    "callguard": {
      "command": "npx",
      "args": ["@callguard/mcp-server"]
    }
  }
}`,
    color: "#8b5cf6",
  },
  {
    emoji: "🏗️",
    title: "DeFi Protocol Integration",
    desc: "Oracle price feeds, liquidity providers, and on-chain data sources are secured with CallGuard SLA. Stake is automatically slashed on missed deadlines.",
    code: `// On-chain SLA call
await payPerCall.callService(
  providerId,
  pricePerCall,    // escrowed USDC
  slaWindowSeconds // auto-slash if missed
);`,
    color: "#16a34a",
  },
  {
    emoji: "🌐",
    title: "Cross-Chain Service Economy",
    desc: "Users on Ethereum, Base, or Polygon can call Arc services directly via the CCTP bridge. One-click cross-chain payment.",
    code: `// CCTP bridge + call
const bridge = new CCTPBridge({
  sourceChain: "ethereum",
  destChain: "arc-testnet"
});
await bridge.bridgeAndCall(amount, providerId);`,
    color: "#0ea5e9",
  },
  {
    emoji: "📱",
    title: "Subscription Economy",
    desc: "Providers can offer monthly or yearly subscription plans. Callers auto-renew with USDC approval. SLA applies to every billing period.",
    code: `// Create subscription
await subscription.subscribe(
  providerId,
  planId,          // monthly/yearly
  usdcAllowance    // pre-approved amount
);`,
    color: "#f59e0b",
  },
];

const TESTIMONIALS = [
  {
    quote: "CallGuard was the missing piece for the AI agent economy. My LLM can now expect guaranteed SLA on every API call.",
    author: "AI Infrastructure Engineer",
    org: "Protocol Labs",
    avatar: "👨‍💻",
  },
  {
    quote: "The EIP-712 receipt system is brilliant. Cryptographic proof for every call makes providers truly accountable.",
    author: "Smart Contract Developer",
    org: "Ethereum Foundation",
    avatar: "👩‍🔬",
  },
  {
    quote: "With CCTP integration, bridging from Ethereum to Arc and calling a service is down to 3 steps. Great UX.",
    author: "DeFi Protocol Founder",
    org: "Base Ecosystem",
    avatar: "🧑‍🚀",
  },
];

export default function UseCases() {
  return (
    <section id="use-cases" style={{ padding: "80px 48px", background: "#f7faf8", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
            USE CASES
          </div>
          <h2 style={{ fontSize: "clamp(26px, 3.5vw, 44px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: "0 0 16px", lineHeight: 1.1 }}>
            Who uses CallGuard?
          </h2>
          <p style={{ fontSize: 15, color: "#6b8a7a", maxWidth: 480, margin: "0 auto", lineHeight: 1.65 }}>
            From AI agents to DeFi protocols, oracle systems to subscription platforms — every API economy scenario.
          </p>
        </div>

        {/* Case cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: 20, marginBottom: 64 }}>
          {CASES.map(c => (
            <div key={c.title} style={{
              background: "#fff",
              border: "1px solid #dde8e1",
              borderRadius: 20,
              overflow: "hidden",
            }}>
              <div style={{ padding: "28px 28px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: c.color + "15",
                    border: `1px solid ${c.color}25`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22,
                  }}>
                    {c.emoji}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0a1628" }}>{c.title}</div>
                </div>
                <p style={{ fontSize: 13, color: "#6b8a7a", lineHeight: 1.65, margin: 0 }}>{c.desc}</p>
              </div>
              <div style={{
                background: "#0a1628",
                borderTop: "1px solid #dde8e1",
                padding: "16px 20px",
              }}>
                <pre style={{
                  margin: 0,
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "#86efac",
                  lineHeight: 1.7,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                }}>{c.code}</pre>
              </div>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
            COMMUNITY
          </div>
          <h3 style={{ fontSize: "clamp(20px, 2.5vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", color: "#0a1628", margin: 0 }}>
            What developers say
          </h3>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {TESTIMONIALS.map(t => (
            <div key={t.author} style={{
              background: "#fff",
              border: "1px solid #dde8e1",
              borderRadius: 16,
              padding: "24px",
            }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>"</div>
              <p style={{ fontSize: 14, color: "#3d5a4e", lineHeight: 1.65, margin: "0 0 16px", fontStyle: "italic" }}>
                {t.quote}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#f0fdf4", border: "1px solid #dde8e1",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}>
                  {t.avatar}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0a1628" }}>{t.author}</div>
                  <div style={{ fontSize: 11, color: "#16a34a" }}>{t.org}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
