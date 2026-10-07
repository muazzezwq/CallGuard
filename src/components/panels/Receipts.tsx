import { useState } from "react";
import { useAccount } from "wagmi";
import { useSubgraph } from "../../hooks/useSubgraph";
import { formatUnits } from "viem";

export default function Receipts() {
  const { address } = useAccount();
  const [copied, setCopied] = useState<string|null>(null);

  const { data, loading, refetch } = useSubgraph<{calls:any[]}>(address ? `{
    calls(where:{caller:"${address.toLowerCase()}",status_in:["COMPLETED","SLASHED"]}
      orderBy:completedAt orderDirection:desc first:50){
      id providerId amount status completedAt responseHash requestHash
    }
  }` : "", { enabled: !!address, pollInterval: 30000 });

  const receipts = data?.calls ?? [];

  const copy = (txt: string) => { navigator.clipboard.writeText(txt); setCopied(txt); setTimeout(()=>setCopied(null),2000); };

  return (
    <div className="cg-panel">
      <div className="panel-head">
        <div><h2>Receipts</h2><p className="text-dim">{receipts.length} on-chain receipts</p></div>
        <button className="btn btn-sm" onClick={() => void refetch()}>↻</button>
      </div>

      {loading && <div className="skeleton-list">{[...Array(3)].map((_,i)=><div key={i} className="skeleton-row" style={{height:100}}/>)}</div>}

      {!loading && receipts.length === 0 && (
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 12 2 2 4-4"/></svg>
          <p className="mt-2">No receipts yet. Make a call to get started.</p>
        </div>
      )}

      <div className="receipt-list">
        {receipts.map(r => (
          <div key={r.id} className="receipt-card">
            <div className="receipt-top">
              <div>
                <span className="receipt-id mono text-xs">{r.id.slice(0,12)}...</span>
                <span className={`receipt-status ml-2 ${r.status==="COMPLETED"?"green":"red"}`}>{r.status}</span>
              </div>
              <span className="receipt-amount">{formatUnits(BigInt(r.amount??0),6)} USDC</span>
            </div>
            <div className="receipt-body">
              <div className="receipt-hash">
                <span className="text-dim text-xs">Response hash</span>
                <div className="hash-row">
                  <span className="mono text-xs">{r.responseHash?.slice(0,20)}...</span>
                  <button className="btn-copy" onClick={()=>copy(r.responseHash??"")}>{copied===r.responseHash?"✓":"⎘"}</button>
                </div>
              </div>
              <div className="receipt-meta text-dim text-xs">
                Provider #{r.providerId} · {r.completedAt ? new Date(Number(r.completedAt)*1000).toLocaleString() : "—"}
              </div>
            </div>
            <div className="receipt-actions">
              <a href={`https://explorer.testnet.arc.io/tx/${r.id}`} target="_blank" rel="noreferrer" className="btn btn-sm">
                View on ArcScan ↗
              </a>
              <a href={`/app/?verify=${r.id}`} className="btn btn-sm">Verify ↗</a>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .receipt-list{display:flex;flex-direction:column;gap:12px;}
        .receipt-card{background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;display:flex;flex-direction:column;gap:10px;}
        .receipt-top{display:flex;justify-content:space-between;align-items:center;}
        .receipt-status{font-size:11px;font-weight:700;text-transform:uppercase;}
        .receipt-status.green{color:var(--accent);}
        .receipt-status.red{color:var(--red);}
        .receipt-amount{font-size:18px;font-weight:700;font-family:var(--font-display);}
        .receipt-body{display:flex;flex-direction:column;gap:6px;}
        .hash-row{display:flex;align-items:center;gap:8px;}
        .btn-copy{background:none;border:none;cursor:pointer;color:var(--accent);font-size:14px;padding:2px 6px;}
        .receipt-actions{display:flex;gap:8px;flex-wrap:wrap;}
        .skeleton-list{display:flex;flex-direction:column;gap:8px;}
        .skeleton-row{border-radius:var(--radius);background:var(--bg-2);animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}
      `}</style>
    </div>
  );
}
