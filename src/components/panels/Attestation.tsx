import { useState } from "react";
import { CONFIG } from "../../lib/config";

export default function Attestation() {
  const [tab, setTab] = useState<"peek"|"issue"|"lookup">("peek");
  const [providerId, setProviderId] = useState("1");
  const [callId, setCallId] = useState("");
  const [attId, setAttId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const peekScore = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/attestation?providerId=${providerId}&type=score`);
      setResult(await res.json());
    } catch (e) { setResult({ error: "Failed to fetch" }); }
    setBusy(false);
  };

  const peekCall = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/attestation?callId=${callId}`);
      setResult(await res.json());
    } catch (e) { setResult({ error: "Failed to fetch" }); }
    setBusy(false);
  };

  return (
    <div className="panel-body">
      <div className="panel-head">
        <h2>SLA Attestation Bridge</h2>
        <p className="panel-sub">Any protocol can query CallGuard for on-chain SLA attestations. CCIP-ready cross-chain broadcast.</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        {[{l:"CONTRACT",v:CONFIG.slaAttestationBridge.slice(0,10)+"..."},{l:"CHAIN",v:"Arc Testnet"},{l:"STATUS",v:"Live"}].map(s=>(
          <div key={s.l} className="stat-card"><div className="stat-label">{s.l}</div><div className="stat-val" style={{fontSize:s.l==="CONTRACT"?11:undefined,fontFamily:s.l==="CONTRACT"?"var(--font-mono)":undefined}}>{s.v}</div></div>
        ))}
      </div>
      <div className="tab-bar" style={{marginBottom:16}}>
        {(["peek","issue","lookup"] as const).map(t=>(
          <button key={t} className={`tab-btn${tab===t?" active":""}`} onClick={()=>setTab(t)} style={{textTransform:"capitalize"}}>{t}</button>
        ))}
      </div>
      {tab === "peek" && (
        <div>
          <div className="action-card" style={{marginBottom:12}}>
            <div className="action-title">Provider Score (no wallet needed)</div>
            <label className="input-label">Provider ID</label>
            <input className="input-field" type="number" value={providerId} onChange={e=>setProviderId(e.target.value)} style={{marginBottom:12}} />
            <button className="btn-primary" onClick={peekScore} disabled={busy}>{busy?"Loading...":"Fetch Score"}</button>
          </div>
          <div className="action-card">
            <div className="action-title">Call Verdict (no wallet needed)</div>
            <label className="input-label">Call ID (0x...)</label>
            <input className="input-field" value={callId} onChange={e=>setCallId(e.target.value)} placeholder="0x..." style={{marginBottom:12}} />
            <button className="btn-primary" onClick={peekCall} disabled={busy}>{busy?"Loading...":"Fetch Verdict"}</button>
          </div>
          {result && (
            <pre style={{background:"var(--bg-0)",padding:12,borderRadius:8,fontSize:11,marginTop:12,overflow:"auto",color:"var(--text)"}}>{JSON.stringify(result,null,2)}</pre>
          )}
        </div>
      )}
      {tab === "issue" && (
        <div className="action-card">
          <div className="action-title">Issue On-Chain Attestation</div>
          <div className="info-box">Attestations are issued by the facilitator. Submit the call ID to request an attestation be written on-chain.</div>
          <label className="input-label" style={{marginTop:12}}>Call ID</label>
          <input className="input-field" value={callId} onChange={e=>setCallId(e.target.value)} placeholder="0x..." style={{marginBottom:12}} />
          <button className="btn-primary" onClick={async()=>{
            setBusy(true);
            const res = await fetch("/api/attestation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({callId})});
            setResult(await res.json()); setBusy(false);
          }} disabled={busy}>{busy?"Issuing...":"Issue Attestation"}</button>
          {result && <pre style={{background:"var(--bg-0)",padding:12,borderRadius:8,fontSize:11,marginTop:12,overflow:"auto",color:"var(--text)"}}>{JSON.stringify(result,null,2)}</pre>}
        </div>
      )}
      {tab === "lookup" && (
        <div className="action-card">
          <div className="action-title">Lookup by Attestation ID</div>
          <label className="input-label">Attestation ID</label>
          <input className="input-field" value={attId} onChange={e=>setAttId(e.target.value)} placeholder="0x..." style={{marginBottom:12}} />
          <button className="btn-primary" onClick={async()=>{
            setBusy(true);
            const res = await fetch(`/api/attestation?attestationId=${attId}`);
            setResult(await res.json()); setBusy(false);
          }} disabled={busy}>{busy?"Looking up...":"Lookup"}</button>
          {result && <pre style={{background:"var(--bg-0)",padding:12,borderRadius:8,fontSize:11,marginTop:12,overflow:"auto",color:"var(--text)"}}>{JSON.stringify(result,null,2)}</pre>}
        </div>
      )}
    </div>
  );
}
