import { useState, useEffect, useRef, useCallback } from "react";
import { useModal } from "connectkit";
import { useSubgraph } from "../hooks/useSubgraph";
import { useAppStore } from "../store/useAppStore";

/* ── subgraph query — real Goldsky schema ── */
const Q = `{
  calls(first:200,orderBy:createdAt,orderDirection:desc){id status amount createdAt providerId}
  providers(first:50,orderBy:createdAt,orderDirection:desc){id owner pricePerCall stake active completedCalls slashedCalls createdAt}
}`;
type Provider = { id:string; owner:string; pricePerCall:string; stake:string; active:boolean; completedCalls:string; slashedCalls:string; createdAt:string };
type CGData = {
  calls: { id:string; status:string; amount:string; createdAt:string; providerId:string }[];
  providers: Provider[];
};

/* ── canvas sparkline ── */
function SparklineCanvas({ calls }: { calls: CGData["calls"] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.offsetWidth || 640;
    const H = canvas.offsetHeight || 60;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const buckets: number[] = Array(20).fill(0);
    if (calls.length) {
      const sorted = [...calls].sort((a,b)=>Number(a.createdAt)-Number(b.createdAt)).slice(-200);
      const min = Number(sorted[0].createdAt);
      const max = Number(sorted[sorted.length-1].createdAt)||min+1;
      sorted.forEach(c=>{
        const idx=Math.min(19,Math.floor(((Number(c.createdAt)-min)/(max-min||1))*20));
        buckets[idx]++;
      });
    }
    // fallback demo data if all zeros
    const peak = Math.max(...buckets, 1);
    const pts = buckets.map((v,i)=>({ x: i*(W/19), y: H - 8 - (v/peak)*(H-16) }));

    // fill
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,"rgba(16,185,129,0.25)");
    grad.addColorStop(1,"rgba(16,185,129,0)");
    ctx.beginPath();
    ctx.moveTo(pts[0].x, H);
    pts.forEach(p=>ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length-1].x, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    pts.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
  }, [calls]);
  return <canvas ref={ref} style={{width:"100%",height:60,display:"block"}} />;
}

/* ── particle dots ── */
const PARTICLES = Array.from({length:12},(_,i)=>({
  top: `${10+Math.random()*80}%`,
  left: `${5+Math.random()*90}%`,
  size: 3+Math.random()*4,
  dur: `${6+Math.random()*8}s`,
  delay: `-${Math.random()*8}s`,
  opacity: 0.3+Math.random()*0.5,
}));

function ParticleDots() {
  return (
    <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
      {PARTICLES.map((p,i)=>(
        <div key={i} className="particle" style={{
          top:p.top, left:p.left,
          width:p.size, height:p.size,
          "--dur":p.dur, "--delay":p.delay,
          opacity:p.opacity,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

/* ── terminal animation lines ── */
const TERM_LINES = [
  { txt: "$ callguard call --provider 1 --payload ping", delay: 0, color: "var(--accent)" },
  { txt: "► Fetching provider #1 from ServiceRegistry...", delay: 600, color: "var(--text-dim)" },
  { txt: "► Opening escrow: 0.001 USDC locked", delay: 1300, color: "var(--text)" },
  { txt: "► Waiting for provider response...", delay: 2000, color: "var(--text-dim)" },
  { txt: '{ "status":"ok","latency":87,"data":"pong" }', delay: 2900, color: "#38bdf8" },
  { txt: "► Submitting EIP-712 receipt on-chain...", delay: 3600, color: "var(--text-dim)" },
  { txt: "✓ RECEIPT VERIFIED — escrow released", delay: 4400, color: "var(--accent)" },
  { txt: "✓ REPUTATION +1 for provider #1", delay: 5000, color: "var(--accent)" },
];

function Terminal() {
  const [lines, setLines] = useState<typeof TERM_LINES>([]);
  const cycleRef = useRef<ReturnType<typeof setTimeout>>();

  const runCycle = useCallback(() => {
    setLines([]);
    const timers: ReturnType<typeof setTimeout>[] = [];
    TERM_LINES.forEach((l, i) => {
      timers.push(setTimeout(() => setLines(prev => [...prev, l]), l.delay));
    });
    // after last line + pause, restart
    const last = TERM_LINES[TERM_LINES.length - 1].delay + 3000;
    cycleRef.current = setTimeout(runCycle, last);
    return () => { timers.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    const cleanup = runCycle();
    return () => { cleanup?.(); if (cycleRef.current) clearTimeout(cycleRef.current); };
  }, [runCycle]);

  return (
    <div className="cgt-terminal">
      <div className="cgt-term-bar">
        <div className="cgt-term-dots">
          {["#ff5f57","#ffbd2e","#28ca41"].map(c=>(
            <span key={c} style={{background:c}} />
          ))}
        </div>
        <span className="cgt-term-title">callguard — arc testnet</span>
      </div>
      <div className="cgt-term-body">
        {lines.map((l,i)=>(
          <span key={i} className="cgt-line" style={{color:l.color}}>
            {l.txt}
          </span>
        ))}
        <span className="cgt-cursor" />
      </div>
    </div>
  );
}

export default function CgLanding() {
  const { setOpen } = useModal();
  const connect = () => setOpen(true);
  const { mode, setMode, theme, setTheme } = useAppStore();

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
  }, [theme]);
  const { data: raw, isLoading: loading } = useSubgraph(Q);
  const data = raw as CGData | undefined;

  const calls     = (data?.calls ?? []) as CGData["calls"];
  const providers = (data?.providers ?? []) as CGData["providers"];
  const total     = calls.length;
  const slashes   = calls.filter((c: CGData["calls"][0])=>c.status==="SLASHED").length;
  const completed = calls.filter((c: CGData["calls"][0])=>c.status==="COMPLETED").length;
  const honorPct  = total>0 ? Math.round(((completed+2)/(total+3))*100) : null;
  // sparkline rendered via canvas component below

  /* live feed: last 8 events */
  const feed = [...calls].reverse().slice(0,8);

  /* ticker time */
  const [clock, setClock] = useState("");
  useEffect(()=>{
    const t=setInterval(()=>setClock(new Date().toLocaleTimeString("en-GB",{hour12:false})),1000);
    setClock(new Date().toLocaleTimeString("en-GB",{hour12:false}));
    return()=>clearInterval(t);
  },[]);

  const howRef = useRef<HTMLElement>(null);

  return (
    <div style={{background:"var(--bg-0)",color:"var(--text)",fontFamily:"var(--font-sans)",minHeight:"100vh"}}>

      {/* ── TICKER ── */}
      <div className="cg-ticker">
        <div className="cg-ticker-track">
          {[
            {l:"PROVIDERS",v:loading?"…":providers.length},
            {l:"CALLS",v:loading?"…":total},
            {l:"HONOR RATE",v:loading?"…":(honorPct!=null?`${honorPct}%`:"…"),accent:true},
            {l:"SLASHES",v:loading?"…":slashes},
            {l:"NETWORK",v:"Arc Testnet",accent:true},
            {l:"CONTRACT",v:"PayPerCall v2"},
            {l:"TIME",v:clock},
            /* duplicate for seamless loop */
            {l:"PROVIDERS",v:loading?"…":providers.length},
            {l:"CALLS",v:loading?"…":total},
            {l:"HONOR RATE",v:loading?"…":(honorPct!=null?`${honorPct}%`:"…"),accent:true},
            {l:"SLASHES",v:loading?"…":slashes},
            {l:"NETWORK",v:"Arc Testnet",accent:true},
          ].map((item,i)=>(
            <span key={i} className="cg-ticker-item">
              <span className="cg-ticker-label">{item.l}</span>
              <span className={`cg-ticker-val${item.accent?" cg-ticker-accent":""}`}>{String(item.v)}</span>
              <span className="cg-ticker-sep">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── TOPBAR ── */}
      <header style={{position:"sticky",top:0,zIndex:100,background:"rgba(7,11,18,0.92)",backdropFilter:"blur(16px)",borderBottom:"1px solid var(--border)",height:48,display:"flex",alignItems:"center",padding:"0 20px",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
          <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#10b981,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>⚡</div>
          <span style={{fontWeight:700,fontSize:15,letterSpacing:"-0.02em"}}>CallGuard</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:99,background:"var(--accent-bg)",border:"1px solid rgba(16,185,129,0.2)",fontSize:11,color:"var(--accent)"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"var(--accent)",display:"inline-block",animation:"pulse-dot 2s ease-in-out infinite"}}/>
            Disconnected
          </div>
          <button
            onClick={connect}
            style={{padding:"6px 14px",borderRadius:8,background:"var(--gradient-brand)",border:"none",color:"#fff",fontWeight:600,fontSize:12,cursor:"pointer",boxShadow:"var(--glow-green)"}}
          >Connect wallet</button>
          <div style={{display:"flex",alignItems:"center",background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:6,overflow:"hidden",fontSize:11,fontWeight:700}}>
            <button onClick={()=>setMode("simple")} style={{padding:"5px 10px",border:"none",cursor:"pointer",background:mode==="simple"?"var(--accent)":"transparent",color:mode==="simple"?"#fff":"var(--text-faint)",transition:"all .15s"}}>Simple</button>
            <button onClick={()=>setMode("pro")} style={{padding:"5px 10px",border:"none",cursor:"pointer",background:mode==="pro"?"var(--accent)":"transparent",color:mode==="pro"?"#fff":"var(--text-faint)",transition:"all .15s"}}>Pro</button>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section style={{textAlign:"center",padding:"80px 24px 56px",position:"relative",overflow:"hidden"}}>
        {/* particle dots — animated */}
        <ParticleDots />
        <div style={{display:"inline-flex",alignItems:"center",gap:6,marginBottom:20,padding:"4px 14px",borderRadius:99,border:"1px solid rgba(16,185,129,0.3)",background:"rgba(16,185,129,0.06)",fontSize:11,fontWeight:600,color:"var(--accent)",letterSpacing:"0.08em"}}>
          5 SLA PROTOCOLS
        </div>
        <h1 style={{fontSize:"clamp(32px,5vw,58px)",fontWeight:800,lineHeight:1.08,letterSpacing:"-0.03em",margin:"0 auto 8px",maxWidth:700}}>
          Service guarantees,
        </h1>
        <h1 style={{fontSize:"clamp(32px,5vw,58px)",fontWeight:800,lineHeight:1.08,letterSpacing:"-0.03em",color:"var(--accent)",margin:"0 auto 24px",fontStyle:"italic",maxWidth:700}}>
          enforced on-chain.
        </h1>
        <p style={{fontSize:16,color:"var(--text-dim)",lineHeight:1.7,maxWidth:560,margin:"0 auto 32px"}}>
          Providers stake USDC and commit to a response-time SLA. Callers pay per request and receive a signed receipt. Miss the deadline — the stake is slashed automatically. No arbitrator. No middleman.
        </p>
        <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:40,flexWrap:"wrap"}}>
          <button onClick={connect} style={{display:"flex",alignItems:"center",gap:8,padding:"12px 24px",borderRadius:10,background:"var(--gradient-brand)",border:"none",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:"var(--glow-green)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
            Connect wallet
          </button>
          <button onClick={()=>howRef.current?.scrollIntoView({behavior:"smooth"})} style={{display:"flex",alignItems:"center",gap:6,padding:"12px 20px",borderRadius:10,background:"var(--bg-2)",border:"1px solid var(--border)",color:"var(--text)",fontWeight:500,fontSize:14,cursor:"pointer"}}>
            How it works
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>

        {/* Live stats row */}
        <div style={{display:"inline-flex",alignItems:"center",gap:0,background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden",margin:"0 auto 32px",flexWrap:"wrap"}}>
          {[
            {n:loading?"—":providers.length,l:"Providers"},
            {n:loading?"—":total,l:"Calls on-chain"},
            {n:loading?"—":slashes,l:"Slashes"},
            {n:"Arc",l:"Network",accent:true},
          ].map((s,i,arr)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"16px 28px",borderRight:i<arr.length-1?"1px solid var(--border)":"none"}}>
              <span style={{fontSize:26,fontWeight:800,letterSpacing:"-0.03em",color:s.accent?"var(--accent)":"var(--text)",fontFamily:"var(--font-display)"}}>{String(s.n)}</span>
              <span style={{fontSize:11,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>{s.l}</span>
            </div>
          ))}
        </div>

        {/* Sparkline — canvas based */}
        <div className="cg-sparkline-wrap">
          <div className="sparkline-header">
            <div className="sparkline-title">
              <span className="live-dot-pulse" />
              Network call activity
            </div>
            <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-faint)"}}>last 20 blocks</span>
          </div>
          <SparklineCanvas calls={calls} />
        </div>
      </section>

      {/* ── ROLE CARDS ── */}
      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,maxWidth:800,margin:"0 auto",padding:"0 24px 56px"}}>
        {[
          {
            icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
            iconBg:"linear-gradient(135deg,#0ea5e9,#0284c7)",
            title:"I want to call a service",
            desc:"Pay USDC per request. Get a full refund plus a stake bonus if the provider misses the SLA deadline.",
            cta:"Get started →",
          },
          {
            icon:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
            iconBg:"linear-gradient(135deg,#10b981,#059669)",
            title:"I want to provide a service",
            desc:"Stake USDC, set your price and SLA window. Earn per call you answer in time. Build on-chain reputation.",
            cta:"Start earning →",
          },
        ].map((card,i)=>(
          <div key={i} onClick={connect} style={{background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:16,padding:"24px",cursor:"pointer",transition:"all 0.2s"}}
            onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="var(--accent)";}}
            onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="var(--border)";}}
          >
            <div style={{width:48,height:48,borderRadius:12,background:card.iconBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,color:"#fff"}}>
              {card.icon}
            </div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>{card.title}</div>
            <div style={{fontSize:13,color:"var(--text-dim)",lineHeight:1.6,marginBottom:16}}>{card.desc}</div>
            <div style={{fontSize:13,color:"var(--accent)",fontWeight:600}}>{card.cta}</div>
          </div>
        ))}
      </section>

      {/* ── TERMINAL / HOW IT WORKS ── */}
      <section style={{maxWidth:1000,margin:"0 auto",padding:"0 24px 72px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:48,alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"var(--accent)",textTransform:"uppercase",marginBottom:12}}>How it works</div>
          <h2 style={{fontSize:"clamp(24px,3vw,36px)",fontWeight:800,letterSpacing:"-0.03em",lineHeight:1.15,marginBottom:16}}>One contract.<br/>Zero intermediaries.</h2>
          <p style={{fontSize:14,color:"var(--text-dim)",lineHeight:1.7,marginBottom:20}}>
            A provider stakes USDC and sets a response window. The caller locks funds in escrow. Provider delivers off-chain, signs a receipt on-chain. Funds release automatically. Miss the window — stake is slashed, caller gets paid.
          </p>
          <ul style={{listStyle:"none",display:"flex",flexDirection:"column",gap:8}}>
            {["Fully permissionless — anyone can register","EIP-712 typed receipts — readable in MetaMask","Bayesian reputation score — on-chain, readable by contracts","Pay from any chain via CCTP"].map((item,i)=>(
              <li key={i} style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:13,color:"var(--text-dim)"}}>
                <span style={{color:"var(--accent)",flexShrink:0,marginTop:1}}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <Terminal/>
      </section>

      {/* ── FEATURES GRID ── */}
      <section style={{maxWidth:960,margin:"0 auto",padding:"0 24px 72px",textAlign:"center"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"var(--accent)",textTransform:"uppercase",marginBottom:12}}>Protocol v4</div>
        <h2 style={{fontSize:"clamp(22px,3vw,34px)",fontWeight:800,letterSpacing:"-0.02em",marginBottom:8}}>Built for the AI economy.</h2>
        <p style={{fontSize:14,color:"var(--text-dim)",marginBottom:40}}>Five advanced modules live on Arc Testnet today — each extending the core SLA primitive.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16,textAlign:"left"}}>
          {[
            {icon:"🛡️",color:"var(--accent)",title:"Verifiable AI Output",desc:"Response hash committed on-chain. Community arbiters vote on quality disputes. Stake-weighted majority wins."},
            {icon:"📈",color:"#a78bfa",title:"SLA Futures",desc:"Providers tokenize future capacity as ERC-1155 NFTs. Callers reserve priority slots. NFTs trade on secondary markets."},
            {icon:"💰",color:"#fbbf24",title:"RepFi Lending",desc:"Honor rate > 90%? Borrow USDC stake from the reputation pool. DeFi meets SLA enforcement."},
            {icon:"🤖",color:"#38bdf8",title:"Autonomous Agent Loop",desc:"ERC-4337 smart wallet with daily spend limit. Any AI (Claude, GPT, Llama) calls services with zero human approval."},
            {icon:"🔗",color:"var(--danger)",title:"SLA Attestation Bridge",desc:'Any protocol queries CallGuard: "Did this provider honor X calls?" On-chain attestation, CCIP-ready cross-chain broadcast.'},
            {icon:"⚡",color:"var(--accent)",title:"USDC-Native Gas",desc:"On Arc, USDC is the gas token. One asset, zero friction. No ETH, no bridging, no separate gas wallet needed."},
          ].map((f,i)=>(
            <div key={i} style={{background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:12,padding:"20px",transition:"border-color 0.2s"}}
              onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=f.color;}}
              onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor="var(--border)";}}
            >
              <div style={{fontSize:24,marginBottom:10}}>{f.icon}</div>
              <div style={{fontWeight:700,fontSize:14,marginBottom:6}}>{f.title}</div>
              <div style={{fontSize:12,color:"var(--text-dim)",lineHeight:1.6}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS — 4 scenarios ── */}
      <section ref={howRef} id="cgHowItWorks" style={{maxWidth:960,margin:"0 auto",padding:"0 24px 72px"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"var(--text-faint)",textTransform:"uppercase",marginBottom:8,textAlign:"center"}}>How it works</div>
        <h2 style={{fontSize:"clamp(22px,3vw,34px)",fontWeight:800,letterSpacing:"-0.02em",textAlign:"center",marginBottom:8}}>Three scenarios, one protocol.</h2>
        <p style={{fontSize:14,color:"var(--text-dim)",textAlign:"center",marginBottom:40}}>Every edge case settles into the same on-chain enforcement layer.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16}}>
          {/* Happy path */}
          <div style={{background:"var(--bg-1)",border:"1px solid rgba(16,185,129,0.3)",borderRadius:12,padding:"20px"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",color:"var(--accent)",background:"var(--accent-bg)",display:"inline-block",padding:"2px 8px",borderRadius:99,marginBottom:12}}>Happy path</div>
            <h3 style={{fontWeight:700,fontSize:15,marginBottom:8}}>Provider honors the SLA</h3>
            <p style={{fontSize:13,color:"var(--text-dim)",lineHeight:1.6,marginBottom:12}}>Provider responds on time, escrow is released, reputation goes up.</p>
            <ol style={{paddingLeft:16,display:"flex",flexDirection:"column",gap:6,fontSize:12,color:"var(--text-dim)",marginBottom:12}}>
              <li>Caller escrows <strong style={{color:"var(--text)"}}>1 USDC</strong> in the contract</li>
              <li>Provider delivers off-chain within the SLA window</li>
              <li>Provider signs receipt, calls <code style={{color:"var(--accent)",fontFamily:"var(--font-mono)"}}>submitReceipt()</code></li>
            </ol>
            <div style={{padding:"8px 12px",background:"var(--accent-bg)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:8,fontSize:12,color:"var(--accent)",fontWeight:600}}>+1 USDC earned · Reputation +1</div>
          </div>
          {/* Timeout */}
          <div style={{background:"var(--bg-1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:12,padding:"20px"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",color:"var(--danger)",background:"var(--danger-bg)",display:"inline-block",padding:"2px 8px",borderRadius:99,marginBottom:12}}>Timeout</div>
            <h3 style={{fontWeight:700,fontSize:15,marginBottom:8}}>Provider misses the deadline</h3>
            <p style={{fontSize:13,color:"var(--text-dim)",lineHeight:1.6,marginBottom:12}}>No response? Caller gets refund + bonus. Provider loses stake.</p>
            <ol style={{paddingLeft:16,display:"flex",flexDirection:"column",gap:6,fontSize:12,color:"var(--text-dim)",marginBottom:12}}>
              <li>Caller escrows <strong style={{color:"var(--text)"}}>1 USDC</strong>, waits for response</li>
              <li>Provider does not respond within the committed window</li>
              <li>Anyone calls <code style={{color:"var(--danger)",fontFamily:"var(--font-mono)"}}>claimTimeout()</code> after deadline</li>
            </ol>
            <div style={{padding:"8px 12px",background:"var(--danger-bg)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,fontSize:12,color:"var(--danger)",fontWeight:600}}>1 USDC refunded + 20% of provider stake</div>
          </div>
          {/* Reputation */}
          <div style={{background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:12,padding:"20px"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",color:"var(--text-dim)",background:"var(--bg-2)",display:"inline-block",padding:"2px 8px",borderRadius:99,marginBottom:12}}>Reputation</div>
            <h3 style={{fontWeight:700,fontSize:15,marginBottom:8}}>Track record, on-chain</h3>
            <p style={{fontSize:13,color:"var(--text-dim)",lineHeight:1.6,marginBottom:12}}>Every call and every slash is immutably recorded. Anyone can read it.</p>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
              {[{l:"New provider",v:"66",c:"var(--text-dim)"},{l:"After 10 calls",v:"92",c:"var(--accent)"},{l:"After 1 slash",v:"50",c:"var(--danger)"}].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:"1px solid var(--border)"}}>
                  <span style={{color:"var(--text-dim)"}}>{r.l}</span>
                  <span style={{fontWeight:700,color:r.c,fontFamily:"var(--font-mono)"}}>{r.v}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,color:"var(--text-faint)",fontFamily:"var(--font-mono)"}}>(good+2)/(total+3)×100 — Bayesian</div>
          </div>
          {/* v4 Rails */}
          <div style={{background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:12,padding:"20px"}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",color:"#a78bfa",background:"rgba(139,92,246,0.1)",display:"inline-block",padding:"2px 8px",borderRadius:99,marginBottom:12}}>v4 Rails</div>
            <h3 style={{fontWeight:700,fontSize:15,marginBottom:8}}>Composable payment rails</h3>
            <p style={{fontSize:13,color:"var(--text-dim)",lineHeight:1.6,marginBottom:12}}>Five ways to pay — all settling into the same SLA enforcement.</p>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[["x402","HTTP 402 agent payments"],["CCTP","Cross-chain via Circle bridge"],["Nano","0.001 USDC gasless micro-pay"],["NFT","ERC-8004 agent identity"],["Jobs","ERC-8183 trustless settlement"]].map(([tag,desc],i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--text-dim)"}}>
                  <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:"var(--bg-2)",border:"1px solid var(--border)",color:"var(--accent)",fontFamily:"var(--font-mono)",flexShrink:0}}>{tag}</span>
                  {desc}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── LIVE PROVIDERS ── */}
      <section style={{maxWidth:960,margin:"0 auto",padding:"0 24px 72px"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"var(--text-faint)",textTransform:"uppercase",marginBottom:8,textAlign:"center"}}>Live on Arc Testnet</div>
        <h2 style={{fontSize:"clamp(18px,2.5vw,28px)",fontWeight:800,letterSpacing:"-0.02em",textAlign:"center",marginBottom:28}}>Browse providers — no wallet needed.</h2>
        {loading ? (
          <div style={{textAlign:"center",color:"var(--text-faint)",padding:32}}>Loading providers…</div>
        ) : providers.length === 0 ? (
          <div style={{textAlign:"center",color:"var(--text-faint)",padding:32}}>No providers registered yet.</div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12}}>
            {providers.slice(0,6).map((p: Provider)=>{
              const tot = Number(p.completedCalls)+Number(p.slashedCalls);
              const honPct = tot>0 ? Math.round(((Number(p.completedCalls)+2)/(tot+3))*100) : 66;
              return (
              <div key={p.id} style={{background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:12,padding:"16px",cursor:"pointer"}} onClick={connect}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontWeight:700,fontSize:13}}>Provider #{p.id}</span>
                  <span style={{fontSize:10,color:p.active?"var(--accent)":"var(--text-faint)",background:p.active?"var(--accent-bg)":"var(--bg-2)",padding:"2px 8px",borderRadius:99,fontWeight:600}}>{p.active?"ACTIVE":"INACTIVE"}</span>
                </div>
                <div style={{fontSize:11,color:"var(--text-faint)",marginBottom:8,fontFamily:"var(--font-mono)",wordBreak:"break-all"}}>
                  {p.owner.slice(0,6)}…{p.owner.slice(-4)}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  {[["Price/call",`${(Number(p.pricePerCall)/1e6).toFixed(4)} USDC`],["Calls",`${p.completedCalls}`],["Stake",`${(Number(p.stake)/1e6).toFixed(0)} USDC`],["Honor",`${honPct}%`]].map(([l,v])=>(
                    <div key={l} style={{background:"var(--bg-2)",borderRadius:6,padding:"6px 8px"}}>
                      <div style={{fontSize:9,color:"var(--text-faint)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{l}</div>
                      <div style={{fontSize:12,fontWeight:600,fontFamily:"var(--font-mono)"}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── LIVE FEED ── */}
      <section style={{maxWidth:960,margin:"0 auto",padding:"0 24px 72px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"var(--text-faint)",textTransform:"uppercase"}}>Live activity</div>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"var(--text-faint)"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"var(--accent)",display:"inline-block",animation:"pulse-dot 2s ease-in-out infinite"}}/>
            streaming from arc testnet
          </div>
        </div>
        <div style={{background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
          {feed.length===0 ? (
            <div style={{padding:24,textAlign:"center",fontSize:12,color:"var(--text-dim)"}}>Connecting to Arc Testnet…</div>
          ) : feed.map(c=>(
            <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:"1px solid var(--border)",fontSize:12}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:c.status==="SLASHED"?"var(--danger)":c.status==="COMPLETED"?"var(--accent)":"var(--warn)",flexShrink:0}}/>
              <span style={{color:"var(--text-dim)",flex:1}}>
                #{c.providerId} <span style={{color:c.status==="SLASHED"?"var(--danger)":c.status==="COMPLETED"?"var(--accent)":"var(--text)"}}>{c.status==="SLASHED"?"slashed":"started"}</span>{" "}
                {(Number(c.amount)/1e6).toFixed(3)} USDC
              </span>
              <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-faint)"}}>
                {Math.round((Date.now()/1000-Number(c.createdAt))/60)}m ago
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CONTRACTS ── */}
      <section style={{maxWidth:960,margin:"0 auto",padding:"0 24px 72px"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"var(--text-faint)",textTransform:"uppercase",marginBottom:16}}>Deployed contracts</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:8}}>
          {[
            ["ServiceRegistry","https://explorer.testnet.arc.io/address/0x9089B80893D0A51a24dE72832449BeBE4A0F9833","0x9089…9833"],
            ["PayPerCall","https://explorer.testnet.arc.io/address/0x101037547677b9F43106dBd6218F7330d6F08B06","0x1010…8B06"],
            ["USDC","https://explorer.testnet.arc.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238","0x1c7D…7238"],
            ["CrossChainReceiver","https://explorer.testnet.arc.io/address/0x28a683A5fAB9B5DC2608089e86d733aB1f116e5c","0x28a6…e5c"],
            ["RegisterWithNFT","https://explorer.testnet.arc.io/address/0x0aBC433356754Cd269bEF9A46273d7a152a0F169","0x0aBC…169"],
            ["AgenticCommerce","https://explorer.testnet.arc.io/address/0x0747EEf0706327138c69792bF28Cd525089e4583","0x0747…583"],
            ["Dispute","https://explorer.testnet.arc.io/address/0xa47162d8e4785d867f05800f35a334fd78575e56","0xa471…5e56"],
            ["DisputeQuality","https://explorer.testnet.arc.io/address/0x3c9bDc353861010A9ebfD8Ae5d31d44C5bb14725","0x3c9b…4725"],
            ["SLAFutures","https://explorer.testnet.arc.io/address/0xa6f194c621eE67559aDcA883824e01F1828e887c","0xa6f1…887c"],
            ["ReputationLoan","https://explorer.testnet.arc.io/address/0xE656dF6512e9d10e555518b7342fd8c81c42B8c0","0xE656…8c0"],
            ["SLAAttestationBridge","https://explorer.testnet.arc.io/address/0x62a63a94a41601fdb8e9d60ed7e56b1e4c4c5da7","0x62a6…5da7"],
            ["AgentWallet","https://explorer.testnet.arc.io/address/0xf73f2Fc55dd985E583516a4614f2A2c1Da0Ae8E6","0xf73f…8E6"],
          ].map(([name,href,short])=>(
            <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"var(--bg-1)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}>
              <span style={{color:"var(--text-dim)"}}>{name}</span>
              <a href={href} target="_blank" rel="noreferrer" style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--accent)",textDecoration:"none"}}>{short}</a>
            </div>
          ))}
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{textAlign:"center",padding:"56px 24px 72px",background:"var(--bg-1)",borderTop:"1px solid var(--border)"}}>
        <h2 style={{fontSize:"clamp(22px,3vw,34px)",fontWeight:800,letterSpacing:"-0.02em",marginBottom:12}}>Ready to get started?</h2>
        <p style={{fontSize:14,color:"var(--text-dim)",marginBottom:28}}>Connect your wallet and make your first on-chain SLA call in under 60 seconds.</p>
        <button onClick={connect} style={{padding:"14px 32px",borderRadius:12,background:"var(--gradient-brand)",border:"none",color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:"var(--glow-green)",marginBottom:16}}>
          Connect wallet →
        </button>
        <br/>
        <a href="https://github.com/muazzezwq/CallGuard" target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:16,color:"var(--text-dim)",fontSize:13,textDecoration:"none",border:"1px solid var(--border)",padding:"8px 18px",borderRadius:99,transition:"all .2s"}}
          onMouseEnter={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor="var(--accent)";(e.currentTarget as HTMLAnchorElement).style.color="var(--accent)";}}
          onMouseLeave={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor="var(--border)";(e.currentTarget as HTMLAnchorElement).style.color="var(--text-dim)";}}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          For protocols → Partnership Brief
        </a>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{borderTop:"1px solid var(--border)",padding:"40px 24px 32px",background:"var(--bg-0)"}}>
        <div style={{maxWidth:960,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:32,marginBottom:32}}>
          {[
            {h:"Arc & Circle",links:[["Arc Network","https://arc.io"],["Arc documentation","https://docs.arc.io"],["Circle Developers","https://developers.circle.com"],["Circle Console","https://console.circle.com"],["Circle","https://circle.com"]]},
            {h:"Testnet tools",links:[["Arc Testnet Faucet","https://faucet.arc.io"],["ArcScan Testnet","https://explorer.testnet.arc.io"],["thirdweb Arc Testnet","https://thirdweb.com/arc-testnet"]]},
            {h:"Project",links:[["GitHub repo","https://github.com/muazzezwq/CallGuard"],["README","https://github.com/muazzezwq/CallGuard/blob/main/README.md"],["Architecture","https://github.com/muazzezwq/CallGuard/blob/main/ARCHITECTURE.md"],["Security","https://github.com/muazzezwq/CallGuard/blob/main/SECURITY.md"],["Deploy guide","https://github.com/muazzezwq/CallGuard/blob/main/DEPLOY.md"]]},
          ].map(col=>(
            <div key={col.h}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--text-faint)",marginBottom:12}}>{col.h}</div>
              {col.links.map(([l,h])=>(
                <a key={l} href={h} target="_blank" rel="noreferrer" style={{display:"block",fontSize:13,color:"var(--text-dim)",textDecoration:"none",marginBottom:7,transition:"color .15s"}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLAnchorElement).style.color="var(--text)";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLAnchorElement).style.color="var(--text-dim)";}}
                >{l}</a>
              ))}
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:24,borderTop:"1px solid var(--border)",flexWrap:"wrap",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--text-faint)"}}>
            <div style={{width:20,height:20,borderRadius:5,background:"var(--gradient-brand)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>⚡</div>
            CallGuard · built on Arc Testnet
          </div>
          <div style={{display:"flex",gap:16,fontSize:12}}>
            <a href="https://explorer.testnet.arc.io/address/0x9089B80893D0A51a24dE72832449BeBE4A0F9833" target="_blank" rel="noreferrer" style={{color:"var(--text-faint)",textDecoration:"none"}}>Registry</a>
            <a href="https://explorer.testnet.arc.io/address/0x101037547677b9F43106dBd6218F7330d6F08B06" target="_blank" rel="noreferrer" style={{color:"var(--text-faint)",textDecoration:"none"}}>PayPerCall</a>
            <a href="https://github.com/muazzezwq/CallGuard/blob/main/LICENSE" target="_blank" rel="noreferrer" style={{color:"var(--text-faint)",textDecoration:"none"}}>MIT License</a>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .cg-ticker { overflow:hidden; background:var(--bg-1); border-bottom:1px solid var(--border); height:28px; display:flex; align-items:center; }
        .cg-ticker-track { display:flex; gap:0; animation:tickerScroll 30s linear infinite; white-space:nowrap; }
        .cg-ticker-track:hover { animation-play-state:paused; }
        @keyframes tickerScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .cg-ticker-item { display:inline-flex; align-items:center; gap:6px; padding:0 16px; font-size:11px; }
        .cg-ticker-label { color:var(--text-faint); font-weight:600; letter-spacing:.06em; text-transform:uppercase; }
        .cg-ticker-val { color:var(--text-dim); font-family:var(--font-mono); }
        .cg-ticker-accent { color:var(--accent) !important; }
        .cg-ticker-sep { color:var(--border-hi); }
      `}</style>
    </div>
  );
}
