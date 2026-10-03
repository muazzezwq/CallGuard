import { useState } from "react";
import { CONFIG } from "../../lib/config";

export default function Verify() {
  const [txHash, setTxHash] = useState(new URLSearchParams(window.location.search).get("verify") || "");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    if (!txHash.startsWith("0x")) { alert("Enter a valid 0x... hash"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/attestation?callId=${txHash}`);
      setResult(await res.json());
    } catch { setResult({ error: "Failed to fetch" }); }
    setBusy(false);
  };

  return (
    <div className="panel-body">
      <div className="panel-head"><h2>Receipt Verification</h2><p className="panel-sub">Verify any receipt hash on-chain. No wallet required. Share a public proof link.</p></div>
      <div className="action-card">
        <label className="input-label">Transaction / Call ID (0x...)</label>
        <input className="input-field" value={txHash} onChange={e=>setTxHash(e.target.value)} placeholder="0x..." style={{marginBottom:12}} />
        <div style={{display:"flex",gap:8}}>
          <button className="btn-primary" onClick={verify} disabled={busy}>{busy?"Verifying...":"Verify On-Chain"}</button>
          {txHash && <button className="btn-secondary" onClick={()=>{ navigator.clipboard.writeText(`${window.location.origin}/app/?verify=${txHash}`); }}>Copy Link</button>}
        </div>
      </div>
      {result && (
        <div style={{marginTop:16}}>
          {result.ok ? (
            <div style={{padding:16,background:"rgba(16,185,129,0.08)",borderRadius:8,border:"1px solid rgba(16,185,129,0.3)"}}>
              <div style={{fontWeight:600,color:"var(--accent)",marginBottom:8}}>✓ Receipt Verified</div>
              <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:"6px 16px",fontSize:13}}>
                <span style={{color:"var(--text-dim)"}}>Status</span><span style={{color:"var(--text)"}}>{result.status || "COMPLETED"}</span>
                <span style={{color:"var(--text-dim)"}}>Provider</span><span>#{result.providerId}</span>
                <span style={{color:"var(--text-dim)"}}>Chain</span><span>{result.proof?.chain || "Arc Testnet"}</span>
                {result.proof?.contract && <><span style={{color:"var(--text-dim)"}}>Contract</span><a href={CONFIG.explorerAddr(result.proof.contract)} target="_blank" rel="noreferrer" style={{color:"var(--accent)",fontSize:11,fontFamily:"var(--font-mono)"}}>{result.proof.contract.slice(0,14)}...</a></>}
              </div>
            </div>
          ) : (
            <div style={{padding:16,background:"rgba(239,68,68,0.08)",borderRadius:8,border:"1px solid rgba(239,68,68,0.3)"}}>
              <div style={{fontWeight:600,color:"var(--red)",marginBottom:4}}>✗ Not Verified</div>
              <div style={{fontSize:13,color:"var(--text-dim)"}}>{result.error || "Could not verify this receipt."}</div>
            </div>
          )}
          <pre style={{background:"var(--bg-0)",padding:12,borderRadius:8,fontSize:11,marginTop:12,overflow:"auto",color:"var(--text)"}}>{JSON.stringify(result,null,2)}</pre>
        </div>
      )}
    </div>
  );
}
