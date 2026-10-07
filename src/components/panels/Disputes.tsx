import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { keccak256, toHex } from "viem";
import { useSubgraph } from "../../hooks/useSubgraph";
import { CONFIG } from "../../lib/config";

const DQ_ABI = [
  { name: "openDispute", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "callId", type: "uint256" }, { name: "evidenceHash", type: "bytes32" }], outputs: [] },
  { name: "voteOnDispute", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "disputeId", type: "uint256" }, { name: "vote", type: "bool" }], outputs: [] },
  { name: "resolveDispute", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "disputeId", type: "uint256" }], outputs: [] },
  { name: "disputeCount", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getDispute", type: "function", stateMutability: "view",
    inputs: [{ name: "disputeId", type: "uint256" }],
    outputs: [
      { name: "callId", type: "uint256" },
      { name: "opener", type: "address" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "yesVotes", type: "uint256" },
      { name: "noVotes", type: "uint256" },
      { name: "resolved", type: "bool" },
      { name: "outcome", type: "bool" },
    ] },
] as const;

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

  const { writeContractAsync } = useWriteContract();
  const { data: voteTxHash } = useWriteContract();
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

  // Open dispute
  const handleOpenDispute = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet first"); return; }
    if (!callIdInput || !evidence) { setStatus("❌ Enter call ID and evidence"); return; }
    setStatus("⏳ Opening dispute...");
    try {
      const evidenceHash = keccak256(toHex(evidence));
      await writeContractAsync({
        address: CONFIG.disputeQualityAddress as `0x${string}`,
        abi: DQ_ABI,
        functionName: "openDispute",
        args: [BigInt(callIdInput), evidenceHash],
      });
      setStatus("✅ Dispute opened! Bond: 0.5 USDC deducted.");
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
        abi: DQ_ABI,
        functionName: "getDispute",
        args: [BigInt(voteDisputeId)],
      }) as [bigint, string, `0x${string}`, bigint, bigint, boolean, boolean];
      setDisputeInfo({
        callId: result[0].toString(),
        opener: result[1].slice(0, 8) + "…" + result[1].slice(-4),
        yesVotes: result[3].toString(),
        noVotes: result[4].toString(),
        resolved: result[5] ? "Yes" : "No",
        outcome: result[6] ? "✅ Honored" : "❌ Slashed",
      });
    } catch (e: unknown) {
      setDisputeInfo({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [voteDisputeId, publicClient]);

  // Vote on dispute
  const handleVote = useCallback(async (vote: boolean) => {
    if (!isConnected) { setVoteStatus("❌ Connect wallet first"); return; }
    if (!voteDisputeId) { setVoteStatus("❌ Enter dispute ID"); return; }
    setVoteStatus(`⏳ Voting ${vote ? "Yes (honored)" : "No (slashed)"}…`);
    try {
      await writeContractAsync({
        address: CONFIG.disputeQualityAddress as `0x${string}`,
        abi: DQ_ABI,
        functionName: "voteOnDispute",
        args: [BigInt(voteDisputeId), vote],
      });
      setVoteStatus(`✅ Vote cast: ${vote ? "Provider honored" : "Provider slashed"}`);
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
