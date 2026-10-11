import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useAppStore } from "../../store/useAppStore";

export default function RoleModal() {
  const { isConnected } = useAccount();
  const { role, onboardingDone, setRole, setOnboardingDone, setMode } = useAppStore();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isConnected && !role && !onboardingDone) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, [isConnected, role, onboardingDone]);

  if (!visible) return null;

  const close = () => {
    setClosing(true);
    setTimeout(() => { setVisible(false); setClosing(false); }, 250);
  };

  const choose = (r: "provider" | "caller") => {
    setRole(r);
    setOnboardingDone();
    if (r === "provider") setMode("pro");
    close();
  };

  const skip = () => { setOnboardingDone(); close(); };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1200,
      background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
      animation: closing ? "fadeOut 0.25s ease forwards" : "fadeIn 0.2s ease",
    }}>
      <div style={{
        background: "var(--bg-2)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "32px 28px", maxWidth: 460, width: "100%",
        boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
        animation: "slideUp 0.25s ease",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: "linear-gradient(135deg,#10b981,#059669)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, margin: "0 auto 16px",
            boxShadow: "0 0 24px rgba(16,185,129,0.4)",
          }}>⚡</div>
          <h2 style={{
            margin: "0 0 8px", fontSize: 20, fontWeight: 800,
            color: "var(--text)", fontFamily: "var(--font-display)",
            letterSpacing: "-0.02em",
          }}>Welcome to CallGuard</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
            How are you planning to use CallGuard?<br />
            We'll customize your experience accordingly.
          </p>
        </div>

        {/* Role cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {/* Provider */}
          <button onClick={() => choose("provider")} style={{
            background: "var(--bg-1)", border: "2px solid var(--border)",
            borderRadius: 12, padding: "20px 16px", cursor: "pointer",
            textAlign: "left", transition: "all 0.18s", color: "var(--text)",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,0.06)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-1)";
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>🖥️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              I'm a Provider
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
              Sell API calls. Stake USDC. Earn per request. Build reputation.
            </div>
            <div style={{
              marginTop: 10, fontSize: 10, fontWeight: 600, color: "var(--accent)",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              → Pro mode
            </div>
          </button>

          {/* Caller */}
          <button onClick={() => choose("caller")} style={{
            background: "var(--bg-1)", border: "2px solid var(--border)",
            borderRadius: 12, padding: "20px 16px", cursor: "pointer",
            textAlign: "left", transition: "all 0.18s", color: "var(--text)",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#3b82f6";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(59,130,246,0.06)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-1)";
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>📡</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              I'm a Caller
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
              Use SLA-guaranteed APIs. Pay per request. Get refund if SLA is missed.
            </div>
            <div style={{
              marginTop: 10, fontSize: 10, fontWeight: 600, color: "#3b82f6",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              → Simple mode
            </div>
          </button>
        </div>

        {/* Feature highlights */}
        <div style={{
          background: "var(--bg-1)", border: "1px solid var(--border)",
          borderRadius: 10, padding: "12px 14px", marginBottom: 20,
        }}>
          {[
            ["⚡", "Gas-free calls via EIP-3009 — no ETH needed"],
            ["🔒", "USDC in escrow — automatic slash on timeout"],
            ["📋", "EIP-712 signed receipts — verifiable on-chain"],
          ].map(([icon, text]) => (
            <div key={text} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 0", fontSize: 12, color: "var(--text-dim)",
            }}>
              <span>{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>

        <button onClick={skip} style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          fontSize: 12, color: "var(--text-faint)", padding: 4,
        }}>
          Skip for now — I'll explore on my own
        </button>
      </div>
    </div>
  );
}
