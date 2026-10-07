import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { useSubgraph } from "../../hooks/useSubgraph";
import { CONFIG, DISPUTE_QUALITY_ABI } from "../../lib/config";

// CRITICAL-04 fix: use centralized DISPUTE_QUALITY_ABI from config (synced with DisputeQuality.sol)
// Vote enum: 1 = ForCaller, 2 = ForProvider
const VOTE_FOR_CALLER   = 1;
const VOTE_FOR_PROVIDER = 2;

interface SubgraphDispute {
  id: string;
  callId: string;
  opener: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
  outcome?: string;
}

export default function Disputes() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [tab, setTab] = useState<"open" | "vote" | "history">("open");
  const [callIdInput, setCallIdInput] = useState("");
  const [evidence, setEvidence] = useState("");
  const [status, setStatus] = useState("");

  // Vote tab state
  const [voteDisputeId, setVoteDisputeId] = useState("");
  const [voteChoice, setVoteChoice] = useState<boolean | null>(null);
  const [voteStatus, setVoteStatus] = useState("");
  const [disputeInfo, setDisputeInfo] = useState<Record<string, string> | null>(null);

  // MEDIUM-06 fix: single useWriteContract instance
  const { writeContractAsync, data: voteTxHash } = useWriteContract();
  const { isLoading: votePending } = useWaitForTransactionReceipt({ hash: voteTxHash });

  // Subgraph: dispute history
  const historyQuery = `{
    disputeRecords(first: 50, orderBy: openedAt, orderDirection: desc) {
      id callId caller providerId status slashAmount openedAt resolvedAt txHash
    }
  }`;
  const { data: historyData, loading: historyLoading, refetch: refetchHistory } = useSubgraph<{ disputeRecords: SubgraphDispute[] }>(
    historyQuery, { pollInterval: 30000 }
  );

  // CRITICAL-04 fix: openDispute(bytes32 callId, uint256 providerId, uint64 settledAt, string evidenceUri)
  const handleOpenDispute = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet first"); return; }
    if (!callIdInput || !evidence) { setStatus("❌ Enter call ID and evidence URI"); return; }
    // callIdInput must be a 0x-prefixed bytes32 hex (66 chars) and providerId should be provided
    if (!/^0x[0-9a-fA-F]{64}$/.test(callIdInput)) {
      setStatus("❌ Call ID must be a 0x-prefixed 32-byte hex string (e.g. 0xabc...)");
      return;
    }
    setStatus("⏳ Opening dispute...");
    try {
      const now = BigInt(Math.floor(Date.now() / 1000));
      await writeContractAsync({
        address: CONFIG.disputeQualityAddress as `0x${string}`,
        abi: DISPUTE_QUALITY_ABI,
        functionName: "openDispute",
        // settledAt: approximate — use current time minus 1 block (~0.5s)
        args: [callIdInput as `0x${string}`, BigInt(1), now - 1n, evidence],
      });
      setStatus("✅ Dispute opened! Bond deducted. Voting window now open.");
      setCallIdInput(""); setEvidence("");
      setTimeout(refetchHistory, 4000);
    } catch (e: unknown) {
      const msg = (e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e));
      setStatus(`❌ ${msg}`);
    }
  }, [callIdInput, evidence, isConnected, writeContractAsync, refetchHistory]);

  // Fetch dispute info for voting
  const fetchDisputeInfo = useCallback(async () => {
    if (!voteDisputeId || !publicClient) return;
    try {
      const result = await publicClient.readContract({
        address: CONFIG.disputeQualityAddress as `0x${string}`,
        abi: DISPUTE_QUALITY_ABI,
        functionName: "disputes",
        args: [BigInt(voteDisputeId)],
      }) as unknown as { callId: `0x${string}`; caller: string; providerId: bigint; votesForCaller: bigint; votesForProvider: bigint; outcome: number; finalized: boolean };
      setDisputeInfo({
        callId:   result.callId.slice(0, 10) + "…",
        opener:   result.caller.slice(0, 8) + "…" + result.caller.slice(-4),
        forCaller:   result.votesForCaller.toString(),
        forProvider: result.votesForProvider.toString(),
        finalized: result.finalized ? "Yes" : "No",
        outcome:   result.outcome === 1 ? "✅ Caller Wins" : result.outcome === 2 ? "🛡 Provider Wins" : result.outcome === 3 ? "🤝 Tied" : "⏳ Pending",
      });
    } catch (e: unknown) {
      setDisputeInfo({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [voteDisputeId, publicClient]);

  // CRITICAL-04 fix: vote(uint256 disputeId, uint8 choice) — 1=ForCaller, 2=ForProvider
  const handleVote = useCallback(async (forCaller: boolean) => {
    if (!isConnected) { setVoteStatus("❌ Connect wallet first"); return; }
    if (!voteDisputeId) { setVoteStatus("❌ Enter dispute ID"); return; }
    const choice = forCaller ? VOTE_FOR_CALLER : VOTE_FOR_PROVIDER;
    setVoteStatus(`⏳ Voting ${forCaller ? "ForCaller" : "ForProvider"}…`);
    try {
      await writeContractAsync({
        address: CONFIG.disputeQualityAddress as `0x${string}`,
        abi: DISPUTE_QUALITY_ABI,
        functionName: "vote",
        args: [BigInt(voteDisputeId), choice],
      });
      setVoteStatus(`✅ Vote cast: ${forCaller ? "ForCaller" : "ForProvider"}`);
      setTimeout(() => fetchDisputeInfo(), 3000);
    } catch (e: unknown) {
      const msg = (e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e));
      setVoteStatus(`❌ ${msg}`);
    }
  }, [voteDisputeId, isConnected, writeContractAsync, fetchDisputeInfo]);

  const disputes = historyData?.disputeRecords ?? [];

  return (
    <div className="cg-panel">
      <div className="panel-head">
        <div>
          <h2>Quality Disputes</h2>
          <p className="text-dim">Community-voted response quality verification</p>
        </div>
        <button className="btn btn-sm" onClick={refetchHistory}>↻</button>
      </div>

      {/* Dispute protocol info */}
      <div style={{
        background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10,
        padding: "14px 16px", marginBottom: 20, display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12,
      }}>
        {[
          { label: "Caller Bond", value: "0.5 USDC" },
          { label: "Voter Bond", value: "0.1 USDC" },
          { label: "Min Voter Stake", value: "1 USDC" },
          { label: "Voting Window", value: "48 hours" },
        ].map(item => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="cg-tabs mb-4">
        {(["open", "vote", "history"] as const).map(t => (
          <button key={t} className={`cg-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "open" ? "Open Dispute" : t === "vote" ? "Vote" : "History"}
            {t === "history" && disputes.length > 0 && (
              <span style={{ marginLeft: 4, background: "var(--accent)", color: "#000", borderRadius: 99, fontSize: 10, padding: "1px 5px", fontWeight: 700 }}>
                {disputes.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* OPEN DISPUTE TAB */}
      {tab === "open" && (
        <div className="cg-card">
          <div style={{ background: "var(--bg-3)", borderLeft: "3px solid var(--accent)", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)" }}>How it works:</strong> Submit the call ID and evidence. Community arbiters vote (stake-weighted majority). Bond: <strong>0.5 USDC</strong> from your wallet.
          </div>
          <div className="form-group mb-3">
            <label className="form-label">Call ID (numeric)</label>
            <input
              className="cg-input mono"
              placeholder="e.g. 42"
              value={callIdInput}
              onChange={e => setCallIdInput(e.target.value)}
            />
          </div>
          <div className="form-group mb-3">
            <label className="form-label">Evidence (description or IPFS URI)</label>
            <textarea
              className="cg-input"
              rows={3}
              placeholder="Describe why the response was inadequate, or paste an IPFS hash with evidence..."
              value={evidence}
              onChange={e => setEvidence(e.target.value)}
            />
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
              Evidence is hashed on-chain (keccak256). Original text stays off-chain.
            </div>
          </div>
          {status && (
            <div style={{
              padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12,
              background: "var(--bg-3)",
              color: status.startsWith("✅") ? "var(--accent)" : status.startsWith("❌") ? "var(--danger,#ef4444)" : "var(--text-dim)",
            }}>
              {status}
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={handleOpenDispute}
            disabled={!callIdInput || !evidence || !isConnected}
          >
            Open Quality Dispute — 0.5 USDC bond
          </button>
          {!isConnected && (
            <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>Connect wallet to open a dispute.</p>
          )}
        </div>
      )}

      {/* VOTE TAB */}
      {tab === "vote" && (
        <div className="cg-card">
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
            Look up a dispute by ID and cast your vote. You must hold staked USDC to be eligible.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              className="cg-input mono"
              placeholder="Dispute ID (e.g. 1)"
              value={voteDisputeId}
              onChange={e => setVoteDisputeId(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-sm" onClick={fetchDisputeInfo}>Look up</button>
          </div>

          {disputeInfo && (
            <div style={{ background: "var(--bg-3)", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
              {(disputeInfo as { error?: string }).error ? (
                <div style={{ color: "var(--danger,#ef4444)", fontSize: 12 }}>{(disputeInfo as { error: string }).error}</div>
              ) : (
                Object.entries(disputeInfo).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                    <span style={{ color: "var(--text-faint)", textTransform: "capitalize" }}>{k}</span>
                    <span style={{ color: "var(--text)" }}>{v as string}</span>
                  </div>
                ))
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button
              className="btn btn-primary"
              onClick={() => { setVoteChoice(true); handleVote(true); }}
              disabled={votePending || !isConnected || !voteDisputeId}
              style={{ flex: 1 }}
            >
              ✅ Vote Yes — Provider Honored
            </button>
            <button
              onClick={() => { setVoteChoice(false); handleVote(false); }}
              disabled={votePending || !isConnected || !voteDisputeId}
              style={{
                flex: 1, padding: "10px 18px", background: "var(--bg-3)", color: "var(--danger,#ef4444)",
                border: "1px solid var(--danger,#ef4444)", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
              }}
            >
              ❌ Vote No — Provider Slashed
            </button>
          </div>

          {voteStatus && (
            <div style={{
              padding: "8px 12px", borderRadius: 6, fontSize: 12, background: "var(--bg-3)",
              color: voteStatus.startsWith("✅") ? "var(--accent)" : voteStatus.startsWith("❌") ? "var(--danger,#ef4444)" : "var(--text-dim)",
            }}>
              {voteStatus}
            </div>
          )}

          {voteChoice !== null && (
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-faint)" }}>
              Selected: {voteChoice ? "Yes (provider honored)" : "No (provider slashed)"}
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <div>
          {historyLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ height: 56, borderRadius: 8, background: "var(--bg-2)", animation: "shimmer 1.4s infinite" }} />
              ))}
            </div>
          )}

          {!historyLoading && disputes.length === 0 && (
            <div className="empty-state">
              <p>No disputes yet on-chain.</p>
              <p className="text-dim text-sm mt-1">Quality disputes appear here once opened by callers.</p>
            </div>
          )}

          {disputes.map(d => (
            <div key={d.id} style={{
              background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10,
              padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
            }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text)" }}>
                  Dispute #{d.id} · Call #{d.callId}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                  Opened by {d.opener.slice(0, 8)}… · {new Date(Number(d.createdAt) * 1000).toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                  color: d.status === "RESOLVED" ? "var(--accent)" : d.status === "OPEN" ? "var(--amber,#f59e0b)" : "var(--text-dim)",
                }}>
                  {d.status}
                </span>
                {d.outcome && (
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                    Outcome: {d.outcome}
                  </div>
                )}
              </div>
              {d.status === "OPEN" && isConnected && (
                <button
                  className="btn btn-sm"
                  onClick={() => { setTab("vote"); setVoteDisputeId(d.id); }}
                  style={{ fontSize: 11 }}
                >
                  Vote →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes shimmer { 0%{opacity:.5} 50%{opacity:1} 100%{opacity:.5} }
      `}</style>
    </div>
  );
}
