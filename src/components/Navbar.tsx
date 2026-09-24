import { useState, useEffect } from "react";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = ["Product", "How It Works", "Developers", "Providers", "Docs"];

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled ? "rgba(247,250,248,0.95)" : "rgba(247,250,248,0.8)",
      backdropFilter: "blur(12px)",
      borderBottom: scrolled ? "1px solid #dde8e1" : "1px solid transparent",
      transition: "all 0.2s ease",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, background: "#0a1628", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#16a34a", fontSize: 14, fontWeight: 700 }}>▲</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0a1628", letterSpacing: "-0.02em" }}>CallGuard</span>
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#16a34a", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 4, padding: "2px 6px", letterSpacing: "0.08em" }}>BUILT ON ARC</span>
        </div>

        {/* Center — desktop */}
        <div style={{ display: "flex", gap: 4 }} className="nav-links">
          {links.map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/\s+/g, "-")}`} style={{
              fontSize: 13, fontWeight: 500, color: "#3d5a4e", padding: "6px 12px",
              borderRadius: 6, textDecoration: "none", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#0a1628"; e.currentTarget.style.background = "#f0f5f2"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#3d5a4e"; e.currentTarget.style.background = "transparent"; }}
            >{l}</a>
          ))}
        </div>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }} className="net-status">
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block", boxShadow: "0 0 0 2px #dcfce7" }} />
            <span style={{ fontSize: 11, color: "#6b8a7a", fontWeight: 500 }}>Arc Testnet</span>
          </div>
          <a href="/app/" style={{
            fontSize: 13, fontWeight: 600, color: "#fff",
            background: "#0a1628", padding: "8px 16px", borderRadius: 8,
            textDecoration: "none", transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#16a34a"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#0a1628"; }}
          >Launch App →</a>
          <button onClick={() => setMobileOpen(o => !o)} style={{ display: "none", background: "none", border: "none", cursor: "pointer", padding: 4, color: "#0a1628", fontSize: 20 }} className="nav-burger">☰</button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div style={{ background: "#f7faf8", borderTop: "1px solid #dde8e1", padding: "12px 24px 20px" }}>
          {links.map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => setMobileOpen(false)}
              style={{ display: "block", fontSize: 15, fontWeight: 500, color: "#0a1628", padding: "10px 0", borderBottom: "1px solid #f0f5f2", textDecoration: "none" }}
            >{l}</a>
          ))}
          <a href="/app/" style={{ display: "block", marginTop: 12, textAlign: "center", fontSize: 14, fontWeight: 600, color: "#fff", background: "#0a1628", padding: "12px", borderRadius: 8, textDecoration: "none" }}>Launch App →</a>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .nav-links { display: none !important; }
          .net-status { display: none !important; }
          .nav-burger { display: block !important; }
        }
      `}</style>
    </nav>
  );
}
