import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useSubgraph } from "../../hooks/useSubgraph";
import { formatUnits } from "viem";
import { CONFIG } from "../../lib/config";

const PPC_ABI = [
  { name: "claimTimeout", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "callId", type: "bytes32" }], outputs: [] },
] as const;

const STATUS_COLORS: Record<string, string> = {
  STARTED:   "var(--amber,#f59e0b)",
  COMPLETED: "var(--accent)",
  SLASHED:   "var(--red,#ef4444)",
  REFUNDED:  "var(--text-dim)",
};

function exportCalls(calls: any[], fmt: "csv" | "json") {
  if (!calls.length) return;
  let content: string;
  let mime: string;
  let ext: string;
  if (fmt === "csv") {
    const header = "callId,providerId,caller,amount,status,createdAt,completedAt,refunded,slashed";
    const rows = calls.map(c =>
      [c.id, c.providerId, c.caller, formatUnits(BigInt(c.amount ?? 0), 6),
       c.status, c.createdAt, c.completedAt ?? "", c.refunded, c.slashed].join(",")
    );
    content = [header, ...rows].join("\n");
    mime = "text/csv"; ext = "csv";
  } else {
    content = JSON.stringify(calls, null, 2);
    mime = "application/json"; ext = "json";
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `callguard-requests.${ext}`; a.click();
  URL.revokeObjectURL(url);
}

export default function Requests() {
  const { address } = useAccount();
  const [filter, setFilter] = useState<"all" | "open" | "completed" | "slashed">("all");
  const [timeoutCallId, setTimeoutCallId] = useState("");
  const [timeoutStatus, setTimeoutStatus] = useState<string | null>(null);

  const q = `{
    calls(
      where: { caller: "${address?.toLowerCase() ?? "0x0"}" }
      orderBy: createdAt orderDirection: desc first: 100
    ) {
      id providerId caller amount status createdAt completedAt
      requestHash responseHash refunded slashed
    }
  }`;

  const { data, loading, refetch } = useSubgraph<{ calls: any[] }>(address ? q : "", {
    skip: !address,
    pollInterval: 15000,
  });

  const calls = data?.calls ?? [];
  const filtered = filter === "all" ? calls
    : filter === "open" ? calls.filter(c => c.status === "STARTED")
    : filter === "completed" ? calls.filter(c => c.status === "COMPLETED")
    : calls.filter(c => c.status === "SLASHED");

  const openCount = calls.filter(c => c.status === "STARTED").length;

  // Timeout claim
  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: txPending, isSuccess: txSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleClaimTimeout = useCallback(async () => {
    const id = timeoutCallId.trim();
    if (!id || id.length !== 66) {
      setTimeoutStatus("❌ Enter a valid 32-byte call ID (0x + 64 hex chars)");
      return;
    }
    if (!address) { setTimeoutStatus("❌ Connect wallet first"); return; }
    setTimeoutStatus("⏳ Submitting...");
    try {
      writeContract({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: PPC_ABI,
        functionName: "claimTimeout",
        args: [id as `0x${string}`],
      });
    } catch (e: unknown) {
      setTimeoutStatus(`❌ ${e.shortMessage || (e instanceof Error ? e.message : String(e))}`);
    }
  }, [timeoutCallId, address, writeContract]);

  // Auto-fill timeout ID when clicking a call row
  const fillTimeout = (id: string) => {
    setTimeoutCallId(id);
    document.getElementById("timeout-input")?.focus();
  };

  return (
    <div className="cg-panel">
      <div className="panel-head">
        <div>
          <h2>My Requests</h2>
          <p className="text-dim">Your call history on Arc Testnet</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-sm" onClick={() => exportCalls(filtered, "csv")}>↓ CSV</button>
          <button className="btn btn-sm" onClick={() => exportCalls(filtered, "json")}>↓ JSON</button>
          <button className="btn btn-sm" onClick={refetch}>↻</button>
        </div>
      </div>

      {/* Claim Timeout section */}
      <div style={{
        background: "var(--bg-2)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "16px 18px", marginBottom: 20
      }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 10 }}>
          Claim Timeout / Refund
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="timeout-input"
            value={timeoutCallId}
            onChange={e => setTimeoutCallId(e.target.value)}
            placeholder="0x... call ID (auto-filled when you click a row)"
            style={{
              flex: 1, padding: "9px 12px", background: "var(--bg-3)",
              border: "1px solid var(--border)", borderRadius: 8,
              color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)"
            }}
          />
          <button
            onClick={handleClaimTimeout}
            disabled={txPending || !address}
            style={{
              padding: "9px 18px", background: "var(--danger,#ef4444)", color: "#fff",
              border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer",
              fontSize: 13, opacity: txPending ? 0.6 : 1, whiteSpace: "nowrap"
            }}
          >
            {txPending ? "Claiming…" : "Claim Timeout"}
          </button>
        </div>
        {timeoutStatus && (
          <div style={{
            marginTop: 8, fontSize: 12, fontFamily: "var(--font-mono)",
            color: timeoutStatus.startsWith("✅") ? "var(--accent)" : timeoutStatus.startsWith("❌") ? "var(--danger,#ef4444)" : "var(--text-dim)",
            padding: "6px 10px", background: "var(--bg-3)", borderRadius: 6
          }}>
            {timeoutStatus}
          </div>
        )}
        {txSuccess && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--accent)", padding: "6px 10px", background: "var(--bg-3)", borderRadius: 6 }}>
            ✅ Timeout claimed — provider slashed. {txHash && (
              <a href={`https://explorer.testnet.arc.io/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                View tx ↗
              </a>
            )}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-faint)" }}>
          Click any STARTED call below to auto-fill the call ID.
        </div>
      </div>

      {/* Tabs */}
      <div className="cg-tabs mb-4">
        {(["all","open","completed","slashed"] as const).map(f => (
          <button key={f} className={`cg-tab${filter===f?" active":""}`}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
            {f === "open" && openCount > 0 &&
              <span className="badge-dot ml-1">{openCount}</span>}
          </button>
        ))}
      </div>

      {!address && (
        <div className="empty-state">Connect your wallet to see your requests.</div>
      )}

      {address && loading && (
        <div className="skeleton-list">{[...Array(4)].map((_,i)=><div key={i} className="skeleton-row"/>)}</div>
      )}

      {address && !loading && filtered.length === 0 && (
        <div className="empty-state">
          <p>No {filter === "all" ? "" : filter} requests yet.</p>
        </div>
      )}

      <div className="call-list">
        {filtered.map(call => {
          const isOpen = call.status === "STARTED";
          const deadlineMs = call.completedAt ? Number(call.completedAt) * 1000 : null;
          const now = Date.now();
          const expired = deadlineMs && now > deadlineMs;

          return (
            <div
              key={call.id}
              className="call-row"
              onClick={() => isOpen && fillTimeout(call.id)}
              style={{ cursor: isOpen ? "pointer" : "default" }}
              title={isOpen ? "Click to fill timeout claim" : undefined}
            >
              <div className="call-row-left">
                <span className="call-id mono">{call.id.slice(0,10)}…</span>
                <span className="call-provider text-dim">Provider #{call.providerId}</span>
              </div>
              <div className="call-row-mid">
                <span className="call-amount">{formatUnits(BigInt(call.amount??0),6)} USDC</span>
                <span className="call-time text-dim" style={{ fontSize: 11 }}>
                  {new Date(Number(call.createdAt)*1000).toLocaleString()}
                </span>
              </div>
              <div className="call-row-right">
                <span className="status-badge" style={{color: STATUS_COLORS[call.status] ?? "var(--text-dim)"}}>
                  {call.status}
                </span>
                {isOpen && expired && (
                  <span style={{ fontSize: 10, color: "var(--danger,#ef4444)", display: "block", marginTop: 2 }}>
                    Claimable
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .call-list { display:flex; flex-direction:column; gap:8px; }
        .call-row { display:flex; align-items:center; justify-content:space-between;
          padding:12px 16px; background:var(--bg-2); border-radius:var(--radius);
          border:1px solid var(--border); gap:12px; flex-wrap:wrap;
          transition: border-color .15s; }
        .call-row:hover { border-color: var(--accent); }
        .call-row-left { display:flex; flex-direction:column; gap:2px; min-width:120px; }
        .call-row-mid { display:flex; flex-direction:column; gap:2px; }
        .call-row-right { margin-left:auto; text-align:right; }
        .call-id { font-family:var(--font-mono); font-size:13px; }
        .status-badge { font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
        .badge-dot { background:var(--accent); color:#000; border-radius:99px;
          font-size:10px; padding:1px 5px; font-weight:700; }
        .skeleton-list { display:flex; flex-direction:column; gap:8px; }
        .skeleton-row { height:56px; border-radius:var(--radius); background:var(--bg-2);
          animation:shimmer 1.4s infinite; }
        @keyframes shimmer { 0%{opacity:.5} 50%{opacity:1} 100%{opacity:.5} }
        @media(max-width:480px){ .call-row{ flex-direction:column; align-items:flex-start; } .call-row-right{margin-left:0;} }
      `}</style>
    </div>
  );
}
