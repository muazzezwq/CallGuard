import { useState, useEffect, useCallback, useMemo } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useSubgraph } from "../../hooks/useSubgraph";
// MEDIUM-09: import canonical ABI from config (was local duplicate)
import { arcTestnet, CONFIG, PPC_ABI } from "../../lib/config";
import { callStatusLabel, csvCell, normalizeCalls, usdcAmount } from "../../lib/activity";
import { friendlyError } from "../../lib/utils";
import { checkPaymentStart, recordSubmittedTx, resolvePendingTx, beginOperation, endOperation } from "../../lib/paymentGate";
import { classifyReceipt } from "../../lib/txLifecycle";

/** Accessing `sessionStorage` itself can throw in restricted browser modes. */
function browserStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

type Call = {
  id: string; providerId?: string | number; caller?: string; amount?: string; status?: string;
  createdAt?: string; completedAt?: string; refunded?: string | number; slashed?: string | number;
  requestHash?: string; responseHash?: string;
};

const STATUS_COLORS: Record<string, string> = {
  STARTED:   "var(--warn)",
  COMPLETED: "var(--accent)",
  SLASHED:   "var(--danger)",
  REFUNDED:  "var(--text-dim)",
};

function exportCalls(calls: Call[], fmt: "csv" | "json") {
  if (!calls.length) return;
  let content: string;
  let mime: string;
  let ext: string;
  if (fmt === "csv") {
    const header = "callId,providerId,caller,amount,status,createdAt,completedAt,refunded,slashed";
    const rows = calls.map(c =>
      [c.id, c.providerId, c.caller, usdcAmount(c.amount) ?? "",
       c.status, c.createdAt, c.completedAt ?? "", c.refunded, c.slashed].map(csvCell).join(",")
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
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "open" | "completed" | "slashed">("all");
  const [timeoutCallId, setTimeoutCallId] = useState("");
  const [timeoutStatus, setTimeoutStatus] = useState<string | null>(null);
  const [claimHash, setClaimHash] = useState<`0x${string}` | undefined>();

  const q = `{
    calls(
      where: { caller: "${address?.toLowerCase() ?? "0x0"}" }
      orderBy: createdAt orderDirection: desc first: 100
    ) {
      id providerId caller amount status createdAt completedAt
      requestHash responseHash refunded slashed
    }
  }`;

  const { data, loading, error, refetch } = useSubgraph<{ calls: Call[] }>(address ? q : "", {
    enabled: !!address,
    pollInterval: 15000,
  });

  /* One row per call, newest first, with an id tie-break: a refresh merged with
     cached data must not list a call twice or jump pages. */
  const calls = useMemo(() => normalizeCalls(data?.calls ?? []), [data]);
  const filtered = filter === "all" ? calls
    : filter === "open" ? calls.filter(c => c.status === "STARTED")
    : filter === "completed" ? calls.filter(c => c.status === "COMPLETED")
    : calls.filter(c => c.status === "SLASHED");

  const openCount = calls.filter(c => c.status === "STARTED").length;

  // Timeout claim
  const { writeContract, isPending: claimSigning } = useWriteContract();
  const { data: claimReceipt, isLoading: claimWaiting, isError: claimReceiptError } = useWaitForTransactionReceipt({ hash: claimHash, chainId: arcTestnet.id });
  const txPending = claimSigning || claimWaiting;

  useEffect(() => {
    if (!claimReceipt) return;
    const outcome = classifyReceipt(claimReceipt.status);
    const cleared = resolvePendingTx(browserStorage()).cleared;
    endOperation("requests-claim");
    const clearNote = cleared
      ? ""
      : " ⚠️ The local pending marker could not be cleared; fix site storage before another submission.";
    if (outcome === "confirmed") {
      setTimeoutStatus(`✅ Claim transaction confirmed. A refund or slash is recorded only if this call was past its SLA window and grace period; this panel does not decode the amounts.${clearNote}`);
      void queryClient.invalidateQueries({ queryKey: ["subgraph"] });
      void queryClient.invalidateQueries({ queryKey: ["recentActivity"] });
      void queryClient.invalidateQueries({ queryKey: ["networkStats"] });
    } else if (outcome === "reverted") {
      setTimeoutStatus(`❌ The claim reverted. Nothing was refunded or slashed; the contract only allows a claim after the response window plus grace, once per call.${clearNote}`);
    } else {
      setTimeoutStatus(`⚠️ The claim has an unrecognised receipt status. Do not retry until the explorer shows a result.${clearNote}`);
    }
  }, [claimReceipt, queryClient]);

  useEffect(() => {
    if (claimReceiptError) {
      setTimeoutStatus("⚠️ The claim was submitted but its receipt could not be read. Check the explorer before retrying; it may still confirm.");
    }
  }, [claimReceiptError]);

  const handleClaimTimeout = useCallback(async () => {
    const id = timeoutCallId.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
      setTimeoutStatus("❌ Enter a valid 32-byte call ID (0x + 64 hex chars)");
      return;
    }
    if (!address) { setTimeoutStatus("❌ Connect wallet first"); return; }
    if (txPending) { setTimeoutStatus("❌ A claim is still pending. Check it before submitting another."); return; }
    if (!publicClient) { setTimeoutStatus("❌ Arc RPC is unavailable. Nothing was submitted."); return; }
    try {
      if (walletChainId !== arcTestnet.id) {
        setTimeoutStatus("⏳ Switching the wallet to Arc Testnet…");
        await switchChainAsync({ chainId: arcTestnet.id });
      }
      setTimeoutStatus("⏳ Checking whether this call can be claimed...");
      await publicClient.simulateContract({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: PPC_ABI,
        functionName: "claimTimeout",
        args: [id as `0x${string}`],
        account: address as `0x${string}`,
      });
      const gate = checkPaymentStart({ storage: browserStorage(), operation: "requests-claim" });
      if (!gate.ok) {
        setTimeoutStatus(`❌ No transaction was submitted. ${gate.message}`);
        return;
      }
      if (!beginOperation("requests-claim")) {
        setTimeoutStatus("❌ Another payment flow is still running in this tab. Wait for it to finish.");
        return;
      }

      setTimeoutStatus("⏳ Submitting...");
      writeContract({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: PPC_ABI,
        functionName: "claimTimeout",
        args: [id as `0x${string}`],
        chainId: arcTestnet.id,
      }, {
        onSuccess: (h) => {
          const persisted = recordSubmittedTx(h, browserStorage()).persisted;
          setClaimHash(h);
          setTimeoutStatus(persisted
            ? "⏳ Claim submitted; waiting for confirmation..."
            : "⚠️ Claim submitted, but the pending marker could not be saved. The hash is shown below; this tab stays blocked and a reload will not remember it. Check the explorer before retrying.");
        },
        onError: (e: unknown) => {
          endOperation("requests-claim");
          setTimeoutStatus(`❌ ${friendlyError(e)}`);
        },
      });
    } catch (_err: unknown) {
      endOperation("requests-claim");
      setTimeoutStatus(`❌ The claim would revert, so nothing was submitted and no gas was spent: ${friendlyError(_err)}`);
    }
  }, [timeoutCallId, address, writeContract, txPending, publicClient, walletChainId, switchChainAsync]);

  // SLA countdown was removed: the provider's real `maxResponseTime` is not in
  // the `calls` entity, so any deadline (and "claimable now") would be invented.

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
          <button className="btn btn-sm" onClick={() => void refetch()}>↻</button>
        </div>
      </div>

      {/* Claim Timeout section */}
      <div style={{
        background: "var(--bg-2)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "16px 18px", marginBottom: 20
      }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text)", fontWeight: 600, marginBottom: 10 }}>
          Claim Timeout / Refund
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            id="timeout-input"
            aria-label="Call ID to claim"
            value={timeoutCallId}
            onChange={e => setTimeoutCallId(e.target.value)}
            placeholder="0x... call ID (auto-filled when you click a row)"
            style={{
              flex: "1 1 200px", minWidth: 0, padding: "9px 12px", background: "var(--bg-3)",
              border: "1px solid var(--border)", borderRadius: 8,
              color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)"
            }}
          />
          <button
            type="button"
            onClick={handleClaimTimeout}
            aria-busy={txPending}
            disabled={txPending || !address}
            style={{
              padding: "9px 18px", background: "var(--danger)", color: "var(--on-danger)",
              border: "none", borderRadius:999, fontWeight: 600, cursor: "pointer",
              fontSize: 13, opacity: txPending ? 0.6 : 1, whiteSpace: "nowrap"
            }}
          >
            {txPending ? "Claiming…" : "Claim Timeout"}
          </button>
        </div>
        {timeoutStatus && (
          <div
            role={timeoutStatus.startsWith("❌") || timeoutStatus.startsWith("⚠️") ? "alert" : "status"}
            aria-live="polite"
            style={{
              marginTop: 8, fontSize: 12, fontFamily: "var(--font-mono)",
              color: timeoutStatus.startsWith("✅") ? "var(--accent-ink)" : timeoutStatus.startsWith("❌") ? "var(--danger)" : "var(--text)",
              padding: "6px 10px", background: "var(--bg-3)", borderRadius: 6
            }}
          >
            {timeoutStatus}
            {claimHash && (
              <>
                {" "}<code style={{ userSelect: "all", overflowWrap: "anywhere" }}>{claimHash}</code>
                <a href={CONFIG.explorerTx(claimHash)} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)", marginLeft: 8 }}>
                  View tx ↗
                </a>
              </>
            )}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text)" }}>
          Click an open call below to prepare its call ID. The contract decides whether it is claimable.
        </div>
      </div>

      {/* Tabs */}
      <div className="cg-tabs mb-4">
        {(["all","open","completed","slashed"] as const).map(f => (
          <button key={f} className={`cg-tab${filter===f?" active":""}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "open" ? "Open" : f === "completed" ? "Completed" : "Timeout claimed"}
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

      {address && error && calls.length > 0 && (
        <p role="status" style={{ fontSize: 12, color: "var(--warn)", margin: "0 0 10px" }}>
          The last refresh failed, so this is the most recent data that arrived.
        </p>
      )}

      {address && !loading && error && calls.length === 0 && (
        <div className="empty-state">
          <p>The indexer did not answer, so no request is shown. This is a read failure, not an empty history.</p>
          <button className="btn btn-sm" onClick={() => void refetch()}>Retry</button>
        </div>
      )}

      {address && !loading && !error && filtered.length === 0 && (
        <div className="empty-state">
          <p>
            {filter === "all"
              ? "No calls indexed for this wallet yet. A call that just confirmed can take a moment to appear."
              : `No indexed call has the ${filter} status.`}
          </p>
        </div>
      )}

      <div className="call-list">
        {filtered.map(call => {
          const isOpen = call.status === "STARTED";
          const amount = usdcAmount(call.amount);
          const createdTs = Number(call.createdAt);
          const createdLabel = Number.isFinite(createdTs) && createdTs > 0
            ? new Date(createdTs * 1000).toLocaleString()
            : "time unavailable";

          return (
            <div
              key={call.id}
              className="call-row"
              role="button"
              tabIndex={isOpen ? 0 : -1}
              aria-disabled={!isOpen}
              onClick={() => isOpen && fillTimeout(call.id)}
              onKeyDown={e => { if (isOpen && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fillTimeout(call.id); } }}
              style={{ cursor: isOpen ? "pointer" : "default" }}
              title={isOpen ? "Click to fill timeout claim" : undefined}
            >
              <div className="call-row-left">
                <span className="call-id mono">{call.id.slice(0,10)}…</span>
                <span className="call-provider text-dim">Provider #{call.providerId}</span>
              </div>
              <div className="call-row-mid">
                <span className="call-amount">{amount ? `${amount} USDC` : "amount unavailable"}</span>
                <span className="call-time text-dim" style={{ fontSize: 11 }}>
                  {createdLabel}
                </span>
              </div>
              <div className="call-row-right">
                <span className="status-badge" style={{color: STATUS_COLORS[call.status ?? ""] ?? "var(--text-dim)"}}>
                  {callStatusLabel(call.status)}
                </span>
                {isOpen && (
                  <span style={{ fontSize: 10, display: "block", marginTop: 3, color: "var(--text)" }}>
                    open in the indexer
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
