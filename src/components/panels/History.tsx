import { useState, useCallback } from "react";
import { useAccount, useChainId, useReadContract, useSwitchChain } from "wagmi";
import { ArrowLeft } from "lucide-react";
import { useSubgraph } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import { ACTIVE_REGISTRY_ADDRESS, V8_ENABLED, REGISTRY_ABI, REGISTRY_ABI_V8, arcTestnet } from "../../lib/config";
import {
  callStatusLabel,
  clampPage,
  csvCell,
  normalizeCalls,
  positiveUsdc,
  usdcAmount,
} from "../../lib/activity";
import {
  PageHeader, SectionCard, StatCard, Toolbar, Chip, ChipRow,
  Input, Button, Badge, EmptyState, ErrorState, Skeleton, Stepper,
} from "../../ui";
import type { Step, StepState } from "../../ui";
import { SLACanvas, slaStages } from "../viz/SLACanvas";

const PAGE_SIZE = 25;

type Call = Record<string, unknown>;

const STATUS_TONE: Record<string, "guard" | "pending" | "slash" | "neutral" | "info"> = {
  COMPLETED: "guard",
  STARTED: "pending",
  SLASHED: "slash",
  REFUNDED: "info",
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "COMPLETED", label: "Completed" },
  { id: "STARTED", label: "Open" },
  { id: "SLASHED", label: "Timeout claimed" },
];

function usdc(v: unknown) {
  return usdcAmount(v);
}

/* `refunded` and `slashed` are USDC amounts (BigInt in the schema), not flags:
   a `=== "true"` test reads "neither" for every call, including a real slash.
   Exported for the rule tests. */
export function refundedAmount(v: unknown) {
  return positiveUsdc(v);
}

/* A call the indexer has not given a settlement timestamp is one whose SLA
   window closed: `claimTimeout` on the contract, slash on the provider.
   Kept out of `slaStages`: the subgraph writes `completedAt` on every
   `CallSlashed`, so the distinction is not observable from the indexed fields. */
function short(v: unknown) {
  const s = String(v ?? "");
  return s.length > 12 ? `${s.slice(0, 10)}…` : s;
}

function when(v: unknown) {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toLocaleString() : null;
}

const STEP_LABELS = ["Payment", "SLA", "Receipt", "Settlement"];

function statusSteps(status: string, amount?: string): Step[] {
  return slaStages(status, { amount }).map((st, i) => ({
    id: st.key,
    label: STEP_LABELS[i] ?? st.label,
    sub: st.sub,
    state: (st.state === "info" ? "done" : st.state) as StepState,
  }));
}

function exportHistory(calls: Call[], format: "csv" | "json") {
  if (!calls.length) return;
  if (format === "csv") {
    const headers = ["Call ID", "Provider", "Amount (USDC)", "Status", "Date", "RequestHash"];
    const rows = calls.map(c => [
      c.id ?? "",
      c.providerId ?? "",
      /* A missing amount leaves the cell empty; writing "0" would export a
         payment that was never recorded. */
      usdc(c.amount) ?? "",
      c.status ?? "",
      when(c.createdAt) ?? "",
      c.requestHash ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `callguard-history-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  } else {
    const blob = new Blob([JSON.stringify(calls, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `callguard-history-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }
}

export default function History() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switchingChain } = useSwitchChain();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /* The stage a user picked on the canvas. Keys are stable across calls, so
     the same stage stays selected when the detail panel switches call. */
  const [stageKey, setStageKey] = useState<string | null>(null);

  /* `_meta` is the indexer's own word on how current it is: the panel shows a
     freshness line from it, and says so when it reports indexing errors. */
  const { data, loading, error, isFetching, refetch } = useSubgraph<{
    calls: Call[];
    _meta?: { hasIndexingErrors: boolean; block: { number: number; timestamp: number } };
  }>(
    address ? `{
      _meta { hasIndexingErrors block { number timestamp } }
      calls(first:500 orderBy:createdAt orderDirection:desc where:{caller:"${address.toLowerCase()}"}) {
        id providerId caller amount status createdAt completedAt requestHash responseHash refunded slashed
      }
    }` : "",
    { enabled: !!address, pollInterval: 30000 }
  );

  /* One row per call: the indexer already keys by call id, and a merge of a
     refresh with older data must not double a call. Order is explicit
     (newest first, id as the tie-break) so pagination is deterministic. */
  const all = normalizeCalls(data?.calls ?? []);
  const wrongNetwork = !!address && chainId !== arcTestnet.id;

  const meta = data?._meta;
  const indexedAt = meta?.block?.timestamp ? new Date(meta.block.timestamp * 1000) : null;
  const lagMin = indexedAt ? Math.floor((Date.now() - indexedAt.getTime()) / 60000) : null;
  const stale = lagMin !== null && lagMin > 10;
  const indexingErrors = !!meta?.hasIndexingErrors;

  const filtered = all.filter(c => {
    if (statusFilter !== "all" && String(c.status) !== statusFilter) return false;
    const s = search.toLowerCase();
    if (s && !String(c.id).includes(s) && !String(c.providerId).includes(s)) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  /* A filter can shrink the result under the current page. Clamp instead of
     showing "no transactions" while matching records sit on an earlier page. */
  const currentPage = clampPage(page, totalPages);
  const paged = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const onSearch = useCallback((v: string) => { setSearch(v); setPage(0); }, []);
  const onFilter = useCallback((v: string) => { setStatusFilter(v); setPage(0); }, []);

  const completed = all.filter(c => c.status === "COMPLETED").length;
  const slashed = all.filter(c => c.status === "SLASHED").length;
  const open = all.filter(c => c.status === "STARTED").length;

  const selected = all.find(c => String(c.id) === selectedId) ?? null;
  const openDispute = useAppStore(s => s.openDispute);

  /* Provider terms for the selected call come from the registry itself, so the
     canvas can name the configuration and the stake behind the call instead of
     only the call's own outcome. `getProvider` answers an empty ProviderView
     (owner = 0x0) for an unknown id — it does not revert — so a settled read
     with no owner means "not registered", not "loading". */
  const providerIdNum = Number((selected as Call | null)?.providerId ?? 0) || 0;
  const providerQuery = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: V8_ENABLED ? REGISTRY_ABI_V8 : REGISTRY_ABI,
    functionName: "getProvider",
    args: [BigInt(providerIdNum || 1)],
    chainId: arcTestnet.id,
    query: { enabled: providerIdNum > 0 && !wrongNetwork, refetchInterval: 60_000 },
  });
  const pRaw = providerQuery.data as Record<string | number, unknown> | undefined;
  const pOwner = (pRaw?.owner ?? pRaw?.[0]) as string | undefined;
  const pTermsVersion = V8_ENABLED ? Number(pRaw?.latestTermsVersion ?? pRaw?.[4] ?? 0) : 0;
  /* Three distinct facts, not one: the read failed (no answer to judge), the id
     is not on the registry (settled read, no owner), or the terms are in hand. */
  const providerReadFailed = providerIdNum > 0 && providerQuery.isError;
  const providerMissing = providerIdNum > 0 && !providerReadFailed &&
    providerQuery.isFetched && !providerQuery.isLoading &&
    (!pOwner || pOwner === "0x0000000000000000000000000000000000000000");
  const providerReady = providerIdNum > 0 && !providerReadFailed && !providerMissing && providerQuery.isFetched;
  const { data: pTermsData } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_V8,
    functionName: "getTerms",
    args: [BigInt(providerIdNum || 1), pTermsVersion],
    chainId: arcTestnet.id,
    query: { enabled: V8_ENABLED && providerReady && pTermsVersion > 0 },
  });
  const pTermsRaw = pTermsData as Record<string | number, unknown> | undefined;
  const pStake = usdc(pRaw?.stake ?? pRaw?.[2]);
  const pPrice = usdc(pRaw?.pricePerCall ?? pRaw?.[3]);
  const pWindow = V8_ENABLED
    ? Number(pTermsRaw?.maxResponseTime ?? pTermsRaw?.[1] ?? 0)
    : Number(pRaw?.maxResponseTime ?? pRaw?.[4] ?? 0);
  const pSlashBps = V8_ENABLED
    ? Number(pTermsRaw?.slashBps ?? pTermsRaw?.[2] ?? 0)
    : Number(pRaw?.slashBps ?? pRaw?.[5] ?? 0);
  const pActive = Boolean(pRaw?.active ?? pRaw?.[V8_ENABLED ? 5 : 6] ?? false);
  const pConcurrent = Number(pRaw?.maxConcurrentCalls ?? pRaw?.[V8_ENABLED ? 9 : 7] ?? 0);

  /* The seven steps the brief asks the board to communicate, each one from a
     real field. Anything the indexer does not carry says so instead of guessing:
     execution time is not in the calls entity, so it is named as not indexed. */
  const terms = selected ? [
    {
      k: "Provider configuration",
      v: providerReadFailed
        ? "unavailable — the registry read failed, so the terms are unknown"
        : providerMissing
          ? `not registered on the registry (provider #${providerIdNum})`
          : providerReady
            ? `${pActive ? "active" : "inactive"} · ${pConcurrent > 0 ? `up to ${pConcurrent} concurrent` : "no concurrency cap recorded"}`
            : "reading the registry…",
    },
    {
      k: "Stake and pricing",
      v: providerReady
        ? `${pStake ?? "—"} USDC staked · ${pPrice ?? "—"} USDC per call · slash ${(pSlashBps / 100).toFixed(1)}% · max ${pWindow}s`
        : providerMissing
          ? "no stake or price to show — the provider id is not on the registry"
          : "unavailable until the provider record loads",
    },
    {
      k: "Caller request and payment",
      v: `${usdc(selected.amount) ?? "—"} USDC escrowed · requested ${when(selected.createdAt) ?? "unknown"}`,
    },
    { k: "Request execution", v: "not indexed — the subgraph does not record the response time" },
    {
      k: "Receipt",
      /* The zero hash is what an unfulfilled call carries, and it is truthy: a
         truthiness test would call a failed call "verified". Measured on the
         SLASHED mock call, whose stage said "no valid receipt". */
      v: /^0x0+$/i.test(String(selected.responseHash ?? "")) || !selected.responseHash
        ? `no receipt recorded · request ${short(selected.requestHash)}`
        : `verified · ${short(selected.requestHash)} → ${short(selected.responseHash)}`,
    },
    {
      k: "Settlement or timeout",
      /* `CallSlashed` always writes `completedAt` (subgraph/src/mapping.ts), so a
         slash is a settlement event with a timestamp — there is no indexed flag
         that separates "window closed" from "receipt failed to verify". The row
         names what the data shows and no more. */
      v: selected.completedAt
        ? String(selected.status) === "SLASHED"
          ? positiveUsdc(selected.slashed)
            ? `timeout claimed ${when(selected.completedAt) ?? "on chain"} — no valid receipt; ${positiveUsdc(selected.slashed)} USDC slashed from the provider stake`
            : `timeout claimed ${when(selected.completedAt) ?? "on chain"} — no valid receipt; no provider stake was slashed`
          : `receipt indexed ${when(selected.completedAt) ?? "on chain"} — the escrow became claimable by the provider; the withdrawal is a separate transaction`
        : "no settlement recorded yet",
    },
    {
      k: "Refund or slash",
      v: [
        refundedAmount(selected.refunded) ? `${refundedAmount(selected.refunded)} USDC refunded to the caller` : null,
        refundedAmount(selected.slashed) ? `${refundedAmount(selected.slashed)} USDC slashed from the provider stake` : null,
      ].filter(Boolean).join(" · ") || "neither refunded nor slashed",
    },
  ] : [];

  return (
    <div className="ov-page tx-page">
      <PageHeader
        title="Transactions"
        subtitle="Calls and indexed outcomes for this wallet on Arc Testnet."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => exportHistory(filtered, "csv")}>Export CSV</Button>
            <Button variant="secondary" size="sm" onClick={() => exportHistory(filtered, "json")}>Export JSON</Button>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>Refresh</Button>
          </>
        }
      />

      {/* Counts and filters read the wallet's Arc history, so they are withheld
          while the wallet is on another chain: an Arc total on the wrong chain
          is a number the reader cannot act on. */}
      {!wrongNetwork && (
        <div className="ov-grid4">
          <StatCard label="Total calls" value={all.length} loading={loading} />
          <StatCard label="Completed" value={completed} loading={loading} />
          <StatCard label="Open" value={open} loading={loading} />
          <StatCard label="Timeout claims" value={slashed} loading={loading} />
        </div>
      )}

      {!wrongNetwork && (
      <Toolbar>
        <Input
          placeholder="Search by call ID or provider…"
          value={search}
          onChange={e => onSearch(e.target.value)}
          aria-label="Search transactions"
        />
        <ChipRow>
          {FILTERS.map(f => (
            <Chip key={f.id} active={statusFilter === f.id} onClick={() => onFilter(f.id)}>{f.label}</Chip>
          ))}
        </ChipRow>
      </Toolbar>
      )}

      {address && !wrongNetwork && (indexedAt || indexingErrors || (!!error && all.length > 0)) && (
        /* Freshness, in the indexer's own words: lag is measured from the block
           it last indexed, its error flag is repeated rather than hidden, and a
           failed refresh is named when there is older data still on screen. */
        <p className={`tx-fresh${stale || indexingErrors || !!error ? " tx-fresh--stale" : ""}`} role="status">
          {error && all.length > 0 && "The last refresh failed, so this is the most recent data that arrived. "}
          {indexingErrors && "The indexer reports indexing errors, so these figures may be incomplete. "}
          {indexedAt && (
            <>
              Last indexed block {meta?.block?.number ?? "—"} at {indexedAt.toLocaleTimeString()}
              {stale ? ` — ${lagMin} minutes behind, values may be stale` : ""}
              {isFetching ? " · refreshing" : ""}
            </>
          )}
        </p>
      )}

      {!address && (
        <SectionCard className="tx-block">
          <EmptyState title="Connect a wallet" description="Your on-chain call history appears here once a wallet is connected." />
        </SectionCard>
      )}

      {wrongNetwork && (
        <SectionCard className="tx-block">
          <ErrorState
            title="Wrong network"
            description={`This wallet is on chain ${chainId}. Call history is read from Arc Testnet (${arcTestnet.id}), so nothing is shown as Arc data until the wallet is there.`}
            action={
              <Button
                variant="primary"
                size="sm"
                disabled={switchingChain}
                onClick={() => switchChain({ chainId: arcTestnet.id })}
              >
                {switchingChain ? "Switching…" : "Switch to Arc Testnet"}
              </Button>
            }
          />
        </SectionCard>
      )}

      {address && !wrongNetwork && !!error && all.length === 0 && (
        <SectionCard className="tx-block">
          <ErrorState
            title="Call history is unavailable"
            description="The subgraph did not answer, so no call is shown. This is a read failure, not an empty history."
            detail={String((error as Error)?.message ?? error)}
            action={<Button variant="secondary" size="sm" onClick={() => void refetch()}>Retry</Button>}
          />
        </SectionCard>
      )}

      {address && !wrongNetwork && (
        <div className="tx-split">
          <SectionCard className="tx-block" title={`${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`} bodyClass="tx-block__body">
            {loading && (
              <div className="tx-skel">
                {[...Array(6)].map((_, i) => <Skeleton key={i} height={62} />)}
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <EmptyState
                title={statusFilter === "all" ? "No calls indexed yet" : "No calls match this filter"}
                description={statusFilter === "all"
                  ? "No call for this wallet is in the indexer yet. A call that just confirmed can take a moment to appear; a missing row is not a failed transaction."
                  : "The indexer answered and no indexed call has this status. Try the All filter."}
              />
            )}

            {!loading && paged.map(c => {
              const id = String(c.id);
              const status = String(c.status);
              const amount = usdc(c.amount);
              const isSel = selectedId === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`tx-row${isSel ? " tx-row--on" : ""}`}
                  onClick={() => setSelectedId(isSel ? null : id)}
                  aria-pressed={isSel}
                >
                  <span className={`tx-row__dot tx-row__dot--${(STATUS_TONE[status] ?? "neutral")}`} />
                  <span className="tx-row__id mono">{id.slice(0, 14)}…</span>
                  <span className="tx-row__meta">
                    <span className="tx-row__prov">Provider #{String(c.providerId)}</span>
                    <span className="tx-row__time">{when(c.createdAt) ?? "—"}</span>
                  </span>
                  <span className="tx-row__amt">{amount ? `${amount} USDC` : "—"}</span>
                  <Badge tone={STATUS_TONE[status] ?? "neutral"}>{callStatusLabel(status)}</Badge>
                </button>
              );
            })}

            {totalPages > 1 && (
              <div className="tx-pager">
                <Button variant="secondary" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Prev</Button>
                <span className="tx-pager__lbl">Page {currentPage + 1} / {totalPages}</span>
                <Button variant="secondary" size="sm" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>Next</Button>
              </div>
            )}
          </SectionCard>

          <div className="tx-detail">
            {!selected && (
              <SectionCard className="tx-block">
                <EmptyState
                  title="Select a transaction"
                  description="Pick a row to trace its SLA lifecycle, hashes and settlement."
                />
              </SectionCard>
            )}

            {selected && (
              <>
                <div className="tx-detail__head">
                  <button
                    type="button"
                    className="tx-back"
                    aria-label="Back to transaction list"
                    onClick={() => setSelectedId(null)}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div className="tx-detail__title">
                    <span className="tx-detail__eyebrow">Transaction Details</span>
                    <span className="tx-detail__id mono">{String(selected.id).slice(0, 22)}…</span>
                  </div>
                  <Badge tone={STATUS_TONE[String(selected.status)] ?? "neutral"}>
                    {callStatusLabel(selected.status)}
                  </Badge>
                </div>

                <SectionCard
                  title="SLA Canvas"
                  subtitle={`Call ${String(selected.id).slice(0, 18)}…`}
                >
                  <SLACanvas
                    stages={slaStages(String(selected.status), {
                      amount: usdc(selected.amount) ?? undefined,
                    })}
                    selected={stageKey}
                    onSelect={setStageKey}
                  />
                  <ul className="sla-legend">
                    <li><span className="sla-legend__sw sla-legend__sw--done" />Success</li>
                    <li><span className="sla-legend__sw sla-legend__sw--pending" />Pending</li>
                    <li><span className="sla-legend__sw sla-legend__sw--failed" />Failed</li>
                  </ul>
                  {/* The seven steps of the brief, each from a real field, with
                      the gaps named instead of filled in. */}
                  <dl className="sla-terms">
                    {terms.map(row => (
                      <div key={row.k} className="sla-terms__row">
                        <dt>{row.k}</dt>
                        <dd>{row.v}</dd>
                      </div>
                    ))}
                  </dl>
                </SectionCard>

                <SectionCard title="Lifecycle steps" bodyClass="tx-block__body">
                  <Stepper steps={statusSteps(String(selected.status), usdc(selected.amount) ?? undefined)} />
                </SectionCard>

                <SectionCard title="Details" bodyClass="tx-block__body">
                  <dl className="tx-fields">
                    {[
                      { k: "Call ID", v: String(selected.id), mono: true, copy: true },
                      { k: "Provider", v: `#${String(selected.providerId)}`, mono: true },
                      { k: "Amount", v: usdc(selected.amount) ? `${usdc(selected.amount)} USDC` : "—", mono: true },
                      { k: "Status", v: `${callStatusLabel(selected.status)} · ${String(selected.status) || "unknown"}` },
                      { k: "Transaction hash", v: "not indexed — the subgraph stores the call id, so no explorer transaction link can be built" },
                      { k: "Created", v: when(selected.createdAt) ?? "—" },
                      { k: "Completed", v: when(selected.completedAt) ?? "—" },
                      { k: "Request hash", v: selected.requestHash ? String(selected.requestHash) : "—", mono: true },
                      { k: "Response hash", v: selected.responseHash ? String(selected.responseHash) : "—", mono: true },
                    ].map(f => (
                      <div key={f.k} className="tx-field">
                        <dt>{f.k}</dt>
                        <dd className={f.mono ? "mono" : undefined}>
                          {f.v}
                          {f.copy && (
                            <button
                              type="button"
                              className="tx-copy"
                              aria-label="Copy call ID"
                              onClick={() => navigator.clipboard?.writeText(String(selected.id)).catch(() => {})}
                            >
                              Copy
                            </button>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {(positiveUsdc(selected.refunded) || positiveUsdc(selected.slashed)) && (
                    <div className="tx-flags">
                      {positiveUsdc(selected.refunded) && <Badge tone="info" dot>Refunded to caller</Badge>}
                      {positiveUsdc(selected.slashed) && <Badge tone="slash" dot>Stake slashed</Badge>}
                    </div>
                  )}
                  {/* Only a Completed call can be disputed, and the panel is
                      where the call id, provider and bond are explained. Hand
                      the id over instead of asking the user to copy it. */}
                  {String(selected.status) === "COMPLETED" && (
                    <div className="tx-flags" style={{ alignItems: "center", gap: 8 }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openDispute(String(selected.id), String(selected.providerId ?? ""))}
                      >
                        Open dispute →
                      </Button>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Opens Disputes with this call. A dispute needs a 2 USDC bond and must start
                        inside the 7-day window after the receipt.
                      </span>
                    </div>
                  )}
                </SectionCard>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
