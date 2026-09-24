export default function Architecture() {
  const box = (label: string, sub: string, color = "#0a1628", bg = "#f7faf8", border = "#dde8e1") => (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "12px 20px", textAlign: "center", minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: "0.06em", fontFamily: "var(--mono)" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#6b8a7a", marginTop: 3 }}>{sub}</div>}
    </div>
  );
  const connector = () => <div style={{ display: "flex", justifyContent: "center" }}><div style={{ width: 1, height: 28, background: "#dde8e1" }} /></div>;
  const arrow = () => <div style={{ display: "flex", justifyContent: "center" }}><span style={{ color: "#16a34a", fontSize: 14 }}>▼</span></div>;

  return (
    <section id="architecture" style={{ padding: "80px 32px", background: "#f7faf8", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>ARCHITECTURE</div>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: 0 }}>Infrastructure for the agentic stack.</h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {box("AI AGENT", "Caller / Automation", "#0a1628")}
          {connector()}
          {arrow()}
          <div style={{ background: "#fff", border: "2px solid #0a1628", borderRadius: 14, padding: "20px 28px", width: "100%", maxWidth: 480 }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0a1628", letterSpacing: "0.08em", fontFamily: "var(--mono)" }}>CALLGUARD</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["PAYMENT", ""], ["SLA REGISTRY", ""], ["RECEIPT VERIFICATION", ""], ["SETTLEMENT", ""]].map(([l]) => (
                <div key={l} style={{ background: "#f7faf8", border: "1px solid #dde8e1", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#3d5a4e", letterSpacing: "0.06em", fontFamily: "var(--mono)" }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          {connector()}
          {arrow()}
          {box("ARC NETWORK", "Sub-second finality · USDC as gas", "#16a34a", "#f0fdf4", "#86efac")}
          {connector()}
          {arrow()}
          {box("USDC", "Settlement token · Gas token on Arc", "#0a1628", "#fff", "#dde8e1")}
        </div>
      </div>
    </section>
  );
}
