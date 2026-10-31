import { useCallback, useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { CONFIG, ACTIVE_REGISTRY_ADDRESS, V8_ENABLED, REGISTRY_ABI, REGISTRY_ABI_V8 } from "../../lib/config";
import { useSubgraph } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import {
  AddressPill, Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton, Tabs,
} from "../../ui";
import {
  countLabel, reputationScore, usdcExact, type ProviderRow,
} from "./providerMetrics";
import { ProviderCompareModal } from "./ProviderCompare";

const REGISTRY = ACTIVE_REGISTRY_ADDRESS;

/* One dataset for all three rankings. The score is computed from the counters,
   so the subgraph cannot order by it; ranking client-side over one bounded
   fetch keeps the three tabs consistent with each other. */
const QUERY = `{
  providers(first: 1000) {
    id owner signer stake pricePerCall active
    completedCalls slashedCalls
  }
}`;

type Tab = "score" | "price" | "slashed";

const TABS: { id: Tab; label: string }[] = [
  { id: "score", label: "Registry score" },
  { id: "price", label: "Lowest price" },
  { id: "slashed", label: "Most slashed" },
];

const PAGE = 20;

function rankScore(a: ProviderRow, b: ProviderRow) {
  return reputationScore(b.completedCalls, b.slashedCalls) - reputationScore(a.completedCalls, a.slashedCalls)
    || b.completedCalls - a.completedCalls
    || Number(a.id) - Number(b.id);
}

function byPrice(a: ProviderRow, b: ProviderRow) {
  const av = BigInt(a.pricePerCall || "0");
  const bv = BigInt(b.pricePerCall || "0");
  if (av !== bv) return av < bv ? -1 : 1;
  return Number(a.id) - Number(b.id);
}

function bySlashed(a: ProviderRow, b: ProviderRow) {
  return b.slashedCalls - a.slashedCalls || Number(a.id) - Number(b.id);
}

export default function Leaderboard() {
  const { address } = useAccount();
  const { setPanel } = useAppStore();
  const [tab, setTab] = useState<Tab>("score");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } =
    useSubgraph<{ providers?: ProviderRow[] }>(QUERY, { pollInterval: 60_000 });

  const providers: ProviderRow[] = useMemo(
    () => (data?.providers ?? []).filter(p => p && p.id),
    [data],
  );

  /* Ranking, per tab. */
  const ranked = useMemo(() => {
    const rows = [...providers];
    if (tab === "score") return rows.sort(rankScore);
    if (tab === "price") return rows.filter(p => p.active).sort(byPrice);
    return rows.filter(p => p.slashedCalls > 0).sort(bySlashed);
  }, [providers, tab]);

  const shown = ranked.slice(0, PAGE);
  const myAddr = address?.toLowerCase();

  /* The comparison includes the response window, which the subgraph does not
     index. Read it for the few selected providers only. */
  const { data: chainData } = useReadContracts({
    contracts: compareIds.map(id => ({
      address: REGISTRY,
      abi: V8_ENABLED ? REGISTRY_ABI_V8 : REGISTRY_ABI,
      functionName: "getProvider" as const,
      args: [BigInt(id)] as const,
    })),
    query: { enabled: compareIds.length > 0, staleTime: 15_000 },
  });

  const { data: termsData } = useReadContracts({
    contracts: compareIds.map((id, i) => {
      const entry = (chainData as unknown as { status?: string; result?: unknown }[] | undefined)?.[i];
      const result = entry?.status === "success" ? entry.result : null;
      const version = Array.isArray(result)
        ? Number(result[4] ?? 0)
        : Number((result as Record<string, unknown> | null)?.latestTermsVersion ?? 0);
      return {
        address: REGISTRY,
        abi: REGISTRY_ABI_V8,
        functionName: "getTerms" as const,
        args: [BigInt(id), version] as const,
      };
    }),
    query: { enabled: V8_ENABLED && compareIds.length > 0, staleTime: 15_000 },
  });

  const compareProviders: ProviderRow[] = useMemo(() => {
    const entries = (chainData as unknown as { status?: string; result?: unknown }[] | undefined) ?? [];
    const termsEntries = (termsData as unknown as { status?: string; result?: unknown }[] | undefined) ?? [];
    return compareIds
      .map((id, i): ProviderRow | null => {
        const base = providers.find(p => p.id === id);
        if (!base) return null;
        let maxResponseTime: number | null = null;
        let slashBps: number | null = null;
        if (V8_ENABLED) {
          const t = termsEntries[i];
          if (t?.status === "success" && t.result != null) {
            const resp = Array.isArray(t.result)
              ? Number(t.result[1])
              : Number((t.result as Record<string, unknown>).maxResponseTime);
            const slash = Array.isArray(t.result)
              ? Number(t.result[2])
              : Number((t.result as Record<string, unknown>).slashBps);
            maxResponseTime = Number.isFinite(resp) ? resp : null;
            slashBps = Number.isFinite(slash) ? slash : null;
          }
        } else {
          const entry = entries[i];
          if (entry?.status === "success" && Array.isArray(entry.result)) {
            const resp = Number(entry.result[4]);
            const slash = Number(entry.result[5]);
            maxResponseTime = Number.isFinite(resp) ? resp : null;
            slashBps = Number.isFinite(slash) ? slash : null;
          }
        }
        return { ...base, maxResponseTime, slashBps };
      })
      .filter((p): p is ProviderRow => p !== null);
  }, [compareIds, providers, chainData, termsData]);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id)
        : prev.length < 4 ? [...prev, id] : prev,
    );
  }, []);

  const openDetails = useCallback((id: string) => {
    sessionStorage.setItem("provprofile_id", id);
    setPanel("provprofile");
  }, [setPanel]);

  const openCall = useCallback((id: string) => {
    sessionStorage.setItem("callbuilder_provider", id);
    setPanel("calls");
  }, [setPanel]);

  const updated = useMemo(() => {
    if (!dataUpdatedAt) return "not loaded yet";
    const secs = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000));
    return secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
  }, [dataUpdatedAt]);

  const tabCopy: Record<Tab, string> = {
    score: "Ordered by the app-side score from the registry counters: floor((completed + 2) × 100 / (completed + slashed + 3)). A provider with no calls scores 66; an empty record cannot reach 100.",
    price: "Active providers only, cheapest price per call first. Price is the exact 6-decimal amount charged for one call.",
    slashed: "Providers with at least one slashed call, most slashed first. Providers with no slashes are not ranked here.",
  };

  return (
    <div className="ov-page lb-root">
      <PageHeader
        eyebrow="Discover"
        title="Rankings"
        subtitle="Provider performance from the registry counters the subgraph indexes. Each tab states the rule it ranks by."
        actions={
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <Tabs
        className="lb-tabs"
        value={tab}
        onChange={id => setTab(id as Tab)}
        tabs={TABS.map(t => ({ id: t.id, label: t.label }))}
      />

      <p className="lb-note">{tabCopy[tab]}</p>

      <p className="visually-hidden" role="status" aria-live="polite">
        {isLoading ? "Loading rankings" : `${shown.length} of ${ranked.length} providers listed`}
      </p>

      {isLoading ? (
        <div className="lb-list" aria-busy="true">
          {[...Array(5)].map((_, i) => (
            <div className="lb-row" key={i}>
              <Skeleton width={20} height={14} />
              <Skeleton width="70%" height={14} />
              <Skeleton width="90%" height={14} />
              <Skeleton width={60} height={28} radius={8} />
            </div>
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="The ranking data could not be loaded."
          description="Rankings read The Graph Studio subgraph. Until that request succeeds the list is unavailable, which is not the same as an empty ranking."
          detail={error instanceof Error ? error.message : undefined}
          action={<Button size="sm" onClick={() => refetch()}>Retry</Button>}
        />
      ) : providers.length === 0 ? (
        <EmptyState
          icon={<span aria-hidden="true">◎</span>}
          title="No providers are registered yet"
          description="Rankings are built from registered providers. None exist on this network yet."
          action={<Button size="sm" onClick={() => setPanel("register")}>Become a provider</Button>}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<span aria-hidden="true">◎</span>}
          title={tab === "slashed" ? "No provider has been slashed" : "No active providers to rank by price"}
          description={
            tab === "slashed"
              ? "Every registered provider has a clean record under the current index."
              : "Every provider in the index is inactive, so a price ranking would not describe anything a caller can use."
          }
          action={<Button size="sm" onClick={() => setTab("score")}>Back to registry score</Button>}
        />
      ) : (
        <ol className="lb-list">
          {shown.map((p, i) => {
            const score = reputationScore(p.completedCalls, p.slashedCalls);
            const isSelf = Boolean(myAddr) && p.owner?.toLowerCase() === myAddr;
            const inCompare = compareIds.includes(p.id);
            const rank = i + 1;
            return (
              <li key={p.id} className={`lb-row${isSelf ? " lb-row--self" : ""}`}>
                <div className={`lb-rank${rank <= 3 ? " lb-rank--top" : ""}`} aria-label={`Rank ${rank}`}>
                  {rank}
                </div>

                <div className="lb-id">
                  <div className="lb-id-top">
                    <button type="button" className="lb-name" onClick={() => openDetails(p.id)}>
                      Provider #{p.id}
                    </button>
                    {isSelf && <Badge tone="guard">You</Badge>}
                    {!p.active && <Badge tone="neutral">Inactive</Badge>}
                  </div>
                  <div className="lb-owner">
                    <AddressPill value={p.owner ?? ""} href={p.owner ? CONFIG.explorerAddr(p.owner) : undefined} />
                  </div>
                </div>

                <div className="lb-metrics">
                  <div className="lb-metric">
                    <div className="lb-metric-lbl">Registry score</div>
                    <div className="lb-metric-val">{score}<small> /100</small></div>
                  </div>
                  <div className="lb-metric">
                    <div className="lb-metric-lbl">Calls</div>
                    <div className="lb-metric-val">
                      {countLabel(p.completedCalls)}
                      {p.slashedCalls > 0 && <small> · {countLabel(p.slashedCalls)} slashed</small>}
                    </div>
                  </div>
                  <div className="lb-metric">
                    <div className="lb-metric-lbl">Price / call</div>
                    <div className="lb-metric-val">{usdcExact(p.pricePerCall) ?? "—"}<small> USDC</small></div>
                  </div>
                </div>

                <div className="lb-row-actions">
                  <Button size="sm" variant="secondary" onClick={() => openDetails(p.id)}>Details</Button>
                  <Button
                    size="sm"
                    onClick={() => openCall(p.id)}
                    disabled={!p.active}
                    title={p.active ? undefined : "Inactive providers cannot take calls."}
                  >
                    Call
                  </Button>
                  <button
                    type="button"
                    className="lb-cmp"
                    aria-pressed={inCompare}
                    aria-label={inCompare ? `Remove provider #${p.id} from comparison` : `Add provider #${p.id} to comparison`}
                    title={inCompare ? "Remove from comparison" : "Add to comparison"}
                    onClick={() => toggleCompare(p.id)}
                  >
                    {inCompare ? "✓" : "+"}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {ranked.length > PAGE && (
        <p className="lb-note">Showing the first {PAGE} of {ranked.length} providers in this ranking.</p>
      )}

      {compareIds.length > 0 && (
        <div className="lb-cmp-bar">
          <span className="lb-metric-lbl">Comparing</span>
          {compareIds.map(id => (
            <span key={id} className="mp-cmp-pill">
              #{id}
              <button type="button" onClick={() => toggleCompare(id)} aria-label={`Remove provider #${id} from comparison`}>✕</button>
            </span>
          ))}
          <Button size="sm" onClick={() => setShowCompare(true)} disabled={compareProviders.length < 2}>
            Compare
          </Button>
          <span className="lb-metric-val--muted">{compareIds.length}/4 selected</span>
        </div>
      )}

      {!isLoading && !isError && providers.length > 0 && (
        <div className="mp-footer">
          <span>{providers.length} {providers.length === 1 ? "provider" : "providers"} indexed</span>
          <span className="mp-sep" aria-hidden="true">·</span>
          <span>The Graph subgraph</span>
          <span className="mp-sep" aria-hidden="true">·</span>
          <span>updated {updated}</span>
        </div>
      )}

      {showCompare && compareProviders.length >= 2 && (
        <ProviderCompareModal
          providers={compareProviders}
          onClose={() => setShowCompare(false)}
          onCall={p => openCall(p.id)}
        />
      )}
    </div>
  );
}
