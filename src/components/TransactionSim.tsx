import { useState } from "react";

const SLA_STEPS = [
  { id: "caller", label: "CALLER", sub: "Request initiated", icon: "●" },
  { id: "payment", label: "PAYMENT AUTHORIZED", sub: "0.001 USDC escrowed", icon: "💳" },
  { id: "request", label: "API REQUEST", sub: "POST /api/data", icon: "→" },
  { id: "response", label: "87 ms RESPONSE", sub: "Within 120 ms SLA", icon: "⚡" },
  { id: "receipt", label: "SIGNED RECEIPT", sub: "EIP-712 signature verified", icon: "#" },
  { id: "sla", label: "SLA VERIFIED", sub: "On-chain check passed", icon: "✓" },
  { id: "settle", label: "SETTLEMENT COMPLETE", sub: "Payment released", icon: "✓" },
];

const MISS_STEPS = [
  { id: "caller", label: "CALLER", sub: "Request initiated", icon: "●" },
  { id: "payment", label: "PAYMENT AUTHORIZED", sub: "0.001 USDC escrowed", icon: "💳" },
  { id: "request", label: "API REQUEST", sub: "POST /api/data", icon: "→" },
  { id: "timeout", label: "184 ms — TIMEOUT", sub: "Exceeded 120 ms SLA", icon: "✕" },
  { id: "slash", label: "STAKE SLASHED", sub: "20% of provider stake", icon: "⚡" },
  { id: "refund", label: "CALLER PROTECTED", sub: "Refund + slash reward", icon: "✓" },
];

export default function TransactionSim() {
  const [mode, setMode] = useState<"idle" | "running" | "met" | "missed">("idle");
  const [activeStep, setActiveStep] = useState(-1);

  const run = (miss: boolean) => {
    const steps = miss ? MISS_STEPS : SLA_STEPS;
    setMode("running");
    setActiveStep(-1);
    steps.forEach((_, i) => {
      setTimeout(() => {
        setActiveStep(i);
        if (i === steps.length - 1) setMode(miss ? "missed" : "met");
      }, i * 600 + 300);
    });
  };

  const steps = mode === "missed" || (mode === "running" && activeStep < SLA_STEPS.length - 1 && false) ? MISS_STEPS : SLA_STEPS;
  const isMiss = mode === "missed";

  return (
    <section style={{ padding: "80px 32px", background: "#f7faf8", borderTop: "1px solid #dde8e1" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>LIVE SIMULATION</div>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#0a1628", margin: "0 0 8px" }}>Watch an API call settle on-chain.</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }} className="sim-grid">
          {/* Timeline */}
          <div style={{ background: "#fff", border: "1px solid #dde8e1", borderRadius: 16, padding: "24px" }}>
            {(mode === "missed" ? MISS_STEPS : SLA_STEPS).map((s, i) => {
              const done = i <= activeStep;
              const active = i === activeStep;
              const isErr = isMiss && (s.id === "timeout" || s.id === "slash");
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: i < 6 ? 4 : 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: done ? (isErr ? "#fee2e2" : "#dcfce7") : "#f0f5f2", border: `2px solid ${done ? (isErr ? "#fca5a5" : "#86efac") : "#dde8e1"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: done ? (isErr ? "#dc2626" : "#16a34a") : "#6b8a7a", transition: "all 0.3s", transform: active ? "scale(1.15)" : "scale(1)" }}>{s.icon}</div>
                    {i < (mode === "missed" ? MISS_STEPS.length : SLA_STEPS.length) - 1 && <div style={{ width: 1, height: 20, background: done ? (isErr ? "#fca5a5" : "#86efac") : "#dde8e1", transition: "background 0.3s" }} />}
                  </div>
                  <div style={{ paddingTop: 2, opacity: done ? 1 : 0.35, transition: "opacity 0.3s" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isErr && done ? "#dc2626" : "#0a1628", letterSpacing: "0.04em" }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: "#6b8a7a" }}>{s.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Result + controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => run(false)} disabled={mode === "running"} style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#fff", background: "#0a1628", border: "none", padding: "12px", borderRadius: 10, cursor: mode === "running" ? "not-allowed" : "pointer", opacity: mode === "running" ? 0.5 : 1, transition: "background 0.15s" }}
                onMouseEnter={e => { if (mode !== "running") e.currentTarget.style.background = "#16a34a"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#0a1628"; }}
              >▶ Send Test Call (SLA Met)</button>
              <button onClick={() => run(true)} disabled={mode === "running"} style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#dc2626", background: "#fff", border: "1px solid #fca5a5", padding: "12px", borderRadius: 10, cursor: mode === "running" ? "not-allowed" : "pointer", opacity: mode === "running" ? 0.5 : 1 }}>✕ Simulate SLA Miss</button>
            </div>
            <button onClick={() => { setMode("idle"); setActiveStep(-1); }} style={{ fontSize: 12, color: "#6b8a7a", background: "#f7faf8", border: "1px solid #dde8e1", padding: "8px", borderRadius: 8, cursor: "pointer" }}>Reset</button>

            {(mode === "met" || mode === "missed") && (
              <div style={{ background: mode === "met" ? "#f0fdf4" : "#fff5f5", border: `1px solid ${mode === "met" ? "#86efac" : "#fca5a5"}`, borderRadius: 14, padding: "20px", transition: "all 0.3s" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: mode === "met" ? "#16a34a" : "#dc2626", marginBottom: 14 }}>
                  {mode === "met" ? "✓ SLA VERIFIED" : "✕ SLA MISSED"}
                </div>
                {mode === "met" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[["Response", "87 ms"], ["Limit", "120 ms"], ["Payment", "0.001 USDC"], ["Status", "SETTLED"], ["Network", "Arc"]].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, color: "#6b8a7a" }}>{k}</span>
                        <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600, color: "#0a1628" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[["Response", "184 ms"], ["Limit", "120 ms"], ["Provider Stake", "-20%"], ["Status", "SLASHED"]].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, color: "#6b8a7a" }}>{k}</span>
                        <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600, color: k === "Status" || k === "Provider Stake" ? "#dc2626" : "#0a1628" }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "#dcfce7", borderRadius: 8, fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Caller fully protected</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 768px) { .sim-grid { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
