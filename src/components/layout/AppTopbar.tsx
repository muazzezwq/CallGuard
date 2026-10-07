import { useState, useCallback } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useModal } from "connectkit";
import { useAppStore } from "../../store/useAppStore";
import { useUsdcBalance } from "../../hooks/useOnchain";

export default function AppTopbar({
  onHamburger,
  onCommandPalette,
}: {
  onHamburger?: () => void;
  onCommandPalette?: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { setOpen } = useModal();
  const { theme, setTheme } = useAppStore();

  const { data: usdcRaw } = useUsdcBalance(address);
  const usdcBal = usdcRaw ? (Number(usdcRaw) / 1e6).toFixed(2) : null;
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [address]);

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  return (
    <header className="topbar">
      {/* Left: hamburger + brand */}
      <div className="tb-left">
        <button className="tb-hamburger" aria-label="Menu" onClick={onHamburger}>
          <span /><span /><span />
        </button>
        <div className="tb-brand">
          <div className="tb-brand-icon">⚡</div>
          <span className="tb-brand-name">CallGuard</span>
        </div>
      </div>

      {/* Right: controls */}
      <div className="tb-right">
        {/* Network pill */}
        <div className={`net-pill${isConnected ? " ok" : ""}`}>
          <span className="net-dot" />
          <span className="tb-hide-sm">{isConnected ? "Arc Testnet" : "Disconnected"}</span>
        </div>

        {/* USDC balance — only when connected */}
        {isConnected && usdcBal && (
          <div className="tb-balance tb-hide-sm">
            <span className="tb-balance-label">USDC</span>
            <span className="tb-balance-val">{usdcBal}</span>
          </div>
        )}

        {/* Theme toggle */}
        <button className="tb-icon-btn" title="Toggle theme" onClick={toggleTheme}>
          {theme === "dark" ? "🌙" : "☀️"}
        </button>

        {/* Connect / address */}
        {!isConnected ? (
          <button className="btn btn-primary tb-connect" onClick={() => setOpen(true)}>
            Connect wallet
          </button>
        ) : (
          <>
            <button className="tb-addr tb-hide-sm" title={copied ? "Copied!" : "Copy address"} onClick={copy}>
              {copied ? "✓" : short}
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => disconnect()}>
              Reset
            </button>
          </>
        )}

        {/* ⌘K */}
        <button className="tb-cmd tb-hide-xs" onClick={onCommandPalette} title="Command palette (Ctrl+K)">
          <span>🔍</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
    </header>
  );
}
