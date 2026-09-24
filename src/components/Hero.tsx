import { useEffect, useState, useRef } from "react";

function HeroWidget() {
  const [step, setStep] = useState(0);
  const [responseMs, setResponseMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t0 = setTimeout(() => setStep(1), 600);
    const t1 = setTimeout(() => setStep(2), 1400);
    const t2 = setTimeout(() => {
      setStep(3);
      let ms = 0;
      timerRef.current = setInterval(() => {
        ms += 6;
        if (ms >= 87) { setResponseMs(87); if (timerRef.current) clearInterval(timerRef.current); }
        else setResponseMs(ms);
      }, 16);
    }, 2200);
    const t3 = setTimeout(() => setStep(4), 3400);
    const t4 = setTimeout(() => setStep(5), 4200);
    const t5 = setTimeout(() => setStep(6), 5000);
    return () => { [t0, t1, t2, t3, t4, t5].forEach(clearTimeout); if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const fade = (show: boolean): React.CSSProperties => ({ opacity: show ? 1 : 0, transition: "opacity 0.4s ease" });
  const row = (label: string, value: string, valueColor = "#0a1628") => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f0f5f2" }}>
      <span style={{ fontSize: 10, color: "#6b8a7a", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600, color: valueColor }}>{value}</span>
    </div>
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #dde8e1", borderRadius: 16, padding: "18px", width: 300, boxShadow: "0 8px 32px rgba(10,22,40,0.08)", fontSize: 12 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#6b8a7a" }}>CALLGUARD</span>
        <span style={{ fontSize: 9, color: "#16a34a", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>LIVE</span>
      </div>

      {/* service */}
      <div style={{ background: "#f7faf8", borderRadius: 10, padding: "12px", marginBottom: 10, border: "1px solid #dde8e1", ...fade(step >= 0) }}>
        <div style={{ fontSize: 9, color: "#6b8a7a", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em" }}>API SERVICE</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0a1628", marginBottom: 8 }}>AI Data Provider</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
          <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>SLA ACTIVE</span>
        </div>
        {row("Response Guarantee", "120 ms")}
        {row("Price / Call", "0.001 USDC")}
        {row("Provider Stake", "500 USDC")}
      </div>

      {/* request */}
      <div style={{ background: "#f7faf8", borderRadius: 10, padding: "12px", marginBottom: 10, border: "1px solid #dde8e1", ...fade(step >= 1) }}>
        <div style={{ fontSize: 9, color: "#6b8a7a", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>REQUEST</div>
        {row("Method", "POST /api/data")}
        {row("Payment", "0.001 USDC")}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", ...fade(step >= 2) }}>
          <span style={{ fontSize: 10, color: "#6b8a7a", textTransform: "uppercase", letterSpacing: "0.07em" }}>Response</span>
          <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 600, color: step >= 4 ? "#16a34a" : "#0a1628" }}>{responseMs} ms</span>
        </div>
        <div style={{ paddingTop: 4, ...fade(step >= 4) }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>✓ SLA MET</span>
        </div>
      </div>

      {/* settlement */}
      <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "12px", border: "1px solid #86efac", ...fade(step >= 5) }}>
        <div style={{ fontSize: 9, color: "#6b8a7a", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>SETTLEMENT</div>
        {["Payment Released", "Receipt Verified", "Provider Protected"].map(s => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#dcfce7", border: "1px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#16a34a", flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: 10, color: "#3d5a4e" }}>{s}</span>
          </div>
        ))}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #dde8e1", display: "flex", justifyContent: "space-between", ...fade(step >= 6) }}>
          <span style={{ fontSize: 9, color: "#6b8a7a", fontFamily: "var(--mono)" }}>tx: 0x4a7f...e291</span>
          <span style={{ fontSize: 9, color: "#16a34a", fontWeight: 600 }}>ARC TESTNET</span>
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section style={{ padding: "96px 32px 72px", background: "var(--bg)", position: "relative", overflow: "hidden" }}>
      {/* subtle grid */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.4, backgroundImage: "linear-gradient(#dde8e1 1px, transparent 1px), linear-gradient(90deg, #dde8e1 1px, transparent 1px)", backgroundSize: "64px 64px", pointerEvents: "none" }} />

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", gap: 64, position: "relative" }} className="hero-inner">
        {/* left */}
        <div style={{ flex: "1 1 480px", minWidth: 0 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 11, fontWeight: 600, color: "#16a34a", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 20, padding: "3px 10px", letterSpacing: "0.06em" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
            Live on Arc Testnet
          </div>

          <h1 style={{ fontSize: "clamp(34px, 4.5vw, 60px)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.03em", color: "#0a1628", margin: "0 0 8px" }}>
            Service guarantees,
          </h1>
          <h1 style={{ fontSize: "clamp(34px, 4.5vw, 60px)", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.03em", color: "#16a34a", fontStyle: "italic", margin: "0 0 24px" }}>
            enforced on-chain.
          </h1>

          <p style={{ fontSize: 17, color: "#3d5a4e", lineHeight: 1.65, margin: "0 0 8px", maxWidth: 480 }}>
            CallGuard is a marketplace where providers put USDC on the line for every request.
          </p>
          <p style={{ fontSize: 14, color: "#6b8a7a", lineHeight: 1.7, margin: "0 0 32px", maxWidth: 460 }}>
            Miss the deadline — lose the stake. No court, no dispute process, no waiting. No arbiter. No middleman.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
            <a href="/app/" style={{ fontSize: 14, fontWeight: 700, color: "#fff", background: "#0a1628", padding: "12px 24px", borderRadius: 10, textDecoration: "none", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#16a34a"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#0a1628"; }}
            >Launch the app →</a>
            <a href="#how-it-works" style={{ fontSize: 14, fontWeight: 500, color: "#3d5a4e", background: "#fff", border: "1px solid #dde8e1", padding: "12px 24px", borderRadius: 10, textDecoration: "none", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#16a34a"; e.currentTarget.style.color = "#16a34a"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#dde8e1"; e.currentTarget.style.color = "#3d5a4e"; }}
            >See how it works</a>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {["EIP-712 receipts", "ERC-8004 identity", "x402 & CCTP", "66/66 tests passing"].map(b => (
              <span key={b} style={{ fontSize: 11, color: "#6b8a7a", fontFamily: "var(--mono)" }}>· {b}</span>
            ))}
          </div>
        </div>

        {/* right */}
        <div style={{ flex: "0 0 auto", display: "flex", justifyContent: "center" }} className="hero-widget">
          <HeroWidget />
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .hero-inner { flex-direction: column !important; gap: 40px !important; }
          .hero-widget { width: 100%; display: flex; justify-content: center; }
          .hero-widget > div { width: 100% !important; max-width: 340px; }
        }
      `}</style>
    </section>
  );
}
