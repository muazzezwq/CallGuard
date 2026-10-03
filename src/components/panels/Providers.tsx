import { useState } from "react";
import { useSubgraph } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import { formatUnits } from "viem";
import type { Provider } from "../../lib/subgraph";

export default function Providers() {
  const { data, loading, refetch } = useSubgraph<{ providers: Provider[] }>(`{
    providers(first:100, orderBy:completedCalls, orderDirection:desc){
      id owner signer stake pricePerCall maxResponseTime slashBps active completedCalls slashedCalls endpoint
    }
  }`, { pollInterval: 30000 });

  const setPanel = useAppStore(s => s.setActivePanel);
  const [show, setShow] = useState<"all"|"active">("active");

  const providers = (data?.providers ?? []).map(p => {
    const c = Number(p.completedCalls), s = Number(p.slashedCalls);
    const rep = (c+s)>0 ? Math.round((c+2)/(c+s+3)*100) : 66;
    return {...p, reputation: rep};
  });

  const list = show === "active" ? providers.filter(p=>p.active) : providers;

  return (
    <div className="cg-panel">
      <div className="panel-head">
        <div>
          <h2>Providers</h2>
          <p className="text-dim">{providers.filter(p=>p.active).length} active · {providers.length} total</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className={`btn btn-sm${show==="active"?" btn-primary":""}`} onClick={()=>setShow("active")}>Active</button>
          <button className={`btn btn-sm${show==="all"?" btn-primary":""}`} onClick={()=>setShow("all")}>All</button>
          <button className="btn btn-sm" onClick={refetch}>↻</button>
        </div>
      </div>

      {loading && <div className="skeleton-list">{[...Array(5)].map((_,i)=><div key={i} className="skeleton-row" style={{height:80}}/>)}</div>}

      <div className="provider-grid">
        {list.map(p => {
          const rep = p.reputation ?? 66;
          const underfunded = Number(p.stake) < Number(p.pricePerCall) * Number(p.slashBps) / 10000;
          return (
            <div key={p.id} className={`provider-card${!p.active?" inactive":""}`}>
              <div className="prov-header">
                <div className="prov-id">
                  <span className={`status-dot${p.active?" green":""}`}/>
                  <strong>Provider #{p.id}</strong>
                </div>
                <span className="rep-badge" style={{
                  background: rep>80?"#10b98122":rep>50?"#f59e0b22":"#ef444422",
                  color: rep>80?"var(--accent)":rep>50?"var(--amber)":"var(--red)"
                }}>{rep}%</span>
              </div>
              {underfunded && <div className="underfunded-badge">⚠ Underfunded</div>}
              <div className="prov-stats">
                <div className="prov-stat"><span className="text-dim">Price</span><strong>{formatUnits(BigInt(p.pricePerCall??0),6)} USDC</strong></div>
                <div className="prov-stat"><span className="text-dim">Stake</span><strong>{formatUnits(BigInt(p.stake??0),6)} USDC</strong></div>
                <div className="prov-stat"><span className="text-dim">SLA</span><strong>{p.maxResponseTime}s</strong></div>
                <div className="prov-stat"><span className="text-dim">Slash</span><strong>{(Number(p.slashBps)/100).toFixed(1)}%</strong></div>
              </div>
              <div className="prov-footer">
                <span className="text-dim text-xs mono">{p.signer?.slice(0,10)}...</span>
                <button className="btn btn-sm btn-primary" onClick={()=>{ useAppStore.getState().setCallProviderId(p.id); setPanel("callbuilder"); }}>
                  Call →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .provider-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;}
        .provider-card{background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;display:flex;flex-direction:column;gap:10px;}
        .provider-card.inactive{opacity:.6;}
        .prov-header{display:flex;justify-content:space-between;align-items:center;}
        .prov-id{display:flex;align-items:center;gap:8px;}
        .status-dot{width:8px;height:8px;border-radius:50%;background:var(--text-faint);}
        .status-dot.green{background:var(--accent);}
        .rep-badge{font-size:12px;font-weight:700;padding:3px 8px;border-radius:99px;}
        .underfunded-badge{font-size:11px;color:var(--red);background:#ef444416;border-radius:4px;padding:3px 8px;}
        .prov-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .prov-stat{display:flex;flex-direction:column;gap:2px;font-size:13px;}
        .prov-footer{display:flex;justify-content:space-between;align-items:center;margin-top:4px;}
        .skeleton-list{display:flex;flex-direction:column;gap:8px;}
        .skeleton-row{border-radius:var(--radius);background:var(--bg-2);animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}
        @media(max-width:560px){.provider-grid{grid-template-columns:1fr;}}
      `}</style>
    </div>
  );
}
