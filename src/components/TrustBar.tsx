export default function TrustBar() {
  const items = ["USDC", "x402", "EIP-712", "ERC-8004", "CCTP", "MCP"];
  return (
    <div style={{ borderTop: "1px solid #dde8e1", borderBottom: "1px solid #dde8e1", background: "#fff", padding: "16px 32px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap", justifyContent: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#6b8a7a", letterSpacing: "0.1em", textTransform: "uppercase" }}>BUILT ON ARC</span>
        <div style={{ width: 1, height: 20, background: "#dde8e1" }} />
        {items.map(item => (
          <span key={item} style={{ fontSize: 11, fontWeight: 600, color: "#3d5a4e", fontFamily: "var(--mono)", background: "#f0f5f2", border: "1px solid #dde8e1", borderRadius: 6, padding: "4px 10px" }}>{item}</span>
        ))}
      </div>
    </div>
  );
}
