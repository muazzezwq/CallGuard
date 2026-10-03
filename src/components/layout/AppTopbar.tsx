import { ConnectKitButton } from "connectkit";
import { useAccount } from "wagmi";
import { useAppStore } from "../../store/useAppStore";
import { Sun, Moon } from "lucide-react";
import { useUsdcBalance } from "../../hooks/useOnchain";
import { formatUnits } from "viem";

export default function AppTopbar() {
  const { address } = useAccount();
  const { mode, setMode, theme, setTheme } = useAppStore();
  const { data: bal } = useUsdcBalance(address);

  const balStr = bal ? parseFloat(formatUnits(bal.value, bal.decimals)).toFixed(2) : null;

  return (
    <header className="topbar flex items-center justify-between px-4 h-12 border-b border-border sticky top-0 z-50 bg-bg-0/80 backdrop-blur-xl">
      {/* Left: logo + network */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center text-white text-xs font-bold">CG</div>
        <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Arc Testnet
        </span>
      </div>

      {/* Right: balance + mode toggle + theme + connect */}
      <div className="flex items-center gap-2">
        {balStr && (
          <span className="hidden sm:block text-xs text-text-dim font-mono">
            {balStr} USDC
          </span>
        )}

        {/* Simple / Pro toggle */}
        <div className="flex items-center rounded-lg overflow-hidden border border-border text-xs">
          <button
            onClick={() => setMode("simple")}
            className={`px-2 py-1 transition-colors ${mode === "simple" ? "bg-accent/20 text-accent font-semibold" : "text-text-dim hover:text-text"}`}
          >
            Simple
          </button>
          <button
            onClick={() => setMode("pro")}
            className={`px-2 py-1 transition-colors ${mode === "pro" ? "bg-accent/20 text-accent font-semibold" : "text-text-dim hover:text-text"}`}
          >
            Pro
          </button>
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-bg-3 transition-colors"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <ConnectKitButton />
      </div>
    </header>
  );
}
