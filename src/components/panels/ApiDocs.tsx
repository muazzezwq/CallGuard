const ENDPOINTS = [
  { method: "GET", path: "/api/health", auth: false, desc: "Health check — RPC, signer, contract connectivity" },
  { method: "GET", path: "/api/attestation?providerId=1&type=score", auth: false, desc: "Provider reputation score + proof" },
  { method: "GET", path: "/api/attestation?callId=0x...", auth: false, desc: "Call verdict (COMPLETED/SLASHED/OPEN)" },
  { method: "POST", path: "/api/attestation", auth: true, desc: "Issue on-chain attestation (facilitator)" },
  { method: "GET", path: "/api/nano-balance?address=0x...", auth: false, desc: "USDC balance via nano endpoint" },
  { method: "POST", path: "/api/nano-call", auth: true, desc: "Nano-payment call (gasless, 0.001 USDC)" },
  { method: "GET", path: "/api/energy-data", auth: "x402", desc: "Premium energy data (x402 payment required)" },
  { method: "GET", path: "/api/premium-report", auth: "x402", desc: "Premium SLA report (x402 payment required)" },
  { method: "GET", path: "/api/mcp-server", auth: false, desc: "MCP server manifest for AI agent integration" },
];

const CODE = `// Browser JS — call a service
import { ethers } from "ethers";
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const PPC = new ethers.Contract(PPC_ADDRESS, PPC_ABI, signer);
const tx = await PPC.callService(providerId, payloadHash);
await tx.wait();`;

export default function ApiDocs() {
  return (
    <div className="panel-body">
      <div className="panel-head"><h2>API & Integration Docs</h2><p className="panel-sub">REST endpoints, MCP server, ERC-8004 agent identity, and SDK examples.</p></div>
      <div style={{marginBottom:24}}>
        <div style={{fontWeight:600,marginBottom:12}}>REST Endpoints</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {ENDPOINTS.map(e=>(
            <div key={e.path} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 14px",background:"var(--bg-2)",borderRadius:8}}>
              <span style={{
                padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,flexShrink:0,
                background:e.method==="GET"?"rgba(16,185,129,0.15)":"rgba(59,130,246,0.15)",
                color:e.method==="GET"?"var(--accent)":"#60a5fa"
              }}>{e.method}</span>
              <div style={{flex:1}}>
                <code style={{fontSize:12,color:"var(--text)",fontFamily:"var(--font-mono)"}}>{e.path}</code>
                <div style={{fontSize:12,color:"var(--text-dim)",marginTop:2}}>{e.desc}</div>
              </div>
              {e.auth === "x402" && <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,background:"rgba(245,158,11,0.15)",color:"var(--amber)",flexShrink:0}}>x402</span>}
              {e.auth === true && <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,background:"rgba(239,68,68,0.15)",color:"var(--red)",flexShrink:0}}>Auth</span>}
            </div>
          ))}
        </div>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{fontWeight:600,marginBottom:12}}>Quick Integration</div>
        <pre style={{background:"var(--bg-0)",padding:16,borderRadius:8,fontSize:11,overflow:"auto",color:"var(--text)",lineHeight:1.6}}>{CODE}</pre>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{fontWeight:600,marginBottom:12}}>Embed Widget</div>
        <pre style={{background:"var(--bg-0)",padding:16,borderRadius:8,fontSize:11,overflow:"auto",color:"var(--text)"}}>{`<script src="https://arcsla.vercel.app/api/widget.js"></script>
<button data-callguard-provider="1" data-callguard-payload="ping">
  Pay with CallGuard
</button>`}</pre>
      </div>
      <div>
        <div style={{fontWeight:600,marginBottom:12}}>MCP Server</div>
        <div className="info-box">Add to your AI agent config to enable autonomous USDC payments.</div>
        <pre style={{background:"var(--bg-0)",padding:16,borderRadius:8,fontSize:11,overflow:"auto",color:"var(--text)",marginTop:8}}>{`{
  "mcpServers": {
    "callguard": {
      "url": "https://arcsla.vercel.app/api/mcp-server",
      "agentWallet": "YOUR_AGENT_WALLET_ADDRESS"
    }
  }
}`}</pre>
      </div>
    </div>
  );
}
