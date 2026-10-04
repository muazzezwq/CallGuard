import { ConnectKitButton } from "connectkit";
import { useAccount } from "wagmi";
import { useAppStore } from "../../store/useAppStore";
import { Sun, Moon, Menu } from "lucide-react";
import { useUsdcBalance } from "../../hooks/useOnchain";
import { formatUnits } from "viem";

interface Props { onMenuClick?: () => void; }

export default function AppTopbar({ onMenuClick }: Props) {
  const { address } = useAccount();
  const { mode, setMode, theme, setTheme } = useAppStore();
  const { data: bal } = useUsdcBalance(address);
  const balStr = bal ? parseFloat(formatUnits(bal.value, bal.decimals)).toFixed(2) : null;

  return (
    <header style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 16px",
      height: 48,
      borderBottom: "1px solid var(--border)",
      position: "sticky",
      top: 0,
      zIndex: 50,
      background: "rgba(7,11,18,0.85)",
      backdropFilter: "blur(16px)",
      flexShrink: 0,
    }}>
      {/* Left: hamburger (mobile) + logo + network */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onMenuClick}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}
        >
          <Menu size={16} />
        </button>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#10b981,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>CG</div>
        <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "var(--accent)", fontSize: 11, fontWeight: 500 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite" }} />
          Arc Testnet
        </span>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {balStr && (
          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            {balStr} USDC
          </span>
        )}

        {/* Simple / Pro */}
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", fontSize: 11 }}>
          {(["simple","pro"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "3px 8px",
              border: "none",
              background: mode === m ? "rgba(16,185,129,0.15)" : "transparent",
              color: mode === m ? "var(--accent)" : "var(--text-dim)",
              fontWeight: mode === m ? 600 : 400,
              cursor: "pointer",
              textTransform: "capitalize",
            }}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* Theme */}
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}>
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <ConnectKitButton />
      </div>
    </header>
  );
}
