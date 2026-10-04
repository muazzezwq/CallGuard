import { useState } from "react";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { CONFIG, REGISTRY_ABI } from "../../lib/config";
import { ExternalLink, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

const ARCSCAN = "https://explorer.testnet.arc.io";
const s = {
  page: { padding:"20px 16px",maxWidth:800,margin:"0 auto" },
  h1: { fontSize:22,fontWeight:700,color:"var(--text)",margin:"0 0 4px",fontFamily:"var(--font-display)" },
  sub: { fontSize:13,color:"var(--text-dim)",margin:"0 0 20px" },
  section: { background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px",marginBottom:12 },
  sectionTitle: { fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"var(--text-faint)",fontWeight:600,marginBottom:12 },
  card: { background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"12px 14px",marginBottom:8 },
  row: { display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6 },
  label: { fontSize:11,color:"var(--text-dim)" },
  val: { fontSize:12,fontWeight:500,fontFamily:"var(--font-mono)",color:"var(--text)" },
  btn: (v="primary") => ({ padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:500,background:v==="primary"?"linear-gradient(135deg,#10b981,#059669)":"var(--bg-3)",color:v==="primary"?"#fff":"var(--text)",display:"inline-flex",alignItems:"center",gap:5 }),
  input: { width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontSize:13,fontFamily:"var(--font-mono)",boxSizing:"border-box" as const,marginBottom:8 },
  code: { background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"12px 14px",fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text)",whiteSpace:"pre-wrap" as const,overflowX:"auto" as const,marginBottom:8 },
  tab: (active:boolean) => ({ padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:500,background:active?"var(--accent)":"transparent",color:active?"#fff":"var(--text-dim)" }),
  badge: (ok:boolean) => ({ display:"inline-block",padding:"1px 7px",borderRadius:10,fontSize:10,fontWeight:600,background:ok?"rgba(16,185,129,0.12)":"rgba(239,68,68,0.1)",color:ok?"var(--accent)":"var(--danger)" }),
  link: { color:"var(--accent)",textDecoration:"none",fontSize:11,display:"inline-flex",alignItems:"center",gap:4,fontFamily:"var(--font-mono)" },
};

const SETUP_STEPS = [
  { n:1, title:"Get testnet USDC", body:"You need USDC to stake and pay for calls. On Arc it's also the gas token.", action:"Open faucet →", href:"https://faucet.circle.com" },
  { n:2, title:"Connect your wallet", body:'Click "Connect wallet" in the top-right. MetaMask will add Arc Testnet automatically.', action:null },
  { n:3, title:"Register as provider", body:'Go to the Register panel, set your price, SLA window and stake amount.', action:null },
  { n:4, title:"Listen for calls", body:"Poll the contract or subscribe to events. Sign and submit receipts within your SLA window.", action:null },
];

const CODE_EXAMPLES: Record<string, string> = {
  "Browser JS": `// Install ethers v6: npm i ethers
import { ethers } from "ethers";
const provider = new ethers.BrowserProvider(window.ethereum);
const wallet = await provider.getSigner();

const PPC = "${CONFIG.ppcAddress}";
const ABI = ["function callService(uint256 providerId,bytes32 requestHash) payable returns(uint256)"];
const ppc = new ethers.Contract(PPC, ABI, wallet);
const tx = await ppc.callService(1, ethers.keccak256(ethers.toUtf8Bytes("ping")));
console.log("call opened:", tx.hash);`,
  "Node.js": `// npm i ethers
const { ethers } = require("ethers");
const rpc = new ethers.JsonRpcProvider("https://rpc.testnet.arc.io");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, rpc);

const PPC = "${CONFIG.ppcAddress}";
const ABI = ["function submitReceipt(uint256,bytes32,uint64,bytes) returns(bool)"];
const ppc = new ethers.Contract(PPC, ABI, wallet);
// Call as provider after answering:
await ppc.submitReceipt(callId, responseHash, respondedAt, signature);`,
  "Python": `# pip install web3
from web3 import Web3
w3 = Web3(Web3.HTTPProvider("https://rpc.testnet.arc.io"))
account = w3.eth.account.from_key(os.environ["PRIVATE_KEY"])

PPC = "${CONFIG.ppcAddress}"
ABI = [{"name":"callService","type":"function","inputs":[{"type":"uint256"},{"type":"bytes32"}]}]
ppc = w3.eth.contract(address=PPC, abi=ABI)
tx = ppc.functions.callService(1, Web3.keccak(text="ping")).build_transaction({...})`,
  "curl": `# Check provider info
curl https://rpc.testnet.arc.io \\
  -X POST -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[{
    "to":"${CONFIG.registryAddress}",
    "data":"0x...getProvider(1)"
  },"latest"],"id":1}'`,
};

export default function Providers() {
  const [lookupId, setLookupId] = useState("1");
  const [codeTab, setCodeTab] = useState("Browser JS");
  const [copied, setCopied] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [sdkOpen, setSdkOpen] = useState(false);

  const { data: provData } = useReadContract({
    address: CONFIG.registryAddress as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "getProvider",
    args: [BigInt(lookupId || "1")],
    query: { enabled: !!lookupId },
  });

  const copyCode = () => {
    navigator.clipboard.writeText(CODE_EXAMPLES[codeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const p = provData as { signer:string; pricePerCall:bigint; maxResponseTime:number; slashBps:number; active:boolean; stakeAmount:bigint } | undefined;
  const shorten = (a: string) => `${a.slice(0,8)}…${a.slice(-6)}`;

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Providers</h1>
      <p style={s.sub}>Browse and inspect registered service providers on Arc Testnet.</p>

      {/* Lookup */}
      <div style={s.section}>
        <div style={s.sectionTitle}>PROVIDER LOOKUP</div>
        <div style={{ display:"flex",gap:8,marginBottom:12 }}>
          <input style={{ ...s.input,width:80,margin:0 }} type="number" min={1} value={lookupId} onChange={e => setLookupId(e.target.value)} placeholder="ID" />
          <span style={{ fontSize:12,color:"var(--text-dim)",alignSelf:"center" }}>Enter provider ID to inspect</span>
        </div>
        {p ? (
          <div style={s.card}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
              <span style={{ fontSize:14,fontWeight:600,color:"var(--text)" }}>Provider #{lookupId}</span>
              <span style={s.badge(p.active)}>{p.active ? "ACTIVE" : "INACTIVE"}</span>
            </div>
            {[
              ["Signer", shorten(p.signer)],
              ["Price / call", `${formatUnits(p.pricePerCall, 6)} USDC`],
              ["Max response", `${p.maxResponseTime}s`],
              ["Slash BPS", `${p.slashBps} (${p.slashBps/100}%)`],
              ["Stake", `${formatUnits(p.stakeAmount, 6)} USDC`],
            ].map(([k,v]) => (
              <div key={k} style={s.row}>
                <span style={s.label}>{k}</span>
                <span style={s.val}>{String(v)}</span>
              </div>
            ))}
            <div style={{ marginTop:8 }}>
              <a href={`${ARCSCAN}/address/${p.signer}`} target="_blank" rel="noreferrer" style={s.link}>
                View on ArcScan <ExternalLink size={10} />
              </a>
            </div>
          </div>
        ) : (
          <div style={{ color:"var(--text-faint)",fontSize:12 }}>Loading provider #{lookupId}…</div>
        )}
      </div>

      {/* Setup Guide */}
      <div style={{ background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:10,marginBottom:12,overflow:"hidden" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",cursor:"pointer",userSelect:"none" as const }} onClick={() => setSetupOpen(o => !o)}>
          <div style={{ fontSize:13,fontWeight:600,color:"var(--text)" }}>Provider Setup Guide</div>
          {setupOpen ? <ChevronUp size={14} color="var(--text-faint)" /> : <ChevronDown size={14} color="var(--text-faint)" />}
        </div>
        {setupOpen && (
          <div style={{ padding:"0 16px 16px",background:"var(--bg-1)",borderTop:"1px solid var(--border)" }}>
            {SETUP_STEPS.map(step => (
              <div key={step.n} style={{ display:"flex",gap:12,padding:"12px 0",borderBottom:"1px solid var(--border)" }}>
                <div style={{ width:24,height:24,borderRadius:"50%",background:"rgba(16,185,129,0.15)",border:"1px solid rgba(16,185,129,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"var(--accent)",fontSize:11,fontWeight:700 }}>{step.n}</div>
                <div>
                  <div style={{ fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:3 }}>{step.title}</div>
                  <div style={{ fontSize:12,color:"var(--text-dim)",marginBottom:step.action?6:0 }}>{step.body}</div>
                  {step.action && step.href && <a href={step.href} target="_blank" rel="noreferrer" style={{ color:"var(--accent)",fontSize:12,textDecoration:"none" }}>{step.action}</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SDK Quick Integration */}
      <div style={{ background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:10,marginBottom:12,overflow:"hidden" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",cursor:"pointer",userSelect:"none" as const }} onClick={() => setSdkOpen(o => !o)}>
          <div style={{ fontSize:13,fontWeight:600,color:"var(--text)" }}>SDK — Quick Integration</div>
          {sdkOpen ? <ChevronUp size={14} color="var(--text-faint)" /> : <ChevronDown size={14} color="var(--text-faint)" />}
        </div>
        {sdkOpen && (
          <div style={{ padding:"16px",background:"var(--bg-1)",borderTop:"1px solid var(--border)" }}>
            <p style={{ fontSize:12,color:"var(--text-dim)",marginBottom:12 }}>
              Integrate CallGuard into any app or AI agent. Pick your language and replace the provider ID and payload.
            </p>
            <div style={{ display:"flex",gap:6,marginBottom:12,flexWrap:"wrap" as const }}>
              {Object.keys(CODE_EXAMPLES).map(tab => (
                <button key={tab} style={s.tab(codeTab===tab)} onClick={() => setCodeTab(tab)}>{tab}</button>
              ))}
            </div>
            <div style={{ position:"relative" as const }}>
              <pre style={s.code}>{CODE_EXAMPLES[codeTab]}</pre>
              <button style={{ position:"absolute" as const,top:8,right:8,...s.btn("secondary"),padding:"4px 8px",fontSize:11 }} onClick={copyCode}>
                {copied ? <><Check size={10} />Copied</> : <><Copy size={10} />Copy</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
