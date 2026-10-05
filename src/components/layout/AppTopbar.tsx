import { useState, useCallback } from "react";
import { ConnectKitButton } from "connectkit";
import { useAccount, useDisconnect } from "wagmi";
import { useAppStore } from "../../store/useAppStore";
import { Sun, Moon, Menu, Copy, Check, LogOut } from "lucide-react";
import { useUsdcBalance, useEurcBalance, useUsycBalance, useBandUsdcRate, formatUnits } from "../../hooks/useOnchain";

interface Props { onMenuClick?: () => void; }

function BalancePill({ symbol, value, decimals, color }: { symbol: string; value: bigint; decimals: number; color: string }) {
  const formatted = parseFloat(formatUnits(value, decimals)).toFixed(2);
  return (
    <span style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 6,
      background: "var(--bg-3)", border: "1px solid var(--border)",
      fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)",
      whiteSpace: "nowrap",
    }}>
      <span style={{ color, fontWeight: 700 }}>{symbol}</span>
      <span style={{ color: "var(--text)" }}>{formatted}</span>
    </span>
  );
}

export default function AppTopbar({ onMenuClick }: Props) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { mode, setMode, theme, setTheme } = useAppStore();
  const { data: usdcBal } = useUsdcBalance(address);
  const { data: eurcBal } = useEurcBalance(isConnected ? address : undefined);
  const { data: usycBal } = useUsycBalance(isConnected ? address : undefined);
  // Band oracle only enabled after wallet connect (rate-limit rule)
  const { data: bandData } = useBandUsdcRate(isConnected);
  const [copied, setCopied] = useState(false);

  const usdcRate = bandData ? Number((bandData as [bigint, bigint, bigint])[0]) / 1e18 : 1.0;

  const copyAddress = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard denied */ }
  }, [address]);

  const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  // USD value of USDC balance
  const usdcUsdValue = usdcBal
    ? (parseFloat(formatUnits(usdcBal.value, usdcBal.decimals)) * usdcRate).toFixed(2)
    : null;

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
      gap: 8,
    }}>
      {/* Left: hamburger + brand + network */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <button
          onClick={onMenuClick}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer", flexShrink: 0 }}
          title="Toggle sidebar"
        >
          <Menu size={16} />
        </button>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--gradient-brand)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 800, flexShrink: 0, fontFamily: "var(--font-display)" }}>
          CG
        </div>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text)", display: "none" }} className="brand-name">
          CallGuard
        </span>
        <span style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "2px 8px", borderRadius: 999,
          background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
          color: "var(--accent)", fontSize: 10, fontWeight: 500, whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite" }} />
          Arc Testnet
        </span>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", overflow: "hidden" }}>
        {/* USDC balance + USD equiv */}
        {isConnected && usdcBal && (
          <BalancePill symbol="USDC" value={usdcBal.value} decimals={usdcBal.decimals} color="var(--accent)" />
        )}
        {/* EURC balance */}
        {isConnected && eurcBal && eurcBal.value > 0n && (
          <BalancePill symbol="EURC" value={eurcBal.value} decimals={eurcBal.decimals} color="#3b82f6" />
        )}
        {/* USYC balance */}
        {isConnected && usycBal && usycBal.value > 0n && (
          <BalancePill symbol="USYC" value={usycBal.value} decimals={usycBal.decimals} color="#f59e0b" />
        )}
        {/* USD equivalent (Band oracle) */}
        {isConnected && usdcUsdValue && bandData && (
          <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
            ≈${usdcUsdValue}
          </span>
        )}

        {/* Address pill (click to copy) */}
        {isConnected && address && (
          <button
            onClick={copyAddress}
            title="Click to copy address"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: 6,
              background: "var(--bg-3)", border: "1px solid var(--border)",
              color: "var(--text-dim)", fontSize: 11, cursor: "pointer",
              fontFamily: "var(--font-mono)", whiteSpace: "nowrap",
            }}
          >
            {copied ? <Check size={10} color="var(--accent)" /> : <Copy size={10} />}
            {short(address)}
          </button>
        )}

        {/* Simple / Pro toggle */}
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", fontSize: 10, flexShrink: 0 }}>
          {(["simple","pro"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "3px 7px",
              border: "none",
              background: mode === m ? "rgba(16,185,129,0.15)" : "transparent",
              color: mode === m ? "var(--accent)" : "var(--text-dim)",
              fontWeight: mode === m ? 600 : 400,
              cursor: "pointer",
              textTransform: "capitalize",
              fontSize: 10,
            }}>
              {m === "simple" ? "S" : "P"}
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          style={{ padding: 5, borderRadius: 8, border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer", flexShrink: 0 }}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        {/* Disconnect button (visible when connected) */}
        {isConnected && (
          <button
            onClick={() => disconnect()}
            title="Disconnect wallet"
            style={{ padding: 5, borderRadius: 8, border: "none", background: "transparent", color: "var(--danger)", cursor: "pointer", flexShrink: 0, opacity: 0.7 }}
          >
            <LogOut size={13} />
          </button>
        )}

        {/* ConnectKit button (handles connect/wallet modal) */}
        <ConnectKitButton />
      </div>
    </header>
  );
}
