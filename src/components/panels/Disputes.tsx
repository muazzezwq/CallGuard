import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useReadContracts, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { Check, X } from "lucide-react";
import { useSubgraph } from "../../hooks/useSubgraph";
import { CONFIG, DISPUTE_QUALITY_ABI } from "../../lib/config";
import {
  Badge, Button, Field, Input, PageHeader, Skeleton, Stat, Tabs, Textarea,
} from "../../ui";
import {
  KeyValue, Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit, SignalRow, StatusNotice,
} from "../panel/PanelUi";

// CRITICAL-04 fix: use centralized DISPUTE_QUALITY_ABI from config (synced with DisputeQuality.sol)
// Vote enum: 1 = ForCaller, 2 = ForProvider
const VOTE_FOR_CALLER   = 1;
const VOTE_FOR_PROVIDER = 2;

interface SubgraphDispute {
  id: string;
  callId: string;
  caller: string;
  providerId?: string;
  status: string;
  slashAmount?: string;
  openedAt: string;
  resolvedAt?: string;
  outcome?: string;
}

function NoticeLine({ value }: { value: string }) {
  const tone = value.startsWith("✅") ? "success" : value.startsWith("❌") ? "danger" : "info";
  return <StatusNotice tone={tone} title={value.replace(/^[✅❌⏳]\s*/u, "")} />;
}

function statusTone(status: string): "guard" | "pending" | "neutral" {
  return status === "RESOLVED" ? "guard" : status === "OPEN" ? "pending" : "neutral";
}

export default function Disputes() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  // DisputeQuality v2 is retired (bound to the old Registry); gate live transactions.
  const dqEnabled = CONFIG.disputeQualityEnabled;

  const [tab, setTab] = useState<"open" | "vote" | "mine" | "history">("open");
  const [callIdInput, setCallIdInput] = useState("");
  const [providerIdInput, setProviderIdInput] = useState("1"); // HIGH-03: user-provided, not hardcoded
  const [evidence, setEvidence] = useState("");
  const [status, setStatus] = useState("");

  // Vote tab state
  const [voteDisputeId, setVoteDisputeId] = useState("");
  const [voteChoice, setVoteChoice] = useState<boolean | null>(null);
  const [voteStatus, setVoteStatus] = useState("");
  const [disputeInfo, setDisputeInfo] = useState<Record<string, string> | null>(null);

  // MEDIUM-06 fix: single useWriteContract instance
  const { writeContractAsync, data: voteTxHash } = useWriteContract();
  const { isLoading: votePending } = useWaitForTransactionReceipt({ hash: voteTxHash });

  // Subgraph: all dispute history
  const historyQuery = `{
    disputeRecords(first: 50, orderBy: openedAt, orderDirection: desc) {
      id callId caller providerId status slashAmount openedAt resolvedAt txHash
    }
  }`;
  // Gate history queries while DisputeQuality is retired (the deployed subgraph
  // has no DisputeRecord entity, so querying it only produces errors).
  const { data: historyData, loading: historyLoading, refetch: refetchHistory } = useSubgraph<{ disputeRecords: SubgraphDispute[] }>(
    historyQuery, { pollInterval: 30000, enabled: dqEnabled }
  );

  // MEDIUM-13: My disputes — filtered by connected address
  const myDisputesQuery = address ? `{
    disputeRecords(first: 50, orderBy: openedAt, orderDirection: desc, where: { caller: "${address.toLowerCase()}" }) {
      id callId caller providerId status slashAmount openedAt resolvedAt txHash
    }
  }` : "";
  const { data: myDisputesData, loading: myDisputesLoading, refetch: refetchMine } = useSubgraph<{ disputeRecords: SubgraphDispute[] }>(
    myDisputesQuery, { enabled: !!address && dqEnabled, pollInterval: 30000 }
  );

  // HIGH-04: pendingWithdrawals from DisputeQuality pull model
  const { data: pendingPayout, refetch: refetchPayout } = useReadContract({
    address: CONFIG.disputeQualityAddress as `0x${string}`,
    abi: DISPUTE_QUALITY_ABI,
    functionName: "pendingWithdrawals",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15000 },
  });
  const hasPayout = pendingPayout ? (pendingPayout as bigint) > 0n : false;
  const payoutAmt = pendingPayout ? formatUnits(pendingPayout as bigint, 6) : "0";

  const handleWithdrawPayout = useCallback(async () => {
    if (!dqEnabled) { setStatus("❌ Quality Disputes are disabled — the contract is retired."); return; }
    try {
      await writeContractAsync({
        address: CONFIG.disputeQualityAddress as `0x${string}`,
        abi: DISPUTE_QUALITY_ABI,
        functionName: "withdrawPayout",
      });
      setTimeout(() => void refetchPayout(), 3000);
    } catch (e: unknown) {
      const msg = (e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e));
      setStatus(`❌ Withdraw failed: ${msg}`);
    }
  }, [dqEnabled, writeContractAsync, refetchPayout]);

  // LOW-01: read bond/window values from contract instead of hardcoding
  const dqAddr = CONFIG.disputeQualityAddress as `0x${string}`;
  const { data: bondData } = useReadContracts({
    contracts: [
      { address: dqAddr, abi: DISPUTE_QUALITY_ABI, functionName: "disputeBond" },
      { address: dqAddr, abi: DISPUTE_QUALITY_ABI, functionName: "voterBond" },
      { address: dqAddr, abi: DISPUTE_QUALITY_ABI, functionName: "votingWindow" },
    ],
  });
  const callerBondUSDC = bondData?.[0]?.result != null ? (Number(bondData[0].result) / 1e6).toFixed(2) : "0.50";
  const voterBondUSDC  = bondData?.[1]?.result != null ? (Number(bondData[1].result) / 1e6).toFixed(2) : "0.10";
  const votingWindowH  = bondData?.[2]?.result != null ? `${Math.round(Number(bondData[2].result) / 3600)}h` : "48h";

  // CRITICAL-04 fix: openDispute(bytes32 callId, uint256 providerId, uint64 settledAt, string evidenceUri)
  const handleOpenDispute = useCallback(async () => {
    if (!dqEnabled) { setStatus("❌ Quality Disputes are disabled — the contract is retired."); return; }
    if (!isConnected) { setStatus("❌ Connect wallet first"); return; }
    if (!callIdInput || !evidence) { setStatus("❌ Enter call ID and evidence URI"); return; }
    // callIdInput must be a 0x-prefixed bytes32 hex (66 chars) and providerId should be provided
    if (!/^0x[0-9a-fA-F]{64}$/.test(callIdInput)) {
      setStatus("❌ Call ID must be a 0x-prefixed 32-byte hex string (e.g. 0xabc...)");
      return;
    }
    setStatus("⏳ Opening dispute...");
    try {
      const now = BigInt(Math.floor(Date.now() / 1000));
      await writeContractAsync({
        address: CONFIG.disputeQualityAddress as `0x${string}`,
        abi: DISPUTE_QUALITY_ABI,
        functionName: "openDispute",
        // HIGH-03 fix: use user-provided providerId, not hardcoded 1
        // settledAt: approximate — use current time minus 1 block (~0.5s)
        args: [callIdInput as `0x${string}`, BigInt(providerIdInput || "1"), now - 1n, evidence],
      });
      setStatus("✅ Dispute opened! Bond deducted. Voting window now open.");
      setCallIdInput(""); setEvidence("");
      setTimeout(refetchHistory, 4000);
    } catch (e: unknown) {
      const msg = (e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e));
      setStatus(`❌ ${msg}`);
    }
  }, [dqEnabled, callIdInput, evidence, isConnected, writeContractAsync, refetchHistory, providerIdInput]);

  // Fetch dispute info for voting
  const fetchDisputeInfo = useCallback(async () => {
    if (!voteDisputeId || !publicClient) return;
    try {
      const result = await publicClient.readContract({
        address: CONFIG.disputeQualityAddress as `0x${string}`,
        abi: DISPUTE_QUALITY_ABI,
        functionName: "disputes",
        args: [BigInt(voteDisputeId)],
      }) as unknown as { callId: `0x${string}`; caller: string; providerId: bigint; votesForCaller: bigint; votesForProvider: bigint; outcome: number; finalized: boolean };
      setDisputeInfo({
        callId:   result.callId.slice(0, 10) + "…",
        opener:   result.caller.slice(0, 8) + "…" + result.caller.slice(-4),
        forCaller:   result.votesForCaller.toString(),
        forProvider: result.votesForProvider.toString(),
        finalized: result.finalized ? "Yes" : "No",
        outcome:   result.outcome === 1 ? "✅ Caller Wins" : result.outcome === 2 ? "🛡 Provider Wins" : result.outcome === 3 ? "🤝 Tied" : "⏳ Pending",
      });
    } catch (e: unknown) {
      setDisputeInfo({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [voteDisputeId, publicClient]);

  // CRITICAL-04 fix: vote(uint256 disputeId, uint8 choice) — 1=ForCaller, 2=ForProvider
  const handleVote = useCallback(async (forCaller: boolean) => {
    if (!dqEnabled) { setVoteStatus("❌ Quality Disputes are disabled — the contract is retired."); return; }
    if (!isConnected) { setVoteStatus("❌ Connect wallet first"); return; }
    if (!voteDisputeId) { setVoteStatus("❌ Enter dispute ID"); return; }
    const choice = forCaller ? VOTE_FOR_CALLER : VOTE_FOR_PROVIDER;
    setVoteStatus(`⏳ Voting ${forCaller ? "ForCaller" : "ForProvider"}…`);
    try {
      await writeContractAsync({
        address: CONFIG.disputeQualityAddress as `0x${string}`,
        abi: DISPUTE_QUALITY_ABI,
        functionName: "vote",
        args: [BigInt(voteDisputeId), choice],
      });
      setVoteStatus(`✅ Vote cast: ${forCaller ? "ForCaller" : "ForProvider"}`);
      setTimeout(() => fetchDisputeInfo(), 3000);
    } catch (e: unknown) {
      const msg = (e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e));
      setVoteStatus(`❌ ${msg}`);
    }
  }, [dqEnabled, voteDisputeId, isConnected, writeContractAsync, fetchDisputeInfo]);

  const disputes = historyData?.disputeRecords ?? [];
  const mine = myDisputesData?.disputeRecords ?? [];

  return (
    <PanelShell>
      <PageHeader
        title="Quality Disputes"
        subtitle="Community-voted response quality verification"
        actions={(
          <Button
            variant="secondary"
            size="sm"
            onClick={refetchHistory}
            aria-label="Refresh dispute history"
            title="Refresh dispute history"
          >
            ↻
          </Button>
        )}
      />
      <PanelSource
        label="DisputeQuality v2"
        value={dqEnabled ? "enabled" : "retired"}
        hint={dqEnabled ? "live contract reads" : "actions and history queries disabled"}
        state={dqEnabled ? "live" : "unavailable"}
      />

      {!dqEnabled && (
        <StatusNotice tone="retired" title="Quality Disputes are temporarily disabled">
          The DisputeQuality contract was retired and has no active replacement — actions and
          on-chain reads are turned off to avoid wasting gas. History remains visible below.
        </StatusNotice>
      )}

      {/* HIGH-04: withdrawPayout banner */}
      {hasPayout && (
        <StatusNotice
          tone="success"
          title="Dispute Payout Ready"
          action={<Button variant="primary" size="sm" onClick={handleWithdrawPayout}>Claim {payoutAmt} USDC →</Button>}
        >
          You have <strong>{payoutAmt} USDC</strong> from resolved disputes ready to claim.
        </StatusNotice>
      )}

      {/* Dispute protocol info */}
      <SignalRow label="Dispute bonds">
        <Stat label="Caller Bond" value={`${callerBondUSDC} USDC`} />
        <Stat label="Voter Bond" value={`${voterBondUSDC} USDC`} />
        <Stat label="Min Voter Stake" value="1 USDC" />
        <Stat label="Voting Window" value={votingWindowH} />
      </SignalRow>

      <div className="pg-tabbar">
        <Tabs
          tabs={[
            { id: "open", label: "Open Dispute" },
            { id: "vote", label: "Vote" },
            { id: "mine", label: <>My Disputes {mine.length > 0 && <Badge tone="guard">{mine.length}</Badge>}</> },
            { id: "history", label: <>History {disputes.length > 0 && <Badge tone="guard">{disputes.length}</Badge>}</> },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <PanelSplit
        main={(
          <>
            {/* OPEN DISPUTE TAB */}
            {tab === "open" && (
              <section className="ui-section">
                <div className="ui-section__body">
                  <StatusNotice tone="info" title="How it works:">
                    Submit the call ID and evidence. Community arbiters vote (stake-weighted majority).
                    Bond: <strong>{callerBondUSDC} USDC</strong> from your wallet.
                  </StatusNotice>
                  <div className="pg-form">
                    <Field label="Call ID (0x bytes32)" htmlFor="dp-callid">
                      <Input
                        id="dp-callid"
                        mono
                        placeholder="0xabc123... (32-byte hex)"
                        value={callIdInput}
                        onChange={e => setCallIdInput(e.target.value)}
                      />
                    </Field>
                    <Field label="Provider ID" htmlFor="dp-provider">
                      <Input
                        id="dp-provider"
                        mono
                        placeholder="e.g. 1"
                        type="number"
                        min="1"
                        value={providerIdInput}
                        onChange={e => setProviderIdInput(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Evidence (description or IPFS URI)"
                      htmlFor="dp-evidence"
                      hint="Evidence is hashed on-chain (keccak256). Original text stays off-chain."
                    >
                      <Textarea
                        id="dp-evidence"
                        rows={3}
                        placeholder="Describe why the response was inadequate, or paste an IPFS hash with evidence..."
                        value={evidence}
                        onChange={e => setEvidence(e.target.value)}
                      />
                    </Field>
                  </div>
                  {status && <div className="pg-section--spaced"><NoticeLine value={status} /></div>}
                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button
                      variant="primary"
                      onClick={handleOpenDispute}
                      disabled={!dqEnabled || !callIdInput || !evidence || !isConnected}
                    >
                      Open Quality Dispute — {callerBondUSDC} USDC bond
                    </Button>
                  </div>
                  {!isConnected && (
                    <p className="pg-note">Connect wallet to open a dispute.</p>
                  )}
                </div>
              </section>
            )}

            {/* VOTE TAB */}
            {tab === "vote" && (
              <section className="ui-section">
                <div className="ui-section__body">
                  <p className="pg-copy">
                    Look up a dispute by ID and cast your vote. You must hold staked USDC to be eligible.
                  </p>
                  <div className="pg-inline-form">
                    <Field className="pg-inline-form__field" label="Dispute ID" htmlFor="dp-vote-id">
                      <Input
                        id="dp-vote-id"
                        mono
                        placeholder="Dispute ID (e.g. 1)"
                        value={voteDisputeId}
                        onChange={e => setVoteDisputeId(e.target.value)}
                      />
                    </Field>
                    <Button variant="secondary" size="sm" onClick={fetchDisputeInfo}>Look up</Button>
                  </div>

                  {disputeInfo && (
                    (disputeInfo as { error?: string }).error ? (
                      <div className="pg-section--spaced">
                        <StatusNotice tone="danger" title="Lookup failed">
                          {(disputeInfo as { error: string }).error}
                        </StatusNotice>
                      </div>
                    ) : (
                      <div className="pg-section--spaced">
                        <KeyValue
                          rows={Object.entries(disputeInfo).map(([k, v]) => ({
                            label: k.charAt(0).toUpperCase() + k.slice(1),
                            value: v as string,
                            mono: k === "callId" || k === "opener",
                          }))}
                        />
                      </div>
                    )
                  )}

                  <div className="pg-vote-actions pg-section--spaced">
                    <Button
                      variant="primary"
                      leftIcon={<Check size={15} />}
                      onClick={() => { setVoteChoice(true); handleVote(true); }}
                      disabled={!dqEnabled || votePending || !isConnected || !voteDisputeId}
                    >
                      Vote Yes — Provider Honored
                    </Button>
                    <Button
                      variant="danger"
                      leftIcon={<X size={15} />}
                      onClick={() => { setVoteChoice(false); handleVote(false); }}
                      disabled={!dqEnabled || votePending || !isConnected || !voteDisputeId}
                    >
                      Vote No — Provider Slashed
                    </Button>
                  </div>

                  {voteStatus && <div className="pg-section--spaced"><NoticeLine value={voteStatus} /></div>}

                  {voteChoice !== null && (
                    <p className="pg-note">
                      Selected: {voteChoice ? "Yes (provider honored)" : "No (provider slashed)"}
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* MY DISPUTES TAB — MEDIUM-13 */}
            {tab === "mine" && (
              <>
                {!address && (
                  <StatusNotice tone="info" title="Connect your wallet to see your disputes." />
                )}
                {address && myDisputesLoading && (
                  <div className="pg-stack">
                    {[0, 1, 2].map(i => <Skeleton key={i} height={56} radius={8} />)}
                  </div>
                )}
                {address && !myDisputesLoading && mine.length === 0 && (
                  <Ledger
                    empty={(
                      <div className="pg-empty">
                        <strong>You have not opened any disputes yet.</strong>
                        <span>Disputes you file as a caller will appear here.</span>
                      </div>
                    )}
                  />
                )}
                {mine.length > 0 && (
                  <Ledger>
                    {mine.map(d => (
                      <LedgerRow
                        key={d.id}
                        tone={d.status === "RESOLVED" ? "guard" : d.status === "OPEN" ? "warn" : "muted"}
                        lead={`Dispute #${d.id} · Call ${d.callId ? d.callId.slice(0, 10) + "…" : "—"}`}
                        meta={`Opened ${d.openedAt ? new Date(Number(d.openedAt) * 1000).toLocaleString() : "—"}`}
                        trailing={(
                          <span className="pg-row-stack">
                            <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                            {d.outcome && <span className="pg-mono">Outcome: {d.outcome}</span>}
                            {d.status === "OPEN" && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => { setTab("vote"); setVoteDisputeId(d.id); }}
                              >
                                Vote →
                              </Button>
                            )}
                          </span>
                        )}
                      />
                    ))}
                  </Ledger>
                )}
                {address && !myDisputesLoading && (
                  <div className="pg-form__actions pg-section--spaced">
                    <Button variant="secondary" size="sm" onClick={refetchMine}>↻ Refresh</Button>
                  </div>
                )}
              </>
            )}

            {/* HISTORY TAB */}
            {tab === "history" && (
              <>
                {historyLoading && (
                  <div className="pg-stack">
                    {[0, 1, 2, 3].map(i => <Skeleton key={i} height={56} radius={8} />)}
                  </div>
                )}

                {!historyLoading && disputes.length === 0 && (
                  <Ledger
                    empty={(
                      <div className="pg-empty">
                        <strong>No disputes yet on-chain.</strong>
                        <span>Quality disputes appear here once opened by callers.</span>
                      </div>
                    )}
                  />
                )}

                {disputes.length > 0 && (
                  <Ledger>
                    {disputes.map(d => (
                      <LedgerRow
                        key={d.id}
                        tone={d.status === "RESOLVED" ? "guard" : d.status === "OPEN" ? "warn" : "muted"}
                        lead={`Dispute #${d.id} · Call #${d.callId}`}
                        meta={`Opened by ${d.caller ? `${d.caller.slice(0, 8)}…` : "—"} · ${d.openedAt ? new Date(Number(d.openedAt) * 1000).toLocaleString() : "—"}`}
                        trailing={(
                          <span className="pg-row-stack">
                            <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                            {d.outcome && <span className="pg-mono">Outcome: {d.outcome}</span>}
                            {d.status === "OPEN" && isConnected && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => { setTab("vote"); setVoteDisputeId(d.id); }}
                              >
                                Vote →
                              </Button>
                            )}
                          </span>
                        )}
                      />
                    ))}
                  </Ledger>
                )}
              </>
            )}
          </>
        )}
        rail={(
          <>
            <KeyValue
              label="Protocol"
              rows={[
                { label: "Contract", value: "DisputeQuality v2" },
                {
                  label: "Address",
                  value: (
                    <a
                      className="pg-rowlink pg-mono"
                      href={`https://explorer.testnet.arc.io/address/${dqAddr}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {dqAddr.slice(0, 10)}…{dqAddr.slice(-6)}
                    </a>
                  ),
                },
                {
                  label: "State",
                  value: <Badge tone={dqEnabled ? "guard" : "neutral"}>{dqEnabled ? "Enabled" : "Retired"}</Badge>,
                },
                { label: "Caller bond", value: `${callerBondUSDC} USDC`, mono: true },
                { label: "Voter bond", value: `${voterBondUSDC} USDC`, mono: true },
                { label: "Voting window", value: votingWindowH, mono: true },
              ]}
            />
            <StatusNotice tone="retired" title="Retired protocol">
              The contract address and bond parameters remain visible for reference. Live actions stay
              disabled until an active replacement exists.
            </StatusNotice>
          </>
        )}
      />
    </PanelShell>
  );
}
