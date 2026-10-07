import { useState, useCallback } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useModal } from "connectkit";
import { formatUnits } from "viem";
import { useAppStore } from "../../store/useAppStore";
import { useUsdcBalance, useEurcBalance, useUsycBalance } from "../../hooks/useOnchain";

export default function AppTopbar({ onHamburger, onCommandPalette }: { onHamburger?: () => void; onCommandPalette?: () => void }) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { setOpen } = useModal();
  const { mode, setMode, theme, toggleTheme } = useAppStore();

  const { data: usdcRaw } = useUsdcBalance(address);
  const { data: eurcRaw } = useEurcBalance(address);
  const { data: usycRaw } = useUsycBalance(address);

  const usdcBal = usdcRaw ? parseFloat(formatUnits(usdcRaw, 6)).toFixed(2) : "0.00";
  const eurcBal = eurcRaw ? parseFloat(formatUnits(eurcRaw, 6)).toFixed(2) : "0.00";
  const usycBal = usycRaw ? parseFloat(formatUnits(usycRaw as bigint, 6)).toFixed(4) : "0.0000";

  const [copied, setCopied] = useState(false);
  const handleCopyAddr = useCallback(() => {
    if (address) {
      navigator.clipboard.writeText(address).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }, [address]);

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* Brand */}
        <div className="brand">
          {/* hamburger — mobile only */}
          <button
            className="hamburger-btn"
            id="hamburgerBtn"
            aria-label="Menu"
            onClick={onHamburger}
          >
            ☰
          </button>
          <div className="brand-mark">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L13 4V10L7 13L1 10V4L7 1Z" stroke="white" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
          <div>
            <div className="brand-title">CallGuard</div>
            <div className="brand-sub">built on Arc Testnet</div>
          </div>
        </div>

        {/* Right side */}
        <div className="wallet-box">
          {/* Network pill */}
          <div className="network-pill" id="netPill">
            <span className={`net-dot${isConnected ? " ok" : ""}`} id="netDot" />
            <span id="netLabel">{isConnected ? "Arc Testnet" : "Disconnected"}</span>
          </div>

          {/* USDC balance — shown when connected */}
          {isConnected && (
            <div
              className="usdc-balance"
              id="balanceBox"
              style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-faint)", letterSpacing: ".06em" }}>USDC</span>
              <span style={{ fontWeight: 600, color: "var(--text)" }} id="usdcBal">{usdcBal}</span>
            </div>
          )}

          {/* EURC balance */}
          {isConnected && parseFloat(eurcBal) > 0 && (
            <div
              className="usdc-balance"
              id="eurcBalBox"
              style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-faint)", letterSpacing: ".06em" }}>EURC</span>
              <span style={{ fontWeight: 600, color: "var(--text)" }} id="eurcBal">{eurcBal}</span>
            </div>
          )}

          {/* USYC balance */}
          {isConnected && parseFloat(usycBal) > 0 && (
            <div
              className="usdc-balance"
              id="usycBalBox"
              style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-faint)", letterSpacing: ".06em" }}>USYC</span>
              <span style={{ fontWeight: 600, color: "var(--text)" }} id="usycBal">{usycBal}</span>
            </div>
          )}

          {/* Theme toggle */}
          <button
            id="cgThemeToggle"
            title="Toggle dark/light mode"
            onClick={toggleTheme}
          >
            {theme === "dark" ? "🌙" : "☀️"}
          </button>

          {/* Connect wallet / address pill */}
          {!isConnected ? (
            <button
              className="btn btn-primary"
              id="connectBtn"
              onClick={() => setOpen(true)}
              style={{ fontSize: 12, padding: "6px 14px" }}
            >
              Connect wallet
            </button>
          ) : (
            <>
              <div
                className="addr-pill"
                id="addrPill"
                title={copied ? "Copied!" : "Click to copy"}
                onClick={handleCopyAddr}
                style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "var(--text-dim)" }}
              >
                <span id="addrText">{copied ? "✓ Copied" : shortAddr}</span>
              </div>
              <button
                className="btn btn-sm btn-danger"
                id="btnResetMM"
                style={{ fontSize: 11, padding: "5px 10px" }}
                onClick={() => disconnect()}
              >
                Reset
              </button>
            </>
          )}

          {/* ⌘K Command Palette */}
          <button
            onClick={onCommandPalette}
            title="Command palette (Ctrl+K)"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-faint)", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
          >
            <span>🔍</span>
            <kbd style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>⌘K</kbd>
          </button>

          {/* Simple / Pro toggle */}
          <div
            id="modeToggle"
            style={{ display: "flex", alignItems: "center", gap: 0, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", fontSize: 11, fontWeight: 600 }}
          >
            <button
              id="btnSimpleMode"
              onClick={() => setMode("simple")}
              style={{ padding: "5px 10px", background: mode === "simple" ? "var(--accent)" : "transparent", color: mode === "simple" ? "#fff" : "var(--text-faint)", border: "none", cursor: "pointer", letterSpacing: ".04em" }}
            >
              Simple
            </button>
            <button
              id="btnProMode"
              onClick={() => setMode("pro")}
              style={{ padding: "5px 10px", background: mode === "pro" ? "var(--accent)" : "transparent", color: mode === "pro" ? "#fff" : "var(--text-faint)", border: "none", cursor: "pointer", letterSpacing: ".04em" }}
            >
              Pro
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
