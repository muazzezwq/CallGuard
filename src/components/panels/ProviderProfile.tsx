import { useCallback, useEffect, useMemo, useState } from "react";
import { useReadContracts } from "wagmi";
import { CONFIG, REGISTRY_ABI } from "../../lib/config";
import { useSubgraph } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import {
  AddressPill, Badge, Button, Copy, EmptyState, ErrorState, PageHeader,
  SectionCard, Skeleton, Stat, Table, Td, Th, Tr,
} from "../../ui";
import {
  callOutcomes, countLabel, honorRate, reputationScore, usdcCompact, usdcExact,
} from "./providerMetrics";

const REGISTRY = CONFIG.registryAddress as `0x${string}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/* The subgraph is a second source, not a replacement for the registry: the
   panels label every value with where it came from. */
type IndexedProvider = {
  id?: string; owner?: string; signer?: string;
  stake?: string; pricePerCall?: string; active?: boolean;
  completedCalls?: string | number; slashedCalls?: string | number;
  totalSlashed?: string; totalUnstaked?: string;
  nftTokenId?: string | null; nftBound?: boolean;
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
      nftTokenId nftBound createdAt updatedAt
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

  /* One batched multicall: the record, the registry's score and the two
     counters. Four separate hooks would give four independent states for one
     provider. */
  const { data, isLoading, isError, error, refetch, isFetching } = useReadContracts({
    contracts: [
      { address: REGISTRY, abi: REGISTRY_ABI, functionName: "getProvider" as const, args: [BigInt(validId ? queriedId : "0")] as const },
      { address: REGISTRY, abi: REGISTRY_ABI, functionName: "getReputationScore" as const, args: [BigInt(validId ? queriedId : "0")] as const },
      { address: REGISTRY, abi: REGISTRY_ABI, functionName: "completedCalls" as const, args: [BigInt(validId ? queriedId : "0")] as const },
      { address: REGISTRY, abi: REGISTRY_ABI, functionName: "slashedCalls" as const, args: [BigInt(validId ? queriedId : "0")] as const },
    ],
    query: { enabled: validId },
  });

  const [recordRes, scoreRes, completedRes, slashedRes] = (data ?? []) as {
    status?: string; result?: unknown;
  }[];

  const record = recordRes?.status === "success" ? recordRes.result : undefined;
  const r = record as Record<string | number, unknown> | undefined;
  const owner = (r?.owner ?? r?.[0]) as string | undefined;
  const signer = (r?.signer ?? r?.[1]) as string | undefined;
  const stake = (r?.stake ?? r?.[2]) as bigint | undefined;
  const price = (r?.pricePerCall ?? r?.[3]) as bigint | undefined;
  const maxResponseTime = Number(r?.maxResponseTime ?? r?.[4] ?? 0);
  const slashBps = Number(r?.slashBps ?? r?.[5] ?? 0);
  const isActive = Boolean(r?.active ?? r?.[6]);
  const maxConcurrent = Number(r?.maxConcurrentCalls ?? r?.[7] ?? 0);
  const zkTier = Number(r?.zkTier ?? r?.[8] ?? 0);

  const registered = Boolean(owner) && owner !== ZERO_ADDR;
  const completed = completedRes?.status === "success" ? Number(completedRes.result ?? 0) : 0;
  const slashed = slashedRes?.status === "success" ? Number(slashedRes.result ?? 0) : 0;
  const counts = callOutcomes(completed, slashed);
  const computedScore = reputationScore(completed, slashed);
  const chainScore = scoreRes?.status === "success" ? Number(scoreRes.result) : null;
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
                <div>
                  <dt>Registration NFT</dt>
                  <dd>
                    {ip?.nftTokenId
                      ? <>#{ip.nftTokenId} <span className="pp-src">indexed</span></>
                      : ip ? "No NFT record" : <span className="pp-muted">not available</span>}
                  </dd>
                </div>
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
              </dl>
              <p className="pp-note">
                The endpoint string is accepted at registration but is not part of the
                getProvider record, so this screen cannot show it.
              </p>
            </SectionCard>

            <SectionCard title="Recent calls" subtitle="Goldsky subgraph · last 10 by start time">
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
