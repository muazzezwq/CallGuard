import { useState, useCallback } from "react";
import { useWatchContractEvent } from "wagmi";
import { CONFIG, PPC_ABI } from "../../lib/config";

type Notif = {
  id: string;
  msg: string;
  sub: string;
  type: "call" | "slash" | "receipt" | "dispute" | "info";
  ts: number;
  txHash?: string;
};

const ARCSCAN = "https://explorer.testnet.arc.io";

const TYPE_META: Record<Notif["type"], { icon: string; color: string; label: string }> = {
  call:    { icon: "📡", color: "var(--info)",        label: "Call Started"   },
  slash:   { icon: "⚡", color: "var(--danger)",      label: "Slashed"        },
  receipt: { icon: "✅", color: "var(--accent)",      label: "Receipt"        },
  dispute: { icon: "⚖️", color: "var(--warn)",  label: "Dispute"        },
  info:    { icon: "ℹ️", color: "var(--text-faint)", label: "Info"  },
};

function ago(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  return `${Math.round(d / 3600)}h ago`;
}

export default function Notifications() {
  const [notifs, setNotifs] = useState<Notif[]>(() => {
    try { return JSON.parse(localStorage.getItem("cg_notifs_v2") || "[]"); }
    catch { return []; }
  });
  const [filter, setFilter] = useState<Notif["type"] | "all">("all");

  const push = useCallback((n: Omit<Notif, "id" | "ts">) => {
    const notif: Notif = { ...n, id: Math.random().toString(36).slice(2), ts: Date.now() };
    setNotifs(prev => {
      const next = [notif, ...prev].slice(0, 50);
      localStorage.setItem("cg_notifs_v2", JSON.stringify(next));
      return next;
    });
  }, []);

  // Watch CallStarted
  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: PPC_ABI,
    eventName: "CallStarted",
    onLogs: logs => logs.forEach(l => {
      const a = l.args;
      push({
        type: "call",
        msg: `Call started → Provider #${a.providerId}`,
        sub: `${Number(a.amount || 0) / 1e6} USDC · ${String(a.callId || "").slice(0, 10)}…`,
        txHash: l.transactionHash ?? undefined,
      });
    }),
  });

  // Watch ReceiptSubmitted — event carries (callId, responseHash, respondedAt), no providerId
  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: PPC_ABI,
    eventName: "ReceiptSubmitted",
    onLogs: logs => logs.forEach(l => {
      const a = l.args;
      push({
        type: "receipt",
        msg: `Receipt submitted`,
        sub: `Call ${String(a.callId || "").slice(0, 10)}…`,
        txHash: l.transactionHash ?? undefined,
      });
    }),
  });

  // Watch CallSlashed — timeout: caller refunded, provider slashed
  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: PPC_ABI,
    eventName: "CallSlashed",
    onLogs: logs => logs.forEach(l => {
      const a = l.args;
      push({
        type: "slash",
        msg: `Deadline missed — provider slashed ${Number(a.slashed || 0) / 1e6} USDC`,
        sub: `Call ${String(a.callId || "").slice(0, 10)}… · refund ${Number(a.refunded || 0) / 1e6} USDC`,
        txHash: l.transactionHash ?? undefined,
      });
    }),
  });



  const clear = () => { setNotifs([]); localStorage.removeItem("cg_notifs_v2"); };

  const filtered = filter === "all" ? notifs : notifs.filter(n => n.type === filter);
  const counts = notifs.reduce<Record<string, number>>((a, n) => ({ ...a, [n.type]: (a[n.type] || 0) + 1 }), {});

  return (
    <div style={{ padding: "24px 20px", maxWidth: 780, margin: "0 auto", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", marginBottom: 4, fontWeight: 700 }}>Notifications</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>On-Chain Alerts</h1>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
            Live contract events — {notifs.length} total
          </p>
        </div>
        {notifs.length > 0 && (
          <button onClick={clear} style={{ padding: "6px 12px", borderRadius:999, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text-dim)", fontSize: 12, cursor: "pointer" }}>
            Clear all ✕
          </button>
        )}
      </div>

      {/* Live indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "8px 12px", background: "rgba(25,209,134,0.06)", border: "1px solid rgba(25,209,134,0.2)", borderRadius: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "block", animation: "pulse 2s infinite" }} />
        <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Listening for contract events…</span>
        <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>CallStarted · ReceiptSubmitted · CallSlashed</span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" as const }}>
        {(["all", "call", "receipt", "slash", "dispute"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "4px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
              background: filter === f ? "var(--accent)" : "var(--bg-2)",
              color: filter === f ? "#fff" : "var(--text-dim)",
              transition: "all 0.15s",
            }}
          >
            {f === "all" ? `All (${notifs.length})` : `${TYPE_META[f as Notif["type"]].icon} ${TYPE_META[f as Notif["type"]].label}${counts[f] ? ` (${counts[f]})` : ""}`}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "var(--text-faint)" }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>🔔</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "var(--text-dim)" }}>
            {filter === "all" ? "No notifications yet" : `No ${TYPE_META[filter].label} events`}
          </div>
          <div style={{ fontSize: 13 }}>Events appear here as they happen on-chain</div>
        </div>
      )}

      {/* Notification list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(n => {
          const meta = TYPE_META[n.type];
          return (
            <div
              key={n.id}
              style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                padding: "12px 14px",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderLeft: `3px solid ${meta.color}`,
                borderRadius: 14,
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                transition: "transform 0.15s",
              }}
            >
              {/* Icon */}
              <div style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: `${meta.color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16,
              }}>
                {meta.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: meta.color }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: "auto", whiteSpace: "nowrap" as const }}>
                    {ago(n.ts)}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, marginBottom: 2 }}>{n.msg}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{n.sub}</div>
              </div>

              {/* TX link */}
              {n.txHash && (
                <a
                  href={`${ARCSCAN}/tx/${n.txHash}`}
                  target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: "var(--accent)", textDecoration: "none", flexShrink: 0, marginTop: 4 }}
                >
                  ↗
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
