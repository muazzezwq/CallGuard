export default function ProblemSection() {
  const traditional = ["Trust the provider", "Pay separately", "SLA lives off-chain", "Disputes happen later", "No economic commitment"];
  const callguard = ["Provider stake as commitment", "Per-call USDC payment", "On-chain SLA enforcement", "Signed cryptographic receipt", "Automatic settlement or slash"];

  return (
    <section id="product" style={{ padding: "80px 32px", background: "#fff", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: "clamp(26px, 3.5vw, 44px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: "0 0 6px", lineHeight: 1.1 }}>
            APIs were built for requests.
          </h2>
          <h2 style={{ fontSize: "clamp(26px, 3.5vw, 44px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#16a34a", margin: 0, lineHeight: 1.1, fontStyle: "italic" }}>
            Agents need guarantees.
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 0, alignItems: "start" }} className="problem-grid">
          {/* traditional */}
          <div style={{ background: "#fafafa", border: "1px solid #dde8e1", borderRadius: 16, padding: "28px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6b8a7a", letterSpacing: "0.1em", marginBottom: 20, textTransform: "uppercase" }}>TRADITIONAL API</div>
            {traditional.map(t => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#fee2e2", border: "1px solid #fca5a5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#dc2626", flexShrink: 0 }}>✕</span>
                <span style={{ fontSize: 13, color: "#6b8a7a" }}>{t}</span>
              </div>
            ))}
          </div>

          {/* arrow */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px", paddingTop: 60 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 1, height: 40, background: "#dde8e1" }} />
              <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#0a1628", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>→</span>
              <div style={{ width: 1, height: 40, background: "#dde8e1" }} />
            </div>
          </div>

          {/* callguard */}
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 16, padding: "28px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.1em", marginBottom: 20, textTransform: "uppercase" }}>CALLGUARD</div>
            {callguard.map(t => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#dcfce7", border: "1px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#16a34a", flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: "#0a1628", fontWeight: 500 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .problem-grid { grid-template-columns: 1fr !important; }
          .problem-grid > div:nth-child(2) { display: none; }
        }
      `}</style>
    </section>
  );
}
