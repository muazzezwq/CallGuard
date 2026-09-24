export default function RoleCards() {
  return (
    <section style={{ padding: "80px 32px", background: "#fff", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="role-grid">
          {/* Providers */}
          <div style={{ background: "#0a1628", borderRadius: 20, padding: "36px", color: "#fff" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#86efac", letterSpacing: "0.1em", marginBottom: 16, textTransform: "uppercase" }}>PROVIDERS</div>
            <h3 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: "0 0 10px", letterSpacing: "-0.02em" }}>For Providers</h3>
            <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6, margin: "0 0 24px" }}>Turn service reliability into programmable revenue.</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px" }}>
              {["Define SLA terms", "Stake USDC as commitment", "Earn per-call payments", "Build on-chain reputation", "Discoverable to AI agents"].map(f => (
                <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, color: "#cbd5e1" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#16a34a", flexShrink: 0, display: "inline-block" }} />{f}
                </li>
              ))}
            </ul>
            <a href="/app/" style={{ display: "inline-block", fontSize: 14, fontWeight: 700, color: "#0a1628", background: "#16a34a", padding: "12px 24px", borderRadius: 10, textDecoration: "none", transition: "opacity 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            >Become a Provider →</a>
          </div>

          {/* Callers */}
          <div style={{ background: "#f7faf8", border: "2px solid #0a1628", borderRadius: 20, padding: "36px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#16a34a", letterSpacing: "0.1em", marginBottom: 16, textTransform: "uppercase" }}>CALLERS</div>
            <h3 style={{ fontSize: 24, fontWeight: 800, color: "#0a1628", margin: "0 0 10px", letterSpacing: "-0.02em" }}>For Callers</h3>
            <p style={{ fontSize: 14, color: "#6b8a7a", lineHeight: 1.6, margin: "0 0 24px" }}>Pay for services with guarantees built in.</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px" }}>
              {["Discover verified providers", "Compare SLAs and prices", "Pay per request only", "Verify signed receipts", "Reduce counterparty risk"].map(f => (
                <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, color: "#3d5a4e" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#0a1628", flexShrink: 0, display: "inline-block" }} />{f}
                </li>
              ))}
            </ul>
            <a href="/app/" style={{ display: "inline-block", fontSize: 14, fontWeight: 700, color: "#fff", background: "#0a1628", padding: "12px 24px", borderRadius: 10, textDecoration: "none", transition: "background 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#16a34a"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#0a1628"; }}
            >Find a Service →</a>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 640px) { .role-grid { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
