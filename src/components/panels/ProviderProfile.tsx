import { useState } from "react";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { CONFIG, REGISTRY_ABI } from "../../lib/config";
import { useAppStore } from "../../store/useAppStore";

export default function ProviderProfile() {
  const [pid, setPid] = useState(new URLSearchParams(window.location.search).get("provider") || "1");
  const setPanel = useAppStore(s=>s.setActivePanel);

  const { data } = useReadContract({ address: CONFIG.registryAddress, abi: REGISTRY_ABI, functionName: "getProvider", args: [BigInt(pid||1)], query: { enabled: !!pid } });
  const p = data as any;

  const price = p?.pricePerCall ? Number(formatUnits(p.pricePerCall,6)).toFixed(4) : "—";
  const stake = p?.stakeAmount ? Number(formatUnits(p.stakeAmount,6)).toFixed(2) : "—";
  const rep = p?.reputationScore ? Number(p.reputationScore) : 0;

  return (
    <div className="panel-body">
      <div className="panel-head"><h2>Provider Profile</h2><p className="panel-sub">Public provider stats. No wallet required. Share via ?provider=ID URL.</p></div>
      <div style={{display:"flex",gap:12,marginBottom:20,alignItems:"flex-end"}}>
        <div style={{flex:1}}>
          <label className="input-label">Provider ID</label>
          <input className="input-field" type="number" value={pid} onChange={e=>setPid(e.target.value)} min="1" />
        </div>
        <button className="btn-secondary" onClick={()=>{ const url=`${window.location.origin}/app/?provider=${pid}`; navigator.clipboard.writeText(url); }}>Copy Link</button>
      </div>
      {p && (
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:20}}>
            <div className="stat-card"><div className="stat-label">PRICE / CALL</div><div className="stat-val">{price} <span style={{fontSize:12}}>USDC</span></div></div>
            <div className="stat-card"><div className="stat-label">STAKE</div><div className="stat-val">{stake} <span style={{fontSize:12}}>USDC</span></div></div>
            <div className="stat-card"><div className="stat-label">SLA WINDOW</div><div className="stat-val">{p.maxResponseTime ? Number(p.maxResponseTime)+"s" : "—"}</div></div>
            <div className="stat-card"><div className="stat-label">STATUS</div><div className="stat-val" style={{color:p.active?"var(--accent)":"var(--red)"}}>{p.active?"Active":"Inactive"}</div></div>
          </div>
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:13,color:"var(--text-dim)"}}>Reputation Score</span>
              <span style={{fontSize:13,fontWeight:600,color:rep>70?"var(--accent)":rep>30?"var(--amber)":"var(--red)"}}>{rep}/100</span>
            </div>
            <div style={{height:8,background:"var(--bg-3)",borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${rep}%`,background:rep>70?"var(--accent)":rep>30?"var(--amber)":"var(--red)",borderRadius:4,transition:"width 0.5s"}} />
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn-primary" onClick={()=>setPanel("callbuilder")}>Call this provider →</button>
            <a href={CONFIG.explorerAddr(p.signer||"0x")} target="_blank" rel="noreferrer" className="btn-secondary">ArcScan</a>
          </div>
        </>
      )}
    </div>
  );
}
