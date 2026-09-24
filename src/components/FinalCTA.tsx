export default function FinalCTA() {
  return (
    <section style={{ padding: "96px 32px", background: "#0a1628", position: "relative", overflow: "hidden" }}>
      {/* grid */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.06, backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />
      {/* green glow */}
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(22,163,74,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center", position: "relative" }}>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", margin: "0 0 16px", lineHeight: 1.1 }}>
          Give every API call<br />a guarantee.
        </h2>
        <p style={{ fontSize: 16, color: "#94a3b8", margin: "0 0 36px", lineHeight: 1.6 }}>
          Build reliable machine-to-machine services with on-chain SLAs on Arc.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/app/" style={{ fontSize: 15, fontWeight: 700, color: "#0a1628", background: "#16a34a", padding: "14px 28px", borderRadius: 10, textDecoration: "none", transition: "opacity 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
          >Launch CallGuard →</a>
          <a href="#developers" style={{ fontSize: 15, fontWeight: 500, color: "#cbd5e1", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", padding: "14px 28px", borderRadius: 10, textDecoration: "none", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
          >Read Documentation</a>
        </div>
      </div>
    </section>
  );
}
