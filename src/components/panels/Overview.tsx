import { useState, useEffect, useRef } from "react";
import { useCountUp } from "../../hooks/useCountUp";
import { useReadContract, useWriteContract, useAccount, useWatchContractEvent } from "wagmi";
import Sparkline from "../ui/Sparkline";
import { parseUnits, formatUnits, keccak256, stringToBytes } from "viem";
import { CONFIG, REGISTRY_ABI, PPC_ABI, USDC_ABI } from "../../lib/config";
import { useSubgraph } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import { ExternalLink, Zap, Users, ChevronDown, ChevronUp, RefreshCw, X } from "lucide-react";

const ARCSCAN = "https://explorer.testnet.arc.io";

const s = {
  page: { padding: "20px 16px", maxWidth: 860, margin: "0 auto" },
  badge: { display:"inline-flex",alignItems:"center",gap:6,padding:"3px 10px",borderRadius:20,background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.2)",color:"var(--accent)",fontSize:11,fontWeight:600,marginBottom:12 },
  dot: { width:6,height:6,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s infinite" },
  h1: { fontSize:22,fontWeight:700,color:"var(--text)",margin:"0 0 4px",fontFamily:"var(--font-display)" },
  sub: { fontSize:13,color:"var(--text-dim)",margin:"0 0 20px" },
  grid4: { display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16 },
  card: { background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px" },
  cardLabel: { fontSize:10,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"var(--text-faint)",fontWeight:600,marginBottom:4 },
  cardVal: { fontSize:22,fontWeight:700,color:"var(--text)",fontFamily:"var(--font-display)" },
  cardSub: { fontSize:11,color:"var(--text-dim)",marginTop:2 },
  section: { background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px",marginBottom:12 },
  sectionTitle: { fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"var(--text-faint)",fontWeight:600,marginBottom:12 },
  row: { display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border)" },
  rowLabel: { fontSize:12,color:"var(--text-dim)" },
  rowVal: { fontSize:12,color:"var(--text)",fontWeight:500,fontFamily:"var(--font-mono)" },
  actItem: { display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)" },
  statusDot: (st:string) => ({ width:8,height:8,borderRadius:"50%",background:st==="STARTED"?"var(--accent)":st==="SLASHED"?"var(--danger)":"#3b82f6",marginTop:4,flexShrink:0 }),
  link: { color:"var(--accent)",textDecoration:"none",fontFamily:"var(--font-mono)",fontSize:11,display:"inline-flex",alignItems:"center",gap:4 },
  contractGrid: { display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 },
  contractCard: { background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px" },
  contractName: { fontSize:11,color:"var(--text-dim)",fontWeight:600,marginBottom:3 },
  btn: (variant="primary") => ({
    padding:"8px 16px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,
    background: variant==="primary" ? "linear-gradient(135deg,#10b981,#059669)" : "var(--bg-3)",
    color: variant==="primary" ? "#fff" : "var(--text)",
    display:"inline-flex",alignItems:"center",gap:6,
  }),
  input: { width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontSize:13,fontFamily:"var(--font-mono)",boxSizing:"border-box" as const },
  accordion: { border:"1px solid var(--border)",borderRadius:10,marginBottom:12,overflow:"hidden" },
  accordionHeader: { display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",cursor:"pointer",background:"var(--bg-2)",userSelect:"none" as const },
  accordionBody: { padding:"16px",background:"var(--bg-1)",borderTop:"1px solid var(--border)" },
};

const CONTRACTS = [
  { name:"ServiceRegistry", addr: CONFIG.registryAddress },
  { name:"PayPerCall v3",   addr: CONFIG.ppcAddress },
  { name:"DisputeQuality",  addr: "0x3c9bDc353861010A9ebfD8Ae5d31d44C5bb14725" },
  { name:"SLAFutures",      addr: "0xa6f194c621eE67559aDcA883824e01F1828e887c" },
  { name:"ReputationLoan",  addr: "0xE656dF6512e9d10e555518b7342fd8c81c42B8c0" },
  { name:"SLABridge",       addr: "0x62a63a94a41601fdb8e9d60ed7e56b1e4c4c5da7" },
  { name:"AgentWallet",     addr: "0xf73f2Fc55dd985E583516a4614f2A2c1Da0Ae8E6" },
  { name:"USDC",            addr: CONFIG.usdcAddress },
];

const SUBGRAPH = `{
  calls(first:100,orderBy:createdAt,orderDirection:desc){id providerId caller amount status createdAt}
  providers(first:10,orderBy:completedCalls,orderDirection:desc){id completedCalls slashedCalls}
}`;

// Build 24h hourly buckets from subgraph calls
function buildActivityChart(calls: { createdAt: string }[]): { hour: number; count: number }[] {
  const nowTs = Math.floor(Date.now() / 1000);
  const buckets: number[] = new Array(24).fill(0);
  calls.forEach(c => {
    const ts = parseInt(c.createdAt || "0");
    const ageS = nowTs - ts;
    if (ageS >= 0 && ageS < 86400) {
      const hourIdx = Math.floor(ageS / 3600); // 0 = most recent hour
      buckets[hourIdx] = (buckets[hourIdx] || 0) + 1;
    }
  });
  return buckets.map((count, i) => ({ hour: 23 - i, count })).reverse();
}

const WB_KEY = "cg_welcome_dismissed";

export default function Overview() {
  const { setPanel } = useAppStore();
  const { address, isConnected } = useAccount();

  // Welcome box — shown after wallet connect, dismissed once via localStorage
  const [welcomeDismissed, setWelcomeDismissed] = useState(() =>
    localStorage.getItem(WB_KEY) === "1"
  );
  const showWelcome = isConnected && !welcomeDismissed;
  const dismissWelcome = () => {
    localStorage.setItem(WB_KEY, "1");
    setWelcomeDismissed(true);
  };
  const { data: sg } = useSubgraph(SUBGRAPH);

  // Onchain: USDC balance + provider count
  const { data: providerCountRaw } = useReadContract({ address: CONFIG.registryAddress as `0x${string}`, abi: REGISTRY_ABI, functionName: "providerCount" });
  const { data: usdcBal } = useReadContract({ address: CONFIG.usdcAddress as `0x${string}`, abi: USDC_ABI, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address } });

  // Derive stats from subgraph
  const sgProviders: any[] = (sg as any)?.providers ?? [];
  const sgCalls: any[] = (sg as any)?.calls ?? [];
  const providerCount = providerCountRaw ? Number(providerCountRaw) : sgProviders.length;
  const callsNum = sgCalls.length;
  const slashesNum = sgCalls.filter((c: any) => c.status === "SLASHED").length;
  const completedNum = sgCalls.filter((c: any) => c.status === "COMPLETED").length;
  const receiptsNum = completedNum;
  const calls = callsNum > 0 ? callsNum.toString() : "—";
  const receipts = receiptsNum > 0 ? receiptsNum.toString() : "—";
  const slashes = slashesNum > 0 ? slashesNum.toString() : "—";
  // count-up animated values
  const animProviders = useCountUp(providerCount);
  const animCalls = useCountUp(callsNum);
  const animReceipts = useCountUp(receiptsNum);
  const honorRate = callsNum > 0
    ? `${Math.round((completedNum / callsNum) * 100)}%` : "—";
  const usdcFormatted = usdcBal ? Number(formatUnits(usdcBal as bigint, 6)).toFixed(2) : null;

  const allCalls = (sg as any)?.calls ?? [];
  const activities = allCalls.slice(0, 8);
  const topProviders = (sg as any)?.providers ?? [];
  const chartData = buildActivityChart(allCalls);

  // Auto-router state
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoMaxPrice, setAutoMaxPrice] = useState("2.0");
  const [autoMinRep, setAutoMinRep] = useState("50");
  const [autoResult, setAutoResult] = useState<string | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);

  // Multi-call state
  const [multiOpen, setMultiOpen] = useState(false);
  const [multiProvider, setMultiProvider] = useState("1");
  const [multiPayload, setMultiPayload] = useState("ping");
  const [multiCount, setMultiCount] = useState(3);

  // Quick call state
  const [registerOpen, setRegisterOpen] = useState(false);
  const [callProvider, setCallProvider] = useState("1");
  const { writeContractAsync, isPending } = useWriteContract()
  const [multiResults, setMultiResults] = useState<{pid:string;hash?:string;err?:string}[]>([])
  const [multiRunning, setMultiRunning] = useState(false);

  // Real-time event feed (watchContractEvent)
  const [liveEvents, setLiveEvents] = useState<{ icon: string; label: string; detail: string; time: string }[]>([]);
  const liveRef = useRef(liveEvents);
  liveRef.current = liveEvents;
  const pushEvent = (icon: string, label: string, detail: string) => {
    const e = { icon, label, detail, time: new Date().toLocaleTimeString("en-US", { hour12: false }) };
    setLiveEvents(prev => [e, ...prev].slice(0, 20));
  };

  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: [{ name: "CallStarted", type: "event", inputs: [{ name: "callId", type: "bytes32", indexed: true }, { name: "providerId", type: "uint256", indexed: true }, { name: "caller", type: "address", indexed: true }, { name: "amount", type: "uint256" }] }],
    eventName: "CallStarted",
    onLogs: (logs) => logs.forEach(l => {
      const a = l.args as any;
      pushEvent("🔵", `Call → Provider #${a.providerId}`, `${Number(a.amount || 0) / 1e6} USDC · ${String(a.callId || "").slice(0, 10)}…`);
    }),
  });
  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: [{ name: "ReceiptSubmitted", type: "event", inputs: [{ name: "callId", type: "bytes32", indexed: true }, { name: "providerId", type: "uint256", indexed: true }] }],
    eventName: "ReceiptSubmitted",
    onLogs: (logs) => logs.forEach(l => {
      const a = l.args as any;
      pushEvent("✅", `Receipt · Provider #${a.providerId}`, `callId: ${String(a.callId || "").slice(0, 10)}…`);
    }),
  });
  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: [{ name: "CallSlashed", type: "event", inputs: [{ name: "callId", type: "bytes32", indexed: true }, { name: "providerId", type: "uint256", indexed: true }, { name: "slashAmount", type: "uint256" }] }],
    eventName: "CallSlashed",
    onLogs: (logs) => logs.forEach(l => {
      const a = l.args as any;
      pushEvent("⚠", `Slashed · Provider #${a.providerId}`, `${Number(a.slashAmount || 0) / 1e6} USDC`);
    }),
  });

  const runAutoRouter = async () => {
    setAutoLoading(true);
    setAutoResult(null);
    try {
      const res = await fetch(`https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/3.0.0/gn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{ providers(first:20,where:{active:true}){ id pricePerCall completedCalls slashedCalls } }` }),
      });
      const d = await res.json();
      const providers = (d?.data?.providers ?? []) as Array<{id:string;pricePerCall:string;completedCalls:string;slashedCalls:string}>;
      const maxPrice = parseFloat(autoMaxPrice);
      const minRep = parseFloat(autoMinRep);
      const filtered = providers.filter(p => {
        const price = parseFloat(formatUnits(BigInt(p.pricePerCall || "0"), 6));
        const total = parseInt(p.completedCalls || "0") + parseInt(p.slashedCalls || "0") + 3;
        const rep = ((parseInt(p.completedCalls || "0") + 2) / total) * 100;
        return price <= maxPrice && rep >= minRep;
      });
      if (filtered.length === 0) setAutoResult("No providers match your criteria.");
      else {
        const best = filtered.sort((a, b) => {
          const repA = ((parseInt(a.completedCalls || "0") + 2) / (parseInt(a.completedCalls || "0") + parseInt(a.slashedCalls || "0") + 3)) * 100;
          const repB = ((parseInt(b.completedCalls || "0") + 2) / (parseInt(b.completedCalls || "0") + parseInt(b.slashedCalls || "0") + 3)) * 100;
          return repB - repA;
        })[0];
        setAutoResult(`Best match: Provider #${best.id} — price ${formatUnits(BigInt(best.pricePerCall || "0"), 6)} USDC`);
        setCallProvider(best.id);
      }
    } catch { setAutoResult("Error fetching providers."); }
    setAutoLoading(false);
  };

  const runMultiCall = async () => {
    const ids = multiProvider.split(",").map(s => s.trim()).filter(Boolean);
    if (!ids.length || !address) return;
    setMultiRunning(true);
    setMultiResults([]);
    for (const pid of ids) {
      for (let i = 0; i < multiCount; i++) {
        try {
          const reqHash = keccak256(stringToBytes(`${multiPayload}-${pid}-${i}-${Date.now()}`)) as `0x${string}`;
          const hash = await writeContractAsync({
            address: CONFIG.ppcAddress as `0x${string}`,
            abi: PPC_ABI,
            functionName: "callService",
            args: [BigInt(pid), reqHash],
          });
          setMultiResults(r => [...r, { pid, hash }]);
        } catch (_err: unknown) { const e = _err as any;
          setMultiResults(r => [...r, { pid, err: e.shortMessage || (e instanceof Error ? e.message : String(e)) }]);
        }
        await new Promise(r => setTimeout(r, 600));
      }
    }
    setMultiRunning(false);
  };

  const shorten = (addr: string) => `${addr.slice(0,6)}…${addr.slice(-4)}`;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.badge}><span style={s.dot} />Arc Testnet · Live</div>
      <h1 style={s.h1}>Overview</h1>
      <p style={s.sub}>Monitor services, requests and settlements on Arc Testnet.</p>

      {/* USDC balance */}
      {usdcFormatted && (
        <div style={{ ...s.section, display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",marginBottom:12 }}>
          <span style={{ fontSize:12,color:"var(--text-dim)" }}>Your USDC Balance</span>
          <span style={{ fontSize:18,fontWeight:700,color:"var(--accent)",fontFamily:"var(--font-display)" }}>{usdcFormatted} USDC</span>
        </div>
      )}

      {/* Welcome box — shown once after wallet connect */}
      {showWelcome && (
        <div style={{ background:"linear-gradient(135deg,rgba(5,150,105,0.06),rgba(37,99,235,0.04))", border:"1px solid var(--border)", borderRadius:12, padding:"20px 24px", marginBottom:20 }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
            <span style={{ fontSize:16,fontWeight:600,color:"var(--text)" }}>👋 Welcome to CallGuard — here's how to start</span>
            <button onClick={dismissWelcome} style={{ background:"transparent",border:"none",color:"var(--text-faint)",fontSize:20,cursor:"pointer",padding:"0 4px",lineHeight:1 }} title="Dismiss"><X size={16}/></button>
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            {/* Step 1 */}
            <div style={{ display:"grid",gridTemplateColumns:"28px 1fr auto",gap:12,alignItems:"center",padding:"10px 12px",background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:8 }}>
              <div style={{ width:28,height:28,borderRadius:"50%",background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0 }}>1</div>
              <div style={{ fontSize:13 }}>
                <strong style={{ color:"var(--text)" }}>Get testnet USDC</strong><br/>
                <span style={{ color:"var(--text-dim)" }}>You need USDC to stake or to pay for calls. On Arc it's also the gas token.</span>
              </div>
              <a href="https://faucet.circle.com/?chain=arc-testnet" target="_blank" rel="noreferrer" style={{ padding:"5px 12px",borderRadius:6,background:"var(--bg-3)",border:"1px solid var(--border)",color:"var(--text)",fontSize:12,cursor:"pointer",textDecoration:"none",whiteSpace:"nowrap" as const }}>Open faucet →</a>
            </div>
            {/* Step 2 */}
            <div style={{ display:"grid",gridTemplateColumns:"28px 1fr auto",gap:12,alignItems:"center",padding:"10px 12px",background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:8 }}>
              <div style={{ width:28,height:28,borderRadius:"50%",background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0 }}>2</div>
              <div style={{ fontSize:13 }}>
                <strong style={{ color:"var(--text)" }}>Pick a role</strong><br/>
                <span style={{ color:"var(--text-dim)" }}><strong style={{ color:"var(--accent)" }}>Provider</strong> = sell API calls, stake USDC, earn per request. &nbsp;<strong style={{ color:"var(--info)" }}>Caller</strong> = pay USDC to use a service with an SLA guarantee.</span>
              </div>
              <button onClick={() => setPanel("register")} style={{ padding:"5px 12px",borderRadius:6,background:"var(--bg-3)",border:"1px solid var(--border)",color:"var(--text)",fontSize:12,cursor:"pointer",whiteSpace:"nowrap" as const }}>Register →</button>
            </div>
            {/* Step 3 */}
            <div style={{ display:"grid",gridTemplateColumns:"28px 1fr auto",gap:12,alignItems:"center",padding:"10px 12px",background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:8 }}>
              <div style={{ width:28,height:28,borderRadius:"50%",background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0 }}>3</div>
              <div style={{ fontSize:13 }}>
                <strong style={{ color:"var(--text)" }}>Make your first call</strong><br/>
                <span style={{ color:"var(--text-dim)" }}>Call provider #1 to see the full SLA lifecycle — escrow, receipt, payout.</span>
              </div>
              <button onClick={() => setPanel("calls")} style={{ padding:"5px 12px",borderRadius:6,background:"linear-gradient(135deg,#10b981,#059669)",border:"none",color:"#fff",fontSize:12,cursor:"pointer",whiteSpace:"nowrap" as const }}>Call a service →</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats — count-up animated */}
      <div style={s.grid4} className="stagger">
        {[
          { label:"Providers",   val: animProviders || providerCount, raw: providerCount, sub:"registered" },
          { label:"Total Calls", val: animCalls || calls,             raw: callsNum,      sub:"all-time" },
          { label:"Receipts",    val: animReceipts || receipts,       raw: receiptsNum,   sub:"SLA honored" },
          { label:"Honor Rate",  val: honorRate,                      raw: 0,             sub:`${slashesNum} slashes` },
        ].map(c => (
          <div key={c.label} style={s.card}>
            <div style={s.cardLabel}>{c.label}</div>
            <div className="count-up" style={{ ...s.cardVal, color: c.label==="Honor Rate" && honorRate!=="—" && parseInt(honorRate)<50 ? "var(--danger)" : "var(--text)" }}>{String(c.val)}</div>
            <div style={s.cardSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ACTIONS */}
      <div style={s.section}>
        <div style={s.sectionTitle}>ACTIONS</div>

        {/* Quick Call */}
        <div style={{ marginBottom:12 }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
            <div>
              <div style={{ fontSize:13,fontWeight:500,color:"var(--text)" }}>Call a service</div>
              <div style={{ fontSize:11,color:"var(--text-dim)" }}>Pay per request · EIP-3009 gasless</div>
            </div>
            <button style={s.btn()} onClick={() => setPanel("calls")}>Call Builder →</button>
          </div>
          <div style={{ display:"flex",gap:8,alignItems:"center" }}>
            <input style={{ ...s.input, width:100 }} placeholder="Provider ID" value={callProvider} onChange={e => setCallProvider(e.target.value)} />
            <button style={s.btn()} onClick={() => { setPanel("calls"); }}>Quick Call</button>
          </div>
        </div>

        <div style={{ height:1, background:"var(--border)", margin:"12px 0" }} />

        {/* Register as provider */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:13,fontWeight:500,color:"var(--text)" }}>Register as provider</div>
            <div style={{ fontSize:11,color:"var(--text-dim)" }}>Stake USDC · Define your SLA terms</div>
          </div>
          <button style={s.btn("secondary")} onClick={() => setPanel("register")}>Register →</button>
        </div>

        <div style={{ height:1, background:"var(--border)", margin:"12px 0" }} />

        {/* Auto-router */}
        <div style={s.accordion}>
          <div style={s.accordionHeader} onClick={() => setAutoOpen(o => !o)}>
            <div>
              <div style={{ fontSize:13,fontWeight:500,color:"var(--text)" }}>Auto-router</div>
              <div style={{ fontSize:11,color:"var(--text-dim)" }}>Best provider by reputation score</div>
            </div>
            {autoOpen ? <ChevronUp size={14} color="var(--text-faint)" /> : <ChevronDown size={14} color="var(--text-faint)" />}
          </div>
          {autoOpen && (
            <div style={s.accordionBody}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:11,color:"var(--text-dim)",marginBottom:4 }}>Max price (USDC)</div>
                  <input style={s.input} value={autoMaxPrice} onChange={e => setAutoMaxPrice(e.target.value)} placeholder="2.0" />
                </div>
                <div>
                  <div style={{ fontSize:11,color:"var(--text-dim)",marginBottom:4 }}>Min reputation %</div>
                  <input style={s.input} value={autoMinRep} onChange={e => setAutoMinRep(e.target.value)} placeholder="50" />
                </div>
              </div>
              <button style={{ ...s.btn(), width:"100%",justifyContent:"center" }} onClick={runAutoRouter} disabled={autoLoading}>
                {autoLoading ? <><RefreshCw size={12} />Finding best provider…</> : <><Zap size={12} />Find best provider</>}
              </button>
              {autoResult && (
                <div style={{ marginTop:10,padding:"8px 12px",borderRadius:8,background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",fontSize:12,color:"var(--accent)" }}>
                  {autoResult}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Multi-call */}
        <div style={s.accordion}>
          <div style={s.accordionHeader} onClick={() => setMultiOpen(o => !o)}>
            <div>
              <div style={{ fontSize:13,fontWeight:500,color:"var(--text)" }}>Multi-provider call</div>
              <div style={{ fontSize:11,color:"var(--text-dim)" }}>Parallel calls · Fastest receipt wins</div>
            </div>
            {multiOpen ? <ChevronUp size={14} color="var(--text-faint)" /> : <ChevronDown size={14} color="var(--text-faint)" />}
          </div>
          {multiOpen && (
            <div style={s.accordionBody}>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11,color:"var(--text-dim)",marginBottom:4 }}>Provider IDs (comma separated)</div>
                <input style={s.input} value={multiProvider} onChange={e => setMultiProvider(e.target.value)} placeholder="1,2,3" />
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11,color:"var(--text-dim)",marginBottom:4 }}>Request payload</div>
                <input style={s.input} value={multiPayload} onChange={e => setMultiPayload(e.target.value)} placeholder="ping" />
              </div>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
                <span style={{ fontSize:11,color:"var(--text-dim)" }}>Calls to send per provider</span>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <button style={{ ...s.btn("secondary"),padding:"4px 10px" }} onClick={() => setMultiCount(c => Math.max(1,c-1))}>−</button>
                  <span style={{ fontFamily:"var(--font-mono)",fontSize:13 }}>{multiCount}</span>
                  <button style={{ ...s.btn("secondary"),padding:"4px 10px" }} onClick={() => setMultiCount(c => Math.min(10,c+1))}>+</button>
                </div>
              </div>
              <div style={{ padding:"8px 12px",borderRadius:8,background:"var(--bg-3)",fontSize:11,color:"var(--text-dim)",marginBottom:10 }}>
                Cost: ~{multiProvider.split(",").filter(Boolean).length * multiCount} USDC total
              </div>
              <button
                style={{ ...s.btn(),width:"100%",justifyContent:"center",opacity:multiRunning||!address?0.5:1 }}
                onClick={runMultiCall}
                disabled={multiRunning || !address}
              >
                {multiRunning ? `Running (${multiResults.length}/${multiProvider.split(",").filter(Boolean).length * multiCount})…` : "Run multi-call →"}
              </button>
              {multiResults.length > 0 && (
                <div style={{ marginTop:10,maxHeight:100,overflowY:"auto" as const }}>
                  {multiResults.map((r,i) => (
                    <div key={i} style={{ display:"flex",gap:8,fontSize:11,padding:"3px 0",borderBottom:"1px solid var(--border)" }}>
                      <span style={{ color:"var(--text-faint)",width:40 }}>P#{r.pid}</span>
                      {r.hash
                        ? <a href={`https://explorer.testnet.arc.io/tx/${r.hash}`} target="_blank" rel="noreferrer" style={{ color:"var(--accent)",fontFamily:"var(--font-mono)" }}>{r.hash.slice(0,14)}…</a>
                        : <span style={{ color:"#ef4444" }}>{r.err}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Activity — real-time watchContractEvent + subgraph fallback */}
      <div style={s.section}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
          <div style={s.sectionTitle}>LIVE ACTIVITY</div>
          <span style={{ fontSize:10,color:"var(--accent)",display:"flex",alignItems:"center",gap:4 }}>
            <span style={{ width:6,height:6,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s infinite",display:"inline-block" }} />
            live
          </span>
        </div>
        {/* Real-time events from watchContractEvent */}
        {liveEvents.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {liveEvents.slice(0, 5).map((e, i) => (
              <div key={i} style={{ ...s.actItem, padding:"6px 0" }}>
                <span style={{ fontSize:14,flexShrink:0 }}>{e.icon}</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:12,color:"var(--text)",fontWeight:500 }}>{e.label}</div>
                  <div style={{ fontSize:11,color:"var(--text-dim)" }}>{e.detail} · {e.time}</div>
                </div>
              </div>
            ))}
            {activities.length > 0 && <div style={{ borderTop:"1px solid var(--border)",margin:"8px 0",fontSize:10,color:"var(--text-faint)",textAlign:"center" }}>subgraph history</div>}
          </div>
        )}
        {/* Subgraph fallback */}
        {activities.length === 0 && liveEvents.length === 0 ? (
          <div style={{ textAlign:"center",padding:"20px 0",color:"var(--text-faint)",fontSize:12 }}>Waiting for on-chain events…</div>
        ) : activities.map((a: {id:string;status:string;providerId:string;amount:string;createdAt:string}) => (
          <div key={a.id} style={s.actItem}>
            <div style={s.statusDot(a.status)} />
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:2 }}>
                <span style={{ fontSize:11,fontWeight:600,padding:"1px 6px",borderRadius:4,background:a.status==="STARTED"?"rgba(16,185,129,0.1)":a.status==="SLASHED"?"rgba(239,68,68,0.1)":"rgba(59,130,246,0.1)",color:a.status==="STARTED"?"var(--accent)":a.status==="SLASHED"?"var(--danger)":"#60a5fa" }}>{a.status}</span>
                <span style={{ fontSize:12,color:"var(--text)" }}>provider #{a.providerId}</span>
              </div>
              <div style={{ fontSize:11,color:"var(--text-dim)" }}>
                {Number(formatUnits(BigInt(a.amount || "0"), 6)).toFixed(2)} USDC · {a.id && <a href={`${ARCSCAN}/tx/${a.id}`} target="_blank" rel="noreferrer" style={s.link}>{shorten(a.id)}<ExternalLink size={10} /></a>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Top Providers */}
      {topProviders.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>TOP PROVIDERS</div>
          {topProviders.map((p: {id:string;completedCalls:string;slashedCalls:string}, i:number) => {
            const total = parseInt(p.completedCalls||"0") + parseInt(p.slashedCalls||"0") + 3;
            const rep = Math.round(((parseInt(p.completedCalls||"0") + 2) / total) * 100);
            return (
              <div key={p.id} style={{ ...s.row, alignItems:"center" }}>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <span style={{ fontSize:11,color:"var(--text-faint)",width:16,textAlign:"center" }}>{i+1}</span>
                  <span style={{ fontSize:13,color:"var(--text)" }}>Provider #{p.id}</span>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{ width:60,height:4,borderRadius:2,background:"var(--bg-3)",overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${rep}%`,background:rep>50?"var(--accent)":"var(--danger)",borderRadius:2 }} />
                  </div>
                  <span style={{ fontSize:11,fontFamily:"var(--font-mono)",color:"var(--text-dim)",width:36,textAlign:"right" }}>{rep}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 24h Activity Chart */}
      <div style={s.section}>
        <div style={{ ...s.sectionTitle, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>24H ACTIVITY CHART</span>
          <span style={{ fontSize:11, color:"var(--text-faint)", fontFamily:"var(--font-mono)", textTransform:"none", letterSpacing:0 }}>
            {chartData.reduce((s, b) => s + b.count, 0)} calls
          </span>
        </div>
        {chartData.every(b => b.count === 0) ? (
          <div style={{ padding: "8px 0 12px" }}>
            {/* Fallback sparkline with gentle wave */}
            <Sparkline data={Array.from({ length: 24 }, (_, i) => 3 + Math.sin(i * 0.4) * 2 + 0.5)} color="#10b981" height={56} />
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 11, color: "var(--text-faint)" }}>No calls in last 24h — showing baseline</div>
          </div>
        ) : (
          <div>
            {/* SVG sparkline curve — hero style */}
            <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 8, background: "var(--bg-1)", padding: "8px 0 4px" }}>
              <Sparkline data={chartData.map(b => b.count)} color="#10b981" height={56} />
            </div>
            {/* Bar chart */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40, marginBottom: 4 }}>
              {(() => {
                const maxCount = Math.max(...chartData.map(b => b.count), 1);
                return chartData.map((b, i) => (
                  <div
                    key={i}
                    title={`${b.hour}:00 — ${b.count} call${b.count !== 1 ? "s" : ""}`}
                    style={{
                      flex: 1,
                      height: `${Math.max(3, (b.count / maxCount) * 36)}px`,
                      background: b.count > 0 ? "var(--accent)" : "var(--bg-3)",
                      borderRadius: "2px 2px 0 0",
                      opacity: b.count > 0 ? 0.75 : 0.2,
                      transition: "height 0.3s",
                      cursor: "default",
                    }}
                  />
                ));
              })()}
            </div>
            {/* Hour labels */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
              {[0, 6, 12, 18, 23].map(h => (
                <span key={h}>{String(h).padStart(2, "0")}h</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Deployed Contracts */}
      <div style={s.section}>
        <div style={s.sectionTitle}>DEPLOYED CONTRACTS</div>
        <div style={s.contractGrid}>
          {CONTRACTS.map(c => (
            <div key={c.name} style={s.contractCard}>
              <div style={s.contractName}>{c.name}</div>
              <a href={`${ARCSCAN}/address/${c.addr}`} target="_blank" rel="noreferrer" style={s.link}>
                {shorten(c.addr)}<ExternalLink size={10} />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
