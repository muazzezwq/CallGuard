import { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore, PanelId } from "../../store/useAppStore";

const ALL_COMMANDS: { id: PanelId; icon: string; label: string; keywords: string }[] = [
  { id: "overview",      icon: "📊", label: "Dashboard",        keywords: "overview home stats" },
  { id: "calls",         icon: "📞", label: "Call Builder",     keywords: "x402 callservice make a call payment" },
  { id: "marketplace",   icon: "💼", label: "Marketplace",      keywords: "providers browse search" },
  { id: "requests",      icon: "📥", label: "My Requests",      keywords: "calls active sla status" },
  { id: "providers",     icon: "🔌", label: "Providers",        keywords: "register endpoint stake" },
  { id: "receipts",      icon: "🧾", label: "Receipts",         keywords: "eip712 verify receipt" },
  { id: "payments",      icon: "💳", label: "Payments",         keywords: "usdc send escrow" },
  { id: "nano",          icon: "⚡", label: "Nanopayments",     keywords: "gateway circle micropayment x402" },
  { id: "bridge",        icon: "🌉", label: "Bridge",           keywords: "cctp cross chain usdc" },
  { id: "jobs",          icon: "📋", label: "Jobs",             keywords: "erc8183 agentic work" },
  { id: "disputes",      icon: "⚖️", label: "Disputes",         keywords: "quality slash bond vote" },
  { id: "history",       icon: "📜", label: "History",          keywords: "past calls export csv" },
  { id: "analytics",     icon: "📈", label: "Analytics",        keywords: "stats chart goldsky" },
  { id: "leaderboard",   icon: "🏆", label: "Leaderboard",      keywords: "reputation ranking top" },
  { id: "agent",         icon: "🤖", label: "Agent Wallet",     keywords: "agentwallet deposit auto" },
  { id: "lending",       icon: "🏦", label: "Lending",          keywords: "reputation loan borrow" },
  { id: "futures",       icon: "📊", label: "SLA Futures",      keywords: "capacity futures slot" },
  { id: "attestation",   icon: "🔏", label: "Attestation",      keywords: "sla bridge oracle" },
  { id: "verify",        icon: "✅", label: "Verify",           keywords: "eip712 receipt signature" },
  { id: "register",      icon: "📝", label: "Register",         keywords: "become provider stake erc8004" },
  { id: "mcp",           icon: "🔧", label: "MCP Agent",        keywords: "claude mcp config ai" },
  { id: "bulkcall",      icon: "⚡", label: "Bulk Call",        keywords: "batch csv multiple providers" },
  { id: "subscriptions", icon: "🔔", label: "Subscriptions",    keywords: "recurring subscribe" },
  { id: "webhooks",      icon: "🔗", label: "Webhooks",         keywords: "events notify endpoint" },
  { id: "notifications", icon: "🔔", label: "Notifications",    keywords: "alerts history" },
  { id: "settings",      icon: "⚙️", label: "Settings",         keywords: "config rpc budget" },
  { id: "privacy",       icon: "🔒", label: "Privacy",          keywords: "aps confidential" },
  { id: "apidocs",       icon: "📚", label: "API Docs",         keywords: "docs reference sdk" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const { setPanel } = useAppStore();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? ALL_COMMANDS.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.keywords.includes(query.toLowerCase())
      )
    : ALL_COMMANDS;

  const pick = useCallback((id: PanelId) => {
    setPanel(id);
    setQuery("");
    onClose();
  }, [setPanel, onClose]);

  // focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // keyboard: Escape to close, Arrow up/down + Enter
  const [cursor, setCursor] = useState(0);
  useEffect(() => { setCursor(0); }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
      if (e.key === "Enter" && filtered[cursor]) { pick(filtered[cursor].id); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cursor, filtered, pick, onClose]);

  if (!open) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "15vh", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(560px, 94vw)", background: "var(--bg-2)", border: "1px solid var(--border-hi)", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)", gap: 10 }}>
          <span style={{ fontSize: 18, opacity: 0.5 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search panels, actions…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 15, fontFamily: "var(--font-body)" }}
          />
          <kbd style={{ padding: "2px 7px", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 5, fontSize: 11, color: "var(--text-faint)" }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>No results for "{query}"</div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => pick(cmd.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", padding: "11px 16px",
                  background: i === cursor ? "var(--accent-bg)" : "transparent",
                  border: "none", borderBottom: "1px solid var(--border)",
                  color: i === cursor ? "var(--accent)" : "var(--text)",
                  cursor: "pointer", textAlign: "left", fontSize: 14,
                  transition: "background 0.1s",
                }}
                onMouseEnter={() => setCursor(i)}
              >
                <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{cmd.icon}</span>
                <span style={{ fontWeight: 500 }}>{cmd.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                  {cmd.id}
                </span>
              </button>
            ))
          )}
        </div>

        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 16, fontSize: 11, color: "var(--text-faint)" }}>
          <span><kbd style={{ padding: "1px 5px", background: "var(--bg-3)", borderRadius: 4, border: "1px solid var(--border)" }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ padding: "1px 5px", background: "var(--bg-3)", borderRadius: 4, border: "1px solid var(--border)" }}>↵</kbd> open</span>
          <span><kbd style={{ padding: "1px 5px", background: "var(--bg-3)", borderRadius: 4, border: "1px solid var(--border)" }}>ESC</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
