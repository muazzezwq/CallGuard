export default function Footer() {
  const cols = [
    { title: "PRODUCT", links: ["Overview", "Providers", "Callers", "How It Works"] },
    { title: "DEVELOPERS", links: ["Documentation", "API", "SDK", "Smart Contracts"] },
    { title: "ECOSYSTEM", links: ["Arc", "USDC", "x402", "ERC-8004"] },
  ];
  return (
    <footer style={{ background: "#fff", borderTop: "1px solid #dde8e1", padding: "48px 32px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 32, marginBottom: 40 }} className="footer-grid">
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0a1628", marginBottom: 8, letterSpacing: "-0.02em" }}>CallGuard</div>
            <div style={{ fontSize: 12, color: "#6b8a7a", lineHeight: 1.7 }}>On-chain SLAs for the agentic economy.<br />Every API call with an economic guarantee.</div>
          </div>
          {cols.map(col => (
            <div key={col.title}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#6b8a7a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>{col.title}</div>
              {col.links.map(l => (
                <div key={l} style={{ marginBottom: 10 }}><a href="#" style={{ fontSize: 13, color: "#3d5a4e", textDecoration: "none", transition: "color 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#0a1628"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "#3d5a4e"; }}
                >{l}</a></div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #dde8e1", paddingTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#6b8a7a" }}>© 2026 CallGuard. All rights reserved.</span>
          <span style={{ fontSize: 11, color: "#6b8a7a", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
            Built on Arc
          </span>
        </div>
      </div>
      <style>{`
        @media (max-width: 640px) { .footer-grid { grid-template-columns: 1fr 1fr !important; } }
      `}</style>
    </footer>
  );
}
