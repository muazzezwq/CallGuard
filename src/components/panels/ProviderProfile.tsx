import { useCallback, useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import {
  ACTIVE_REGISTRY_ADDRESS, CONFIG, REGISTRY_ABI, REGISTRY_ABI_V8, V8_ENABLED,
} from "../../lib/config";
import { useProviderScore } from "../../hooks/useOnchain";
import { useSubgraph } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import {
  AddressPill, Badge, Button, Copy, EmptyState, ErrorState, PageHeader,
  SectionCard, Skeleton, Stat, Table, Td, Th, Tr,
} from "../../ui";
import {
  callOutcomes, countLabel, honorRate, reputationScore, usdcCompact, usdcExact,
} from "./providerMetrics";
import { endpointHref, endpointState } from "./endpointUrl";

/* The profile reads whichever stack is wired. Field access below is by name
   only: `getProvider` is 9 words on v7 and 11 on v8, so a positional read
   would silently return the wrong column after a cutover. */
const REGISTRY = ACTIVE_REGISTRY_ADDRESS;
const REGISTRY_ABI_ACTIVE = V8_ENABLED ? REGISTRY_ABI_V8 : REGISTRY_ABI;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/* The subgraph is a second source, not a replacement for the registry: the
   panels label every value with where it came from. */
type IndexedProvider = {
  id?: string; owner?: string; signer?: string;
  stake?: string; pricePerCall?: string; active?: boolean;
  completedCalls?: string | number; slashedCalls?: string | number;
  totalSlashed?: string; totalUnstaked?: string;
  createdAt?: string; updatedAt?: string;
};
type IndexedCall = {
  id?: string; caller?: string; amount?: string; status?: string; createdAt?: string;
};

function indexedQuery(id: string) {
  return `{
    provider(id: "${id}") {
      id owner signer stake pricePerCall active
      completedCalls slashedCalls totalSlashed totalUnstaked
      createdAt updatedAt
    }
    calls(first: 10, where: {providerId: "${id}"}, orderBy: createdAt, orderDirection: desc) {
      id caller amount status createdAt
    }
  }`;
}

function callStatus(status: string | undefined) {
  if (status === "COMPLETED") return <Badge tone="guard">Completed</Badge>;
  if (status === "SLASHED") return <Badge tone="slash">Slashed</Badge>;
  if (status === "STARTED") return <Badge tone="info">Started</Badge>;
  return <Badge>{status || "unknown"}</Badge>;
}

function timestamp(raw: string | undefined) {
  const secs = Number(raw);
  if (!Number.isFinite(secs) || secs <= 0) return "—";
  return new Date(secs * 1000).toLocaleString();
}

export default function ProviderProfile() {
  const { setPanel } = useAppStore();
  const [inputId, setInputId] = useState("1");
  const [queriedId, setQueriedId] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);

  /* Deep links: ?provider=N from a shared link, or the hand-off the
     Marketplace writes before it switches panels. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("provider");
    const fromStore = sessionStorage.getItem("provprofile_id");
    const candidate = fromUrl ?? fromStore;
    if (candidate && /^[1-9]\d*$/.test(candidate)) {
      setInputId(candidate);
      setQueriedId(candidate);
    }
  }, []);

  const validId = /^[1-9]\d*$/.test(queriedId);

  /* The provider record is one read. The counters it needs live inside it on
     v8; v7 exposed them as separate getters, so those two are asked for only
     when v7 is the wired stack. */
  /* The record and its endpoint answer for the same id on the same registry, so
     one multicall returns both and the public RPC sees one request. */
  const recordRead = useReadContracts({
    contracts: [
      {
        address: REGISTRY,
        abi: REGISTRY_ABI_ACTIVE,
        functionName: "getProvider" as const,
        args: [BigInt(validId ? queriedId : "0")] as const,
      },
      {
        address: REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "getEndpoint" as const,
        args: [BigInt(validId ? queriedId : "0")] as const,
      },
    ],
    query: { enabled: validId },
  });
  const { isLoading, isError, error, refetch, isFetching } = recordRead;
  const recordRes = recordRead.data?.[0]?.result;

  const r = recordRes as Record<string, unknown> | undefined;
  const owner = r?.owner as string | undefined;
  const signer = r?.signer as string | undefined;
  const stake = r?.stake as bigint | undefined;
  const price = r?.pricePerCall as bigint | undefined;
  const isActive = Boolean(r?.active);
  const maxConcurrent = Number(r?.maxConcurrentCalls ?? 0);
  const zkTier = Number(r?.zkTier ?? 0);

  /* v8 moved the response window and the slash ratio out of the provider
     record and into the terms version the call snapshots. */
  const latestTermsVersion = Number(r?.latestTermsVersion ?? 0);
  const termsQuery = useReadContract({
    address: REGISTRY,
    abi: REGISTRY_ABI_V8,
    functionName: "getTerms",
    args: [BigInt(validId ? queriedId : "0"), latestTermsVersion],
    query: { enabled: V8_ENABLED && validId && latestTermsVersion > 0, staleTime: 15_000 },
  });
  const terms = termsQuery.data as { maxResponseTime?: number; slashBps?: number } | undefined;
  const maxResponseTime = V8_ENABLED
    ? Number(terms?.maxResponseTime ?? 0)
    : Number(r?.maxResponseTime ?? 0);
  const slashBps = V8_ENABLED ? Number(terms?.slashBps ?? 0) : Number(r?.slashBps ?? 0);

  const registered = Boolean(owner) && owner !== ZERO_ADDR;

  /* getProvider does not carry the endpoint; it rides along in the same
     multicall rather than opening a second request. */
  const endpoint = endpointState({
    isLoading,
    isError: isError || recordRead.data?.[1]?.status === "failure",
    data: recordRead.data?.[1]?.result,
  });
  /* Only a usable endpoint becomes a link; a placeholder or free text stays
     inert text, so nothing here can ping an endpoint by accident. */
  const endpointLink = endpointHref(endpoint);
  /* v7 keeps two standalone counters; v8 folded both into the record. */
  const { data: v7Completed } = useReadContract({
    address: REGISTRY, abi: REGISTRY_ABI, functionName: "completedCalls",
    args: [BigInt(validId ? queriedId : "0")],
    query: { enabled: !V8_ENABLED && validId },
  });
  const { data: v7Slashed } = useReadContract({
    address: REGISTRY, abi: REGISTRY_ABI, functionName: "slashedCalls",
    args: [BigInt(validId ? queriedId : "0")],
    query: { enabled: !V8_ENABLED && validId },
  });
  const completed = V8_ENABLED ? Number(r?.completedCalls ?? 0) : Number(v7Completed ?? 0);
  const slashed = V8_ENABLED ? Number(r?.slashedCalls ?? 0) : Number(v7Slashed ?? 0);

  const counts = callOutcomes(completed, slashed);
  const computedScore = reputationScore(completed, slashed);
  /* `getReputationScore` does not exist on v8; the hook it lives in is gated
     there, so v8 always answers from the counters with the same formula. */
  const { data: chainScoreRaw } = useProviderScore(validId ? Number(queriedId) : 0);
  const chainScore = !V8_ENABLED && chainScoreRaw !== undefined ? Number(chainScoreRaw) : null;
  const score = chainScore ?? computedScore;
  const honor = honorRate(completed, slashed);

  /* Indexed history. Fails softly: the on-chain record above stays usable. */
  const indexQuery = useMemo(() => (registered ? indexedQuery(queriedId) : ""), [registered, queriedId]);
  const {
    data: indexed, isLoading: indexLoading, isError: indexError, refetch: refetchIndex,
  } = useSubgraph<{ provider?: IndexedProvider; calls?: IndexedCall[] }>(indexQuery, {
    pollInterval: 30_000, enabled: Boolean(indexQuery),
  });
  const ip = indexed?.provider;
  const calls = (indexed?.calls ?? []).filter(c => c && c.id);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/app?provider=${queriedId}` : "";

  const submit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const next = inputId.trim();
    if (!/^[1-9]\d*$/.test(next)) {
      setFormError("Enter a positive whole provider id, for example 1.");
      return;
    }
    setFormError(null);
    if (next === queriedId) refetch();
    else setQueriedId(next);
  }, [inputId, queriedId, refetch]);

  const openCallBuilder = useCallback((key: "callbuilder_provider" | "nano_provider") => {
    sessionStorage.setItem(key, queriedId);
    setPanel(key === "callbuilder_provider" ? "calls" : "nano");
  }, [queriedId, setPanel]);

  return (
    <div className="ov-page pp-root">
      <PageHeader
        eyebrow="Discover"
        title="Provider details"
        subtitle="One provider as the registry stores it, next to the history the subgraph indexes. Every value states its source."
        actions={<Button variant="secondary" size="sm" onClick={() => { refetch(); refetchIndex(); }} disabled={isFetching || indexLoading}>Refresh</Button>}
      />

      <form className="pp-lookup" onSubmit={submit} noValidate>
        <label htmlFor="pp-id" className="pp-lookup__label">Provider ID</label>
        <input
          id="pp-id"
          className="pp-lookup__input"
          inputMode="numeric"
          value={inputId}
          onChange={e => { setInputId(e.target.value); if (formError) setFormError(null); }}
          aria-invalid={Boolean(formError)}
          aria-describedby={formError ? "pp-id-err" : "pp-id-hint"}
          placeholder="1"
        />
        <Button type="submit" size="sm">Load</Button>
        <p id="pp-id-hint" className="pp-lookup__hint">Opens any registered provider without a wallet.</p>
        {formError && <p id="pp-id-err" className="pp-lookup__err">{formError}</p>}
      </form>

      {isLoading && validId && (
        <div className="pp-loading" aria-busy="true">
          <Skeleton width="100%" height={28} />
          <Skeleton width="80%" height={16} />
          <Skeleton width="100%" height={110} radius={12} />
          <Skeleton width="100%" height={110} radius={12} />
        </div>
      )}

      {isError && (
        <ErrorState
          title={`Provider #${queriedId} could not be read from the registry.`}
          description="The registry call did not return. This is an RPC problem, not an empty provider record."
          detail={error instanceof Error ? error.message : undefined}
          action={<Button size="sm" onClick={() => refetch()}>Retry</Button>}
        />
      )}

      {!isLoading && !isError && validId && !registered && (
        <EmptyState
          icon={<span aria-hidden="true">◎</span>}
          title={`No provider is registered under #${queriedId}`}
          description="The registry returned an empty record for this id. Provider ids start at 1; new providers choose their own id when they register."
          action={<Button size="sm" onClick={() => setPanel("register")}>Register a provider</Button>}
        />
      )}

      {!isLoading && !isError && registered && (
        <>
          <div className="pp-actions">
            <Button
              onClick={() => openCallBuilder("callbuilder_provider")}
              disabled={!isActive}
              title={isActive ? undefined : "Inactive providers cannot take calls."}
            >
              Call this provider
            </Button>
            <Button
              variant="secondary"
              onClick={() => openCallBuilder("nano_provider")}
              disabled={!isActive}
              title={isActive ? undefined : "Inactive providers cannot take calls."}
            >
              Nano pay
            </Button>
            {!isActive && <span className="pp-actions__note">Inactive: the registry refuses new calls to this provider.</span>}
          </div>

          <div className="pp-grid">
            <SectionCard
              title="Identity"
              subtitle="Read from ServiceRegistry.getProvider"
              action={<Badge tone={isActive ? "guard" : "neutral"} dot>{isActive ? "Active" : "Inactive"}</Badge>}
            >
              <dl className="pp-kv">
                <div><dt>Provider</dt><dd className="mono">#{queriedId}</dd></div>
                <div><dt>Owner</dt><dd><AddressPill value={owner ?? ""} href={CONFIG.explorerAddr(owner ?? "")} /></dd></div>
                <div><dt>Signer</dt><dd><AddressPill value={signer ?? ""} href={signer ? CONFIG.explorerAddr(signer) : undefined} /></dd></div>
                <div><dt>Registered</dt><dd>{timestamp(ip?.createdAt)} <span className="pp-src">indexed</span></dd></div>
              </dl>
            </SectionCard>

            <SectionCard title="Price and SLA" subtitle="Configured by the provider; charged per call">
              <div className="pp-stats">
                <Stat label="Price / call" value={<>{usdcExact(price) ?? "—"} <small>USDC</small></>} hint="Exact amount, 6 decimals" />
                <Stat label="Response window" value={<>{Number.isFinite(maxResponseTime) ? maxResponseTime : "—"}<small> s</small></>} hint="Maximum time to submit a receipt" />
                <Stat label="Slash on miss" value={<>{slashBps}<small> bps</small></>} hint={`${(slashBps / 100).toFixed(2)}% of stake per miss`} />
                <Stat label="Concurrent calls" value={Number.isFinite(maxConcurrent) ? maxConcurrent : "—"} hint="Registry slot limit" />
              </div>
            </SectionCard>

            <SectionCard title="Stake and slashing" subtitle="Held by ServiceRegistry; slashed stake leaves the provider">
              <div className="pp-stats">
                <Stat label="Stake" value={<>{usdcCompact(stake) ?? "—"} <small>USDC</small></>} hint="Registry" />
                <Stat label="Slashed calls" value={countLabel(slashed)} hint="Registry" tone={slashed > 0 ? "slash" : undefined} />
                <Stat
                  label="Total slashed"
                  value={<>{usdcCompact(ip?.totalSlashed) ?? "—"} <small>USDC</small></>}
                  hint="Subgraph total"
                />
                <Stat
                  label="Total unstaked"
                  value={<>{usdcCompact(ip?.totalUnstaked) ?? "—"} <small>USDC</small></>}
                  hint="Subgraph total"
                />
              </div>
            </SectionCard>

            <SectionCard title="Performance" subtitle="Counters from the registry; the score is the registry's own formula">
              <div className="pp-stats">
                <Stat
                  label="Registry score"
                  value={<>{score}<small> /100</small></>}
                  hint={chainScore !== null ? "Read from getReputationScore" : "Computed from the counters"}
                />
                <Stat label="Completed calls" value={countLabel(completed)} hint="Registry counter" />
                <Stat
                  label="Honor rate"
                  value={honor === null ? <span className="pp-muted">no settled calls</span> : <>{honor}<small>%</small></>}
                  hint={counts.total > 0 ? `${counts.total} settled calls` : "No denominator yet"}
                />
                <Stat label="Settled calls" value={countLabel(counts.total)} hint="Completed + slashed" />
              </div>
              <p className="pp-note">
                Score = ((completed + 2) × 100) / (completed + slashed + 3), integer division. A new
                provider starts at 66; an empty record can never score 100. The honor rate is a
                separate, raw ratio and is not used to rank anything on this screen.
              </p>
            </SectionCard>

            <SectionCard title="Network and contract" subtitle="Arc Testnet">
              <dl className="pp-kv">
                <div><dt>Registry</dt><dd><AddressPill value={REGISTRY} href={CONFIG.explorerAddr(REGISTRY)} /></dd></div>
                <div><dt>Chain ID</dt><dd className="mono">{CONFIG.chainId}</dd></div>
                <div><dt>ZK tier</dt><dd className="mono">{Number.isFinite(zkTier) ? zkTier : "—"}</dd></div>
                <div><dt>Subgraph</dt><dd className="pp-break mono">{CONFIG.subgraphUrl}</dd></div>
                <div>
                  <dt>Endpoint</dt>
                  <dd className="pp-endpoint mono" aria-busy={endpoint.kind === "loading" ? true : undefined}>
                    {endpoint.kind === "loading" ? (
                      <span className="pp-muted">Reading the endpoint…</span>
                    ) : endpoint.kind === "error" ? (
                      <span className="pp-muted">
                        Endpoint read failed.{" "}
                        <button type="button" className="pp-linkbtn" onClick={() => refetch()}>Retry</button>
                      </span>
                    ) : endpoint.kind === "empty" ? (
                      <span className="pp-muted">No endpoint recorded at registration.</span>
                    ) : endpoint.kind === "placeholder" ? (
                      <>
                        {endpoint.value}{" "}
                        <span className="pp-muted">placeholder from the registration form, not a usable endpoint</span>
                      </>
                    ) : endpoint.kind === "invalid" ? (
                      <>
                        {endpoint.value}{" "}
                        <span className="pp-muted">not an http(s) URL, so it cannot be called</span>
                      </>
                    ) : (
                      <>
                        <a href={endpointLink ?? undefined} target="_blank" rel="noreferrer noopener">{endpoint.value}</a>{" "}
                        <span className="pp-muted">recorded at registration, not verified</span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="pp-note">
                The endpoint is stored in the provider record but not in the getProvider tuple,
                so it is read through ServiceRegistry.getEndpoint. It can only be set at
                registration and cannot be updated afterwards.
              </p>
            </SectionCard>

            <SectionCard title="Recent calls" subtitle="The Graph subgraph · last 10 by start time">
              {indexLoading ? (
                <div className="pp-calls-skel" aria-busy="true">
                  <Skeleton width="100%" height={14} />
                  <Skeleton width="100%" height={14} />
                  <Skeleton width="100%" height={14} />
                </div>
              ) : indexError ? (
                <p className="pp-muted">
                  The subgraph request failed, so activity is unavailable. The on-chain record above is unaffected.
                  {" "}<button type="button" className="pp-linkbtn" onClick={() => refetchIndex()}>Retry</button>
                </p>
              ) : calls.length === 0 ? (
                <p className="pp-muted">No calls are indexed for this provider yet.</p>
              ) : (
                <Table dense>
                  <thead>
                    <tr>
                      <Th>Call</Th>
                      <Th>Caller</Th>
                      <Th num>Amount</Th>
                      <Th>Status</Th>
                      <Th>Started</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map(c => (
                      <Tr key={c.id}>
                        <Td mono><span title={c.id}>{`${c.id?.slice(0, 10)}…`}</span> <Copy value={String(c.id)} label="Copy call id" /></Td>
                        <Td>{c.caller ? <AddressPill value={c.caller} href={CONFIG.explorerAddr(c.caller)} /> : "—"}</Td>
                        <Td num mono>{usdcCompact(c.amount) ?? "—"}</Td>
                        <Td>{callStatus(c.status)}</Td>
                        <Td>{timestamp(c.createdAt)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Shareable link" subtitle="Opens this provider details screen directly">
            <div className="pp-share">
              <input className="pp-lookup__input mono" aria-label="Shareable link" value={shareUrl} readOnly />
              <Copy value={shareUrl} label="Copy shareable link" />
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
