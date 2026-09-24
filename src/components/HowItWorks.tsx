export default function HowItWorks() {
  const steps = [
    { n: "01", label: "PROVIDER STAKES", title: "Provider commits USDC", desc: "Provider defines the SLA: response time, price per call, and slash percentage. USDC is locked as collateral." },
    { n: "02", label: "CALLER PAYS", title: "Caller pays per request", desc: "Caller pays USDC per request. Payment is escrowed in the contract until settlement." },
    { n: "03", label: "RECEIPT VERIFIED", title: "Signed receipt returned", desc: "The provider returns a signed EIP-712 receipt with a response hash. Cryptographic proof of the response." },
    { n: "04", label: "SETTLEMENT", title: "On-chain settlement", desc: "SLA is verified on-chain. Payment settles to provider automatically, or stake is slashed." },
  ];

  return (
    <section id="how-it-works" style={{ padding: "80px 32px", background: "#f7faf8", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>HOW IT WORKS</div>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: 0 }}>Four steps. Fully on-chain.</h2>
        </div>

        {/* Steps */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginBottom: 40, position: "relative" }} className="how-steps">
          {steps.map((s, i) => (
            <div key={s.n} style={{ position: "relative" }}>
              {/* connector */}
              {i < 3 && <div style={{ position: "absolute", top: 20, left: "50%", right: 0, height: 1, background: "#dde8e1", zIndex: 0 }} />}
              <div style={{ position: "relative", zIndex: 1, padding: "0 16px 0 0" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", border: "2px solid #0a1628", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#0a1628", fontFamily: "var(--mono)" }}>{s.n}</span>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#16a34a", letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0a1628", marginBottom: 8 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#6b8a7a", lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Outcomes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="how-outcomes">
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>✓</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", letterSpacing: "0.06em", marginBottom: 3 }}>SLA MET</div>
              <div style={{ fontSize: 12, color: "#3d5a4e" }}>Payment settled to provider automatically</div>
            </div>
          </div>
          <div style={{ background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>✕</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", letterSpacing: "0.06em", marginBottom: 3 }}>SLA MISSED</div>
              <div style={{ fontSize: 12, color: "#6b8a7a" }}>Stake slashed · Caller protected · Refund issued</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .how-steps { grid-template-columns: 1fr 1fr !important; gap: 24px !important; }
          .how-outcomes { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .how-steps { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
