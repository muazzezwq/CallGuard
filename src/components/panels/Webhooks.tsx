import { useState } from "react";
const EVENTS = ["slash","receipt","timeout","expiring","registration"];
export default function Webhooks() {
  const [url, setUrl] = useState(localStorage.getItem("cg_webhook_url")||"");
  const [events, setEvents] = useState<string[]>(JSON.parse(localStorage.getItem("cg_webhook_events")||"[]"));
  const toggle = (e:string) => setEvents(p=>p.includes(e)?p.filter(x=>x!==e):[...p,e]);
  const save = () => { localStorage.setItem("cg_webhook_url",url); localStorage.setItem("cg_webhook_events",JSON.stringify(events)); alert("Saved!"); };
  return (
    <div className="panel-body">
      <div className="panel-head"><h2>Webhooks</h2><p className="panel-sub">Receive HTTP POST notifications for on-chain events.</p></div>
      <div className="action-card">
        <label className="input-label">Webhook URL</label>
        <input className="input-field" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-server.com/webhook" style={{marginBottom:12}} />
        <div style={{marginBottom:12}}>
          <div className="input-label" style={{marginBottom:8}}>Events</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {EVENTS.map(ev=>(
              <button key={ev} onClick={()=>toggle(ev)} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${events.includes(ev)?"var(--accent)":"var(--border)"}`,background:events.includes(ev)?"rgba(16,185,129,0.1)":"var(--bg-2)",color:events.includes(ev)?"var(--accent)":"var(--text-dim)",cursor:"pointer",fontSize:12,textTransform:"capitalize"}}>{ev}</button>
            ))}
          </div>
        </div>
        <button className="btn-primary" onClick={save}>Save Webhook</button>
      </div>
    </div>
  );
}
