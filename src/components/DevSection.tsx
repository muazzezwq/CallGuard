export default function DevSection() {
  const request = `const result = await callGuard.request({
  provider: "data-service",
  endpoint: "/api/data",
  maxResponseTime: 120
});`;

  const response = `{
  status: "settled",
  responseTime: 87,
  sla: "verified",
  payment: "0.001 USDC"
}`;

  const codeStyle: React.CSSProperties = {
    background: "#0a1628", borderRadius: 12, padding: "20px", fontFamily: "var(--mono)",
    fontSize: 12, color: "#e2e8f0", lineHeight: 1.7, overflow: "auto", whiteSpace: "pre",
    border: "1px solid #1e3a5f",
  };

  const keyword = (s: string) => `<span style="color:#86efac">${s}</span>`;
  const string = (s: string) => `<span style="color:#fbbf24">${s}</span>`;
  const num = (s: string) => `<span style="color:#60a5fa">${s}</span>`;

  const highlightRequest = request
    .replace(/const|await/g, s => keyword(s))
    .replace(/"[^"]*"/g, s => string(s))
    .replace(/\b120\b/g, s => num(s));

  const highlightResponse = response
    .replace(/"[^"]*"/g, s => string(s))
    .replace(/\b87\b/g, s => num(s));

  return (
    <section id="developers" style={{ padding: "80px 32px", background: "#fff", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>DEVELOPER EXPERIENCE</div>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: "0 0 8px" }}>Built for agents.<br />Designed for developers.</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }} className="dev-grid">
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6b8a7a", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>REQUEST</div>
            <div style={codeStyle} dangerouslySetInnerHTML={{ __html: highlightRequest }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6b8a7a", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>RESPONSE</div>
            <div style={codeStyle} dangerouslySetInnerHTML={{ __html: highlightResponse }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {["REST API", "TypeScript SDK", "MCP", "x402", "EIP-712", "ERC-8004"].map(b => (
            <span key={b} style={{ fontSize: 11, fontWeight: 600, color: "#3d5a4e", background: "#f0f5f2", border: "1px solid #dde8e1", borderRadius: 6, padding: "5px 12px", fontFamily: "var(--mono)" }}>{b}</span>
          ))}
        </div>
      </div>
      <style>{`@media (max-width: 768px) { .dev-grid { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
