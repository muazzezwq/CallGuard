import { useState, useEffect, useRef, useCallback } from "react";
import { useModal } from "connectkit";
import { useSubgraph } from "../hooks/useSubgraph";
import { useAppStore } from "../store/useAppStore";

const SUBGRAPH_Q = `{
  calls(first:200,orderBy:createdAt,orderDirection:desc){id status amount createdAt providerId}
  providers(first:50,orderBy:createdAt,orderDirection:desc){id owner pricePerCall stake active completedCalls slashedCalls createdAt}
}`;
type Call = { id:string; status:string; amount:string; createdAt:string; providerId:string };
type Provider = { id:string; owner:string; pricePerCall:string; stake:string; active:boolean; completedCalls:string; slashedCalls:string; createdAt:string };
type CGData = { calls: Call[]; providers: Provider[] };

/* ─────────────────────────────────────────
   INTERACTIVE NETWORK CANVAS
   Nodes = providers + callers, edges animate along SLA paths
───────────────────────────────────────── */
function NetworkCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    let mouse = { x: -999, y: -999 };

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", e => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    });

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    // nodes
    const nodes = Array.from({ length: 22 }, () => ({
      x: Math.random() * W(),
      y: Math.random() * H(),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 2 + Math.random() * 2.5,
      type: Math.random() > 0.4 ? "provider" : "caller",
      pulse: Math.random() * Math.PI * 2,
    }));

    // packets flying along edges
    type Packet = { from: number; to: number; t: number; speed: number; color: string };
    const packets: Packet[] = [];
    const spawnPacket = () => {
      const from = Math.floor(Math.random() * nodes.length);
      let to = Math.floor(Math.random() * nodes.length);
      while (to === from) to = Math.floor(Math.random() * nodes.length);
      packets.push({ from, to, t: 0, speed: 0.004 + Math.random() * 0.004, color: Math.random() > 0.3 ? "#10b981" : "#38bdf8" });
    };
    for (let i = 0; i < 6; i++) spawnPacket();

    const ACCENT = "#10b981";
    const BLUE   = "#38bdf8";
    const FAINT  = "rgba(16,185,129,0.12)";

    const draw = () => {
      ctx.clearRect(0, 0, W(), H());

      // update nodes
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W()) n.vx *= -1;
        if (n.y < 0 || n.y > H()) n.vy *= -1;
        n.pulse += 0.02;
        // mouse repulsion
        const dx = n.x - mouse.x, dy = n.y - mouse.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 100) { n.vx += dx/dist * 0.08; n.vy += dy/dist * 0.08; }
        n.vx *= 0.99; n.vy *= 0.99;
      });

      // edges between nearby nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d  = Math.sqrt(dx*dx + dy*dy);
          if (d < 140) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(16,185,129,${(1 - d/140) * 0.18})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // packets
      packets.forEach((pk, idx) => {
        pk.t += pk.speed;
        if (pk.t >= 1) {
          packets.splice(idx, 1);
          spawnPacket();
          return;
        }
        const a = nodes[pk.from], b = nodes[pk.to];
        const x = a.x + (b.x - a.x) * pk.t;
        const y = a.y + (b.y - a.y) * pk.t;
        // trail
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = pk.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = pk.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // nodes
      nodes.forEach(n => {
        const glow = 0.5 + 0.5 * Math.sin(n.pulse);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + glow, 0, Math.PI * 2);
        ctx.fillStyle = n.type === "provider" ? ACCENT : BLUE;
        ctx.shadowBlur = 10;
        ctx.shadowColor = n.type === "provider" ? ACCENT : BLUE;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return (
    <canvas
      ref={ref}
      style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"all", opacity:0.55 }}
    />
  );
}

/* ─────────────────────────────────────────
   SLA LIFECYCLE FLOW — animated step diagram
───────────────────────────────────────── */
const SLA_STEPS = [
  { icon:"📤", label:"Caller escrows", sub:"1 USDC locked", color:"#38bdf8" },
  { icon:"⚙️", label:"Provider works", sub:"Off-chain execution", color:"#a78bfa" },
  { icon:"📝", label:"Receipt signed", sub:"EIP-712 on-chain", color:"#10b981" },
  { icon:"✅", label:"Escrow released", sub:"Funds auto-settle", color:"#10b981" },
  { icon:"⭐", label:"Reputation +1", sub:"Bayesian score update", color:"#fbbf24" },
];
const SLASH_PATH = [
  { icon:"⏱️", label:"Deadline missed", sub:"No response", color:"#ef4444" },
  { icon:"⚡", label:"Anyone triggers", sub:"claimTimeout()", color:"#f97316" },
  { icon:"💸", label:"Stake slashed", sub:"20% to caller", color:"#ef4444" },
];

function SlaFlowDiagram() {
  const [active, setActive] = useState(0);
  const [path, setPath] = useState<"happy"|"slash">("happy");
  const steps = path === "happy" ? SLA_STEPS : SLASH_PATH;

  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % steps.length), 1600);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="sla-flow-wrap">
      <div className="sla-flow-tabs">
        <button className={`sla-flow-tab${path==="happy"?" active":""}`} onClick={()=>{setPath("happy");setActive(0);}}>✅ Happy path</button>
        <button className={`sla-flow-tab${path==="slash"?" active red":""}`} onClick={()=>{setPath("slash");setActive(0);}}>⚡ Slash path</button>
      </div>
      <div className="sla-flow-steps">
        {steps.map((s, i) => (
          <div key={i} className="sla-flow-row">
            <div className={`sla-flow-node${i === active ? " active" : i < active ? " done" : ""}`} style={{ "--step-color": s.color } as React.CSSProperties}>
              <span className="sla-flow-icon">{s.icon}</span>
            </div>
            <div className="sla-flow-label">
              <span className="sla-flow-title">{s.label}</span>
              <span className="sla-flow-sub">{s.sub}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`sla-flow-line${i < active ? " done" : ""}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   COUNTER — animate up from 0
───────────────────────────────────────── */
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      const dur = 1200;
      const start = Date.now();
      const tick = () => {
        const p = Math.min(1, (Date.now() - start) / dur);
        const ease = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(ease * target));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* ─────────────────────────────────────────
   SPARKLINE CANVAS
───────────────────────────────────────── */
function SparklineCanvas({ calls }: { calls: Call[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.offsetWidth || 640;
    const H = canvas.offsetHeight || 60;
    canvas.width = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
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
    const peak = Math.max(...buckets, 1);
    const pts = buckets.map((v,i)=>({ x: i*(W/19), y: H - 8 - (v/peak)*(H-16) }));
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,"rgba(16,185,129,0.3)");
    grad.addColorStop(1,"rgba(16,185,129,0)");
    ctx.beginPath();
    ctx.moveTo(pts[0].x, H);
    pts.forEach(p=>ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length-1].x, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    pts.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.shadowBlur = 6;
    ctx.shadowColor = "#10b981";
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [calls]);
  return <canvas ref={ref} style={{width:"100%",height:64,display:"block"}} />;
}

/* ─────────────────────────────────────────
   TERMINAL
───────────────────────────────────────── */
const TERM_LINES = [
  { txt: "$ callguard call --provider 1 --payload ping", color: "#10b981" },
  { txt: "► Fetching provider #1 from ServiceRegistry...", color: "rgba(255,255,255,0.5)", delay: 600 },
  { txt: "► Opening escrow: 0.001 USDC locked", color: "rgba(255,255,255,0.7)", delay: 1300 },
  { txt: "► Awaiting off-chain response...", color: "rgba(255,255,255,0.5)", delay: 2000 },
  { txt: '{ "status":"ok","latency":87,"data":"pong" }', color: "#38bdf8", delay: 2900 },
  { txt: "► Submitting EIP-712 receipt on-chain...", color: "rgba(255,255,255,0.5)", delay: 3600 },
  { txt: "✓ RECEIPT VERIFIED — escrow released", color: "#10b981", delay: 4400 },
  { txt: "✓ REPUTATION +1 → score: 92/100", color: "#10b981", delay: 5000 },
];
function Terminal() {
  const [lines, setLines] = useState<typeof TERM_LINES>([]);
  const cycleRef = useRef<ReturnType<typeof setTimeout>>();
  const runCycle = useCallback(() => {
    setLines([]);
    const timers: ReturnType<typeof setTimeout>[] = [];
    TERM_LINES.forEach(l => {
      timers.push(setTimeout(() => setLines(prev => [...prev, l]), l.delay ?? 0));
    });
    const last = TERM_LINES[TERM_LINES.length-1].delay ?? 0;
    cycleRef.current = setTimeout(() => runCycle(), last + 3000);
    return () => timers.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    const cleanup = runCycle();
    return () => { cleanup?.(); if (cycleRef.current) clearTimeout(cycleRef.current); };
  }, [runCycle]);
  return (
    <div className="cgt-terminal">
      <div className="cgt-term-bar">
        <div className="cgt-term-dots">
          {["#ff5f57","#ffbd2e","#28ca41"].map(c=><span key={c} style={{background:c}}/>)}
        </div>
        <span className="cgt-term-title">callguard — arc testnet</span>
      </div>
      <div className="cgt-term-body">
        {lines.map((l,i)=><span key={i} className="cgt-line" style={{color:l.color}}>{l.txt}</span>)}
        <span className="cgt-cursor"/>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   SCROLL REVEAL WRAPPER
───────────────────────────────────────── */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(e => { if (e[0].isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: 0.12 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? "translateY(0)" : "translateY(28px)",
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────
   COMPARISON TABLE
───────────────────────────────────────── */
const COMPARE = [
  ["Feature","Classic API","CallGuard"],
  ["Payment guarantee","❌ None","✅ USDC stake"],
  ["SLA enforcement","❌ Manual","✅ Auto on-chain"],
  ["Dispute resolution","❌ Lawyer","✅ Smart contract"],
  ["Receipt","❌ Logs only","✅ EIP-712 signed"],
  ["Reputation","❌ Trust us","✅ Bayesian score"],
  ["AI agent support","❌ API key","✅ ERC-4337 wallet"],
];

/* ─────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────── */
export default function CgLanding() {
  const { setOpen } = useModal();
  const connect = () => setOpen(true);
  const { mode, setMode, theme, setTheme } = useAppStore();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  const { data: raw, isLoading: loading } = useSubgraph(SUBGRAPH_Q);
  const data = raw as CGData | undefined;
  const calls     = (data?.calls ?? []) as Call[];
  const providers = (data?.providers ?? []) as Provider[];
  const total   = calls.length;
  const slashes = calls.filter(c=>c.status==="SLASHED").length;
  const completed = calls.filter(c=>c.status==="COMPLETED").length;
  const honorPct = total>0 ? Math.round(((completed+2)/(total+3))*100) : null;
  const feed = [...calls].reverse().slice(0, 6);

  const [clock, setClock] = useState("");
  useEffect(()=>{
    const t=setInterval(()=>setClock(new Date().toLocaleTimeString("en-GB",{hour12:false})),1000);
    setClock(new Date().toLocaleTimeString("en-GB",{hour12:false}));
    return()=>clearInterval(t);
  },[]);

  const howRef = useRef<HTMLElement>(null);

  return (
    <div className="cg-landing" data-theme={theme}>

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
            {l:"PROVIDERS",v:loading?"…":providers.length},
            {l:"CALLS",v:loading?"…":total},
            {l:"HONOR RATE",v:loading?"…":(honorPct!=null?`${honorPct}%`:"…"),accent:true},
            {l:"SLASHES",v:loading?"…":slashes},
            {l:"NETWORK",v:"Arc Testnet",accent:true},
            {l:"CONTRACT",v:"PayPerCall v2"},
            {l:"TIME",v:clock},
          ].map((item,i)=>(
            <span key={i} className={`cg-ticker-item${item.accent?" accent":""}`}>
              <span className="cg-ticker-label">{item.l}</span>
              <span className="cg-ticker-value">{String(item.v)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── TOPBAR ── */}
      <header className="topbar">
        <div className="tb-left">
          <div className="tb-brand-icon">⚡</div>
          <span className="tb-brand-name">CallGuard</span>
        </div>
        <div className="tb-right">
          <div className="net-pill">
            <span className="net-dot" />
            <span>Disconnected</span>
          </div>
          <button className="btn btn-primary" onClick={connect}>Connect wallet</button>
          <div className="tb-mode-toggle">
            <button className={`tb-mode-btn${mode==="simple"?" active":""}`} onClick={()=>setMode("simple")}>Simple</button>
            <button className={`tb-mode-btn${mode==="pro"?" active":""}`} onClick={()=>setMode("pro")}>Pro</button>
          </div>
          <button className="tb-theme-btn" onClick={()=>setTheme(theme==="dark"?"light":"dark")} title="Toggle theme">
            {theme==="dark"?"☀️":"🌙"}
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="cg-hero-section">
        <NetworkCanvas />
        <div className="cg-hero-content">
          <div className="cg-hero-badge">5 SLA PROTOCOLS</div>
          <h1 className="cg-hero-h1">
            Service guarantees,<br />
            <em className="cg-hero-em">enforced on-chain.</em>
          </h1>
          <p className="cg-hero-sub">
            Providers stake USDC and commit to a response-time SLA. Callers pay per request
            and receive a signed receipt. Miss the deadline — the stake is slashed automatically.
            No arbitrator. No middleman.
          </p>
          <div className="cg-hero-ctas">
            <button className="btn btn-primary btn-lg cg-glow-btn" onClick={connect}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight:6}}><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
              Connect wallet
            </button>
            <button className="btn btn-outline btn-lg" onClick={()=>howRef.current?.scrollIntoView({behavior:"smooth"})}>
              How it works ▾
            </button>
          </div>

          {/* live stats grid */}
          <div className="cg-stats-grid">
            {[
              {n:loading?"—":String(providers.length),l:"Providers"},
              {n:loading?"—":String(total),l:"Calls on-chain"},
              {n:loading?"—":String(slashes),l:"Slashes"},
              {n:"Arc",l:"Network",accent:true},
            ].map((s,i,arr)=>(
              <div key={i} className={`cg-stat-cell${i<arr.length-1?" cg-stat-divider":""}`}>
                <span className={`cg-stat-num${s.accent?" accent":""}`}>{s.n}</span>
                <span className="cg-stat-lbl">{s.l}</span>
              </div>
            ))}
          </div>

          {/* sparkline */}
          <div className="cg-sparkline-wrap">
            <div className="sparkline-header">
              <span className="sparkline-title">
                <span className="cg-dot-green" /> NETWORK CALL ACTIVITY
              </span>
              <span style={{fontSize:11,color:"var(--text-faint)"}}>last 20 blocks</span>
            </div>
            <SparklineCanvas calls={calls} />
          </div>
        </div>
      </section>

      {/* ── ROLE CARDS ── */}
      <Reveal>
        <section className="cg-section">
          <div className="cg-roles">
            {[
              { iconBg:"linear-gradient(135deg,#0ea5e9,#0284c7)", icon:"📞", title:"I want to call a service", desc:"Pay USDC per request. Get a full refund plus a stake bonus if the provider misses the SLA deadline.", cta:"Get started →" },
              { iconBg:"linear-gradient(135deg,#10b981,#059669)", icon:"🖥️", title:"I want to provide a service", desc:"Stake USDC, set your price and SLA window. Earn per call you answer in time. Build on-chain reputation.", cta:"Start earning →" },
            ].map((card,i)=>(
              <div key={i} className="cg-role-card" onClick={connect}>
                <div className="cg-role-icon" style={{background:card.iconBg}}>{card.icon}</div>
                <h3 className="cg-role-title">{card.title}</h3>
                <p className="cg-role-desc">{card.desc}</p>
                <span className="cg-role-cta">{card.cta}</span>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── SLA FLOW + TERMINAL ── */}
      <Reveal>
        <section ref={howRef} id="cgHowItWorks" className="cg-section cg-two-col">
          <div>
            <div className="cg-label-sm">How it works</div>
            <h2 className="cg-h2">One contract.<br/>Zero intermediaries.</h2>
            <p className="cg-body-text" style={{marginBottom:24}}>
              A provider stakes USDC and sets a response window. The caller locks funds in escrow.
              Provider delivers off-chain, signs a receipt on-chain. Funds release automatically.
              Miss the window — stake is slashed, caller gets paid.
            </p>
            <SlaFlowDiagram />
          </div>
          <div>
            <Terminal />
          </div>
        </section>
      </Reveal>

      {/* ── LIVE METRICS ── */}
      <Reveal>
        <section className="cg-section cg-metrics-section">
          <div className="cg-label-sm" style={{textAlign:"center"}}>Live network</div>
          <h2 className="cg-h2" style={{textAlign:"center",marginBottom:40}}>Real activity, right now.</h2>
          <div className="cg-metrics-grid">
            {[
              { val: providers.length, suffix:"", label:"Active Providers", color:"#10b981" },
              { val: total, suffix:"", label:"Total Calls On-Chain", color:"#38bdf8" },
              { val: slashes, suffix:"", label:"Slash Events", color:"#ef4444" },
              { val: honorPct??0, suffix:"%", label:"Honor Rate", color:"#fbbf24" },
            ].map((m,i)=>(
              <div key={i} className="cg-metric-card">
                <div className="cg-metric-num" style={{color:m.color}}>
                  <Counter target={m.val} suffix={m.suffix} />
                </div>
                <div className="cg-metric-lbl">{m.label}</div>
                <div className="cg-metric-bar">
                  <div className="cg-metric-bar-fill" style={{width:`${Math.min(100,m.val/Math.max(total,1)*100)}%`,background:m.color}} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── FEATURES GRID ── */}
      <Reveal>
        <section className="cg-section" style={{textAlign:"center"}}>
          <div className="cg-label-sm">Protocol v4</div>
          <h2 className="cg-h2" style={{marginBottom:8}}>Built for the AI economy.</h2>
          <p className="cg-body-text" style={{textAlign:"center",maxWidth:560,margin:"0 auto 40px"}}>
            Five advanced modules live on Arc Testnet — each extending the core SLA primitive.
          </p>
          <div className="cg-features-grid">
            {[
              { icon:"🛡️", color:"#10b981", title:"Verifiable AI Output", desc:"Response hash committed on-chain. Community arbiters vote. Stake-weighted majority wins." },
              { icon:"📈", color:"#a78bfa", title:"SLA Futures", desc:"Providers tokenize future capacity as ERC-1155 NFTs. Callers reserve priority slots." },
              { icon:"💰", color:"#fbbf24", title:"RepFi Lending", desc:"Honor rate > 90%? Borrow USDC from the reputation pool. DeFi meets SLA." },
              { icon:"🤖", color:"#38bdf8", title:"Agent Loop", desc:"ERC-4337 smart wallet with daily spend limit. Any AI calls services with zero human approval." },
              { icon:"🔗", color:"#ef4444", title:"SLA Attestation Bridge", desc:"Any protocol queries CallGuard for cryptographic proof of SLA compliance. CCIP-ready." },
              { icon:"⚡", color:"#10b981", title:"USDC-Native Gas", desc:"On Arc, USDC is the gas token. One asset, zero friction. No ETH needed." },
            ].map((f,i)=>(
              <Reveal key={i} delay={i*60}>
                <div className="cg-feat-card" style={{"--feat-color":f.color} as React.CSSProperties}>
                  <div className="cg-feat-icon">{f.icon}</div>
                  <div className="cg-feat-title">{f.title}</div>
                  <div className="cg-feat-desc">{f.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── COMPARISON TABLE ── */}
      <Reveal>
        <section className="cg-section" style={{textAlign:"center"}}>
          <div className="cg-label-sm">Why CallGuard</div>
          <h2 className="cg-h2" style={{marginBottom:32}}>vs. the old way.</h2>
          <div className="cg-compare-wrap">
            <table className="cg-compare-table">
              <thead>
                <tr>
                  {COMPARE[0].map((h,i)=>(
                    <th key={i} className={i===2?"accent":""}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.slice(1).map((row,i)=>(
                  <tr key={i}>
                    {row.map((cell,j)=>(
                      <td key={j} className={j===2?"accent":""}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      {/* ── LIVE FEED ── */}
      {feed.length > 0 && (
        <Reveal>
          <section className="cg-section">
            <div className="cg-label-sm" style={{textAlign:"center"}}>Live activity</div>
            <h2 className="cg-h2" style={{textAlign:"center",marginBottom:24}}>Latest on-chain events.</h2>
            <div className="cg-feed-list">
              {feed.map((c,i)=>{
                const isSlash = c.status==="SLASHED";
                const amt = c.amount ? (Number(c.amount)/1e6).toFixed(3) : "—";
                return (
                  <div key={i} className="cg-feed-item">
                    <span className={`cg-feed-dot${isSlash?" red":""}`}/>
                    <span className="cg-feed-label">
                      {isSlash?"⚡ Slashed":"● Started"} · provider #{c.providerId}
                    </span>
                    <span className="cg-feed-amt">{amt} USDC</span>
                    <span className="cg-feed-time" title={new Date(Number(c.createdAt)*1000).toLocaleString()}>
                      {Math.round((Date.now()/1000 - Number(c.createdAt))/60)}m ago
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </Reveal>
      )}

      {/* ── LIVE PROVIDERS ── */}
      {providers.length > 0 && (
        <Reveal>
          <section className="cg-section">
            <div className="cg-label-sm" style={{textAlign:"center"}}>Browse providers</div>
            <h2 className="cg-h2" style={{textAlign:"center",marginBottom:24}}>No wallet needed.</h2>
            <div className="cg-providers-grid">
              {providers.slice(0,6).map((p,i)=>{
                const tot = Number(p.completedCalls)+Number(p.slashedCalls);
                const honor = Math.round(((Number(p.completedCalls)+2)/(tot+3))*100);
                const price = p.pricePerCall ? (Number(p.pricePerCall)/1e6).toFixed(4) : "—";
                const stake = p.stake ? (Number(p.stake)/1e6).toFixed(0) : "—";
                return (
                  <div key={i} className="cg-provider-card" onClick={connect}>
                    <div className="cg-provider-head">
                      <div className="cg-provider-id">#{p.id}</div>
                      <div className={`cg-provider-status${p.active?" active":""}`}>{p.active?"ACTIVE":"INACTIVE"}</div>
                    </div>
                    <div className="cg-provider-row"><span>Price/call</span><strong>{price} USDC</strong></div>
                    <div className="cg-provider-row"><span>Stake</span><strong>{stake} USDC</strong></div>
                    <div className="cg-provider-row"><span>Honor rate</span><strong style={{color:honor>70?"var(--accent)":"var(--danger)"}}>{honor}%</strong></div>
                    <div className="cg-honor-bar"><div className="cg-honor-fill" style={{width:`${honor}%`,background:honor>70?"var(--accent)":"var(--danger)"}}/></div>
                  </div>
                );
              })}
            </div>
          </section>
        </Reveal>
      )}

      {/* ── CONTRACTS ── */}
      <Reveal>
        <section className="cg-section">
          <div className="cg-label-sm" style={{textAlign:"center"}}>Deployed contracts</div>
          <h2 className="cg-h2" style={{textAlign:"center",marginBottom:24}}>Everything on-chain.</h2>
          <div className="cg-contracts-grid">
            {[
              ["ServiceRegistry","0xc3ff216999de24a4de8B7626DaFB0e0E4bf38CB"],
              ["PayPerCall","0x389b44b72f502A0dF9b7a4cCAeBC79dDef97Fd4"],
              ["USDC","0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"],
              ["CrossChainReceiver","0x2b6e...a5c"],
              ["RegisterWithNFT","0x8a3bC...287"],
              ["AgenticCommerce","0x6bf7...583"],
            ].map(([name,addr],i)=>(
              <div key={i} className="cg-contract-row">
                <span className="cg-contract-name">{name}</span>
                <a className="cg-contract-addr" href={`https://testnet.arcscan.net/address/${addr}`} target="_blank" rel="noreferrer">
                  {addr.slice(0,10)}…{addr.slice(-4)}
                </a>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── BOTTOM CTA ── */}
      <Reveal>
        <section className="cg-cta-section">
          <div className="cg-cta-glow" />
          <h2 className="cg-cta-h2">Ready to get started?</h2>
          <p className="cg-cta-sub">Connect your wallet and make your first on-chain SLA call in under 60 seconds.</p>
          <button className="btn btn-primary btn-xl cg-glow-btn" onClick={connect}>
            Connect wallet →
          </button>
        </section>
      </Reveal>

      {/* ── FOOTER ── */}
      <footer className="cg-footer">
        <div className="cg-footer-inner">
          <div className="cg-footer-brand">
            <span className="cg-footer-logo">⚡ CallGuard</span>
            <span className="cg-footer-tagline">Built on Arc Testnet</span>
          </div>
          <div className="cg-footer-cols">
            <div>
              <div className="cg-footer-col-title">ARC &amp; CIRCLE</div>
              <a href="https://arc.io" target="_blank" rel="noreferrer">Arc Network</a>
              <a href="https://docs.arc.io" target="_blank" rel="noreferrer">Arc documentation</a>
              <a href="https://developers.circle.com" target="_blank" rel="noreferrer">Circle Developers</a>
            </div>
            <div>
              <div className="cg-footer-col-title">TESTNET TOOLS</div>
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Arc Testnet Faucet</a>
              <a href="https://testnet.arcscan.net" target="_blank" rel="noreferrer">ArcScan Testnet</a>
            </div>
            <div>
              <div className="cg-footer-col-title">PROJECT</div>
              <a href="https://github.com/muazzezwq/CallGuard" target="_blank" rel="noreferrer">GitHub repo</a>
              <a href="/docs/architecture" target="_blank" rel="noreferrer">Architecture</a>
              <a href="/SECURITY.md" target="_blank" rel="noreferrer">Security</a>
            </div>
          </div>
        </div>
        <div className="cg-footer-bottom">
          <span>⚡ CallGuard · built on Arc Testnet</span>
          <div className="cg-footer-links">
            <a href="https://testnet.arcscan.net/address/0xc3ff216999de24a4de8B7626DaFB0e0E4bf38CB" target="_blank" rel="noreferrer">Registry ↗</a>
            <a href="https://testnet.arcscan.net/address/0x389b44b72f502A0dF9b7a4cCAeBC79dDef97Fd4" target="_blank" rel="noreferrer">PayPerCall ↗</a>
            <a href="https://github.com/muazzezwq/CallGuard/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT License</a>
          </div>
        </div>
      </footer>

      {/* Help FAB */}
      <button className="help-fab" onClick={()=>alert("CallGuard docs: https://github.com/muazzezwq/CallGuard")}>?</button>
    </div>
  );
}
