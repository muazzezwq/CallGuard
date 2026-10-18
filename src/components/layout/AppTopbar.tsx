import { useState, useCallback, useEffect, useRef } from "react";
import { Search, Moon, Sun, ChevronDown, Copy, LogOut, Bell } from "lucide-react";
import { useAccount, useChainId, useDisconnect } from "wagmi";
import { useModal } from "connectkit";
import { toast } from "sonner";
import { useAppStore } from "../../store/useAppStore";
import { useUsdcBalance } from "../../hooks/useOnchain";
import { Mark } from "../../ui";
import { arcTestnet } from "../../lib/config";

type NetState = "connected" | "connecting" | "disconnected" | "wrong-chain";

export default function AppTopbar({
  onHamburger,
  onCommandPalette,
  panelLabel,
  groupLabel,
  navOpen,
}: {
  onHamburger?: () => void;
  onCommandPalette?: () => void;
  panelLabel?: string;
  groupLabel?: string;
  navOpen?: boolean;
}) {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { setOpen } = useModal();
  const { theme, setTheme, mode, setMode, setPanel } = useAppStore();

  const { data: usdcBalance } = useUsdcBalance(address);
  const usdcBal = usdcBalance ? Number(usdcBalance.formatted).toFixed(2) : null;
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  /* Real network state — never a permanent green dot. */
  const net: NetState = !isConnected
    ? (status === "connecting" || status === "reconnecting" ? "connecting" : "disconnected")
    : chainId === arcTestnet.id ? "connected" : "wrong-chain";

  const NET_LABEL: Record<NetState, string> = {
    connected: "Arc Testnet",
    connecting: "Connecting…",
    disconnected: "Not connected",
    "wrong-chain": "Wrong network",
  };

  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    }).catch(() => toast.error("Couldn't copy address"));
  }, [address]);
  // Cleanup timer on unmount
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  // Close the wallet menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
  const avatarHue = address ? parseInt(address.slice(2, 8), 16) % 360 : 150;

  return (
    <header className="topbar">
      {/* Left: hamburger + brand + breadcrumb */}
      <div className="tb-left">
        <button
          className="tb-hamburger"
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navOpen}
          aria-controls="appSidebar"
          onClick={onHamburger}
        >
          <span /><span /><span />
        </button>
        <div className="tb-brand">
          <div className="tb-brand-icon"><Mark size={22} /></div>
          <span className="tb-brand-name">CallGuard</span>
        </div>
        {panelLabel && (
          <div className="tb-breadcrumb">
            {groupLabel && (
              <>
                <span className="tb-breadcrumb-group">{groupLabel}</span>
                <span className="tb-breadcrumb-sep">›</span>
              </>
            )}
            <span className="tb-breadcrumb-panel">{panelLabel}</span>
          </div>
        )}
      </div>

      {/* Right: controls */}
      <div className="tb-right">

        {/* Simple / Pro toggle — always visible */}
        <div className="tb-mode-toggle">
          <button
            className={`tb-mode-btn${mode === "simple" ? " active" : ""}`}
            onClick={() => setMode("simple")}
          >Simple</button>
          <button
            className={`tb-mode-btn${mode === "pro" ? " active" : ""}`}
            onClick={() => setMode("pro")}
          >Pro</button>
        </div>

        {/* Network pill — real connection state */}
        {net === "wrong-chain" ? (
          <button
            className="net-pill is-warn"
            onClick={() => setOpen(true)}
            title="This wallet is on a different chain — switch to Arc Testnet"
          >
            <span className="net-dot" />
            <span className="tb-hide-sm">{NET_LABEL[net]}</span>
          </button>
        ) : (
          <div className={`net-pill${net === "connected" ? " ok" : net === "connecting" ? " is-connecting" : ""}`}>
            <span className="net-dot" />
            <span className="tb-hide-sm">{NET_LABEL[net]}</span>
          </div>
        )}

        {/* USDC balance — only when connected */}
        {isConnected && usdcBal && (
          <div className="tb-balance tb-hide-sm">
            <span className="tb-balance-label">USDC</span>
            <span className="tb-balance-val">{usdcBal}</span>
          </div>
        )}

        {/* Notifications / activity log */}
        <button
          className="tb-icon-btn"
          title="Logs & notifications"
          aria-label="Logs and notifications"
          onClick={() => setPanel("notifications")}
        >
          <Bell size={15} />
        </button>

        {/* Theme toggle */}
        <button className="tb-icon-btn" title="Toggle theme" aria-label="Toggle theme" onClick={toggleTheme}>
          {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        {/* Connect / address */}
        {!isConnected ? (
          <button className="btn btn-primary tb-connect" onClick={() => setOpen(true)}>
            Connect
          </button>
        ) : (
          <div className="tb-wallet-wrap" ref={menuRef}>
            <button
              className="tb-wallet"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={address ?? ""}
            >
              <span
                className="tb-wallet__avatar"
                style={{ background: `linear-gradient(135deg, hsl(${avatarHue} 55% 42%), hsl(${(avatarHue + 40) % 360} 60% 30%))` }}
                aria-hidden="true"
              />
              <span className="tb-wallet__addr mono">{short}</span>
              <ChevronDown size={13} className="tb-wallet__chev" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div className="tb-wallet__menu" role="menu">
                <button
                  className="tb-wallet__item"
                  role="menuitem"
                  onClick={() => { copy(); setMenuOpen(false); }}
                >
                  <Copy size={13} />
                  {copied ? "Copied" : "Copy address"}
                </button>
                <button
                  className="tb-wallet__item is-danger"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); disconnect(); }}
                >
                  <LogOut size={13} />
                  Disconnect
                </button>
              </div>
            )}
          </div>
        )}

        {/* ⌘K */}
        <button className="tb-cmd tb-hide-xs" onClick={onCommandPalette} title="Command palette (Ctrl+K)">
          <Search size={14} />
          <kbd>⌘K</kbd>
        </button>
      </div>
    </header>
  );
}
