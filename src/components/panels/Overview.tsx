import { useState, useEffect } from "react";
import { useCountUp } from "../../hooks/useCountUp";
import { useReadContract, useWriteContract, useAccount, useWatchContractEvent } from "wagmi";
import { formatUnits, keccak256, stringToBytes } from "viem";
import { CONFIG, REGISTRY_ABI, PPC_ABI, USDC_ABI } from "../../lib/config";
import { useSubgraph } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import {
  PageHeader, SectionCard, StatCard, Stepper, Sparkline, Button,
  Badge, Field, Input,
} from "../../ui";
import type { Step } from "../../ui";
import {
  ExternalLink, Zap, ChevronDown, ChevronUp, RefreshCw, X,
  Radio, ReceiptText, Pencil, Shuffle, Layers,
  ShieldCheck, Server,
} from "lucide-react";

const ARCSCAN = "https://explorer.testnet.arc.io";

const CONTRACTS = [
  { name: "ServiceRegistry", addr: CONFIG.registryAddress },
  { name: "PayPerCall",      addr: CONFIG.ppcAddress },
  { name: "DisputeQuality",  addr: CONFIG.disputeQualityAddress },
  { name: "SLAFutures",      addr: CONFIG.slaFuturesAddress },
  { name: "ReputationLoan",  addr: CONFIG.reputationLoanAddress },
  { name: "SLABridge",       addr: CONFIG.slaAttestationBridge as `0x${string}` },
  { name: "AgentWallet",     addr: CONFIG.agentWallet as `0x${string}` },
  { name: "USDC",            addr: CONFIG.usdcAddress },
];

const SUBGRAPH = `{
  calls(first:1000,orderBy:createdAt,orderDirection:desc){id providerId caller amount status createdAt}
  providers(first:50,orderBy:completedCalls,orderDirection:desc){id completedCalls slashedCalls}
}`;

const OPEN_STATES = new Set(["STARTED", "OPEN", "PENDING"]);
const DAY = 86400;

/* 24h hourly buckets from subgraph calls */
function buildActivityChart(calls: { createdAt: string }[]): { hour: number; count: number }[] {
  const nowTs = Math.floor(Date.now() / 1000);
  const buckets: number[] = new Array(24).fill(0);
  calls.forEach(c => {
    const ts = parseInt(c.createdAt || "0");
    const ageS = nowTs - ts;
    if (ageS >= 0 && ageS < DAY) {
      const hourIdx = Math.floor(ageS / 3600);
      buckets[hourIdx] = (buckets[hourIdx] || 0) + 1;
    }
  });
  return buckets.map((count, i) => ({ hour: 23 - i, count })).reverse();
}

/* 7-day daily buckets, oldest → newest */
function weeklySeries(calls: { createdAt: string }[]): { series: number[]; last7: number; prev7: number } {
  const nowTs = Math.floor(Date.now() / 1000);
  const series = new Array(7).fill(0);
  let last7 = 0, prev7 = 0;
  calls.forEach(c => {
    const age = nowTs - parseInt(c.createdAt || "0");
    const d = Math.floor(age / DAY);
    if (d >= 0 && d < 7) { series[6 - d]++; last7++; }
    else if (d >= 7 && d < 14) prev7++;
  });
  return { series, last7, prev7 };
}

const WB_KEY = "cg_welcome_dismissed";

export default function Overview() {
  const setPanel = useAppStore(s => s.setPanel);
  const role = useAppStore(s => s.role);
  const markStep = useAppStore(s => s.markStep);
  const { address, isConnected } = useAccount();

  const [welcomeDismissed, setWelcomeDismissed] = useState(() =>
    localStorage.getItem(WB_KEY) === "1"
  );
  const showWelcome = isConnected && !welcomeDismissed;
  const dismissWelcome = () => {
    localStorage.setItem(WB_KEY, "1");
    setWelcomeDismissed(true);
  };
  const { data: sg, isLoading: sgLoading } = useSubgraph(SUBGRAPH);

  const { data: providerCountRaw } = useReadContract({ address: CONFIG.registryAddress as `0x${string}`, abi: REGISTRY_ABI, functionName: "nextProviderId" });
  const { data: usdcBal } = useReadContract({ address: CONFIG.usdcAddress as `0x${string}`, abi: USDC_ABI, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address } });

  const sgProviders: any[] = (sg as any)?.providers ?? [];
  const sgCalls: any[] = (sg as any)?.calls ?? [];
  const providerCount = providerCountRaw ? Math.max(0, Number(providerCountRaw) - 1) : sgProviders.length;
  const callsNum = sgCalls.length;
  const completedNum = sgCalls.filter((c: any) => c.status === "COMPLETED").length;

  const animProviders = useCountUp(providerCount);
  const animCalls = useCountUp(callsNum);

  const honorPctNum = callsNum > 0 ? Math.round((completedNum / callsNum) * 100) : null;
  const honorRate = honorPctNum === null ? "—" : `${honorPctNum}%`;
  const usdcFormatted = usdcBal ? Number(formatUnits(usdcBal as bigint, 6)).toFixed(2) : null;

  const { series: weekSeries, last7, prev7 } = weeklySeries(sgCalls);
  const callsDelta = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;

  const escrowRaw = sgCalls
    .filter((c: any) => OPEN_STATES.has(c.status))
    .reduce((sum: bigint, c: any) => sum + BigInt(c.amount || "0"), 0n);
  const escrowUsdc = callsNum > 0 ? Number(formatUnits(escrowRaw, 6)) : null;

  const allCalls = sgCalls;
  const activities = allCalls.slice(0, 6);
  const topProviders = sgProviders;
  const chartData = buildActivityChart(allCalls);
  const latestCall = allCalls[0];

  const flowSteps: Step[] = computeFlowSteps(latestCall);

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

  const [callProvider, setCallProvider] = useState("1");
  const { writeContractAsync } = useWriteContract();
  const [multiResults, setMultiResults] = useState<{ pid: string; hash?: string; err?: string }[]>([]);
  const [multiRunning, setMultiRunning] = useState(false);

  const [liveEvents, setLiveEvents] = useState<{ label: string; detail: string; time: string }[]>([]);
  const pushEvent = (label: string, detail: string) => {
    const e = { label, detail, time: new Date().toLocaleTimeString("en-US", { hour12: false }) };
    setLiveEvents(prev => [e, ...prev].slice(0, 20));
  };

  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: PPC_ABI,
    eventName: "CallStarted",
    onLogs: (logs) => logs.forEach(l => {
      const a = l.args as any;
      pushEvent(`Call → Provider #${a.providerId}`, `${a.amount ? Number(formatUnits(BigInt(a.amount), 6)).toFixed(4) : "?"} USDC · ${String(a.callId || "").slice(0, 10)}…`);
    }),
  });
  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: PPC_ABI,
    eventName: "ReceiptSubmitted",
    onLogs: (logs) => logs.forEach(l => {
      const a = l.args as any;
      pushEvent("Receipt submitted", `callId: ${String(a.callId || "").slice(0, 10)}…`);
    }),
  });
  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: PPC_ABI,
    eventName: "CallSlashed",
    onLogs: (logs) => logs.forEach(l => {
      const a = l.args as any;
      pushEvent("Deadline missed — provider slashed", `${Number(a.slashed || 0) / 1e6} USDC · refund ${Number(a.refunded || 0) / 1e6}`);
    }),
  });

  const runAutoRouter = async () => {
    setAutoLoading(true);
    setAutoResult(null);
    try {
      const res = await fetch(CONFIG.subgraphUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{ providers(first:20,where:{active:true}){ id pricePerCall completedCalls slashedCalls } }` }),
      });
      const d = await res.json();
      const providers = (d?.data?.providers ?? []) as Array<{ id: string; pricePerCall: string; completedCalls: string; slashedCalls: string }>;
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
        } catch (_err: unknown) {
          const e = _err as any;
          setMultiResults(r => [...r, { pid, err: e.shortMessage || (e instanceof Error ? e.message : String(e)) }]);
        }
        await new Promise(r => setTimeout(r, 600));
      }
    }
    setMultiRunning(false);
  };

  const shorten = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  useEffect(() => {
    if (isConnected) markStep("wallet");
    if (sgCalls.some((c: any) => c.caller?.toLowerCase() === address?.toLowerCase())) markStep("action");
    if (sgCalls.some((c: any) => c.status === "COMPLETED" && c.caller?.toLowerCase() === address?.toLowerCase())) markStep("receipt");
  }, [isConnected, sgCalls, address]);

  const myActivity = sgCalls.filter((c: any) =>
    c.caller?.toLowerCase() === address?.toLowerCase()
  ).slice(0, 5);

  const totalCalls24h = chartData.reduce((s, b) => s + b.count, 0);

  return (
    <div className="ov-page">
      <PageHeader
        title="Overview"
        subtitle="Live network, real data, on-chain trust."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setPanel("calls")}>
            <Zap size={14} /> Call Builder
          </Button>
        }
      />

      {/* ── Stat cards ── */}
      <div className="ov-grid4">
        <StatCard
          label="Total Calls"
          value={animCalls || callsNum}
          delta={callsDelta}
          spark={weekSeries}
          loading={sgLoading && callsNum === 0}
          unavailable={!sgLoading && callsNum === 0}
        />
        <StatCard
          label="Active Providers"
          value={animProviders || providerCount}
          loading={sgLoading && providerCount === 0}
          unavailable={!sgLoading && providerCount === 0}
        />
        <StatCard
          label="Escrowed USDC"
          value={escrowUsdc === null ? "—" : escrowUsdc.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          unavailable={escrowUsdc === null}
          loading={sgLoading && callsNum === 0}
        />
        <StatCard
          label="SLA Success Rate"
          value={honorRate}
          unavailable={honorPctNum === null}
          loading={sgLoading && callsNum === 0}
        />
      </div>

      {/* ── Live network + recent activity ── */}
      <div className="ov-2col">
        <SectionCard
          title="Live Network"
          action={<Badge tone="guard" dot>Live</Badge>}
          bodyClass="ui-section__body--flush"
        >
          <div className="ov-net">
            <NetworkGraphBox />
          </div>
          <div className="ov-legend">
            <span className="ov-legend__item"><i style={{ background: "var(--accent)" }} />Call flow</span>
            <span className="ov-legend__item"><i style={{ background: "var(--accent-2)" }} />Provider</span>
            <span className="ov-legend__item"><i style={{ background: "var(--text-dim)" }} />Caller</span>
            <span className="ov-legend__item"><i style={{ background: "var(--danger)" }} />SLA risk</span>
          </div>
        </SectionCard>

        <SectionCard
          title="Recent Activity"
          action={<button className="ov-linkbtn" onClick={() => setPanel("history")}>View all</button>}
          bodyClass="ui-section__body--flush"
        >
          {activities.length === 0 ? (
            <div className="ov-empty">No calls yet — the ledger fills as the network runs.</div>
          ) : (
            <ul className="ov-activity">
              {activities.map((a: any) => {
                const tone = a.status === "SLASHED" ? "slash" : a.status === "COMPLETED" ? "guard" : "info";
                const label = a.status === "COMPLETED" ? "Call completed" : a.status === "SLASHED" ? "SLA timeout" : "Call started";
                return (
                  <li key={a.id} className="ov-activity__row">
                    <span className={`ov-activity__ico ov-activity__ico--${tone}`}>
                      {a.status === "SLASHED" ? <ShieldCheck size={15} /> : a.status === "COMPLETED" ? <ReceiptText size={15} /> : <Radio size={15} />}
                    </span>
                    <span className="ov-activity__body">
                      <span className="ov-activity__title">{label}</span>
                      <span className="ov-activity__sub">
                        Provider #{a.providerId} · {Number(formatUnits(BigInt(a.amount || "0"), 6)).toFixed(2)} USDC
                      </span>
                    </span>
                    <Badge tone={tone}>{a.status === "COMPLETED" ? "Success" : a.status === "SLASHED" ? "Slashed" : "Open"}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* ── Transaction flow + service health ── */}
      <div className="ov-2col">
        <SectionCard title="Transaction Flow">
          {latestCall ? (
            <>
              <Stepper steps={flowSteps} />
              <div className="ov-flow__meta">
                Call #{String(latestCall.id).slice(0, 6)}…{String(latestCall.id).slice(-4)}
              </div>
            </>
          ) : (
            <Stepper steps={computeFlowSteps(null)} />
          )}
        </SectionCard>

        <SectionCard title="Service Health" bodyClass="ui-section__body--flush">
          <ul className="ov-health">
            {[
              { name: "PayPerCall", addr: CONFIG.ppcAddress },
              { name: "ServiceRegistry", addr: CONFIG.registryAddress },
            ].map(c => (
              <li key={c.name} className="ov-health__row">
                <span className="ov-health__name"><Server size={14} />{c.name}</span>
                <a className="ov-health__addr" href={`${ARCSCAN}/address/${c.addr}`} target="_blank" rel="noreferrer">
                  {shorten(c.addr)}<ExternalLink size={10} />
                </a>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* ── Role-aware CTA banner ── */}
      {isConnected && role && (
        <div className={`ov-role ov-role--${role}`}>
          <div>
            <div className="ov-role__title">{role === "provider" ? "Provider Dashboard" : "Caller Dashboard"}</div>
            <div className="ov-role__sub">
              {role === "provider"
                ? "Register your service, set your stake and SLA terms."
                : "Browse providers, call services, and track your receipts."}
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setPanel(role === "provider" ? "register" : "calls")}>
            {role === "provider" ? "Register" : "Make a call"}
          </Button>
        </div>
      )}

      {/* ── USDC balance ── */}
      {usdcFormatted && (
        <div className="ov-balance">
          <span className="ov-balance__label">Your USDC balance</span>
          <span className="ov-balance__val">{usdcFormatted} USDC</span>
        </div>
      )}

      {/* ── Welcome ── */}
      {showWelcome && (
        <SectionCard
          title="Welcome to CallGuard"
          subtitle="Three steps to your first on-chain SLA."
          action={
            <button className="ov-iconbtn" onClick={dismissWelcome} title="Dismiss" aria-label="Dismiss">
              <X size={15} />
            </button>
          }
        >
          <ol className="ov-steps">
            <li className="ov-steps__row">
              <span className="ov-steps__n">1</span>
              <span className="ov-steps__body">
                <strong>Get testnet USDC</strong>
                <span>You need USDC to stake or to pay for calls. On Arc it is also the gas token.</span>
              </span>
              <a className="ov-steps__cta" href="https://faucet.circle.com/?chain=arc-testnet" target="_blank" rel="noreferrer">Open faucet</a>
            </li>
            <li className="ov-steps__row">
              <span className="ov-steps__n">2</span>
              <span className="ov-steps__body">
                <strong>Pick a role</strong>
                <span><b className="c-accent">Provider</b> sells API calls, stakes USDC, earns per request. <b className="c-info">Caller</b> pays USDC for an SLA guarantee.</span>
              </span>
              <button className="ov-steps__cta" onClick={() => setPanel("register")}>Register</button>
            </li>
            <li className="ov-steps__row">
              <span className="ov-steps__n">3</span>
              <span className="ov-steps__body">
                <strong>Make your first call</strong>
                <span>Call provider #1 to see the full SLA lifecycle — escrow, receipt, payout.</span>
              </span>
              <button className="ov-steps__cta ov-steps__cta--primary" onClick={() => setPanel("calls")}>Call a service</button>
            </li>
          </ol>
        </SectionCard>
      )}

      {/* ── My activity ── */}
      {isConnected && myActivity.length > 0 && (
        <SectionCard title="My Activity" action={<button className="ov-linkbtn" onClick={() => setPanel("requests")}>My requests</button>} bodyClass="ui-section__body--flush">
          <ul className="ov-activity">
            {myActivity.map((c: any) => (
              <li key={c.id} className="ov-activity__row">
                <span className={`ov-activity__ico ov-activity__ico--${c.status === "SLASHED" ? "danger" : c.status === "STARTED" ? "info" : "ok"}`}>
                  <ReceiptText size={15} />
                </span>
                <span className="ov-activity__body">
                  <span className="ov-activity__title">Call #{String(c.id).slice(-4)}</span>
                  <span className="ov-activity__sub">{c.amount ? `${Number(formatUnits(BigInt(c.amount), 6)).toFixed(4)} USDC` : ""}</span>
                </span>
                <Badge tone={c.status === "SLASHED" ? "slash" : c.status === "STARTED" ? "info" : "guard"}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ── Actions ── */}
      <SectionCard title="Actions" bodyClass="ui-section__body--flush">
        <div className="ov-actions">
          <div className="ov-actions__row">
            <span className="ov-actions__icon ov-actions__icon--accent"><Zap size={15} /></span>
            <span className="ov-actions__body">
              <span className="ov-actions__title">Call a service</span>
              <span className="ov-actions__sub">Pay per request · EIP-3009 gasless</span>
            </span>
            <div className="ov-actions__ctrl">
              <Input value={callProvider} onChange={(e: any) => setCallProvider(e.target.value)} placeholder="Provider ID" className="ov-input-sm" />
              <Button variant="primary" size="sm" onClick={() => setPanel("calls")}>Quick Call</Button>
            </div>
          </div>

          <div className="ov-actions__row">
            <span className="ov-actions__icon ov-actions__icon--info"><Pencil size={15} /></span>
            <span className="ov-actions__body">
              <span className="ov-actions__title">Register as provider</span>
              <span className="ov-actions__sub">Stake USDC · define your SLA terms</span>
            </span>
            <Button variant="secondary" size="sm" onClick={() => setPanel("register")}>Register</Button>
          </div>

          <div className="ov-accordion">
            <button className="ov-accordion__head" aria-expanded={autoOpen} onClick={() => setAutoOpen(o => !o)}>
              <span className="ov-actions__icon ov-actions__icon--warn"><Shuffle size={15} /></span>
              <span className="ov-actions__body">
                <span className="ov-actions__title">Auto-router</span>
                <span className="ov-actions__sub">Best provider by reputation score</span>
              </span>
              {autoOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {autoOpen && (
              <div className="ov-accordion__body">
                <div className="ov-form2">
                  <Field label="Max price (USDC)"><Input value={autoMaxPrice} onChange={(e: any) => setAutoMaxPrice(e.target.value)} placeholder="2.0" /></Field>
                  <Field label="Min reputation %"><Input value={autoMinRep} onChange={(e: any) => setAutoMinRep(e.target.value)} placeholder="50" /></Field>
                </div>
                <Button variant="primary" size="sm" onClick={runAutoRouter} disabled={autoLoading} className="ov-full">
                  {autoLoading ? <><RefreshCw size={13} /> Finding best provider…</> : <><Zap size={13} /> Find best provider</>}
                </Button>
                {autoResult && <div className="ov-note">{autoResult}</div>}
              </div>
            )}
          </div>

          <div className="ov-accordion">
            <button className="ov-accordion__head" aria-expanded={multiOpen} onClick={() => setMultiOpen(o => !o)}>
              <span className="ov-actions__icon ov-actions__icon--info"><Layers size={15} /></span>
              <span className="ov-actions__body">
                <span className="ov-actions__title">Multi-provider call</span>
                <span className="ov-actions__sub">Parallel calls · fastest receipt wins</span>
              </span>
              {multiOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {multiOpen && (
              <div className="ov-accordion__body">
                <Field label="Provider IDs (comma separated)"><Input value={multiProvider} onChange={(e: any) => setMultiProvider(e.target.value)} placeholder="1,2,3" /></Field>
                <Field label="Request payload"><Input value={multiPayload} onChange={(e: any) => setMultiPayload(e.target.value)} placeholder="ping" /></Field>
                <div className="ov-stepper-row">
                  <span className="ov-actions__sub">Calls per provider</span>
                  <div className="ov-stepper">
                    <button aria-label="Decrease calls per provider" onClick={() => setMultiCount(c => Math.max(1, c - 1))}>−</button>
                    <span>{multiCount}</span>
                    <button aria-label="Increase calls per provider" onClick={() => setMultiCount(c => Math.min(10, c + 1))}>+</button>
                  </div>
                </div>
                <div className="ov-note ov-note--muted">
                  Cost: ~{multiProvider.split(",").filter(Boolean).length * multiCount} USDC total
                </div>
                <Button variant="primary" size="sm" className="ov-full" onClick={runMultiCall} disabled={multiRunning || !address}>
                  {multiRunning ? `Running (${multiResults.length}/${multiProvider.split(",").filter(Boolean).length * multiCount})…` : "Run multi-call"}
                </Button>
                {multiResults.length > 0 && (
                  <div className="ov-results">
                    {multiResults.map((r, i) => (
                      <div key={i} className="ov-results__row">
                        <span className="ov-results__pid">P#{r.pid}</span>
                        {r.hash
                          ? <a href={`${ARCSCAN}/tx/${r.hash}`} target="_blank" rel="noreferrer">{r.hash.slice(0, 14)}…</a>
                          : <span className="c-danger">{r.err}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Live activity ── */}
      <SectionCard
        title="Live Activity"
        action={<span className="ov-live"><span className="live-dot-pulse" />live</span>}
        bodyClass="ui-section__body--flush"
      >
        {liveEvents.length === 0 && activities.length === 0 ? (
          <div className="ov-empty">Waiting for on-chain events…</div>
        ) : (
          <ul className="ov-activity">
            {liveEvents.slice(0, 4).map((e, i) => (
              <li key={`l${i}`} className="ov-activity__row">
                <span className="ov-activity__ico ov-activity__ico--ok"><Radio size={15} /></span>
                <span className="ov-activity__body">
                  <span className="ov-activity__title">{e.label}</span>
                  <span className="ov-activity__sub">{e.detail} · {e.time}</span>
                </span>
              </li>
            ))}
            {activities.map((a: any) => (
              <li key={a.id} className="ov-activity__row">
                <span className={`ov-activity__ico ov-activity__ico--${a.status === "SLASHED" ? "danger" : a.status === "STARTED" ? "info" : "ok"}`}>
                  <Radio size={15} />
                </span>
                <span className="ov-activity__body">
                  <span className="ov-activity__title">Provider #{a.providerId}</span>
                  <span className="ov-activity__sub">
                    {Number(formatUnits(BigInt(a.amount || "0"), 6)).toFixed(2)} USDC
                    {a.id && <> · <a href={`${ARCSCAN}/tx/${a.id}`} target="_blank" rel="noreferrer">{shorten(a.id)}</a></>}
                  </span>
                </span>
                <Badge tone={a.status === "SLASHED" ? "slash" : "guard"}>{a.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ── Top providers ── */}
      {topProviders.length > 0 && (
        <SectionCard title="Top Providers" bodyClass="ui-section__body--flush">
          <ul className="ov-rank">
            {topProviders.map((p: { id: string; completedCalls: string; slashedCalls: string }, i: number) => {
              const total = parseInt(p.completedCalls || "0") + parseInt(p.slashedCalls || "0") + 3;
              const rep = Math.round(((parseInt(p.completedCalls || "0") + 2) / total) * 100);
              return (
                <li key={p.id} className="ov-rank__row">
                  <span className="ov-rank__pos">{i + 1}</span>
                  <span className="ov-rank__name">Provider #{p.id}</span>
                  <span className="ov-rank__bar"><i style={{ width: `${rep}%`, background: rep >= 50 ? "var(--accent)" : "var(--danger)" }} /></span>
                  <span className="ov-rank__val">{rep}%</span>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {/* ── 24h activity ── */}
      <SectionCard
        title="24h Activity"
        action={<span className="ov-mono-dim">{totalCalls24h} calls</span>}
      >
        {totalCalls24h === 0 ? (
          <div className="ov-chart-empty">
            <div className="ov-chart-empty__note">No calls in the last 24h.</div>
          </div>
        ) : (
          <div>
            <div className="ov-chart">
              <Sparkline data={chartData.map(b => b.count)} height={56} color="var(--accent)" />
            </div>
            <div className="ov-bars">
              {(() => {
                const max = Math.max(...chartData.map(b => b.count), 1);
                return chartData.map((b, i) => (
                  <div key={i} title={`${b.hour}:00 — ${b.count} call${b.count !== 1 ? "s" : ""}`}
                    className="ov-bars__bar"
                    style={{ height: `${Math.max(3, (b.count / max) * 36)}px`, opacity: b.count > 0 ? 0.75 : 0.2 }} />
                ));
              })()}
            </div>
            <div className="ov-bars__labels">
              {[0, 6, 12, 18, 23].map(h => <span key={h}>{String(h).padStart(2, "0")}h</span>)}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Deployed contracts ── */}
      <SectionCard title="Deployed Contracts">
        <div className="ov-contracts">
          {CONTRACTS.map(c => (
            <div key={c.name} className="ov-contract">
              <div className="ov-contract__name">{c.name}</div>
              <a href={`${ARCSCAN}/address/${c.addr}`} target="_blank" rel="noreferrer">
                {shorten(c.addr)}<ExternalLink size={10} />
              </a>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/* Lazy import keeps the viz module out of the initial bundle path of other panels. */
function NetworkGraphBox() {
  const [Cmp, setCmp] = useState<null | ((p: any) => JSX.Element)>(null);
  useEffect(() => {
    import("../viz/NetworkGraph").then(m => setCmp(() => m.NetworkGraph));
  }, []);
  if (!Cmp) return <div className="ov-net__placeholder" />;
  return <Cmp labels={["Provider", "Caller"]} seed={5} height={300} nodeScale={1.35} />;
}

function computeFlowSteps(call: { status?: string } | null | undefined): Step[] {
  const s = call?.status;
  const mk = (id: string, label: string, sub: string, state: Step["state"]): Step => ({ id, label, sub, state });

  if (!s) {
    return [
      mk("payment", "Payment", "USDC escrow", "idle"),
      mk("sla", "SLA", "Set by provider", "idle"),
      mk("receipt", "Receipt", "EIP-712 verified", "idle"),
      mk("settlement", "Settlement", "On-chain", "idle"),
    ];
  }
  if (s === "COMPLETED") {
    return [
      mk("payment", "Payment", "USDC", "done"),
      mk("sla", "SLA", "Set by provider", "done"),
      mk("receipt", "Receipt", "EIP-712 verified", "done"),
      mk("settlement", "Settlement", "On-chain", "done"),
    ];
  }
  if (s === "SLASHED" || s === "REFUNDED") {
    return [
      mk("payment", "Payment", "USDC", "done"),
      mk("sla", "SLA", "Deadline missed", "failed"),
      mk("receipt", "Receipt", "No receipt", "idle"),
      mk("settlement", "Settlement", s === "SLASHED" ? "Stake slashed" : "Refunded", "failed"),
    ];
  }
  return [
    mk("payment", "Payment", "USDC", "done"),
    mk("sla", "SLA", "Awaiting receipt", "active"),
    mk("receipt", "Receipt", "EIP-712 verified", "idle"),
    mk("settlement", "Settlement", "On-chain", "idle"),
  ];
}
