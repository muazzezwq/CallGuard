import { useState, useEffect, useMemo, useRef } from "react";
import {
  useReadContract, useWriteContract, useAccount, useWatchContractEvent,
  useBlockNumber, useChainId, usePublicClient,
} from "wagmi";
import { formatUnits, keccak256, stringToBytes } from "viem";
import { CONFIG, USDC_ABI, arcTestnet, ACTIVE_PPC_ADDRESS, ACTIVE_REGISTRY_ADDRESS, PPC_ABI_V8_ACTIVE, REGISTRY_ABI_V8_ACTIVE } from "../../lib/config";
import { useSubgraph } from "../../hooks/useSubgraph";
import { usdcAmount } from "../../lib/activity";
import { useAppStore } from "../../store/useAppStore";
import { errText } from "../../lib/utils";
import {
  checkPaymentStart, recordSubmittedTx, resolvePendingTx, beginOperation, endOperation,
} from "../../lib/paymentGate";
import {
  PageHeader, SectionCard, Stepper, Button,
  Badge, Field, Input, EmptyState, ErrorState,
} from "../../ui";
import type { Step } from "../../ui";
import {
  ExternalLink, Zap, ChevronDown, ChevronUp, RefreshCw, X,
  Radio, ReceiptText, Pencil, Shuffle, Layers,
  ShieldCheck, Server, Activity, Wifi, WifiOff, Database, Clock,
} from "lucide-react";
import {
  MetricCard, ActivityChart, OutcomeChart, LiveNetwork, RecentActivity,
} from "../overview/OverviewUi";
import {
  formatClock, formatCount, formatUsdc, relTime, shortId, statusMeta,
} from "../overview/format";
import type { SgCall, SgMeta, SgProvider } from "../overview/types";
import "../overview/overview.css";

const CONTRACTS = [
  { name: "ServiceRegistry", addr: ACTIVE_REGISTRY_ADDRESS },
  { name: "PayPerCall",      addr: ACTIVE_PPC_ADDRESS },
  { name: "DisputeQuality",  addr: CONFIG.disputeQualityAddress, retired: !CONFIG.disputeQualityEnabled },
  { name: "SLAFutures",      addr: CONFIG.slaFuturesAddress },
  { name: "ReputationLoan",  addr: CONFIG.reputationLoanAddress },
  { name: "SLABridge",       addr: CONFIG.slaAttestationBridge as `0x${string}` },
  { name: "AgentWallet",     addr: CONFIG.agentWallet as `0x${string}` },
  { name: "USDC",            addr: CONFIG.usdcAddress },
];

const SUBGRAPH = `{
  _meta { block { number timestamp } hasIndexingErrors deployment }
  calls(first:1000,orderBy:createdAt,orderDirection:desc){id providerId caller amount status createdAt}
  providers(first:1000,orderBy:completedCalls,orderDirection:desc){id active completedCalls slashedCalls pricePerCall stake}
}`;

const OPEN_STATES = new Set(["STARTED", "OPEN", "PENDING"]);
const CALLS_CAP = 1000;
const PROVIDERS_CAP = 1000;
const DAY = 86400;

type LiveEvent = {
  label: string;
  detail: string;
  time: string;
  hash?: string;
};

/* Bayesian reputation, the same formula the registry-facing panels use. */
function repPct(p: { completedCalls?: string; slashedCalls?: string }): number {
  const c = parseInt(p.completedCalls || "0");
  const s = parseInt(p.slashedCalls || "0");
  return Math.round(((c + 2) / (c + s + 3)) * 100);
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

/** Accessing `sessionStorage` itself can throw in restricted browser modes. */
function overviewStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export default function Overview() {
  const setPanel = useAppStore(s => s.setPanel);
  const openVerify = useAppStore(s => s.openVerify);
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

  const {
    data: sg, isLoading: sgLoading, error: sgError, isFetching: sgFetching,
    dataUpdatedAt, refetch,
  } = useSubgraph(SUBGRAPH);
  const {
    data: providerCountRaw, isLoading: providerCountLoading,
    isFetching: providerCountFetching, refetch: refetchProviderCount,
  } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_V8_ACTIVE,
    functionName: "nextProviderId",
  });
  const {
    data: usdcBal, isLoading: usdcBalLoading, isError: usdcBalError,
  } = useReadContract({
    address: CONFIG.usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const sgPayload = sg as { providers?: SgProvider[]; calls?: SgCall[]; _meta?: SgMeta } | undefined;
  const sgMeta = sgPayload?._meta;
  const sgProviders: SgProvider[] = sgPayload?.providers ?? [];
  const sgCalls: SgCall[] = useMemo(() => sgPayload?.calls ?? [], [sgPayload]);

  /* A body from the indexer makes a zero a measured zero. `calls` and
     `providers` are checked separately because a partial failure must not turn
     one list into an invented empty list. */
  const callsIndexed = Array.isArray(sgPayload?.calls);
  const providersIndexed = Array.isArray(sgPayload?.providers);
  const indexerHasData = callsIndexed || providersIndexed;
  const indexerStale = !!sgError && indexerHasData;
  const initialLoading = sgLoading && !indexerHasData;
  const callsNum = sgCalls.length;
  const callsTruncated = callsNum >= CALLS_CAP;
  const providersTruncated = sgProviders.length >= PROVIDERS_CAP;

  /* nextProviderId is the registry counter and counts the reserved id 0, so the
     live provider count is one less. Fall back to the indexed count only when
     the contract read has not arrived. */
  const providerCount = providerCountRaw !== undefined
    ? Math.max(0, Number(providerCountRaw) - 1)
    : (providersIndexed ? sgProviders.length : null);
  const providersKnown = providerCount !== null;

  const completedNum = sgCalls.filter((c: SgCall) => c.status === "COMPLETED").length;
  const slashedNum = sgCalls.filter((c: SgCall) => c.status === "SLASHED").length;
  const refundedNum = sgCalls.filter((c: SgCall) => c.status === "REFUNDED").length;
  const openNum = sgCalls.filter((c: SgCall) => OPEN_STATES.has(c.status ?? "")).length;
  /* The SLA rate is measured over calls that reached a terminal outcome; open
     calls are neither a success nor a failure yet. */
  const settledNum = completedNum + slashedNum;
  const honorPctNum = settledNum > 0 ? Math.round((completedNum / settledNum) * 100) : null;

  const { series: weekSeries, last7, prev7 } = weeklySeries(sgCalls);
  /* A truncated window cannot prove the previous 7 days are complete, so no
     percentage change is claimed from it. */
  const callsDelta = !callsTruncated && prev7 > 0
    ? Math.round(((last7 - prev7) / prev7) * 100)
    : null;

  const escrowRaw = sgCalls
    .filter((c: SgCall) => OPEN_STATES.has(c.status ?? ""))
    .reduce((sum: bigint, c: SgCall) => {
      try { return sum + BigInt(c.amount || "0"); } catch { return sum; }
    }, 0n);
  const activeProviders = sgProviders.filter(p => p.active).length;
  const completedAll = sgProviders.reduce((sum, p) => sum + (parseInt(p.completedCalls || "0", 10) || 0), 0);
  const slashedAll = sgProviders.reduce((sum, p) => sum + (parseInt(p.slashedCalls || "0", 10) || 0), 0);

  const stakeRaw = sgProviders.reduce((sum: bigint, p: SgProvider) => {
    try { return sum + BigInt(p.stake || "0"); } catch { return sum; }
  }, 0n);

  let minPrice: bigint | null = null;
  let maxPrice: bigint | null = null;
  for (const p of sgProviders) {
    try {
      const value = BigInt(p.pricePerCall || "0");
      if (value <= 0n) continue;
      if (minPrice === null || value < minPrice) minPrice = value;
      if (maxPrice === null || value > maxPrice) maxPrice = value;
    } catch { /* an unreadable price is omitted, never guessed */ }
  }
  const priceRange = minPrice !== null && maxPrice !== null
    ? { min: formatUsdc(minPrice) ?? "—", max: formatUsdc(maxPrice) ?? "—" }
    : null;

  const callsSpark = callsIndexed && weekSeries.some(v => v > 0) ? weekSeries : undefined;
  const activities = sgCalls.slice(0, 6);
  const topProviders = sgProviders.slice(0, 5);
  const myActivity = sgCalls
    .filter((c: SgCall) => c.caller?.toLowerCase() === address?.toLowerCase())
    .slice(0, 5);
  const chartData = buildActivityChart(sgCalls);
  const latestCall = sgCalls[0];
  const flowSteps: Step[] = computeFlowSteps(latestCall);

  const totalCalls24h = chartData.reduce((sum, b) => sum + b.count, 0);
  const peak = chartData.reduce((best, b) => (b.count > best.count ? b : best), { ago: -1, count: 0 });
  const otherNum = callsNum - completedNum - slashedNum - refundedNum - openNum;
  const outcomeRows = [
    { key: "completed", label: "Completed", count: completedNum, color: "var(--accent)" },
    { key: "open", label: "Open", count: openNum, color: "var(--accent-2)" },
    { key: "slashed", label: "Timeout claimed", count: slashedNum, color: "var(--danger)" },
    ...(refundedNum > 0 ? [{ key: "refunded", label: "Refunded", count: refundedNum, color: "var(--warn)" }] : []),
    ...(otherNum > 0 ? [{ key: "other", label: "Other", count: otherNum, color: "var(--text-dim)" }] : []),
  ].map(r => ({ ...r, pct: callsNum > 0 ? Math.round((r.count / callsNum) * 100) : 0 }));

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
  const publicClient = usePublicClient();
  const [multiResults, setMultiResults] = useState<{ pid: string; hash?: string; err?: string }[]>([]);
  const [multiRunning, setMultiRunning] = useState(false);

  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  /* A re-subscription can replay logs. The log identity is the only stable
     dedupe key; a repeated delivery must not add a second row. */
  const seenLogs = useRef<Set<string>>(new Set());
  const pushEvent = (label: string, detail: string, key: string, hash?: string) => {
    if (seenLogs.current.has(key)) return;
    seenLogs.current.add(key);
    const event: LiveEvent = {
      label, detail, hash,
      time: new Date().toLocaleTimeString("en-US", { hour12: false }),
    };
    setLiveEvents(prev => [event, ...prev].slice(0, 20));
  };
  const liveFailed = (err: unknown) => setLiveError(String((err as Error)?.message ?? err).slice(0, 160));

  /* One watcher for the three events. Each `useWatchContractEvent` call opens its
     own `eth_newFilter` and polls that filter on its own timer, and the public Arc
     RPC allows about twenty calls per burst — three watchers here plus three in the
     notification drawer was six filters for one feed. */
  useWatchContractEvent({
    address: ACTIVE_PPC_ADDRESS,
    abi: PPC_ABI_V8_ACTIVE,
    chainId: arcTestnet.id,
    onError: liveFailed,
    onLogs: (logs) => {
      setLiveError(null);
      for (const l of logs) {
        const key = `${l.transactionHash}:${l.logIndex}`;
        if (l.eventName === "CallStarted") {
          const a = l.args as { providerId?: bigint; amount?: bigint; callId?: string };
          pushEvent(
            `Call → Provider #${a.providerId ?? "unknown"}`,
            `${usdcAmount(a.amount) ?? "amount unavailable"} USDC · ${shortId(String(a.callId || ""))}`,
            `started:${key}`,
            l.transactionHash,
          );
        } else if (l.eventName === "ReceiptSubmitted") {
          const a = l.args as { callId?: string };
          pushEvent(
            "Receipt submitted",
            `Call ${shortId(String(a.callId || ""))}`,
            `receipt:${key}`,
            l.transactionHash,
          );
        } else if (l.eventName === "CallSlashed") {
          const a = l.args as { slashed?: bigint; refunded?: bigint };
          pushEvent(
            "Timeout claimed — refund and slash recorded",
            `${usdcAmount(a.slashed) ?? "slash unavailable"} USDC slashed · refund ${usdcAmount(a.refunded) ?? "unavailable"} USDC`,
            `slash:${key}`,
            l.transactionHash,
          );
        }
      }
    },
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
    if (!beginOperation("overview-multi")) return;
    setMultiRunning(true);
    setMultiResults([]);
    try {
      for (const pid of ids) {
        for (let i = 0; i < multiCount; i++) {
          /* Same fail-closed gate as the Call Builder, before every write. */
          const gate = checkPaymentStart({ storage: overviewStorage(), operation: "overview-multi" });
          if (!gate.ok) {
            setMultiResults(r => [...r, { pid, err: gate.message }]);
            return;
          }
          try {
            const reqHash = keccak256(stringToBytes(`${multiPayload}-${pid}-${i}-${Date.now()}`)) as `0x${string}`;
            const hash = await writeContractAsync({
              address: ACTIVE_PPC_ADDRESS,
              abi: PPC_ABI_V8_ACTIVE,
              functionName: "callService",
              args: [BigInt(pid), reqHash],
            });
            if (!recordSubmittedTx(hash, overviewStorage()).persisted) {
              setMultiResults(r => [...r, { pid, err: `Submitted ${hash}, but its pending marker could not be saved. The tab stays blocked; check the explorer before retrying.` }]);
              return;
            }
            const receipt = await publicClient?.waitForTransactionReceipt({ hash, timeout: 60_000 });
            if (!receipt) {
              setMultiResults(r => [...r, { pid, err: `Submitted ${hash}, but no receipt reader is available. The tab stays blocked.` }]);
              return;
            }
            resolvePendingTx(overviewStorage());
            if (receipt.status !== "success") {
              setMultiResults(r => [...r, { pid, err: `Transaction ${hash} reverted.` }]);
              return;
            }
            setMultiResults(r => [...r, { pid, hash }]);
          } catch (_err: unknown) {
            setMultiResults(r => [...r, { pid, err: errText(_err) }]);
            return;
          }
          await new Promise(r => setTimeout(r, 600));
        }
      }
    } finally {
      endOperation("overview-multi");
      setMultiRunning(false);
    }
  };

  const shorten = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  useEffect(() => {
    if (isConnected) markStep("wallet");
    if (sgCalls.some((c: SgCall) => c.caller?.toLowerCase() === address?.toLowerCase())) markStep("action");
    if (sgCalls.some((c: SgCall) => c.status === "COMPLETED" && c.caller?.toLowerCase() === address?.toLowerCase())) markStep("receipt");
  }, [isConnected, sgCalls, address, markStep]);

  const handleRefresh = () => {
    refetch();
    refetchProviderCount?.();
  };
  const isRefreshing = sgFetching || providerCountFetching;
  const updatedLabel = dataUpdatedAt
    ? `Last read ${formatClock(dataUpdatedAt)}`
    : "Awaiting first read";

  return (
    <div className="ov-page ovd-page">
      <PageHeader
        eyebrow={
          <span className="ovd-eyebrow">
            <span className="ovd-eyebrow__dot" aria-hidden="true" />
            Arc Testnet · Protocol operations
          </span>
        }
        title="Overview"
        subtitle="Current protocol state from the registry, PayPerCall events and the indexed subgraph. Every figure below has a source; unavailable data stays unavailable."
        actions={
          <>
            <span className="ovd-refresh">
              <Clock size={13} aria-hidden="true" />
              {updatedLabel}
            </span>
            <span className="visually-hidden" role="status" aria-live="polite">
              {isRefreshing ? "Refreshing protocol data" : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh protocol data"
            >
              <RefreshCw size={14} className={isRefreshing ? "ovd-spin" : undefined} aria-hidden="true" />
              {isRefreshing ? "Refreshing…" : "Refresh"}
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
        indexerHasData={indexerHasData}
        indexerStale={indexerStale}
        indexerLoading={sgLoading}
        indexerError={!!sgError}
      />

      {/* ── Primary metrics ──
          A value is shown as 0 only when the indexer answered, "—" only when the
          source failed, and a skeleton only while the first read is in flight. */}
      <section className="ovd-metrics-section" aria-labelledby="ovd-metrics-title">
        <div className="ovd-section-head">
          <div>
            <h2 id="ovd-metrics-title">Protocol metrics</h2>
            <p>Registry counters and the latest indexed call records.</p>
          </div>
          {indexerStale && <Badge tone="pending">Cached indexer read</Badge>}
        </div>

        <div className="ovd-metrics">
          <MetricCard
            tone="accent"
            icon={<Activity size={15} />}
            label="Calls indexed"
            value={callsIndexed ? formatCount(callsNum) : "—"}
            hint={callsIndexed
              ? callsTruncated
                ? `Latest ${formatCount(CALLS_CAP)} records · the true total may be higher`
                : "All calls returned by the subgraph"
              : "The indexer did not return a call list"}
            delta={callsDelta}
            spark={callsSpark}
            sparkLabel="Calls per day over the last 7 days, oldest first."
            unavailable={!callsIndexed}
            loading={initialLoading && !callsIndexed}
            stale={indexerStale && callsIndexed}
          />
          <MetricCard
            icon={<Server size={15} />}
            label="Providers"
            value={providersKnown ? formatCount(providerCount!) : "—"}
            hint={providerCountRaw !== undefined
              ? providersIndexed
                ? `${formatCount(activeProviders)} accepting calls · registry nextProviderId − 1${providersTruncated ? " · indexer capped at 1,000" : ""}`
                : sgLoading
                  ? "Registry count read · provider records loading…"
                  : "Registry count read · provider records unavailable"
              : "Indexed provider count · registry read unavailable"}
            unavailable={!providersKnown}
            loading={providerCountLoading && !providersKnown}
            stale={indexerStale && providerCountRaw === undefined}
          />
          <MetricCard
            tone="cyan"
            icon={<Database size={15} />}
            label="Escrowed"
            value={callsIndexed ? formatUsdc(escrowRaw) ?? "—" : "—"}
            unit={callsIndexed ? "USDC" : undefined}
            hint={callsIndexed
              ? openNum > 0
                ? `${formatCount(openNum)} open call${openNum === 1 ? "" : "s"}${callsTruncated ? " · latest 1,000 records" : ""}`
                : "No open calls in the indexed set"
              : "Escrow cannot be derived without the call list"}
            unavailable={!callsIndexed}
            loading={initialLoading && !callsIndexed}
            stale={indexerStale && callsIndexed}
          />
          <MetricCard
            icon={<ShieldCheck size={15} />}
            label="SLA success"
            value={honorPctNum === null ? "—" : `${honorPctNum}%`}
            hint={!callsIndexed
              ? "Call states unavailable · not shown as zero"
              : settledNum > 0
                ? `${formatCount(completedNum)} completed of ${formatCount(settledNum)} settled${callsTruncated ? " · latest 1,000 records" : ""}`
                : "No settled calls yet · unknown, not zero"}
            unavailable={honorPctNum === null}
            loading={initialLoading && !callsIndexed}
            stale={indexerStale && callsIndexed}
          />
        </div>
      </section>

      {/* ── Analytical charts ── */}
      <div className="ovd-analytics">
        <SectionCard
          title="Call activity"
          subtitle="Calls created per hour, from indexed timestamps"
          titleAs="h2"
          action={<span className="ovd-mono-dim">{callsIndexed ? `${indexerStale ? "cached · " : ""}${formatCount(totalCalls24h)} in 24h` : initialLoading ? "loading…" : "unavailable"}</span>}
        >
          {initialLoading && !callsIndexed ? (
            <div aria-busy="true"><SkeletonBlock /></div>
          ) : !callsIndexed ? (
            <ErrorState
              title="Activity series unavailable"
              description="The indexer did not return call timestamps. No series is drawn from guesses."
              detail={errText(sgError)}
              action={<Button size="sm" variant="secondary" onClick={handleRefresh}>Retry</Button>}
            />
          ) : totalCalls24h === 0 ? (
            <EmptyState
              icon={<Activity size={20} />}
              title="No calls in the last 24 hours"
              description="The indexer returned no calls in this window. This is a measured zero from the indexed set, not a missing series."
            />
          ) : (
            <ActivityChart
              buckets={chartData}
              total={totalCalls24h}
              peak={peak}
              truncated={callsTruncated}
            />
          )}
        </SectionCard>

        <SectionCard
          title="SLA outcomes"
          subtitle="Every indexed call by current state"
          titleAs="h2"
          action={<span className="ovd-mono-dim">{callsIndexed ? `${indexerStale ? "cached · " : ""}${formatCount(callsNum)} indexed` : initialLoading ? "loading…" : "unavailable"}</span>}
        >
          {initialLoading && !callsIndexed ? (
            <div aria-busy="true"><SkeletonBlock /></div>
          ) : !callsIndexed ? (
            <ErrorState
              title="Outcome split unavailable"
              description="The indexer did not return call states. The split is not filled in."
              detail={errText(sgError)}
              action={<Button size="sm" variant="secondary" onClick={handleRefresh}>Retry</Button>}
            />
          ) : callsNum === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={20} />}
              title="No outcomes to report"
              description="Outcomes appear once calls have been made and settled."
            />
          ) : (
            <OutcomeChart
              rows={outcomeRows}
              total={callsNum}
              completed={completedNum}
              slashed={slashedNum}
              refunded={refundedNum}
              open={openNum}
              honorPct={honorPctNum}
              truncated={callsTruncated}
            />
          )}
        </SectionCard>
      </div>

      {/* ── Live Network + Recent Activity ── */}
      <div className="ovd-livegrid">
        <SectionCard
          className="ovd-live-card"
          title="Live Network"
          subtitle="Provider availability from indexed records, not a simulated topology"
          titleAs="h2"
          action={<Badge tone={indexerStale ? "pending" : activeProviders > 0 ? "guard" : "neutral"}>
            {indexerStale ? "Cached" : providersIndexed ? `${formatCount(activeProviders)} active` : "—"}
          </Badge>}
          bodyClass="ui-section__body--flush"
        >
          <LiveNetwork
            providers={sgProviders}
            providerCount={providerCount}
            activeProviders={activeProviders}
            completedAll={completedAll}
            slashedAll={slashedAll}
            stakeRaw={providersIndexed ? stakeRaw : null}
            priceRange={priceRange}
            meta={sgMeta}
            loading={initialLoading && !providersIndexed}
            unavailable={!providersIndexed}
            stale={indexerStale}
            truncated={providersTruncated}
            errorText={errText(sgError)}
            onRetry={handleRefresh}
            onViewProviders={() => setPanel("providers")}
            onRegister={() => setPanel("register")}
          />
        </SectionCard>

        <SectionCard
          className="ovd-activity-card"
          title="Recent Activity"
          subtitle="Newest indexed calls, with the exact call id"
          titleAs="h2"
          action={<button className="ovd-linkbtn" onClick={() => setPanel("history")}>View all</button>}
          bodyClass="ui-section__body--flush"
        >
          <RecentActivity
            calls={activities}
            loading={initialLoading && !callsIndexed}
            unavailable={!callsIndexed}
            errorText={errText(sgError)}
            onRetry={handleRefresh}
            onViewAll={() => setPanel("history")}
            onMakeCall={() => setPanel("calls")}
            onVerify={openVerify}
          />
        </SectionCard>
      </div>

      {/* ── Next actions ── */}
      <section className="ovd-next" aria-labelledby="ovd-next-title">
        <div className="ovd-next__head">
          <div>
            <h2 id="ovd-next-title">Next actions</h2>
            <p>Only destinations that already exist in this app.</p>
          </div>
        </div>
        <div className="ovd-next__grid">
          <button className="ovd-next__item" onClick={() => setPanel("marketplace")}>
            <span className="ovd-next__icon ovd-next__icon--accent" aria-hidden="true"><Server size={16} /></span>
            <span><b>Browse marketplace</b><small>Compare live provider price and SLA terms</small></span>
          </button>
          <button className="ovd-next__item" onClick={() => setPanel("history")}>
            <span className="ovd-next__icon ovd-next__icon--info" aria-hidden="true"><ReceiptText size={16} /></span>
            <span><b>View transactions</b><small>Inspect every indexed call and settlement</small></span>
          </button>
          <button className="ovd-next__item" onClick={() => setPanel("verify")}>
            <span className="ovd-next__icon ovd-next__icon--warn" aria-hidden="true"><ShieldCheck size={16} /></span>
            <span><b>Verify a receipt</b><small>Check an EIP-712 response against a call</small></span>
          </button>
          <button className="ovd-next__item" onClick={() => setPanel("register")}>
            <span className="ovd-next__icon ovd-next__icon--cyan" aria-hidden="true"><Pencil size={16} /></span>
            <span><b>Become a provider</b><small>Stake USDC and publish an SLA</small></span>
          </button>
        </div>
      </section>

      {/* ── Operations ── */}
      <SectionCard
        title="Operations"
        subtitle="On-chain actions available from this wallet"
        titleAs="h2"
        bodyClass="ui-section__body--flush"
      >
        <div className="ov-actions">
          <div className="ov-actions__row">
            <span className="ov-actions__icon ov-actions__icon--accent"><Zap size={15} /></span>
            <span className="ov-actions__body">
              <span className="ov-actions__title">Call a service</span>
              <span className="ov-actions__sub">Pay per request · USDC escrow</span>
            </span>
            <div className="ov-actions__ctrl">
              <Input
                value={callProvider}
                onChange={(e) => setCallProvider(e.target.value)}
                placeholder="Provider ID"
                aria-label="Provider ID"
                className="ov-input-sm"
              />
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
                <span className="ov-actions__sub">Sequential calls · per-call receipts</span>
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
                  Cost: each call escrows its provider's listed price
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

      {/* ── Transaction flow + contract endpoints ── */}
      <div className="ovd-twocol">
        <SectionCard
          title="Transaction flow"
          subtitle={latestCall ? "Lifecycle of the latest indexed call" : "No indexed call to trace yet"}
          titleAs="h2"
        >
          <Stepper steps={flowSteps} />
          {latestCall?.id && (
            <div className="ov-flow__meta">
              Call {shortId(latestCall.id, 8, 6)}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Contract endpoints"
          subtitle="Explorer links for the active deployment — no health probe is implied"
          titleAs="h2"
          bodyClass="ui-section__body--flush"
        >
          <ul className="ov-health">
            {[
              { name: "PayPerCall", addr: ACTIVE_PPC_ADDRESS },
              { name: "ServiceRegistry", addr: ACTIVE_REGISTRY_ADDRESS },
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
      {address && (
        <div className="ovd-balance">
          <span className="ovd-balance__label">Your USDC balance</span>
          <span className="ovd-balance__val">
            {usdcBalLoading
              ? "Reading…"
              : usdcBalError
                ? "Unavailable"
                : `${formatUsdc(usdcBal) ?? "—"} USDC`}
          </span>
        </div>
      )}

      {/* ── Welcome ── */}
      {showWelcome && (
        <SectionCard
          title="Welcome to CallGuard"
          subtitle="Three steps to your first on-chain SLA."
          titleAs="h2"
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
        <SectionCard
          title="My Activity"
          titleAs="h2"
          action={<button className="ovd-linkbtn" onClick={() => setPanel("requests")}>My requests</button>}
          bodyClass="ui-section__body--flush"
        >
          <ul className="ov-activity">
            {myActivity.map((c: SgCall) => {
              const meta = statusMeta(c.status);
              return (
                <li key={c.id} className="ov-activity__row">
                  <span className={`ov-activity__ico ov-activity__ico--${meta.tone === "slash" ? "danger" : meta.tone === "info" ? "info" : "ok"}`}>
                    <ReceiptText size={15} />
                  </span>
                  <span className="ov-activity__body">
                    <span className="ov-activity__title">Call {shortId(String(c.id ?? ""), 8, 6)}</span>
                    <span className="ov-activity__sub">
                      {formatUsdc(c.amount) === null ? "Amount unavailable" : `${formatUsdc(c.amount)} USDC`}
                      {c.createdAt && <> · {relTime(parseInt(c.createdAt, 10))}</>}
                    </span>
                  </span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {/* ── On-chain event stream ──
          A live log subscription on PayPerCall. Only events actually received
          are listed; the badge turns active once one has arrived, so the card
          never suggests traffic that is not there. */}
      <SectionCard
        title="On-chain Events"
        subtitle="Live log subscription on PayPerCall — CallStarted, ReceiptSubmitted, CallSlashed"
        titleAs="h2"
        action={
          <span role="status" aria-live="polite">
            <Badge tone={liveError ? "slash" : liveEvents.length > 0 ? "guard" : "neutral"} dot={!liveError && liveEvents.length > 0}>
              {liveError ? "Feed error" : liveEvents.length > 0 ? `${liveEvents.length} this session` : "Listening"}
            </Badge>
          </span>
        }
        bodyClass="ui-section__body--flush"
      >
        {liveEvents.length === 0 ? (
          <EmptyState
            icon={<Radio size={20} />}
            title={liveError ? "Event stream unavailable" : "No events in this session"}
            description={liveError
              ? `The subscription reported an error, so nothing is claimed as delivered: ${liveError}`
              : "The subscription is open. Events appear here only while this page is mounted — silence means the contracts have not emitted, not that the feed is broken."}
          />
        ) : (
          <ul className="ov-activity">
            {liveEvents.slice(0, 6).map((e, i) => (
              <li key={`l${i}`} className="ov-activity__row">
                <span className="ov-activity__ico ov-activity__ico--ok"><Radio size={15} /></span>
                <span className="ov-activity__body">
                  <span className="ov-activity__title">{e.label}</span>
                  <span className="ov-activity__sub">{e.detail} · {e.time}</span>
                  {e.hash && (
                    <a className="ov-activity__id" href={CONFIG.explorerTx(e.hash)} target="_blank" rel="noreferrer">
                      <span className="mono">{shortId(e.hash)}</span>
                      <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ── Top providers ── */}
      <SectionCard
        title="Top Providers"
        subtitle="Ranked by the reputation formula used across the app; list is bounded"
        titleAs="h2"
        action={
          <span className="ovd-card-actions">
            {indexerStale && <Badge tone="pending">Cached</Badge>}
            <button className="ovd-linkbtn" onClick={() => setPanel("providers")}>View providers</button>
          </span>
        }
        bodyClass="ui-section__body--flush"
      >
        {!providersIndexed ? (
          <EmptyState
            icon={<Server size={20} />}
            title="Provider ranking unavailable"
            description="The indexer did not return provider records, so no ranking is shown."
          />
        ) : topProviders.length === 0 ? (
          <EmptyState
            icon={<Server size={20} />}
            title="No providers to rank"
            description="Provider records will appear after a provider registers and the indexer catches up."
            action={<Button size="sm" variant="secondary" onClick={() => setPanel("register")}>Register a provider</Button>}
          />
        ) : (
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
        )}
      </SectionCard>

      {/* ── Deployed contracts ── */}
      <SectionCard
        title="Deployed Contracts"
        subtitle="Active v7 deployment addresses; the explorer is the source of truth"
        titleAs="h2"
      >
        <div className="ov-contracts">
          {CONTRACTS.map(c => (
            <div key={c.name} className="ov-contract">
              <div className="ov-contract__name">
                {c.name}
                {c.retired && <Badge tone="pending">Retired</Badge>}
              </div>
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
function ProtocolStatus({ meta, indexerHasData, indexerStale, indexerLoading, indexerError }: {
  meta?: SgMeta;
  indexerHasData: boolean;
  indexerStale: boolean;
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
      : { tone: "err" as const, icon: <WifiOff size={15} />, label: "Network", value: "Wrong network", hint: `wallet on chain ${chainId}, expected ${arcTestnet.id}` };

  const rpc = rpcError
    ? { tone: "err" as const, icon: <WifiOff size={15} />, label: "RPC", value: "Unreachable" }
    : rpcLoading || blockNumber === undefined
      ? { tone: "unknown" as const, icon: <Clock size={15} />, label: "RPC", value: "Reading head block…" }
      : { tone: "ok" as const, icon: <Wifi size={15} />, label: "RPC", value: `Block ${formatCount(blockNumber)}` };

  const idxBlock = meta?.block?.number;
  const idxTs = meta?.block?.timestamp;
  const lag = idxBlock !== undefined && blockNumber !== undefined ? Math.max(0, Number(blockNumber) - idxBlock) : undefined;
  const indexer = indexerStale
    ? {
      tone: "warn" as const,
      icon: <Database size={15} />,
      label: "Indexer",
      value: idxBlock === undefined ? "Cached read" : `Cached block ${formatCount(idxBlock)}`,
      hint: "last refresh failed · values are marked cached",
    }
    : indexerError && !indexerHasData
      ? { tone: "err" as const, icon: <Database size={15} />, label: "Indexer", value: "Query failed" }
      : !indexerHasData || indexerLoading && idxBlock === undefined
        ? { tone: "unknown" as const, icon: <Database size={15} />, label: "Indexer", value: "Reading…" }
        : idxBlock === undefined
          ? { tone: "unknown" as const, icon: <Database size={15} />, label: "Indexer", value: "No _meta in response" }
          : meta?.hasIndexingErrors
            ? { tone: "err" as const, icon: <Database size={15} />, label: "Indexer", value: "Indexing error", hint: `block ${formatCount(idxBlock)}` }
            : {
              tone: (lag !== undefined && lag > 50 ? "warn" : "ok") as "warn" | "ok",
              icon: <Database size={15} />,
              label: "Indexer",
              value: `Block ${formatCount(idxBlock)}`,
              hint: [
                lag !== undefined ? `lag ${formatCount(lag)} block${lag === 1 ? "" : "s"}` : null,
                idxTs ? `indexed ${relTime(idxTs)}` : null,
              ].filter(Boolean).join(" · "),
            };

  return (
    <div className="ov-status ovd-status">
      {[wallet, network, rpc, indexer].map(item => <StatusItem key={item.label} {...item} />)}
    </div>
  );
}

function SkeletonBlock() {
  return (
    <div className="ovd-skeleton-block">
      <div className="ovd-skeleton-block__line" />
      <div className="ovd-skeleton-block__line" />
      <div className="ovd-skeleton-block__line" />
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
  if (s === "SLASHED") {
    return [
      mk("payment", "Payment", "USDC", "done"),
      mk("sla", "SLA", "Deadline missed", "failed"),
      mk("receipt", "Receipt", "No receipt", "idle"),
      mk("settlement", "Settlement", "Stake slashed", "failed"),
    ];
  }
  if (s === "REFUNDED") {
    return [
      mk("payment", "Payment", "USDC", "done"),
      mk("sla", "SLA", "Closed without receipt", "failed"),
      mk("receipt", "Receipt", "No receipt", "idle"),
      mk("settlement", "Settlement", "Refunded", "failed"),
    ];
  }
  return [
    mk("payment", "Payment", "USDC", "done"),
    mk("sla", "SLA", "Awaiting receipt", "active"),
    mk("receipt", "Receipt", "EIP-712 verified", "idle"),
    mk("settlement", "Settlement", "On-chain", "idle"),
  ];
}
