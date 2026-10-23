import { useCallback, useDeferredValue, useId, useMemo, useState } from "react";
import { useReadContracts } from "wagmi";
import { CONFIG, ACTIVE_REGISTRY_ADDRESS, V8_ENABLED, REGISTRY_ABI, REGISTRY_ABI_V8 } from "../../lib/config";
import { useProviders } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import type { Provider } from "../../lib/subgraph";
import {
  AddressPill, Badge, Button, Chip, ChipRow, EmptyState, ErrorState,
  PageHeader, Select, Skeleton,
} from "../../ui";
import { Search } from "lucide-react";
import {
  callOutcomes, countLabel, filterProviders, honorRate, isFilterActive,
  reputationBand, reputationScore, sortProviders, usdcCompact, usdcExact,
  usdcFromInput, type ProviderRow, type ProviderSortKey, type SortDir,
} from "./providerMetrics";
import { ProviderCompareModal } from "./ProviderCompare";

const REGISTRY = ACTIVE_REGISTRY_ADDRESS;

/* Sort labels and the direction each key starts in. "Lowest price" must start
   ascending; the old panel forced descending for every key, which is why the
   cheapest filter showed the most expensive provider first. */
const SORTS: { key: ProviderSortKey; label: string; first: SortDir }[] = [
  { key: "reputation", label: "Registry score", first: "desc" },
  { key: "price",      label: "Price per call", first: "asc"  },
  { key: "completed",  label: "Completed calls", first: "desc" },
  { key: "stake",      label: "Stake", first: "desc" },
  { key: "response",   label: "Response window", first: "asc" },
];

/* ── on-chain merge ──────────────────────────────────────────────────────
   The subgraph does not index maxResponseTime or slashBps, so the list reads
   them from the registry in one batched multicall. A failed entry stays null:
   "not readable" is a value the card can show, an invented 0 is not. */
type ChainEntry = { status?: string; result?: unknown };

function chainFields(entry: ChainEntry | undefined): { maxResponseTime: number | null; slashBps: number | null } {
  const empty = { maxResponseTime: null, slashBps: null };
  if (!entry || entry.status !== "success" || entry.result == null) return empty;
  const t = entry.result;
  if (Array.isArray(t)) {
    const resp = Number(t[4]);
    const slash = Number(t[5]);
    return {
      maxResponseTime: Number.isFinite(resp) ? resp : null,
      slashBps: Number.isFinite(slash) ? slash : null,
    };
  }
  if (typeof t === "object") {
    const o = t as Record<string, unknown>;
    const resp = Number(o.maxResponseTime);
    const slash = Number(o.slashBps);
    return {
      maxResponseTime: Number.isFinite(resp) ? resp : null,
      slashBps: Number.isFinite(slash) ? slash : null,
    };
  }
  return empty;
}

/* v8 moved maxResponseTime/slashBps into getTerms. The provider view only
   carries the latest version, so the batched read needs a second pass. */
function chainTermsVersion(entry: ChainEntry | undefined): number {
  if (!entry || entry.status !== "success" || entry.result == null) return 0;
  const t = entry.result;
  if (Array.isArray(t)) return Number(t[4] ?? 0);
  if (typeof t === "object") return Number((t as Record<string, unknown>).latestTermsVersion ?? 0);
  return 0;
}

function termsFields(entry: ChainEntry | undefined): { maxResponseTime: number | null; slashBps: number | null } {
  if (!entry || entry.status !== "success" || entry.result == null) return { maxResponseTime: null, slashBps: null };
  const t = entry.result;
  if (Array.isArray(t)) {
    const resp = Number(t[1]);
    const slash = Number(t[2]);
    return {
      maxResponseTime: Number.isFinite(resp) ? resp : null,
      slashBps: Number.isFinite(slash) ? slash : null,
    };
  }
  if (typeof t === "object") {
    const o = t as Record<string, unknown>;
    const resp = Number(o.maxResponseTime);
    const slash = Number(o.slashBps);
    return {
      maxResponseTime: Number.isFinite(resp) ? resp : null,
      slashBps: Number.isFinite(slash) ? slash : null,
    };
  }
  return { maxResponseTime: null, slashBps: null };
}

/* ── call-outcome bar ────────────────────────────────────────────────────
   Real completed/slashed counts as a proportion. Replaces a canvas chart that
   drew `Math.random()` values and called the result a reputation trend. */
function OutcomeBar({ completed, slashed }: { completed: number; slashed: number }) {
  const { total } = callOutcomes(completed, slashed);
  const completedPct = total > 0 ? (completed / total) * 100 : 0;
  return (
    <div className="mp-outcomes">
      <div className="mp-outcome-bar" aria-hidden="true">
        {total === 0
          ? <span className="mp-outcome-none" />
          : (
            <>
              {completed > 0 && <span className="mp-outcome-done" style={{ width: `${completedPct}%` }} />}
              {slashed > 0 && <span className="mp-outcome-slash" style={{ width: `${100 - completedPct}%` }} />}
            </>
          )}
      </div>
      <span className="mp-outcome-text">
        {total === 0
          ? "No settled calls yet"
          : `${countLabel(completed)} completed · ${countLabel(slashed)} slashed`}
      </span>
    </div>
  );
}

/* ── provider card ───────────────────────────────────────────────────────*/
function ProviderCard({ p, onCall, onCompare, onProfile, inCompare }: {
  p: ProviderRow;
  onCall: (p: ProviderRow) => void;
  onCompare: (p: ProviderRow) => void;
  onProfile: (id: string) => void;
  inCompare: boolean;
}) {
  const nameId = useId();
  const score = reputationScore(p.completedCalls, p.slashedCalls);
  const band = reputationBand(score);
  const honor = honorRate(p.completedCalls, p.slashedCalls);
  const price = usdcExact(p.pricePerCall);
  const stake = usdcCompact(p.stake);
  const total = p.completedCalls + p.slashedCalls;
  const response = typeof p.maxResponseTime === "number" ? `${p.maxResponseTime}s` : "not readable";

  return (
    <article className={`mp-card${inCompare ? " mp-card-sel" : ""}`} aria-labelledby={nameId}>
      <div className="mp-card-head">
        <div className="mp-card-id-row">
          <span className={`mp-dot${p.active ? " mp-dot-on" : ""}`} aria-hidden="true" />
          <Badge tone={p.active ? "guard" : "neutral"} dot>{p.active ? "Active" : "Inactive"}</Badge>
          {p.nftBound && <Badge tone="info">NFT #{p.nftTokenId ?? "?"}</Badge>}
        </div>
        <span className={`mp-score mp-score--${band.key}`} title="Registry score: ((completed + 2) × 100) / (completed + slashed + 3), the same formula as getReputationScore">
          {score}
          <span className="mp-score-of">/100</span>
        </span>
      </div>

      <h2 className="mp-card-name" id={nameId}>Provider #{p.id}</h2>
      <div className="mp-card-owner">
        <AddressPill value={p.owner} href={CONFIG.explorerAddr(p.owner)} />
      </div>

      <dl className="mp-metrics">
        <div className="mp-metric">
          <dt className="mp-metric-lbl">Price / call</dt>
          <dd className="mp-metric-val mp-val-green">
            {price ?? "unreadable"} <span className="mp-metric-unit">USDC</span>
          </dd>
        </div>
        <div className="mp-metric">
          <dt className="mp-metric-lbl">Response window</dt>
          <dd className="mp-metric-val">{response}</dd>
        </div>
        <div className="mp-metric">
          <dt className="mp-metric-lbl">Stake</dt>
          <dd className="mp-metric-val">
            {stake ?? "unreadable"} <span className="mp-metric-unit">USDC</span>
          </dd>
        </div>
        <div className="mp-metric">
          <dt className="mp-metric-lbl">Calls</dt>
          <dd className="mp-metric-val">
            {countLabel(total)}
            {honor !== null && <span className="mp-metric-unit"> · {honor}% completed</span>}
          </dd>
        </div>
      </dl>

      <OutcomeBar completed={p.completedCalls} slashed={p.slashedCalls} />

      <div className="mp-card-actions">
        <button
          type="button"
          className="mp-btn-call"
          onClick={() => onCall(p)}
          disabled={!p.active}
          title={p.active ? undefined : "This provider is inactive and cannot take calls."}
        >
          {p.active ? "Call this provider" : "Inactive"}
          {p.active && <span className="mp-arrow" aria-hidden="true">→</span>}
        </button>
        <Button variant="secondary" size="sm" onClick={() => onProfile(p.id)}>
          Details
        </Button>
        <button
          type="button"
          className={`mp-btn-cmp${inCompare ? " mp-btn-cmp-on" : ""}`}
          onClick={() => onCompare(p)}
          aria-pressed={inCompare}
          aria-label={inCompare ? `Remove provider #${p.id} from comparison` : `Add provider #${p.id} to comparison`}
          title={inCompare ? "Remove from comparison" : "Add to comparison"}
        >
          {inCompare ? "✓" : "+"}
        </button>
      </div>
    </article>
  );
}

/* ── panel ───────────────────────────────────────────────────────────────*/
export default function Marketplace() {
  const { data: providers = [], isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useProviders();
  const { setPanel } = useAppStore();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [activeOnly, setActiveOnly] = useState(false);
  const [nftOnly, setNftOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [minStake, setMinStake] = useState("");
  const [minReputation, setMinReputation] = useState<"" | 70 | 80 | 90>("");
  const [maxResponse, setMaxResponse] = useState<"" | 5 | 30 | 60 | 300>("");
  const [sortKey, setSortKey] = useState<ProviderSortKey>("reputation");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [compareList, setCompareList] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  /* Batched read of the fields the subgraph does not index. */
  const { data: chainData, isError: chainError } = useReadContracts({
    contracts: providers.map(p => ({
      address: REGISTRY,
      abi: V8_ENABLED ? REGISTRY_ABI_V8 : REGISTRY_ABI,
      functionName: "getProvider" as const,
      args: [BigInt(p.id)] as const,
    })),
    query: { enabled: providers.length > 0, staleTime: 15_000 },
  });

  const { data: termsData } = useReadContracts({
    contracts: providers.map((p, i) => ({
      address: REGISTRY,
      abi: REGISTRY_ABI_V8,
      functionName: "getTerms" as const,
      args: [BigInt(p.id), chainTermsVersion((chainData as unknown as ChainEntry[] | undefined)?.[i])] as const,
    })),
    query: { enabled: V8_ENABLED && providers.length > 0, staleTime: 15_000 },
  });

  const rows: ProviderRow[] = useMemo(() => providers.map((p: Provider, i: number) => {
    const entry = (chainData as unknown as ChainEntry[] | undefined)?.[i];
    const fields = V8_ENABLED
      ? termsFields((termsData as unknown as ChainEntry[] | undefined)?.[i])
      : chainFields(entry);
    return { ...p, ...fields };
  }), [providers, chainData, termsData]);

  const readableResponse = rows.filter(p => typeof p.maxResponseTime === "number").length;
  const responseReady = providers.length === 0 || readableResponse > 0;

  const filters = useMemo(() => ({
    search: deferredSearch,
    activeOnly,
    nftOnly,
    maxPrice,
    minStake,
    minReputation: minReputation === "" ? null : minReputation,
    maxResponseTime: maxResponse === "" ? null : maxResponse,
  }), [deferredSearch, activeOnly, nftOnly, maxPrice, minStake, minReputation, maxResponse]);
  const narrowed = isFilterActive(filters);
  const filtered = useMemo(
    () => sortProviders(filterProviders(rows, filters), sortKey, sortDir),
    [rows, filters, sortKey, sortDir],
  );

  const priceError = maxPrice.trim() && usdcFromInput(maxPrice) === null
    ? "Enter an amount with up to 6 decimals." : null;
  const stakeError = minStake.trim() && usdcFromInput(minStake) === null
    ? "Enter an amount with up to 6 decimals." : null;

  const reset = useCallback(() => {
    setSearch(""); setActiveOnly(false); setNftOnly(false);
    setMaxPrice(""); setMinStake(""); setMinReputation(""); setMaxResponse("");
    setSortKey("reputation"); setSortDir("desc");
  }, []);

  const handleCall = useCallback((p: ProviderRow) => {
    // CallBuilder reads and clears this key on mount.
    sessionStorage.setItem("callbuilder_provider", p.id);
    setPanel("calls");
  }, [setPanel]);

  const handleProfile = useCallback((id: string) => {
    sessionStorage.setItem("provprofile_id", id);
    setPanel("provprofile");
  }, [setPanel]);

  const handleCompare = useCallback((p: ProviderRow) => {
    setCompareList(prev =>
      prev.includes(p.id) ? prev.filter(id => id !== p.id)
        : prev.length < 4 ? [...prev, p.id] : prev,
    );
  }, []);

  const cmpProviders = useMemo(
    () => rows.filter(p => compareList.includes(p.id)),
    [rows, compareList],
  );

  const updatedLabel = (() => {
    if (!dataUpdatedAt) return "not loaded yet";
    const secs = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000));
    if (secs < 60) return `${secs}s ago`;
    return `${Math.round(secs / 60)}m ago`;
  })();

  return (
    <div className="mp-root">
      <PageHeader
        title="Marketplace"
        subtitle="Registered SLA providers on Arc Testnet. Prices, stakes and call counts come from the Goldsky subgraph; response windows and slash terms from the registry."
        actions={
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="mp-controls">
        <div className="mp-search-wrap">
          <Search size={15} className="mp-search-icon" aria-hidden="true" />
          <label className="visually-hidden" htmlFor="mp-search">Search providers by id, owner or signer address</label>
          <input
            id="mp-search"
            className="mp-search"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by provider id or address…"
            autoComplete="off"
          />
          {search && (
            <button type="button" className="mp-search-x" onClick={() => setSearch("")} aria-label="Clear search">✕</button>
          )}
        </div>

        <ChipRow>
          <Chip active={!narrowed} onClick={reset}>All</Chip>
          <Chip active={activeOnly} onClick={() => setActiveOnly(v => !v)}>Active only</Chip>
          <Chip active={nftOnly} onClick={() => setNftOnly(v => !v)}>NFT-bound</Chip>
        </ChipRow>

        <div className="mp-ctrl-right">
          <Select
            value={sortKey}
            onChange={e => {
              const key = e.target.value as ProviderSortKey;
              setSortKey(key);
              setSortDir(SORTS.find(s => s.key === key)?.first ?? "desc");
            }}
            aria-label="Sort providers by"
          >
            {SORTS.map(s => (
              <option key={s.key} value={s.key} disabled={s.key === "response" && !responseReady}>
                {s.label}
              </option>
            ))}
          </Select>
          <button
            type="button"
            className="mp-sortdir"
            onClick={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))}
            aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}. Switch to ${sortDir === "asc" ? "descending" : "ascending"}.`}
            title={sortDir === "asc" ? "Ascending (click for descending)" : "Descending (click for ascending)"}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
          <div className="mp-view-grp" role="group" aria-label="Layout">
            <button type="button" className={`mp-view-btn${view === "list" ? " mp-view-on" : ""}`} onClick={() => setView("list")} aria-pressed={view === "list"} aria-label="List layout">≡</button>
            <button type="button" className={`mp-view-btn${view === "grid" ? " mp-view-on" : ""}`} onClick={() => setView("grid")} aria-pressed={view === "grid"} aria-label="Grid layout">⊞</button>
          </div>
        </div>
      </div>

      {/* Filters use only fields that exist: everything below is either indexed
          or read from the registry. There is no name/description filter because
          neither field is stored by the protocol. */}
      <div className="mp-filters">
        <div className={`mp-field${priceError ? " mp-field-invalid" : ""}`}>
          <label htmlFor="mp-max-price">Max price / call</label>
          <div className="mp-field-row">
            <input
              id="mp-max-price"
              className="mp-filter-input"
              inputMode="decimal"
              value={maxPrice}
              onChange={e => setMaxPrice(e.target.value)}
              placeholder="any"
              aria-invalid={Boolean(priceError)}
              aria-describedby={priceError ? "mp-max-price-err" : undefined}
            />
            <span className="mp-field-unit">USDC</span>
          </div>
          {priceError && <p className="mp-field-err" id="mp-max-price-err">{priceError}</p>}
        </div>

        <div className={`mp-field${stakeError ? " mp-field-invalid" : ""}`}>
          <label htmlFor="mp-min-stake">Min stake</label>
          <div className="mp-field-row">
            <input
              id="mp-min-stake"
              className="mp-filter-input"
              inputMode="decimal"
              value={minStake}
              onChange={e => setMinStake(e.target.value)}
              placeholder="any"
              aria-invalid={Boolean(stakeError)}
              aria-describedby={stakeError ? "mp-min-stake-err" : undefined}
            />
            <span className="mp-field-unit">USDC</span>
          </div>
          {stakeError && <p className="mp-field-err" id="mp-min-stake-err">{stakeError}</p>}
        </div>

        <div className="mp-field">
          <label htmlFor="mp-min-rep">Min registry score</label>
          <Select id="mp-min-rep" value={minReputation} onChange={e => setMinReputation(e.target.value === "" ? "" : Number(e.target.value) as 70 | 80 | 90)}>
            <option value="">Any</option>
            <option value={70}>70+</option>
            <option value={80}>80+</option>
            <option value={90}>90+</option>
          </Select>
        </div>

        <div className="mp-field">
          <label htmlFor="mp-max-resp">Max response window</label>
          <Select
            id="mp-max-resp"
            value={maxResponse}
            disabled={!responseReady}
            onChange={e => setMaxResponse(e.target.value === "" ? "" : Number(e.target.value) as 5 | 30 | 60 | 300)}
          >
            <option value="">Any</option>
            <option value={5}>≤ 5s</option>
            <option value={30}>≤ 30s</option>
            <option value={60}>≤ 60s</option>
            <option value={300}>≤ 300s</option>
          </Select>
          {!responseReady && <p className="mp-field-hint">Waiting for the registry…</p>}
        </div>

        <div className="mp-filter-reset">
          <Button variant="ghost" size="sm" onClick={reset} disabled={!narrowed && sortKey === "reputation" && sortDir === "desc"}>
            Reset filters
          </Button>
        </div>
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {isLoading ? "Loading providers" : `${filtered.length} of ${providers.length} providers shown`}
      </p>

      {compareList.length >= 2 && (
        <div className="mp-cmp-bar">
          <div className="mp-cmp-bar-l">
            <span className="mp-cmp-count">{compareList.length}</span>
            <span className="mp-cmp-lbl">selected</span>
            {compareList.map(id => (
              <span key={id} className="mp-cmp-pill">
                #{id}
                <button type="button" onClick={() => setCompareList(l => l.filter(x => x !== id))} aria-label={`Remove provider #${id} from comparison`}>✕</button>
              </span>
            ))}
          </div>
          <Button size="sm" onClick={() => setShowCompare(true)}>Compare</Button>
        </div>
      )}

      <div className="mp-content">
        {isLoading ? (
          <div className={view === "grid" ? "mp-grid" : "mp-list"} aria-busy="true">
            {[...Array(6)].map((_, i) => (
              <div className="mp-card" key={i}>
                <Skeleton width="45%" height={16} />
                <div style={{ height: 10 }} />
                <Skeleton width="65%" height={12} />
                <div style={{ height: 18 }} />
                <Skeleton width="100%" height={54} radius={8} />
                <div style={{ height: 14 }} />
                <Skeleton width="100%" height={34} radius={999} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title="The provider index could not be loaded."
            description="The Marketplace reads the Goldsky subgraph. The list below is unavailable until that request succeeds."
            detail={error instanceof Error ? error.message : undefined}
            action={<Button size="sm" onClick={() => refetch()}>Retry</Button>}
          />
        ) : providers.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true">◎</span>}
            title="No providers are registered yet"
            description="Registration writes the first provider record to the registry. Until then the Marketplace has nothing to list."
            action={<Button size="sm" onClick={() => setPanel("register")}>Become a provider</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true">⌕</span>}
            title="No providers match these filters"
            description={`${providers.length} providers are registered; none pass the current filters.`}
            action={<Button size="sm" onClick={reset}>Reset filters</Button>}
          />
        ) : (
          <div className={view === "grid" ? "mp-grid" : "mp-list"}>
            {filtered.map(p => (
              <ProviderCard
                key={p.id}
                p={p}
                onCall={handleCall}
                onCompare={handleCompare}
                onProfile={handleProfile}
                inCompare={compareList.includes(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {!isLoading && !isError && providers.length > 0 && (
        <div className="mp-footer">
          <span>
            {filtered.length === providers.length
              ? `${providers.length} ${providers.length === 1 ? "provider" : "providers"}`
              : `${filtered.length} of ${providers.length} providers`}
          </span>
          <span className="mp-sep" aria-hidden="true">·</span>
          <span>Goldsky subgraph + registry</span>
          <span className="mp-sep" aria-hidden="true">·</span>
          <span>updated {updatedLabel}</span>
          {isFetching && <><span className="mp-sep" aria-hidden="true">·</span><span>refreshing…</span></>}
          {chainError && (
            <>
              <span className="mp-sep" aria-hidden="true">·</span>
              <span className="mp-footer-warn">
                response windows unreadable for {providers.length - readableResponse} of {providers.length}
              </span>
            </>
          )}
          {sortKey === "response" && !responseReady && (
            <>
              <span className="mp-sep" aria-hidden="true">·</span>
              <span className="mp-footer-warn">response order needs the registry read</span>
            </>
          )}
        </div>
      )}

      {showCompare && cmpProviders.length >= 2 && (
        <ProviderCompareModal providers={cmpProviders} onClose={() => setShowCompare(false)} onCall={handleCall} />
      )}
    </div>
  );
}
