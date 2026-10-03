import { useSubgraph } from "../../hooks/useSubgraph";
import { CONFIG } from "../../lib/config";

const Q = `{ providers(first:20,orderBy:completedCalls,orderDirection:desc){id providerId completedCalls slashedCalls reputationScore active} }`;
const Q2 = `{ calls(first:10,where:{status:"SLASHED"},orderBy:createdAt,orderDirection:desc){id providerId caller createdAt} }`;

export default function Leaderboard() {
  const { data: pd } = useSubgraph<{providers:any[]}>(Q);
  const { data: sd } = useSubgraph<{calls:any[]}>(Q2);
  const providers = pd?.providers || [];
  const slashes = sd?.calls || [];

  return (
    <div className="panel-body">
      <div className="panel-head"><h2>Leaderboard</h2><p className="panel-sub">Top providers by honor rate and most slashed providers.</p></div>
      <div style={{marginBottom:24}}>
        <div style={{fontWeight:600,marginBottom:12,color:"var(--text)"}}>Top Providers (by completed calls)</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{borderBottom:"1px solid var(--border)"}}>
                {["Rank","Provider","Completed","Slashes","Rep Score","Status"].map(h=>(
                  <th key={h} style={{padding:"8px 12px",textAlign:"left",color:"var(--text-dim)",fontWeight:500,fontSize:11,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.map((p,i)=>(
                <tr key={p.id} style={{borderBottom:"1px solid var(--border)"}}>
                  <td style={{padding:"10px 12px",color:"var(--text-dim)"}}>{i+1}</td>
                  <td style={{padding:"10px 12px"}}><a href={CONFIG.explorerAddr(`0x${p.providerId?.toString(16)||"0"}`)} target="_blank" rel="noreferrer" style={{color:"var(--accent)"}}>{p.providerId}</a></td>
                  <td style={{padding:"10px 12px",color:"var(--text)"}}>{p.completedCalls}</td>
                  <td style={{padding:"10px 12px",color:Number(p.slashedCalls)>0?"var(--red)":"var(--text)"}}>{p.slashedCalls}</td>
                  <td style={{padding:"10px 12px"}}><span style={{background:"var(--bg-2)",padding:"2px 8px",borderRadius:4,fontSize:11}}>{p.reputationScore}/100</span></td>
                  <td style={{padding:"10px 12px"}}><span style={{color:p.active?"var(--accent)":"var(--text-dim)",fontSize:11}}>{p.active?"Active":"Inactive"}</span></td>
                </tr>
              ))}
              {providers.length===0 && <tr><td colSpan={6} style={{padding:24,textAlign:"center",color:"var(--text-dim)"}}>No data yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div style={{fontWeight:600,marginBottom:12,color:"var(--text)"}}>Recent Slashes</div>
        {slashes.length===0 ? <div style={{color:"var(--text-dim)",fontSize:13}}>No slashes recorded.</div> : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {slashes.map((s:any)=>(
              <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"var(--bg-2)",borderRadius:8,borderLeft:"3px solid var(--red)"}}>
                <div>
                  <span style={{color:"var(--text-dim)",fontSize:11,marginRight:8}}>Provider #{s.providerId}</span>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text)"}}>{s.caller?.slice(0,10)}...</span>
                </div>
                <span style={{fontSize:11,color:"var(--text-dim)"}}>{new Date(Number(s.createdAt)*1000).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
