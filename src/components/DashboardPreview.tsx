import { useState } from "react";

const CALLS = [
  { provider: "AI Data Provider", response: "87 ms", sla: "120 ms", status: "settled", time: "23:41:02" },
  { provider: "Search API", response: "54 ms", sla: "100 ms", status: "settled", time: "23:40:28" },
  { provider: "Oracle API", response: "146 ms", sla: "120 ms", status: "slashed", time: "23:39:55" },
  { provider: "ML Inference", response: "98 ms", sla: "200 ms", status: "settled", time: "23:38:31" },
];
const SLAS = [
  { id: "#1042", name: "AI Data Provider", guarantee: "120 ms", price: "0.001 USDC", stake: "500 USDC", slash: "20%", status: "active" },
  { id: "#1041", name: "Search API", guarantee: "100 ms", price: "0.002 USDC", stake: "1000 USDC", slash: "15%", status: "active" },
  { id: "#1040", name: "Oracle API", guarantee: "120 ms", price: "0.005 USDC", stake: "2000 USDC", slash: "25%", status: "slashed" },
];
const PROVIDERS = [
  { name: "AI Data Provider", rep: 92, stake: "500 USDC", calls: 1240, slashes: 3 },
  { name: "Search API", rep: 96, stake: "1,000 USDC", calls: 4320, slashes: 1 },
  { name: "Oracle API", rep: 50, stake: "2,000 USDC", calls: 892, slashes: 12 },
];
const SETTLEMENTS = [
  { time: "23:41:02", provider: "AI Data", tx: "0x4a7f...e291", amount: "+0.001 USDC", ok: true },
  { time: "23:40:28", provider: "Search API", tx: "0x9b2c...f103", amount: "+0.002 USDC", ok: true },
  { time: "23:39:55", provider: "Oracle API", tx: "0x1d3e...3B42", amount: "-0.04 USDC", ok: false },
  { time: "23:38:31", provider: "ML Inference", tx: "0x7f1a...c934", amount: "+0.005 USDC", ok: true },
];
const ACTIVITY = [
  { icon: "✓", text: "AI Data Provider settled call #8421", time: "just now", ok: true },
  { icon: "✕", text: "Oracle API missed SLA — stake slashed", time: "2m ago", ok: false },
  { icon: "✓", text: "Search API honored SLA #8419", time: "3m ago", ok: true },
  { icon: "●", text: "New provider registered: ML Inference", time: "5m ago", ok: null },
  { icon: "✓", text: "CCTP bridge settled 10 USDC from Base", time: "8m ago", ok: true },
];

const STATS = [
  { label: "Active SLAs", value: "24", color: "#0a1628" },
  { label: "Calls Today", value: "8,421", color: "#16a34a" },
  { label: "USDC Settled", value: "12.48", color: "#0f766e" },
  { label: "Provider Stake", value: "25,000", color: "#0a1628" },
];

const SIDEBAR = ["Overview", "Services", "SLAs", "Calls", "Providers", "Settlements", "Activity"];

export default function DashboardPreview() {
  const [active, setActive] = useState("Overview");

  const renderContent = () => {
    switch (active) {
      case "Overview": return (
        <div>
          <div style={{ fontSize: 10, color: "#6b8a7a", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--mono)" }}>OVERVIEW</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0a1628", marginBottom: 20 }}>Dashboard</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }} className="dash-stats">
            {STATS.map(s => (
              <div key={s.label} style={{ background: "#f7faf8", border: "1px solid #dde8e1", borderRadius: 10, padding: "14px" }}>
                <div style={{ fontSize: 9, color: "#6b8a7a", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "var(--mono)" }}>{s.value}</div>
              </div>
            ))}
          </div>
          <CallsTable calls={CALLS} />
        </div>
      );
      case "SLAs": return (
        <div>
          <div style={{ fontSize: 10, color: "#6b8a7a", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--mono)" }}>SLAS</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0a1628", marginBottom: 20 }}>Active SLAs</div>
          {SLAS.map(s => (
            <div key={s.id} style={{ background: "#f7faf8", border: "1px solid #dde8e1", borderRadius: 10, padding: "14px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: "#6b8a7a", fontFamily: "var(--mono)" }}>{s.id}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0a1628" }}>{s.name}</div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[["GUARANTEE", s.guarantee], ["PER CALL", s.price], ["STAKE", s.stake], ["SLASH", s.slash]].map(([k, v]) => (
                  <div key={k as string} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 8, color: "#6b8a7a", letterSpacing: "0.08em" }}>{k}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0a1628", fontFamily: "var(--mono)" }}>{v}</div>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: s.status === "active" ? "#16a34a" : "#dc2626", background: s.status === "active" ? "#dcfce7" : "#fee2e2", border: `1px solid ${s.status === "active" ? "#86efac" : "#fca5a5"}`, borderRadius: 5, padding: "2px 8px" }}>{s.status.toUpperCase()}</span>
            </div>
          ))}
        </div>
      );
      case "Calls": return (
        <div>
          <div style={{ fontSize: 10, color: "#6b8a7a", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--mono)" }}>CALLS</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0a1628", marginBottom: 20 }}>Call History</div>
          <CallsTable calls={CALLS} />
        </div>
      );
      case "Providers": return (
        <div>
          <div style={{ fontSize: 10, color: "#6b8a7a", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--mono)" }}>PROVIDERS</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0a1628", marginBottom: 20 }}>Provider Directory</div>
          {PROVIDERS.map(p => (
            <div key={p.name} style={{ background: "#f7faf8", border: "1px solid #dde8e1", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0a1628" }}>{p.name}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", fontFamily: "var(--mono)" }}>Rep {p.rep}</span>
              </div>
              <div style={{ width: "100%", height: 4, background: "#dde8e1", borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
                <div style={{ width: `${p.rep}%`, height: "100%", background: p.rep > 80 ? "#16a34a" : p.rep > 60 ? "#f59e0b" : "#dc2626", borderRadius: 2, transition: "width 0.5s" }} />
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {[["Stake", p.stake], ["Calls", String(p.calls)], ["Slashes", String(p.slashes)]].map(([k, v]) => (
                  <div key={k as string}><span style={{ fontSize: 9, color: "#6b8a7a" }}>{k} </span><span style={{ fontSize: 11, fontWeight: 700, color: "#0a1628", fontFamily: "var(--mono)" }}>{v}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
      case "Settlements": return (
        <div>
          <div style={{ fontSize: 10, color: "#6b8a7a", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--mono)" }}>SETTLEMENTS</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0a1628", marginBottom: 20 }}>Settlement History</div>
          {SETTLEMENTS.map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #dde8e1" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#6b8a7a", fontFamily: "var(--mono)" }}>{s.time}</span>
                <span style={{ fontSize: 12, color: "#0a1628", fontWeight: 500 }}>{s.provider}</span>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#6b8a7a", fontFamily: "var(--mono)" }}>{s.tx}</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)", color: s.ok ? "#16a34a" : "#dc2626" }}>{s.amount}</span>
              </div>
            </div>
          ))}
        </div>
      );
      case "Activity": return (
        <div>
          <div style={{ fontSize: 10, color: "#6b8a7a", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--mono)" }}>ACTIVITY</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0a1628", marginBottom: 20 }}>Live Feed</div>
          {ACTIVITY.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid #f0f5f2" }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", background: a.ok === null ? "#f0f5f2" : a.ok ? "#dcfce7" : "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: a.ok === null ? "#6b8a7a" : a.ok ? "#16a34a" : "#dc2626", flexShrink: 0 }}>{a.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#0a1628" }}>{a.text}</div>
                <div style={{ fontSize: 10, color: "#6b8a7a", marginTop: 2 }}>{a.time}</div>
              </div>
            </div>
          ))}
        </div>
      );
      default: return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#6b8a7a", fontSize: 13 }}>Select a section</div>
      );
    }
  };

  return (
    <section style={{ padding: "80px 32px", background: "#fff", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>PRODUCT PREVIEW</div>
          <h2 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: 0 }}>The CallGuard dashboard.</h2>
        </div>

        <div style={{ background: "#fff", border: "1px solid #0a1628", borderRadius: 16, overflow: "hidden", boxShadow: "0 16px 40px rgba(10,22,40,0.08)" }}>
          {/* title bar */}
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #dde8e1", display: "flex", alignItems: "center", gap: 6, background: "#f7faf8" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", opacity: 0.7 }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", opacity: 0.7 }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", opacity: 0.7 }} />
            <span style={{ fontSize: 11, color: "#6b8a7a", marginLeft: 12, fontFamily: "var(--mono)" }}>callguard.app — {active}</span>
          </div>

          <div style={{ display: "flex", height: 480 }}>
            {/* sidebar */}
            <div style={{ width: 160, borderRight: "1px solid #dde8e1", padding: "16px 0", flexShrink: 0, background: "#f7faf8" }}>
              <div style={{ padding: "0 16px 14px", fontSize: 13, fontWeight: 800, color: "#0a1628", letterSpacing: "-0.02em" }}>CallGuard</div>
              {SIDEBAR.map(item => (
                <div key={item} onClick={() => setActive(item)} style={{
                  padding: "7px 16px", fontSize: 12, fontWeight: active === item ? 600 : 400,
                  color: active === item ? "#0a1628" : "#6b8a7a",
                  background: active === item ? "#fff" : "transparent",
                  borderLeft: active === item ? "2px solid #16a34a" : "2px solid transparent",
                  cursor: "pointer", transition: "all 0.15s",
                }}
                  onMouseEnter={e => { if (active !== item) e.currentTarget.style.color = "#0a1628"; }}
                  onMouseLeave={e => { if (active !== item) e.currentTarget.style.color = "#6b8a7a"; }}
                >{item}</div>
              ))}
            </div>

            {/* main */}
            <div style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
              {renderContent()}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) { .dash-stats { grid-template-columns: 1fr 1fr !important; } }
      `}</style>
    </section>
  );
}

function CallsTable({ calls }: { calls: typeof CALLS }) {
  return (
    <div style={{ background: "#f7faf8", border: "1px solid #dde8e1", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", padding: "8px 14px", borderBottom: "1px solid #dde8e1" }}>
        {["PROVIDER", "RESPONSE", "SLA", "STATUS"].map(h => (
          <span key={h} style={{ fontSize: 9, color: "#6b8a7a", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>{h}</span>
        ))}
      </div>
      {calls.map(c => (
        <div key={c.provider} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", padding: "9px 14px", borderBottom: "1px solid #f0f5f2", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#0a1628", fontWeight: 500 }}>{c.provider}</span>
          <span style={{ fontSize: 11, color: c.status === "slashed" ? "#dc2626" : "#0a1628", fontFamily: "var(--mono)" }}>{c.response}</span>
          <span style={{ fontSize: 11, color: "#6b8a7a", fontFamily: "var(--mono)" }}>{c.sla}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: c.status === "settled" ? "#16a34a" : "#dc2626", background: c.status === "settled" ? "#dcfce7" : "#fee2e2", border: `1px solid ${c.status === "settled" ? "#86efac" : "#fca5a5"}`, borderRadius: 4, padding: "2px 6px", width: "fit-content" }}>{c.status === "settled" ? "✓ Settled" : "✕ Slashed"}</span>
        </div>
      ))}
    </div>
  );
}
