import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, useWatchContractEvent } from "wagmi";
import { CONFIG, PPC_ABI_V8_ACTIVE, ACTIVE_PPC_ADDRESS, arcTestnet } from "../../lib/config";
import { useAppStore } from "../../store/useAppStore";
import {
  mergeNotifications,
  notificationKey,
  notificationStoreKey,
  sanitizeNotifications,
  usdcAmount,
  type ActivityNotification,
} from "../../lib/activity";

const TYPE_META: Record<ActivityNotification["type"], { icon: string; color: string; label: string }> = {
  call:    { icon: "📡", color: "var(--info)",     label: "Call started" },
  slash:   { icon: "⚡", color: "var(--danger)",   label: "Timeout claimed" },
  receipt: { icon: "✅", color: "var(--accent-ink)", label: "Receipt submitted" },
};

function ago(ts: number) {
  const d = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (d < 5) return "just now";
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  return `${Math.round(d / 3600)}h ago`;
}

function short(v: unknown) {
  const s = String(v ?? "");
  return s.length > 12 ? `${s.slice(0, 10)}…` : s || "unknown";
}

export default function Notifications() {
  const { address } = useAccount();
  const walletChain = useChainId();
  const setPanel = useAppStore(s => s.setPanel);
  const storeKey = notificationStoreKey(address);

  const [notifs, setNotifs] = useState<ActivityNotification[]>([]);
  const [filter, setFilter] = useState<ActivityNotification["type"] | "all">("all");
  const [streamError, setStreamError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const fallbackSeq = useRef(0);

  /* The store is per account. Switching wallets loads that wallet's own list,
     so one account's alerts are never shown under another. */
  useEffect(() => {
    let raw: unknown = null;
    try { raw = JSON.parse(localStorage.getItem(storeKey) || "[]"); } catch { raw = []; }
    const loaded = sanitizeNotifications(raw);
    seen.current = new Set(loaded.map(n => n.id));
    setNotifs(loaded);
    setStreamError(null);
  }, [storeKey]);

  const push = useCallback((n: {
    type: ActivityNotification["type"];
    msg: string;
    sub: string;
    id?: string | null;
    txHash?: string;
    callId?: string;
    caller?: string;
  }) => {
    fallbackSeq.current += 1;
    const id = n.id || `${n.type}:${Date.now()}:${fallbackSeq.current}`;
    if (seen.current.has(id)) return;
    seen.current.add(id);
    const entry: ActivityNotification = {
      id,
      type: n.type,
      msg: n.msg,
      sub: n.sub,
      /* This is when the browser received the log, not the block timestamp:
         the event payload does not carry one and reading the block would be a
         second RPC call per event. The UI labels it as such. */
      ts: Date.now(),
    };
    if (n.txHash) entry.txHash = n.txHash;
    if (n.callId) entry.callId = n.callId;
    if (n.caller) entry.caller = n.caller;
    setNotifs(prev => {
      const next = mergeNotifications(prev, [entry], 50);
      try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
      return next;
    });
  }, [storeKey]);

  const onError = useCallback((err: unknown) => {
    setStreamError(String((err as Error)?.message ?? err).slice(0, 220));
  }, []);

  useWatchContractEvent({
    address: ACTIVE_PPC_ADDRESS,
    abi: PPC_ABI_V8_ACTIVE,
    eventName: "CallStarted",
    chainId: arcTestnet.id,
    onError,
    onLogs: logs => {
      setStreamError(null);
      logs.forEach(l => {
        const a = l.args;
        push({
          type: "call",
          msg: `Call started → Provider #${String(a.providerId ?? "unknown")}`,
          sub: `${usdcAmount(a.amount) ?? "amount unavailable"} USDC escrowed · ${short(a.callId)} · caller ${short(a.caller)}`,
          id: notificationKey(l.transactionHash, l.logIndex, "call"),
          txHash: l.transactionHash ?? undefined,
          callId: a.callId ? String(a.callId) : undefined,
          caller: a.caller ? String(a.caller) : undefined,
        });
      });
    },
  });

  /* `ReceiptSubmitted` carries (callId, responseHash, respondedAt); the log is
     mined by definition, so the event is confirmed — it says nothing about the
     provider's answer beyond the signature the contract accepted. */
  useWatchContractEvent({
    address: ACTIVE_PPC_ADDRESS,
    abi: PPC_ABI_V8_ACTIVE,
    eventName: "ReceiptSubmitted",
    chainId: arcTestnet.id,
    onError,
    onLogs: logs => {
      setStreamError(null);
      logs.forEach(l => {
        const a = l.args;
        push({
          type: "receipt",
          msg: "Receipt submitted — the contract accepted the provider signature",
          sub: `Call ${short(a.callId)}`,
          id: notificationKey(l.transactionHash, l.logIndex, "receipt"),
          txHash: l.transactionHash ?? undefined,
          callId: a.callId ? String(a.callId) : undefined,
        });
      });
    },
  });

  /* `CallSlashed` is emitted by `claimTimeout` only: the SLA window passed, the
     caller was refunded and the provider's stake was cut. Both amounts come
     from the event. */
  useWatchContractEvent({
    address: ACTIVE_PPC_ADDRESS,
    abi: PPC_ABI_V8_ACTIVE,
    eventName: "CallSlashed",
    chainId: arcTestnet.id,
    onError,
    onLogs: logs => {
      setStreamError(null);
      logs.forEach(l => {
        const a = l.args;
        push({
          type: "slash",
          msg: `Timeout claimed — ${usdcAmount(a.slashed) ?? "slash amount unavailable"} USDC slashed`,
          sub: `Call ${short(a.callId)} · refund ${usdcAmount(a.refunded) ?? "unavailable"} USDC`,
          id: notificationKey(l.transactionHash, l.logIndex, "slash"),
          txHash: l.transactionHash ?? undefined,
          callId: a.callId ? String(a.callId) : undefined,
        });
      });
    },
  });

  const clear = () => {
    setNotifs([]);
    try { localStorage.removeItem(storeKey); } catch { /* ignore */ }
  };

  const filtered = useMemo(
    () => (filter === "all" ? notifs : notifs.filter(n => n.type === filter)),
    [notifs, filter],
  );
  const counts = useMemo(
    () => notifs.reduce<Record<string, number>>((a, n) => ({ ...a, [n.type]: (a[n.type] || 0) + 1 }), {}),
    [notifs],
  );

  const accountLabel = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "not connected";

  return (
    <div style={{ padding: "24px 20px", maxWidth: 780, margin: "0 auto", paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent-ink)", marginBottom: 4, fontWeight: 700 }}>Notifications</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>On-Chain Alerts</h1>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
            Contract events received by this browser — network-wide, so each event shows its caller. {notifs.length} stored for {accountLabel}.
          </p>
        </div>
        {notifs.length > 0 && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear all stored alerts for this account"
            style={{ padding: "10px 14px", minHeight: 44, borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text-dim)", fontSize: 12, cursor: "pointer" }}
          >
            Clear all ✕
          </button>
        )}
      </div>

      {streamError ? (
        <div
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 12px", background: "rgba(220,80,80,0.08)", border: "1px solid rgba(220,80,80,0.35)", borderRadius: 14 }}
        >
          <span aria-hidden style={{ fontSize: 14 }}>⚠</span>
          <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
            Event stream unavailable — no delivery is claimed. {streamError}
          </span>
        </div>
      ) : (
        <div
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 12px", background: "rgba(25,209,134,0.06)", border: "1px solid rgba(25,209,134,0.2)", borderRadius: 14 }}
        >
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "block" }} />
          <span style={{ fontSize: 12, color: "var(--accent-ink)", fontWeight: 600 }}>
            Listening while this panel is open — only events received here are listed
          </span>
        </div>
      )}

      {walletChain !== arcTestnet.id && (
        <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "0 0 12px" }}>
          This wallet is on chain {walletChain}; alerts are read from Arc Testnet ({arcTestnet.id}) and are unaffected by the wallet network.
        </p>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" as const }} role="group" aria-label="Filter alerts by event">
        {(["all", "call", "receipt", "slash"] as const).map(f => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            style={{
              padding: "10px 14px", minHeight: 44, borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: filter === f ? "var(--accent)" : "var(--bg-2)",
              color: filter === f ? "var(--on-accent)" : "var(--text-dim)",
            }}
          >
            {f === "all" ? `All (${notifs.length})` : `${TYPE_META[f].icon} ${TYPE_META[f].label}${counts[f] ? ` (${counts[f]})` : ""}`}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "var(--text-faint)" }}>
          <div aria-hidden style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>🔔</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "var(--text-dim)" }}>
            {filter === "all" ? "No alerts received in this browser yet" : `No ${TYPE_META[filter].label} events received`}
          </div>
          <div style={{ fontSize: 13 }}>
            This panel only records events that arrive while it is open. Past calls remain under Transactions.
          </div>
        </div>
      )}

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
              }}
            >
              <div aria-hidden style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: `${meta.color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16,
              }}>
                {meta.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: meta.color }}>
                    {meta.label}
                  </span>
                  <span
                    title="When this browser received the event; the block timestamp is not read"
                    style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: "auto", whiteSpace: "nowrap" as const }}
                  >
                    {ago(n.ts)}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, marginBottom: 2 }}>{n.msg}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", overflowWrap: "anywhere" as const }}>{n.sub}</div>
                {n.callId && (
                  <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-mono)", overflowWrap: "anywhere" as const }}>
                    Call {n.callId}
                  </div>
                )}
                {n.callId && n.caller && address && n.caller.toLowerCase() === address.toLowerCase() && (
                  <button
                    type="button"
                    onClick={() => setPanel("history")}
                    aria-label={`Open transactions to find your call ${short(n.callId)}`}
                    style={{ marginTop: 6, padding: "6px 0", background: "none", border: "none", color: "var(--accent-ink)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                  >
                    Open Transactions →
                  </button>
                )}
              </div>

              {n.txHash && (
                <a
                  href={CONFIG.explorerTx(n.txHash)}
                  target="_blank" rel="noreferrer"
                  aria-label={`View transaction ${n.txHash.slice(0, 10)}… on the Arc explorer`}
                  style={{ fontSize: 11, color: "var(--accent-ink)", textDecoration: "none", flexShrink: 0, marginTop: 4, minWidth: 24, minHeight: 24 }}
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
