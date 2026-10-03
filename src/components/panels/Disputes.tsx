import { useState } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { CONFIG, DISPUTE_QUALITY_ABI } from "../../lib/config";

export default function Disputes() {
  const { address, isConnected } = useAccount();
  const [callId, setCallId] = useState("");
  const [evidence, setEvidence] = useState("");
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState<"open"|"vote"|"history">("open");

  const { data: disputeCount } = useReadContract({
    address: CONFIG.disputeQualityAddress as `0x${string}`,
    abi: DISPUTE_QUALITY_ABI,
    functionName: "disputeCount",
    query: { refetchInterval: 15000 },
  });

  const { writeContractAsync } = useWriteContract();

  const handleDispute = async () => {
    if (!isConnected || !callId || !evidence) return;
    try {
      setStatus("Opening dispute...");
      const evidenceHash = `0x${Buffer.from(evidence).toString("hex").padEnd(64,"0").slice(0,64)}` as `0x${string}`;
      await writeContractAsync({
        address: CONFIG.disputeQualityAddress as `0x${string}`,
        abi: DISPUTE_QUALITY_ABI,
        functionName: "openDispute",
        args: [BigInt(callId), evidenceHash],
      });
      setStatus("Dispute opened!");
      setCallId(""); setEvidence("");
    } catch(e:any){ setStatus(e.shortMessage ?? e.message); }
  };

  return (
    <div className="cg-panel">
      <div className="panel-head">
        <div>
          <h2>Quality Disputes</h2>
          <p className="text-dim">Community-voted response quality verification</p>
        </div>
        <div className="stat-pill">
          <span className="text-dim text-xs">Total disputes</span>
          <strong>{disputeCount?.toString() ?? "—"}</strong>
        </div>
      </div>

      <div className="cg-tabs mb-4">
        {(["open","vote","history"] as const).map(t => (
          <button key={t} className={`cg-tab${tab===t?" active":""}`} onClick={()=>setTab(t)}>
            {t==="open"?"Open Dispute":t==="vote"?"Vote":"History"}
          </button>
        ))}
      </div>

      {tab === "open" && (
        <div className="cg-card">
          <div className="info-box mb-4">
            <strong>How it works:</strong> Submit the call ID and evidence. Community arbiters vote on response quality. Stake-weighted majority wins.
          </div>
          <div className="form-group mb-3">
            <label className="form-label">Call ID</label>
            <input className="cg-input mono" placeholder="1" value={callId} onChange={e=>setCallId(e.target.value)}/>
          </div>
          <div className="form-group mb-3">
            <label className="form-label">Evidence (description or hash)</label>
            <textarea className="cg-input" rows={3} placeholder="Describe why the response was inadequate..." value={evidence} onChange={e=>setEvidence(e.target.value)}/>
          </div>
          {status && <p className="text-sm mb-2" style={{color:status.includes("!")?"var(--accent)":"var(--red)"}}>{status}</p>}
          <button className="btn btn-primary" onClick={handleDispute} disabled={!callId||!evidence}>
            Open Dispute
          </button>
        </div>
      )}

      {tab === "vote" && (
        <div className="empty-state">
          <p>No active disputes to vote on.</p>
          <p className="text-dim text-sm mt-1">Disputes appear here once opened by callers.</p>
        </div>
      )}

      {tab === "history" && (
        <div className="empty-state">
          <p>No resolved disputes yet.</p>
        </div>
      )}

      <style>{`
        .stat-pill{background:var(--bg-2);border:1px solid var(--border);border-radius:99px;padding:6px 14px;display:flex;flex-direction:column;align-items:center;gap:2px;}
        .info-box{background:var(--bg-3);border-left:3px solid var(--accent);border-radius:var(--radius);padding:12px 16px;font-size:13px;}
      `}</style>
    </div>
  );
}
