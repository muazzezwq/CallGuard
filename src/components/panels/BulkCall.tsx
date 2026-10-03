import { useState } from "react";
export default function BulkCall() {
  const [count,setCount] = useState(5);
  const [pid,setPid] = useState("1");
  const [payload,setPayload] = useState("ping");
  return (
    <div className="panel-body">
      <div className="panel-head"><h2>Bulk Call</h2><p className="panel-sub">Send multiple calls to a provider in one session.</p></div>
      <div className="action-card">
        <label className="input-label">Provider ID</label>
        <input className="input-field" type="number" value={pid} onChange={e=>setPid(e.target.value)} style={{marginBottom:12}} />
        <label className="input-label">Payload</label>
        <input className="input-field" value={payload} onChange={e=>setPayload(e.target.value)} style={{marginBottom:12}} />
        <label className="input-label">Call count: {count}</label>
        <input type="range" min={1} max={20} value={count} onChange={e=>setCount(Number(e.target.value))} style={{width:"100%",marginBottom:12,accentColor:"var(--accent)"}} />
        <div style={{fontSize:13,color:"var(--text-dim)",marginBottom:12}}>Estimated cost: ~{(count * 1).toFixed(2)} USDC</div>
        <button className="btn-primary" onClick={()=>alert("Bulk call: use Call Builder for each call — automation coming soon")}>Send {count} Calls</button>
      </div>
    </div>
  );
}
