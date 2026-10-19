import { useState, useEffect, useMemo } from "react";
import { useCountUp } from "../../hooks/useCountUp";
import {
  useReadContract, useWriteContract, useAccount, useWatchContractEvent,
  useBlockNumber, useChainId,
} from "wagmi";
import { formatUnits, keccak256, stringToBytes } from "viem";
import { CONFIG, REGISTRY_ABI, PPC_ABI, USDC_ABI, arcTestnet } from "../../lib/config";
import { useSubgraph } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import { errText } from "../../lib/utils";
import {
  PageHeader, SectionCard, StatCard, Stepper, Button,
  Badge, Field, Input, Copy, EmptyState, ErrorState,
} from "../../ui";
import type { Step } from "../../ui";
import {
  ExternalLink, Zap, ChevronDown, ChevronUp, RefreshCw, X,
  Radio, ReceiptText, Pencil, Shuffle, Layers,
  ShieldCheck, Server, Activity, Wifi, WifiOff, Database, Clock,
} from "lucide-react";

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
  _meta { block { number timestamp } hasIndexingErrors deployment }
  calls(first:1000,orderBy:createdAt,orderDirection:desc){id providerId caller amount status createdAt}
  providers(first:50,orderBy:completedCalls,orderDirection:desc){id active completedCalls slashedCalls pricePerCall stake}
}`;

const OPEN_STATES = new Set(["STARTED", "OPEN", "PENDING"]);
const CALLS_CAP = 1000;
const DAY = 86400;

type SgCall = {
  id?: string;
  status?: string;
  providerId?: string | number;
  caller?: string;
  amount?: string;
  createdAt?: string;
};

type SgProvider = {
  id: string;
  active?: boolean;
  completedCalls: string;
  slashedCalls: string;
  pricePerCall?: string;
  stake?: string;
};

type SgMeta = {
  block?: { number?: number; timestamp?: number };
  hasIndexingErrors?: boolean;
  deployment?: string;
};

/* ── Formatting helpers ─────────────────────────────────────────────────────
   Every value the dashboard prints comes from the chain or the indexer; these
   only decide how it is written, never what it means. */

function relTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (!Number.isFinite(diff) || diff < 0) return "—";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

function shortId(id: string, head = 10, tail = 6): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}

function usdc(raw: string | bigint | undefined, dp = 2): string {
  return Number(formatUnits(BigInt(raw || "0"), 6)).toLocaleString("en-US", {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  });
}

/* Bayesian reputation, the same formula the registry-facing panels use. */
function repPct(p: { completedCalls?: string; slashedCalls?: string }): number {
  const c = parseInt(p.completedCalls || "0");
  const s = parseInt(p.slashedCalls || "0");
  return Math.round(((c + 2) / (c + s + 3)) * 100);
}

const STATUS_META: Record<string, { label: string; tone: "guard" | "slash" | "info" | "pending" }> = {
  COMPLETED: { label: "Completed", tone: "guard" },
  SLASHED: { label: "Slashed", tone: "slash" },
  REFUNDED: { label: "Refunded", tone: "pending" },
  STARTED: { label: "Started", tone: "info" },
  OPEN: { label: "Open", tone: "info" },
  PENDING: { label: "Pending", tone: "pending" },
};

function statusMeta(status?: string) {
  return STATUS_META[status ?? ""] ?? { label: status || "Unknown", tone: "neutral" as const };
}

/* Status tone is carried by an icon, a label and a value as well as colour, so
   the strip never communicates state by colour alone. */
function StatusItem({ tone, icon, label, value, hint }: {
  tone: "ok" | "warn" | "err" | "unknown";
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className={`ov-status__item ov-status__item--${tone}`}>
      <span className="ov-status__ico">{icon}</span>
      <span className="ov-status__body">
        <span className="ov-status__label">{label}</span>
        <span className="ov-status__value">{value}</span>
        {hint && <span className="ov-status__hint">{hint}</span>}
      </span>
    </div>
  );
}


/* 24h hourly buckets from subgraph calls, oldest first.
   `ago` is hours before now (0 = the current hour), which is what the chart is
   actually plotting — clock hours would need the viewer's timezone. */
function buildActivityChart(calls: { createdAt?: string }[]): { ago: number; count: number }[] {
  const nowTs = Math.floor(Date.now() / 1000);
  const buckets: number[] = new Array(24).fill(0);
  calls.forEach(c => {
    const ts = parseInt(c.createdAt || "0");
    const ageS = nowTs - ts;
    if (ageS >= 0 && ageS < DAY) {
      const ago = Math.floor(ageS / 3600);
      buckets[ago] = (buckets[ago] || 0) + 1;
    }
  });
  return buckets.map((count, ago) => ({ ago, count })).reverse();
}

/* 7-day daily buckets, oldest → newest */
function weeklySeries(calls: { createdAt?: string }[]): { series: number[]; last7: number; prev7: number } {
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
  const { data: sg, isLoading: sgLoading, error: sgError, isFetching: sgFetching, dataUpdatedAt, refetch } = useSubgraph(SUBGRAPH);

  const { data: providerCountRaw } = useReadContract({ address: CONFIG.registryAddress as `0x${string}`, abi: REGISTRY_ABI, functionName: "nextProviderId" });
  const { data: usdcBal } = useReadContract({ address: CONFIG.usdcAddress as `0x${string}`, abi: USDC_ABI, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address } });

  const sgPayload = sg as { providers?: SgProvider[]; calls?: SgCall[]; _meta?: SgMeta } | undefined;
  const sgMeta = sgPayload?._meta;
  const sgProviders: SgProvider[] = sgPayload?.providers ?? [];
  const sgCalls: SgCall[] = useMemo(() => sgPayload?.calls ?? [], [sgPayload]);
  /* The indexer answered with a body, so a zero below is a real zero and not a
     request that failed. */
  const indexerAnswered = !sgError && !!sgPayload;
  const callsNum = sgCalls.length;
  const callsTruncated = callsNum >= CALLS_CAP;

  /* nextProviderId is the registry counter and counts the reserved id 0, so the
     live provider count is one less. Fall back to the indexed count only when
     the contract read has not arrived. */
  const providerCount = providerCountRaw !== undefined
    ? Math.max(0, Number(providerCountRaw) - 1)
    : (indexerAnswered ? sgProviders.length : 0);
  const providersKnown = providerCountRaw !== undefined || indexerAnswered;

  const animProviders = useCountUp(providerCount);
  const animCalls = useCountUp(callsNum);

  const completedNum = sgCalls.filter((c: SgCall) => c.status === "COMPLETED").length;
  const slashedNum = sgCalls.filter((c: SgCall) => c.status === "SLASHED").length;
  const openNum = sgCalls.filter((c: SgCall) => OPEN_STATES.has(c.status ?? "")).length;
  /* The SLA rate is measured over calls that reached a terminal outcome; open
     calls are neither a success nor a failure yet. */
  const settledNum = completedNum + slashedNum;
  const honorPctNum = settledNum > 0 ? Math.round((completedNum / settledNum) * 100) : null;
  const honorRate = honorPctNum === null ? "—" : `${honorPctNum}%`;

  const usdcFormatted = usdcBal ? Number(formatUnits(usdcBal as bigint, 6)).toFixed(2) : null;

  const { series: weekSeries, last7, prev7 } = weeklySeries(sgCalls);
  const callsDelta = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;

  const escrowRaw = sgCalls
    .filter((c: SgCall) => OPEN_STATES.has(c.status ?? ""))
    .reduce((sum: bigint, c: SgCall) => sum + BigInt(c.amount || "0"), 0n);
  const escrowUsdc = indexerAnswered ? Number(formatUnits(escrowRaw, 6)) : null;

  const activeProviders = sgProviders.filter(p => p.active).length;
  const stakeRaw = sgProviders.reduce((s, p) => s + BigInt(p.stake || "0"), 0n);
  const prices = sgProviders.map(p => Number(formatUnits(BigInt(p.pricePerCall || "0"), 6)));
  const priceRange = prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null;

  const allCalls = sgCalls;
  const activities = allCalls.slice(0, 8);
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
      const a = l.args;
      pushEvent(`Call → Provider #${a.providerId}`, `${a.amount ? Number(formatUnits(BigInt(a.amount), 6)).toFixed(4) : "?"} USDC · ${String(a.callId || "").slice(0, 10)}…`);
    }),
  });
  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: PPC_ABI,
    eventName: "ReceiptSubmitted",
    onLogs: (logs) => logs.forEach(l => {
      const a = l.args;
      pushEvent("Receipt submitted", `callId: ${String(a.callId || "").slice(0, 10)}…`);
    }),
  });
  useWatchContractEvent({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: PPC_ABI,
    eventName: "CallSlashed",
    onLogs: (logs) => logs.forEach(l => {
      const a = l.args;
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
        return price <= maxPrice && repPct(p) >= minRep;
      });
      if (filtered.length === 0) setAutoResult("No providers match your criteria.");
      else {
        const best = filtered.sort((a, b) => repPct(b) - repPct(a))[0];
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
          setMultiResults(r => [...r, { pid, err: errText(_err) }]);
        }
        await new Promise(r => setTimeout(r, 600));
      }
    }
    setMultiRunning(false);
  };

  const shorten = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  useEffect(() => {
    if (isConnected) markStep("wallet");
    if (sgCalls.some((c: SgCall) => c.caller?.toLowerCase() === address?.toLowerCase())) markStep("action");
    if (sgCalls.some((c: SgCall) => c.status === "COMPLETED" && c.caller?.toLowerCase() === address?.toLowerCase())) markStep("receipt");
  }, [isConnected, sgCalls, address, markStep]);

  const myActivity = sgCalls.filter((c: SgCall) =>
    c.caller?.toLowerCase() === address?.toLowerCase()
  ).slice(0, 5);

  const totalCalls24h = chartData.reduce((s, b) => s + b.count, 0);
  const peak = chartData.reduce((best, b) => (b.count > best.count ? b : best), { ago: -1, count: 0 });
  const peakAgo = peak.count > 0 ? peak.ago : -1;
  const peakCount = peak.count;

  /* Outcome split over every indexed call, so the counts always add up to the
     Total Calls metric. "Other" covers any state the indexer reports that this
     panel does not know, instead of silently dropping it. */
  const otherNum = callsNum - completedNum - slashedNum - openNum;
  const outcomeRows = [
    { key: "completed", label: "Completed", count: completedNum, color: "var(--accent-ink)" },
    { key: "open", label: "Open", count: openNum, color: "var(--accent-2)" },
    { key: "slashed", label: "Slashed", count: slashedNum, color: "var(--danger)" },
    ...(otherNum > 0 ? [{ key: "other", label: "Other", count: otherNum, color: "var(--text-dim)" }] : []),
  ].map(r => ({ ...r, pct: callsNum > 0 ? Math.round((r.count / callsNum) * 100) : 0 }));

  return (
    <div className="ov-page">
      <PageHeader
        title="Overview"
        subtitle={`Protocol state on ${CONFIG.chainName}, read from the contracts and the indexed subgraph.`}
        actions={
          <>
            <span className="ov-refresh">
              <Clock size={13} aria-hidden="true" />
              {dataUpdatedAt ? `Updated ${relTime(Math.floor(dataUpdatedAt / 1000))}` : "Awaiting first read"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={sgFetching} aria-label="Refresh protocol data">
              <RefreshCw size={14} className={sgFetching ? "ov-spin" : undefined} aria-hidden="true" />
              {sgFetching ? "Refreshing…" : "Refresh"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPanel("calls")}>
              <Zap size={14} aria-hidden="true" /> Call Builder
            </Button>
          </>
        }
      />

      {/* ── Protocol status ── */}
      <ProtocolStatus
        meta={sgMeta}
        indexerAnswered={indexerAnswered}
        indexerLoading={sgLoading}
        indexerError={!!sgError}
      />

      {/* ── Primary metrics ──
          A value is shown as 0 only when the indexer answered, "—" only when the
          source failed, and a skeleton only while the first read is in flight. */}
      <div className="ov-grid4">
        <StatCard
          label="Total Calls"
          value={!indexerAnswered ? "—" : (callsNum > 0 ? animCalls : 0)}
          hint={callsTruncated ? `Capped at the ${CALLS_CAP} most recent calls` : `Every call indexed for this deployment`}
          delta={callsDelta}
          spark={weekSeries}
          loading={sgLoading && !indexerAnswered}
          unavailable={!indexerAnswered && !sgLoading}
        />
        <StatCard
          label="Providers"
          value={!providersKnown ? "—" : (providerCount > 0 ? animProviders : 0)}
          hint="ServiceRegistry nextProviderId − 1 (id 0 is reserved)"
          loading={sgLoading && !providersKnown}
          unavailable={!providersKnown}
        />
        <StatCard
          label="Escrowed USDC"
          value={escrowUsdc === null ? "—" : usdc(escrowRaw, 2)}
          hint={openNum > 0 ? `Held by ${openNum} open call${openNum === 1 ? "" : "s"}` : "No calls are open right now"}
          unavailable={escrowUsdc === null}
          loading={sgLoading && !indexerAnswered}
        />
        <StatCard
          label="SLA Success Rate"
          value={honorRate}
          hint={settledNum > 0 ? `${completedNum} completed of ${settledNum} settled calls` : "No settled calls yet — the rate is unknown, not zero"}
          unavailable={honorPctNum === null}
          loading={sgLoading && !indexerAnswered}
        />
      </div>

      {/* ── Provider network + recent activity ── */}
      <div className="ov-2col">
        <SectionCard
          title="Provider Network"
          subtitle="Aggregated from indexed provider records"
          action={
            <Badge tone={activeProviders > 0 ? "guard" : "neutral"}>
              {indexerAnswered ? `${activeProviders} active` : "—"}
            </Badge>
          }
          bodyClass="ui-section__body--flush"
        >
          {sgError ? (
            <ErrorState
              title="Provider records unavailable"
              description="The indexer request failed, so the provider state cannot be read."
              detail={errText(sgError)}
              action={<Button size="sm" variant="secondary" onClick={() => refetch()}>Retry</Button>}
            />
          ) : sgLoading && !indexerAnswered ? (
            <div className="ov-facts">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="ov-skel" />)}</div>
          ) : sgProviders.length === 0 ? (
            <EmptyState
              icon={<Database size={20} />}
              title="No providers indexed"
              description="No provider has registered for this deployment yet. This is an empty registry, not a failed request."
              action={<Button size="sm" variant="secondary" onClick={() => setPanel("register")}>Register a provider</Button>}
            />
          ) : (
            <ul className="ov-facts">
              <li className="ov-facts__row"><span>Providers indexed</span><b>{sgProviders.length}</b></li>
              <li className="ov-facts__row"><span>Accepting calls</span><b>{activeProviders}</b></li>
              <li className="ov-facts__row"><span>Completed calls (all providers)</span><b>{sgProviders.reduce((s, p) => s + parseInt(p.completedCalls || "0"), 0).toLocaleString("en-US")}</b></li>
              <li className="ov-facts__row"><span>Slashed calls (all providers)</span><b>{sgProviders.reduce((s, p) => s + parseInt(p.slashedCalls || "0"), 0).toLocaleString("en-US")}</b></li>
              <li className="ov-facts__row"><span>Stake locked</span><b>{usdc(stakeRaw, 2)} USDC</b></li>
              <li className="ov-facts__row">
                <span>Price per call</span>
                <b>{priceRange ? (priceRange.min === priceRange.max ? `${priceRange.min.toFixed(2)} USDC` : `${priceRange.min.toFixed(2)} – ${priceRange.max.toFixed(2)} USDC`) : "—"}</b>
              </li>
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent Activity"
          subtitle="Most recent calls, newest first"
          action={<button className="ov-linkbtn" onClick={() => setPanel("history")}>View all</button>}
          bodyClass="ui-section__body--flush"
        >
          {sgError ? (
            <ErrorState
              title="Activity unavailable"
              description="The indexer request failed. No activity is shown rather than an arrangement."
              detail={errText(sgError)}
              action={<Button size="sm" variant="secondary" onClick={() => refetch()}>Retry</Button>}
            />
          ) : sgLoading && !indexerAnswered ? (
            <div className="ov-activity">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="ov-skel ov-skel--row" />)}</div>
          ) : activities.length === 0 ? (
            <EmptyState
              icon={<Activity size={20} />}
              title="No calls indexed yet"
              description="No call has been made against this deployment. The ledger is empty, not unreachable."
              action={<Button size="sm" variant="secondary" onClick={() => setPanel("calls")}>Make the first call</Button>}
            />
          ) : (
            <ul className="ov-activity">
              {activities.map((a: SgCall) => {
                const meta = statusMeta(a.status);
                const icon = a.status === "SLASHED" ? <ShieldCheck size={15} />
                  : a.status === "COMPLETED" ? <ReceiptText size={15} />
                    : <Radio size={15} />;
                const ts = parseInt(a.createdAt || "0");
                return (
                  <li key={a.id} className="ov-activity__row">
                    <span className={`ov-activity__ico ov-activity__ico--${meta.tone === "guard" ? "ok" : meta.tone === "slash" ? "danger" : "info"}`}>{icon}</span>
                    <span className="ov-activity__body">
                      <span className="ov-activity__title">{meta.label} · Provider #{a.providerId}</span>
                      <span className="ov-activity__sub">
                        {usdc(a.amount, 2)} USDC · {ts ? <span title={new Date(ts * 1000).toISOString()}>{relTime(ts)}</span> : "timestamp unavailable"}
                      </span>
                      {a.id && (
                        <span className="ov-activity__id" title={a.id}>
                          <span className="mono">{shortId(a.id)}</span>
                          <Copy value={a.id} label="Copy call id" />
                        </span>
                      )}
                    </span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
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
                <a className="ov-health__addr" href={CONFIG.explorerAddr(c.addr)} target="_blank" rel="noreferrer">
                  {shorten(c.addr)}<ExternalLink size={10} aria-hidden="true" />
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
            {myActivity.map((c: SgCall) => (
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
              <Input value={callProvider} onChange={(e) => setCallProvider(e.target.value)} placeholder="Provider ID" className="ov-input-sm" />
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
                  <Field label="Max price (USDC)"><Input value={autoMaxPrice} onChange={(e) => setAutoMaxPrice(e.target.value)} placeholder="2.0" /></Field>
                  <Field label="Min reputation %"><Input value={autoMinRep} onChange={(e) => setAutoMinRep(e.target.value)} placeholder="50" /></Field>
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
                <Field label="Provider IDs (comma separated)"><Input value={multiProvider} onChange={(e) => setMultiProvider(e.target.value)} placeholder="1,2,3" /></Field>
                <Field label="Request payload"><Input value={multiPayload} onChange={(e) => setMultiPayload(e.target.value)} placeholder="ping" /></Field>
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
                          ? <a href={CONFIG.explorerTx(r.hash)} target="_blank" rel="noreferrer">{r.hash.slice(0, 14)}…</a>
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

      {/* ── On-chain event stream ──
          A live log subscription on PayPerCall. Only events actually received
          are listed; the badge turns active once one has arrived, so the card
          never suggests traffic that is not there. */}
      <SectionCard
        title="On-chain Events"
        subtitle="Live log subscription on PayPerCall — CallStarted, ReceiptSubmitted, CallSlashed"
        action={
          <Badge tone={liveEvents.length > 0 ? "guard" : "neutral"} dot={liveEvents.length > 0}>
            {liveEvents.length > 0 ? `${liveEvents.length} this session` : "Listening"}
          </Badge>
        }
        bodyClass="ui-section__body--flush"
      >
        {liveEvents.length === 0 ? (
          <EmptyState
            icon={<Radio size={20} />}
            title="No events in this session"
            description="The subscription is open. Events appear here only while this page is mounted — silence means the contracts have not emitted, not that the feed is broken."
          />
        ) : (
          <ul className="ov-activity">
            {liveEvents.slice(0, 6).map((e, i) => (
              <li key={`l${i}`} className="ov-activity__row">
                <span className="ov-activity__ico ov-activity__ico--ok"><Radio size={15} /></span>
                <span className="ov-activity__body">
                  <span className="ov-activity__title">{e.label}</span>
                  <span className="ov-activity__sub">{e.detail} · {e.time}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ── Top providers ── */}
      {topProviders.length > 0 && (
        <SectionCard title="Top Providers" bodyClass="ui-section__body--flush">
          <ul className="ov-rank">
            {topProviders.map((p, i) => {
              const rep = Math.round(repPct(p));
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

      {/* ── Analytics ──
          Two charts, each answering one question: when did calls happen, and
          how did they end. Both are computed from the same indexed call list. */}
      <div className="ov-2col">
        <SectionCard
          title="Call Activity (24h)"
          subtitle="Calls created per hour, from indexed timestamps"
          action={<span className="ov-mono-dim">{totalCalls24h} calls</span>}
        >
          {totalCalls24h === 0 ? (
            <EmptyState
              icon={<Activity size={20} />}
              title="No calls in the last 24 hours"
              description="Nothing has been called in this window. This is a measured zero from the indexer, not a missing series."
            />
          ) : (
            <div>
              <div className="ov-bars" role="img" aria-label={`Calls per hour over the last 24 hours. ${totalCalls24h} calls in total, busiest ${peakCount === 0 ? "hour has no calls" : `${peakAgo === 0 ? "in the current hour" : `${peakAgo} hours ago`} with ${peakCount} call${peakCount === 1 ? "" : "s"}`}.`}>
                {chartData.map((b, i) => (
                  <div
                    key={i}
                    title={`${b.ago === 0 ? "This hour" : `${b.ago}h ago`} — ${b.count} call${b.count !== 1 ? "s" : ""}`}
                    className="ov-bars__bar"
                    style={{ height: `${Math.max(3, (b.count / Math.max(peakCount, 1)) * 48)}px`, opacity: b.count > 0 ? 0.8 : 0.2 }}
                  />
                ))}
              </div>
              <div className="ov-bars__labels" aria-hidden="true">
                <span>23h ago</span><span>12h ago</span><span>now</span>
              </div>
              <p className="ov-chart-summary">
                {totalCalls24h} call{totalCalls24h === 1 ? "" : "s"} in the last 24 hours
                {peakCount > 0 && <> · busiest {peakAgo === 0 ? "in the current hour" : `${peakAgo}h ago`} with {peakCount} call{peakCount === 1 ? "" : "s"}</>}
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="SLA Outcomes"
          subtitle="Every indexed call by final state"
          action={<span className="ov-mono-dim">{callsNum} calls</span>}
        >
          {callsNum === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={20} />}
              title="No outcomes to report"
              description="Outcomes appear once calls have been made and settled."
            />
          ) : (
            <div>
              <ul className="ov-bars-h">
                {outcomeRows.map(r => (
                  <li key={r.key} className="ov-bars-h__row">
                    <span className="ov-bars-h__label">{r.label}</span>
                    <span className="ov-bars-h__track">
                      <i style={{ width: `${r.pct}%`, background: r.color }} />
                    </span>
                    <span className="ov-bars-h__val">{r.count}<span className="ov-bars-h__pct">{r.pct}%</span></span>
                  </li>
                ))}
              </ul>
              <p className="ov-chart-summary">
                {completedNum} completed · {slashedNum} slashed · {openNum} still open
                {honorPctNum !== null && <> · SLA success rate {honorPctNum}% of settled calls</>}
                {honorPctNum === null && <> · the success rate is unknown until a call settles</>}
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Deployed contracts ── */}
      <SectionCard title="Deployed Contracts">
        <div className="ov-contracts">
          {CONTRACTS.map(c => (
            <div key={c.name} className="ov-contract">
              <div className="ov-contract__name">{c.name}</div>
              <a href={CONFIG.explorerAddr(c.addr)} target="_blank" rel="noreferrer">
                {shorten(c.addr)}<ExternalLink size={10} aria-hidden="true" />
              </a>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/* ── Protocol status ────────────────────────────────────────────────────────
   Four independent facts, never merged: the wallet, the chain the wallet is on,
   the RPC head, and the indexer's own position. The block subscription lives
   here so a new block re-renders this strip only, not the whole dashboard. */
function ProtocolStatus({ meta, indexerAnswered, indexerLoading, indexerError }: {
  meta?: SgMeta;
  indexerAnswered: boolean;
  indexerLoading: boolean;
  indexerError: boolean;
}) {
  const { address, status } = useAccount();
  const chainId = useChainId();
  const { data: blockNumber, isError: rpcError, isLoading: rpcLoading } = useBlockNumber({ watch: true });

  const onArc = chainId === arcTestnet.id;

  const wallet = status === "connected"
    ? { tone: "ok" as const, icon: <Wifi size={15} />, label: "Wallet", value: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connected" }
    : status === "connecting" || status === "reconnecting"
      ? { tone: "unknown" as const, icon: <Clock size={15} />, label: "Wallet", value: status === "reconnecting" ? "Reconnecting…" : "Connecting…" }
      : { tone: "unknown" as const, icon: <WifiOff size={15} />, label: "Wallet", value: "Not connected" };

  const network = status !== "connected"
    ? { tone: "unknown" as const, icon: <WifiOff size={15} />, label: "Network", value: "Unknown until a wallet connects" }
    : onArc
      ? { tone: "ok" as const, icon: <Wifi size={15} />, label: "Network", value: CONFIG.chainName, hint: `chain ${chainId}` }
      : { tone: "err" as const, icon: <WifiOff size={15} />, label: "Network", value: `Wrong network`, hint: `wallet on chain ${chainId}, expected ${arcTestnet.id}` };

  const rpc = rpcError
    ? { tone: "err" as const, icon: <WifiOff size={15} />, label: "RPC", value: "Unreachable" }
    : rpcLoading || blockNumber === undefined
      ? { tone: "unknown" as const, icon: <Clock size={15} />, label: "RPC", value: "Reading head block…" }
      : { tone: "ok" as const, icon: <Wifi size={15} />, label: "RPC", value: `Block ${Number(blockNumber).toLocaleString("en-US")}` };

  const idxBlock = meta?.block?.number;
  const idxTs = meta?.block?.timestamp;
  const lag = idxBlock !== undefined && blockNumber !== undefined ? Math.max(0, Number(blockNumber) - idxBlock) : undefined;
  const indexer = indexerError
    ? { tone: "err" as const, icon: <Database size={15} />, label: "Indexer", value: "Query failed" }
    : !indexerAnswered || indexerLoading && idxBlock === undefined
      ? { tone: "unknown" as const, icon: <Database size={15} />, label: "Indexer", value: "Reading…" }
      : idxBlock === undefined
        ? { tone: "unknown" as const, icon: <Database size={15} />, label: "Indexer", value: "No _meta in response" }
        : meta?.hasIndexingErrors
          ? { tone: "err" as const, icon: <Database size={15} />, label: "Indexer", value: "Indexing error", hint: `block ${idxBlock.toLocaleString("en-US")}` }
          : {
            tone: (lag !== undefined && lag > 50 ? "warn" : "ok") as "warn" | "ok",
            icon: <Database size={15} />,
            label: "Indexer",
            value: `Block ${idxBlock.toLocaleString("en-US")}`,
            hint: `${lag !== undefined ? `lag ${lag} block${lag === 1 ? "" : "s"} · ` : ""}${idxTs ? `indexed ${relTime(idxTs)}` : ""}`,
          };

  return (
    <div className="ov-status">
      {[wallet, network, rpc, indexer].map(item => <StatusItem key={item.label} {...item} />)}
    </div>
  );
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
