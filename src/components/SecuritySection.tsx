export default function SecuritySection() {
  const cards = [
    { icon: "◆", title: "Provider Stake", desc: "Economic commitment behind every SLA. Providers lock USDC as collateral before accepting any calls." },
    { icon: "#", title: "Signed Receipts", desc: "Cryptographic evidence of the service response. EIP-712 signatures cannot be forged or backdated." },
    { icon: "○", title: "On-chain Rules", desc: "Settlement logic enforced by smart contracts. No arbitration, no manual review, no intermediary." },
    { icon: "↺", title: "Automatic Settlement", desc: "Successful calls settle automatically. Missed deadlines trigger automatic slash and refund." },
  ];

  return (
    <section style={{ padding: "80px 32px", background: "#f7faf8", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>SECURITY</div>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: "0 0 4px", lineHeight: 1.1 }}>Verifiable commitments.</h2>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: 0, lineHeight: 1.1 }}>Programmable settlement.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="sec-grid">
          {cards.map(c => (
            <div key={c.title} style={{ background: "#fff", border: "1px solid #dde8e1", borderRadius: 14, padding: "24px", transition: "border-color 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#0a1628"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#dde8e1"; }}
            >
              <div style={{ fontSize: 18, color: "#16a34a", marginBottom: 12 }}>{c.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0a1628", marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 13, color: "#6b8a7a", lineHeight: 1.65 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <style>{`@media (max-width: 640px) { .sec-grid { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
