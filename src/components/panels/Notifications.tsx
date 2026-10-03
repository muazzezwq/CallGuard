import { useState, useEffect } from "react";
type Notif = { id:string; msg:string; type:"info"|"success"|"error"; ts:number };
export default function Notifications() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  useEffect(()=>{ const n = JSON.parse(localStorage.getItem("cg_notifs")||"[]"); setNotifs(n); },[]);
  const clear = () => { setNotifs([]); localStorage.removeItem("cg_notifs"); };
  return (
    <div className="panel-body">
      <div className="panel-head" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><h2>Notifications</h2><p className="panel-sub">On-chain event alerts.</p></div>
        {notifs.length>0 && <button className="btn-secondary" onClick={clear} style={{fontSize:12}}>Clear all</button>}
      </div>
      {notifs.length===0 ? (
        <div style={{textAlign:"center",padding:40,color:"var(--text-dim)"}}>
          <div style={{fontSize:32,marginBottom:12}}>🔔</div>
          <div>No notifications yet</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {notifs.map((n:Notif)=>(
            <div key={n.id} style={{padding:"12px 14px",background:"var(--bg-2)",borderRadius:8,borderLeft:`3px solid ${n.type==="success"?"var(--accent)":n.type==="error"?"var(--red)":"var(--border)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,color:"var(--text)"}}>{n.msg}</span>
              <span style={{fontSize:11,color:"var(--text-dim)"}}>{new Date(n.ts).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
