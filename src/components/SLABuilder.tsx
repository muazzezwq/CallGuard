import { useState } from "react";

export default function SLABuilder() {
  const [form, setForm] = useState({ provider: "AI Data Service", endpoint: "/api/data", price: "0.001", sla: "120", stake: "500", slash: "20" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", fontSize: 13, border: "1px solid #dde8e1", borderRadius: 8, background: "#fff", color: "#0a1628", outline: "none", fontFamily: "inherit", transition: "border-color 0.15s" };
  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#6b8a7a", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 5 };

  return (
    <section id="interactive" style={{ padding: "80px 32px", background: "#fff", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>INTERACTIVE</div>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: "0 0 8px" }}>Create an SLA</h2>
          <p style={{ fontSize: 14, color: "#6b8a7a", margin: 0 }}>Configure and preview your SLA in real time.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }} className="sla-grid">
          {/* Form */}
          <div style={{ background: "#f7faf8", border: "1px solid #dde8e1", borderRadius: 16, padding: "28px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div><label style={labelStyle}>Provider Name</label><input style={inputStyle} value={form.provider} onChange={set("provider")} onFocus={e => e.target.style.borderColor="#16a34a"} onBlur={e => e.target.style.borderColor="#dde8e1"} /></div>
              <div><label style={labelStyle}>API Endpoint</label><input style={inputStyle} value={form.endpoint} onChange={set("endpoint")} onFocus={e => e.target.style.borderColor="#16a34a"} onBlur={e => e.target.style.borderColor="#dde8e1"} /></div>
              <div><label style={labelStyle}>Price / Call (USDC)</label><input style={inputStyle} type="number" value={form.price} onChange={set("price")} onFocus={e => e.target.style.borderColor="#16a34a"} onBlur={e => e.target.style.borderColor="#dde8e1"} /></div>
              <div><label style={labelStyle}>Response SLA (ms)</label><input style={inputStyle} type="number" value={form.sla} onChange={set("sla")} onFocus={e => e.target.style.borderColor="#16a34a"} onBlur={e => e.target.style.borderColor="#dde8e1"} /></div>
              <div><label style={labelStyle}>Provider Stake (USDC)</label><input style={inputStyle} type="number" value={form.stake} onChange={set("stake")} onFocus={e => e.target.style.borderColor="#16a34a"} onBlur={e => e.target.style.borderColor="#dde8e1"} /></div>
              <div><label style={labelStyle}>Slash %</label><input style={inputStyle} type="number" value={form.slash} onChange={set("slash")} onFocus={e => e.target.style.borderColor="#16a34a"} onBlur={e => e.target.style.borderColor="#dde8e1"} /></div>
            </div>
            <a href="/app/" style={{ display: "block", textAlign: "center", fontSize: 14, fontWeight: 700, color: "#fff", background: "#0a1628", padding: "12px", borderRadius: 10, textDecoration: "none", transition: "background 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#16a34a"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#0a1628"; }}
            >Register SLA on Arc →</a>
          </div>

          {/* Preview */}
          <div style={{ background: "#fff", border: "2px solid #0a1628", borderRadius: 16, padding: "28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, color: "#6b8a7a", fontFamily: "var(--mono)", marginBottom: 3 }}>SLA #1042</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0a1628" }}>{form.provider || "–"}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 6, padding: "3px 8px" }}>● ACTIVE</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["RESPONSE GUARANTEE", form.sla ? `${form.sla} ms` : "–", "#0a1628"],
                ["PER CALL", form.price ? `${form.price} USDC` : "–", "#16a34a"],
                ["PROVIDER STAKE", form.stake ? `${form.stake} USDC` : "–", "#0a1628"],
                ["SLASH", form.slash ? `${form.slash}%` : "–", "#dc2626"],
              ].map(([label, value, color]) => (
                <div key={label as string} style={{ background: "#f7faf8", border: "1px solid #dde8e1", borderRadius: 10, padding: "14px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6b8a7a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: color as string, fontFamily: "var(--mono)", letterSpacing: "-0.02em", transition: "color 0.2s" }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #dde8e1", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
              <span style={{ fontSize: 10, color: "#6b8a7a", fontFamily: "var(--mono)", letterSpacing: "0.06em" }}>ARC TESTNET</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) { .sla-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
