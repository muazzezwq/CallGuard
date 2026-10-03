import { useState } from "react";
export default function Mcp() {
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try { const r = await fetch("/api/mcp-server"); setResult(await r.json()); } catch { setResult({error:"Failed"}); }
    setBusy(false);
  };
  return (
    <div className="panel-body">
      <div className="panel-head"><h2>MCP Server</h2><p className="panel-sub">Model Context Protocol endpoint for AI agent integration. Connect Claude, GPT, or any MCP-compatible agent.</p></div>
      <div className="action-card">
        <div className="action-title">Endpoint</div>
        <code style={{display:"block",padding:12,background:"var(--bg-0)",borderRadius:8,fontSize:12,marginBottom:12,fontFamily:"var(--font-mono)",color:"var(--accent)"}}>https://arcsla.vercel.app/api/mcp-server</code>
        <button className="btn-primary" onClick={test} disabled={busy}>{busy?"Testing...":"Test Endpoint"}</button>
        {result && <pre style={{background:"var(--bg-0)",padding:12,borderRadius:8,fontSize:11,marginTop:12,overflow:"auto",color:"var(--text)"}}>{JSON.stringify(result,null,2)}</pre>}
      </div>
    </div>
  );
}
