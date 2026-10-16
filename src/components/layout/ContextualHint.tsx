import { useState, useEffect } from "react";
import { useAppStore } from "../../store/useAppStore";

const HINTS: Record<string, { icon: string; title: string; body: string }> = {
  calls: {
    icon: "💡",
    title: "Try your first call",
    body: "Enter provider ID 1 and payload 'ping' — this runs the full SLA lifecycle: escrow → response → receipt → payout.",
  },
  register: {
    icon: "💡",
    title: "Register as a provider",
    body: "Stake at least 10 USDC and set a max response time. Callers will get a refund + slash if you miss it.",
  },
  receipts: {
    icon: "💡",
    title: "Submit your receipt",
    body: "As provider: sign and submit within your SLA window to release escrow. As caller: wait for deadline to claim timeout.",
  },
  marketplace: {
    icon: "💡",
    title: "Browse live providers",
    body: "Filter by honor rate, price, or response time. Click a provider card to see their full profile and history.",
  },
  lending: {
    icon: "💡",
    title: "RepFi Lending",
    body: "Providers with honor rate > 90% can borrow USDC stake from the reputation pool. DeFi meets SLA enforcement.",
  },
  agent: {
    icon: "💡",
    title: "Agent Loop",
    body: "Deploy an AgentWallet — an on-chain wallet your AI controls. Set a daily USDC limit and let it call services 24/7.",
  },
  futures: {
    icon: "💡",
    title: "SLA Futures",
    body: "Providers tokenize future capacity as ERC-1155 NFTs. Callers reserve priority slots that trade on secondary markets.",
  },
  attestation: {
    icon: "💡",
    title: "SLA Attestation Bridge",
    body: "Any protocol can query CallGuard for cryptographic proof that a provider honored (or violated) their SLA commitment.",
  },
};

export default function ContextualHint({ panel }: { panel: string }) {
  const hintsSeen = useAppStore(s => s.hintsSeen);
  const markHintSeen = useAppStore(s => s.markHintSeen);
  const [show, setShow] = useState(false);

  const hint = HINTS[panel];

  useEffect(() => {
    if (!hint) return;
    if (hintsSeen.includes(panel)) return;
    const t = setTimeout(() => setShow(true), 800);
    return () => clearTimeout(t);
  }, [panel, hint, hintsSeen]);

  if (!hint || !show) return null;

  const dismiss = () => {
    markHintSeen(panel);
    setShow(false);
  };

  return (
    <div style={{
      position: "fixed",
      bottom: 72,
      right: 20,
      zIndex: 900,
      maxWidth: 300,
      background: "var(--bg-2)",
      border: "1px solid var(--accent)",
      borderRadius: 12,
      padding: "14px 16px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(25,209,134,0.15)",
      animation: "slideUp 0.3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{hint.icon}</span>
            <span>{hint.title}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
            {hint.body}
          </div>
        </div>
        <button
          onClick={dismiss}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-faint)", fontSize: 16, padding: 0, flexShrink: 0,
            lineHeight: 1,
          }}
        >×</button>
      </div>
      <button
        onClick={dismiss}
        style={{
          marginTop: 10,
          background: "rgba(25,209,134,0.1)",
          border: "1px solid rgba(25,209,134,0.2)",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--accent)",
          cursor: "pointer",
          width: "100%",
        }}
      >
        Got it ✓
      </button>
    </div>
  );
}
