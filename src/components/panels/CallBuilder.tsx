import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAccount, useReadContract, useWriteContract, useSwitchChain, useChainId,
  useWalletClient, usePublicClient, useBalance,
} from "wagmi";
import { keccak256, stringToBytes, maxUint256, pad, decodeEventLog, createPublicClient, http } from "viem";
// MEDIUM-09: import canonical ABIs from config — eliminates local duplicates
import { arcTestnet, CONFIG, REGISTRY_ABI, PPC_ABI } from "../../lib/config";
import { useAppStore } from "../../store/useAppStore";
import { CCTP_CONFIG, switchToChain, waitForAttestation, TOKEN_MESSENGER_ABI, MESSAGE_TRANSMITTER_ABI, USDC_APPROVE_ABI } from "../../lib/cctp";
import { useBudgetCap } from "../../hooks/useBudgetCap";
import { useProviders } from "../../hooks/useSubgraph";
import { PageHeader, SectionCard, Tabs } from "../../ui";
import { friendlyError } from "../../lib/utils";
import { assessCall, batchCost, callCost, formatUsdc, BLOCKER_TEXT, WARNING_TEXT } from "../../lib/callCosts";
import { canSubmit, classifyReceipt, classifyWalletError, txStatus, type TxPhase } from "../../lib/txLifecycle";
import {
  findFacilitatorGuard, upsertFacilitatorGuard, removeFacilitatorGuard,
  beginGuardedFacilitatorRequest, recordFacilitatorSettlement,
  type FacilitatorGuard, type GuardFailure, type GuardStorage,
} from "../../lib/facilitatorGuard";
import { classifyFacilitatorResult, type FacilitatorBody } from "../../lib/facilitatorOutcome";
import {
  checkPaymentStart, readPending, recordSubmittedTx, resolvePendingTx,
  beginOperation, endOperation, activeOperationLabel,
} from "../../lib/paymentGate";
import {
  readCctpOperation, startCctpOperation, updateCctpOperation, clearCctpOperation,
  cctpStageDecision,
} from "../../lib/cctpOperation";
import { endpointHref, endpointState } from "./endpointUrl";

// Aliases for local readability — both reference the same canonical PPC_ABI from config
const SUBMIT_RECEIPT_ABI = PPC_ABI;  // contains submitReceipt with correct respondedAt uint64
const CALL_STARTED_ABI   = PPC_ABI;  // contains CallStarted event definition

/** Accessing `sessionStorage` itself can throw in restricted browser modes. */
function browserSessionStorage(): GuardStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

type GuardView =
  | { status: "checking" }
  | { status: "ok"; guard: FacilitatorGuard | null }
  | { status: "error"; message: string };

const GUARD_FAILURE_TEXT: Record<GuardFailure, string> = {
  "storage-unavailable": "Session storage is unavailable, so an unresolved payment cannot be ruled out. New payments are blocked. Allow site storage for this tab, then re-check.",
  "guard-corrupt": "The saved payment safety marker is unreadable, so an unresolved payment cannot be ruled out. New payments are blocked. Check the explorer and registry, then clear this site's session storage for the tab and re-check.",
  "write-failed": "The x402 safety marker could not be saved, so no facilitator request was sent. Free storage space or allow site storage, then retry.",
  "readback-failed": "The x402 safety marker could not be verified after saving, so no facilitator request was sent. Check site storage, then retry.",
  "downgrade-refused": "The saved x402 safety marker records a stronger state (a submitted transaction hash) than this update would keep. The attempt stays blocked; do not retry.",
};

function guardFailureMessage(reason: GuardFailure): string {
  return GUARD_FAILURE_TEXT[reason];
}

const USDC_ALLOWANCE_ABI = [{
  name: "allowance", type: "function", stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
  outputs: [{ type: "uint256" }],
}] as const;

const USDC_APPROVE_ABI_ONE = [{
  name: "approve", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }],
  outputs: [{ type: "bool" }],
}] as const;

const OPEN_CALLS_ABI = [{
  name: "openCallsPerCaller", type: "function", stateMutability: "view",
  inputs: [{ name: "providerId", type: "uint256" }, { name: "caller", type: "address" }],
  outputs: [{ type: "uint32" }],
}] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const CALL_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

type Chain = "arc" | "sepolia" | "base" | "amoy";

const CHAINS: { value: Chain; label: string; txCount: number; hint: string }[] = [
  { value: "arc",     label: "Arc Testnet (direct)",           txCount: 1, hint: "Paying from Arc Testnet directly. No bridging required." },
  { value: "sepolia", label: "Ethereum Sepolia (via CCTP)",    txCount: 5, hint: "USDC is burned on Sepolia and minted to CrossChainReceiver on Arc. This build does not attach hookData, so no call is created." },
  { value: "base",    label: "Base Sepolia (via CCTP)",        txCount: 5, hint: "USDC is burned on Base Sepolia and minted to CrossChainReceiver on Arc. This build does not attach hookData, so no call is created." },
  { value: "amoy",    label: "Polygon Amoy (via CCTP)",        txCount: 5, hint: "USDC is burned on Amoy and minted to CrossChainReceiver on Arc. This build does not attach hookData, so no call is created." },
];

type Draft = { providerId?: string; payload?: string; chain?: Chain; tab?: "basic" | "advanced" };

function readDraft(): Draft {
  try {
    const raw = sessionStorage.getItem("callbuilder_draft");
    return raw ? (JSON.parse(raw) as Draft) : {};
  } catch {
    return {};
  }
}

/* Factual provider notice. No honour rate is invented when nothing has settled,
   and no causal claim is made from the ratio. */
function RiskBadge({ completed, slashed }: { completed: number; slashed: number }) {
  const settled = completed + slashed;
  if (settled === 0) {
    return (
      <div style={{ background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"var(--text-dim)" }}>
        No settled calls recorded for this provider yet, so there is no honour rate to show.
      </div>
    );
  }
  const rate = Math.round((completed / settled) * 100);
  const tone = rate < 30 ? "var(--warn)" : "var(--text-dim)";
  return (
    <div style={{ background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"var(--text-dim)" }}>
      <strong style={{ color: tone }}>{rate}% honour rate</strong> from {settled} settled call{settled === 1 ? "" : "s"}: {completed} completed, {slashed} slashed. Past results do not predict this call.
    </div>
  );
}

export default function CallBuilder() {
  const { address, isConnected } = useAccount();
  const { setPanel } = useAppStore();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const walletChainId = useChainId();
  const { checkBudget, spendBudget } = useBudgetCap();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);

  const draft = readDraft();
  const [chain, setChain] = useState<Chain>(() => (draft.chain === "sepolia" || draft.chain === "base" || draft.chain === "amoy" ? draft.chain : "arc"));
  const [providerId, setProviderId] = useState(() => {
    const saved = sessionStorage.getItem("callbuilder_provider");
    if (saved) { sessionStorage.removeItem("callbuilder_provider"); return saved; }
    return draft.providerId || "1";
  });
  const [payload, setPayload] = useState(() => draft.payload ?? "ping");
  const [callIdInput, setCallIdInput] = useState("");
  const [responsePayload, setResponsePayload] = useState("pong");
  const [lastCallId, setLastCallId] = useState<string | null>(null);
  const [phase, setPhase] = useState<TxPhase>({ kind: "idle" });
  const [note, setNote] = useState<string | null>(null);
  const [initialPending] = useState(() => readPending());
  const [pendingHash, setPendingHash] = useState<`0x${string}` | null>(() => {
    if (!initialPending.ok || !initialPending.hash) return null;
    return CALL_ID_PATTERN.test(initialPending.hash) ? initialPending.hash as `0x${string}` : null;
  });
  const [pendingPersisted, setPendingPersisted] = useState(true);
  const [settlement, setSettlement] = useState<{ refunded: bigint; slashed: bigint } | null>(null);
  const [batchCount, setBatchCount] = useState(3);
  const [batchResults, setBatchResults] = useState<{ i: number; hash?: string; error?: string; state: "pending" | "confirmed" | "reverted" | "rejected" }[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [checkingPending, setCheckingPending] = useState(false);
  const [confirmDiscardPending, setConfirmDiscardPending] = useState(false);
  const [guardView, setGuardView] = useState<GuardView>({ status: "checking" });
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [ackConfirm, setAckConfirm] = useState(false);
  const [tab, setTab] = useState<"basic" | "advanced">(() => (draft.tab === "advanced" ? "advanced" : "basic"));

  /* Live provider list — lets the builder pick a real id instead of typing one. */
  const { data: providers = [] } = useProviders();

  const chainInfo = CHAINS.find(c => c.value === chain)!;
  const providerIdNum = parseInt(providerId) || 0;
  const payloadTrimmed = payload.trim();
  const payloadError = payloadTrimmed.length === 0 ? "Enter the request payload you want hashed and sent on-chain." : null;
  const callIdError = callIdInput.length > 0 && !CALL_ID_PATTERN.test(callIdInput)
    ? "A call ID is 0x followed by 64 hex characters."
    : null;

  const { data: providerData, isError: providerError, isFetched: providerFetched, isLoading: providerLoading } = useReadContract({
    address: CONFIG.registryAddress as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "getProvider",
    args: [BigInt(providerIdNum || 1)],
    chainId: arcTestnet.id,
    query: { enabled: providerIdNum > 0, refetchInterval: 30_000 },
  });

  // getProvider returns a named 9-field ProviderView tuple. viem decodes named tuples to an
  // object, so read by name and fall back to positional indexes for older shapes.
  // [owner, signer, stake, pricePerCall, maxResponseTime, slashBps, active, maxConcurrentCalls, zkTier]
  const raw = providerData as Record<string | number, unknown> | undefined;
  const owner     = (raw?.owner ?? raw?.[0]) as string | undefined;
  const price     = raw ? ((raw?.pricePerCall ?? raw?.[3] ?? null) as bigint | null) : null;
  const slaWindow = raw ? Number(raw?.maxResponseTime ?? raw?.[4] ?? 0) : 0;
  const slashBps  = raw ? Number(raw?.slashBps ?? raw?.[5] ?? 0) : null;
  const active    = Boolean(raw?.active ?? raw?.[6] ?? false);
  const stake     = raw ? ((raw?.stake ?? raw?.[2] ?? null) as bigint | null) : null;
  const maxConcurrent = raw ? Number(raw?.maxConcurrentCalls ?? raw?.[7] ?? 0) : null;
  const zkTier    = raw ? Number(raw?.zkTier ?? raw?.[8] ?? 0) : 0;

  // getProvider reverts for unknown ids, so a settled query with no usable owner means
  // the id doesn't exist on the live registry — surface that instead of loading forever.
  // An RPC failure is a load failure, not proof the provider is missing.
  const providerNotFound = providerIdNum > 0 && !providerError && providerFetched && !providerLoading && (
    !owner || owner === ZERO_ADDRESS
  );
  const providerLoadError = providerIdNum > 0 && providerError;

  // HIGH-03 fix: completedCalls/slashedCalls are separate reads (not in getProvider tuple)
  const { data: completedCallsRaw } = useReadContract({
    address: CONFIG.registryAddress as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "completedCalls",
    args: [BigInt(providerIdNum || 1)],
    chainId: arcTestnet.id,
    query: { enabled: providerIdNum > 0 && !!providerData, refetchInterval: 60_000 },
  });
  const { data: slashedCallsRaw } = useReadContract({
    address: CONFIG.registryAddress as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "slashedCalls",
    args: [BigInt(providerIdNum || 1)],
    chainId: arcTestnet.id,
    query: { enabled: providerIdNum > 0 && !!providerData, refetchInterval: 60_000 },
  });
  const completedN = completedCallsRaw ? Number(completedCallsRaw) : 0;
  const slashedN   = slashedCallsRaw   ? Number(slashedCallsRaw)   : 0;

  /* Endpoint support is part of the registry record; show it only when the record loaded. */
  const { data: endpointRaw, isLoading: endpointLoading, isError: endpointError } = useReadContract({
    address: CONFIG.registryAddress as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "getEndpoint",
    args: [BigInt(providerIdNum || 1)],
    chainId: arcTestnet.id,
    query: { enabled: providerIdNum > 0 && !!providerData },
  });
  const endpoint = endpointState({ isLoading: providerData ? endpointLoading : false, isError: endpointError, data: endpointRaw });
  const endpointLink = endpointHref(endpoint);

  /* Caller-side balances and limits, all read from the live chain. */
  const { data: usdcBal, refetch: refetchUsdc } = useBalance({
    address, token: CONFIG.usdcAddress as `0x${string}`, chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 20_000 },
  });
  const { data: nativeBal } = useBalance({
    address, chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: CONFIG.usdcAddress as `0x${string}`,
    abi: USDC_ALLOWANCE_ABI,
    functionName: "allowance",
    args: [address ?? ZERO_ADDRESS, CONFIG.payPerCall as `0x${string}`],
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 20_000 },
  });
  const { data: openCallsRaw, refetch: refetchOpenCalls } = useReadContract({
    address: CONFIG.payPerCall as `0x${string}`,
    abi: OPEN_CALLS_ABI,
    functionName: "openCallsPerCaller",
    args: [BigInt(providerIdNum || 1), address ?? ZERO_ADDRESS],
    chainId: arcTestnet.id,
    query: { enabled: providerIdNum > 0 && !!address },
  });

  // ── Gas estimator (debounced; an estimate, never a charge) ──────
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  useEffect(() => {
    if (chain !== "arc" || !isConnected || !address || !active || providerIdNum <= 0 || !publicClient || providerNotFound || providerLoadError || !providerData) return;
    if (payloadTrimmed.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const reqH = keccak256(stringToBytes(payload)) as `0x${string}`;
      publicClient.estimateContractGas({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: PPC_ABI,
        functionName: "callService",
        args: [BigInt(providerIdNum), reqH],
        account: address as `0x${string}`,
      }).then(g => { if (!cancelled) setGasEstimate(g); })
        .catch(() => { if (!cancelled) setGasEstimate(null); });
      publicClient.getGasPrice()
        .then(p => { if (!cancelled) setGasPrice(p); })
        .catch(() => { if (!cancelled) setGasPrice(null); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [chain, isConnected, address, active, providerIdNum, payload, payloadTrimmed, publicClient, providerNotFound, providerLoadError, providerData, allowanceRaw]);

  const gasWei = gasEstimate != null && gasPrice != null ? gasEstimate * gasPrice : null;
  const cost = callCost({ price, gasWei });
  const batchTotal = batchCost(price, batchCount);

  const assessment = assessCall({
    providerId: providerIdNum,
    recordLoaded: !!providerData && !providerLoadError,
    notFound: providerNotFound,
    active,
    price,
    stake,
    slashBps,
    usdcBalance: usdcBal ? usdcBal.value : null,
    allowance: allowanceRaw != null ? BigInt(allowanceRaw) : null,
    openCalls: openCallsRaw != null ? Number(openCallsRaw) : null,
    maxConcurrentCalls: maxConcurrent,
    zkTier,
    gasWei,
    nativeBalance: nativeBal ? nativeBal.value : null,
  });

  const wrongNetwork = isConnected && walletChainId !== arcTestnet.id;
  const isCCTP = chain !== "arc";
  const busy = phase.kind === "preparing" || phase.kind === "awaiting-signature" || phase.kind === "submitted";

  /* Identity of the current payment attempt: provider + request hash. The same
     identity is used by x402, the direct on-chain call and the batch base
     request. A guard blocks every payment-starting action for this provider and
     request, not only the x402 button, until the outcome is known or the user
     explicitly acknowledges the warning. Another provider or payload is a
     separate attempt. */
  const requestHash = keccak256(stringToBytes(payload)) as `0x${string}`;
  const activeGuard = guardView.status === "ok" ? guardView.guard : null;
  const guardBlocked = guardView.status !== "ok" || activeGuard !== null;
  const blockers = [
    ...assessment.blockers,
    ...(price == null && providerData && !providerNotFound ? ["price-unavailable"] : []),
    ...(payloadError ? ["payload-invalid"] : []),
    ...(wrongNetwork ? ["wrong-network"] : []),
    ...(isCCTP ? ["cctp-no-call"] : []),
    ...(pendingHash ? ["pending-transaction"] : []),
    ...(!initialPending.ok ? ["pending-unreadable"] : []),
    ...(guardBlocked ? ["facilitator-guard"] : []),
  ];
  const canRun = canSubmit({ submitting: busy || batchRunning, connected: isConnected, blockers });
  const statusCopy = txStatus(phase);

  /* Read the durable marker. A storage error is shown and blocks x402; it is
     never treated as "no unresolved payment". */
  const refreshGuard = useCallback(() => {
    const storage = browserSessionStorage();
    if (!storage) {
      setGuardView({ status: "error", message: guardFailureMessage("storage-unavailable") });
      return;
    }
    const found = findFacilitatorGuard(storage, { providerId: providerIdNum, requestHash });
    if (!found.ok) setGuardView({ status: "error", message: guardFailureMessage(found.reason) });
    else setGuardView({ status: "ok", guard: found.guard });
  }, [providerIdNum, requestHash]);

  useEffect(() => {
    refreshGuard();
  }, [refreshGuard]);

  /* The decision every payment handler calls immediately before any write.
     A disabled button is not enough: a programmatic click must also be refused.
     Storage failure, an unpersisted marker, an unresolved transaction, another
     running flow, or an active facilitator guard are all blocks. */
  const paymentStartBlock = useCallback((operation: string): string | null => {
    const storage = browserSessionStorage();
    const decision = checkPaymentStart({
      storage,
      attempt: { providerId: providerIdNum, requestHash },
      operation,
    });
    if (decision.ok) {
      if (guardView.status === "error") refreshGuard();
      return null;
    }

    if (decision.code === "guard-active" && decision.guard) {
      setGuardView({ status: "ok", guard: decision.guard });
    } else if (decision.code === "guard-untrusted") {
      setGuardView({ status: "error", message: decision.message });
    }
    return `No payment was started. ${decision.message}`;
  }, [providerIdNum, requestHash, guardView.status, refreshGuard]);

  /* Keep the author's input when the panel unmounts (copy, provider, network, tab). */
  useEffect(() => {
    try {
      sessionStorage.setItem("callbuilder_draft", JSON.stringify({ providerId, payload, chain, tab }));
    } catch { /* storage full or disabled: nothing to preserve */ }
  }, [providerId, payload, chain, tab]);

  /* A hash is a submitted transaction, not a result. The hash is kept in memory
     even when the durable marker cannot be written; the gate then refuses every
     later payment in this tab and says that recovery is not durable. */
  const rememberPending = useCallback((hash: `0x${string}`) => {
    const persisted = recordSubmittedTx(hash, browserSessionStorage()).persisted;
    setPendingHash(hash);
    setPendingPersisted(persisted);
    if (!persisted) {
      setStorageWarning(
        "The transaction was submitted, but its pending marker could not be saved and verified. The hash is shown from memory, this tab stays blocked, and a reload will not remember the transaction. Copy the hash and check the explorer before any retry.",
      );
    }
    return persisted;
  }, []);

  const forgetPending = useCallback(() => {
    const cleared = resolvePendingTx(browserSessionStorage()).cleared;
    if (!cleared) {
      setStorageWarning("The local pending marker could not be verified as cleared. It may keep blocking, and a reload could block again until you recover it.");
    }
    setPendingHash(null);
    setPendingPersisted(true);
    setConfirmDiscardPending(false);
    return cleared;
  }, []);

  const refreshAfterSettlement = useCallback(() => {
    void refetchUsdc();
    void refetchAllowance();
    void refetchOpenCalls();
    void queryClient.invalidateQueries({ queryKey: ["subgraph"] });
    void queryClient.invalidateQueries({ queryKey: ["providers"] });
    void queryClient.invalidateQueries({ queryKey: ["recentActivity"] });
    void queryClient.invalidateQueries({ queryKey: ["networkStats"] });
  }, [refetchUsdc, refetchAllowance, refetchOpenCalls, queryClient]);

  const changeProvider = useCallback((next: string) => {
    setProviderId(next);
    setLastCallId(null);
    setSettlement(null);
    setNote(null);
    setPhase({ kind: "idle" });
  }, []);

  const waitForReceipt = useCallback(async (hash: `0x${string}`, rpcUrl?: string) => {
    /* Source-chain stages need that chain's RPC; the wagmi client is bound to
       Arc. Without a reader the outcome is `unknown`, never a guess. */
    const client = rpcUrl ? createPublicClient({ transport: http(rpcUrl) }) : publicClient;
    if (!client) return { kind: "unknown" as const };
    try {
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
      return { kind: classifyReceipt(receipt.status), receipt };
    } catch {
      return { kind: "unknown" as const };
    }
  }, [publicClient]);

  /* Read-only recovery for a hash left behind by an unread receipt. It never
     sends anything, so checking cannot charge twice. */
  const handleCheckPending = useCallback(async () => {
    if (!pendingHash || !publicClient || checkingPending || submittingRef.current) return;
    setCheckingPending(true);
    setNote(null);
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: pendingHash });
      const kind = classifyReceipt(receipt.status);
      if (kind === "confirmed") {
        forgetPending();
        setPhase({ kind: "confirmed", hash: pendingHash });
        setNote("The stored transaction is confirmed on-chain. This recovery check cannot prove which action it performed; confirm the call or claim in History before starting another one.");
        refreshAfterSettlement();
      } else if (kind === "reverted") {
        forgetPending();
        setPhase({ kind: "reverted", hash: pendingHash });
        setNote("The stored transaction reverted. Its state change and transfer were rolled back.");
        refreshAfterSettlement();
      } else {
        setNote("The receipt has no recognised status. Do not resubmit until the explorer shows a result.");
      }
    } catch {
      setNote(`No receipt is available yet for ${pendingHash}. It may still confirm. Do not resubmit; check the explorer again later.`);
    } finally {
      setCheckingPending(false);
    }
  }, [pendingHash, publicClient, checkingPending, forgetPending, refreshAfterSettlement]);

  /* An explicit, user-confirmed escape from a transaction that never mined
     (dropped or replaced). It sends nothing; it only removes the local marker
     after the user has reviewed the explorer and the registry. */
  const discardPendingMarker = useCallback(() => {
    if (submittingRef.current || activeOperationLabel() !== null) {
      setNote("A payment, facilitator request or receipt wait is still running, so the pending marker cannot be discarded. Wait for it to finish.");
      setConfirmDiscardPending(false);
      return;
    }
    const cleared = forgetPending();
    setNote(cleared
      ? "The local pending marker was discarded. This is not proof the transaction failed and not proof it succeeded; check the explorer and the registry before resubmitting."
      : "The local pending marker could not be cleared because session storage is unavailable. It stays in place.");
  }, [forgetPending]);

  /* Explicit acknowledgment of an uncertain x402 settlement. It removes only
     that attempt's marker and is not treated as proof of settlement. */
  const discardFacGuard = useCallback(() => {
    if (!activeGuard) return;
    if (submittingRef.current || activeOperationLabel() !== null) {
      setNote("A payment, facilitator request or receipt wait is still running, so this warning cannot be discarded. Wait for it to finish.");
      setAckConfirm(false);
      return;
    }
    const storage = browserSessionStorage();
    if (!storage) {
      setGuardView({ status: "error", message: guardFailureMessage("storage-unavailable") });
      setAckConfirm(false);
      return;
    }
    const cleared = removeFacilitatorGuard(storage, {
      providerId: activeGuard.providerId,
      requestHash: activeGuard.requestHash,
    });
    if (cleared.ok) setGuardView({ status: "ok", guard: null });
    else setGuardView({ status: "error", message: guardFailureMessage(cleared.reason) });
    setAckConfirm(false);
    setNote(cleared.ok
      ? "The local x402 warning was discarded. This is not proof of settlement; payment may still have occurred."
      : "The local x402 warning could not be cleared and stays in place.");
  }, [activeGuard]);

  const ensureArc = useCallback(async () => {
    if (walletChainId === arcTestnet.id) return true;
    setPhase({ kind: "preparing", label: "Switching the wallet to Arc Testnet" });
    try {
      await switchChainAsync({ chainId: arcTestnet.id });
      return true;
    } catch (error) {
      const classified = classifyWalletError(error);
      setPhase(classified.kind === "rejected" ? { kind: "rejected" } : { kind: "failed", message: classified.message });
      return false;
    }
  }, [walletChainId, switchChainAsync]);

  /* Ask for the USDC approval only when the live allowance is short. Each step is
     surfaced: rejection leaves nothing submitted, a reverted approval is a failure. */
  const ensureAllowance = useCallback(async (amount: bigint, label: string, operation: string) => {
    if (!publicClient || !address) return false;
    const guardMessage = paymentStartBlock(operation);
    if (guardMessage) {
      setPhase({ kind: "failed", message: guardMessage });
      return false;
    }
    const allowed = await publicClient.readContract({
      address: CONFIG.usdcAddress as `0x${string}`,
      abi: USDC_ALLOWANCE_ABI,
      functionName: "allowance",
      args: [address as `0x${string}`, CONFIG.payPerCall as `0x${string}`],
    }).catch(() => null);
    if (allowed == null) {
      setPhase({ kind: "failed", message: "Could not read the USDC allowance from Arc. Nothing was submitted." });
      return false;
    }
    if (allowed >= amount) return true;

    setPhase({ kind: "awaiting-signature", label: `${label}: approve USDC` });
    let hash: `0x${string}`;
    try {
      hash = await writeContractAsync({
        address: CONFIG.usdcAddress as `0x${string}`,
        abi: USDC_APPROVE_ABI_ONE,
        functionName: "approve",
        args: [CONFIG.payPerCall as `0x${string}`, maxUint256],
        chainId: arcTestnet.id,
      });
    } catch (error) {
      const classified = classifyWalletError(error);
      setPhase(classified.kind === "rejected" ? { kind: "rejected" } : { kind: "failed", message: classified.message });
      return false;
    }
    setPhase({ kind: "submitted", hash });
    rememberPending(hash);
    const result = await waitForReceipt(hash);
    if (result.kind === "reverted") {
      forgetPending();
      setPhase({ kind: "reverted", hash });
      return false;
    }
    if (result.kind !== "confirmed") {
      setPhase({ kind: "failed", message: `Approval was submitted but its receipt could not be read. Check ${CONFIG.explorerTx(hash)} before retrying; a retry could ask for another approval.` });
      return false;
    }
    forgetPending();
    void refetchAllowance();
    return true;
  }, [publicClient, address, writeContractAsync, waitForReceipt, refetchAllowance, rememberPending, forgetPending, paymentStartBlock]);

  /* One call, one lifecycle. The hash is emitted by this operation, so an approval
     hash can never be mistaken for the call's hash. */
  const runCall = useCallback(async (payloadText: string, label: string, operation: string) => {
    if (!address || price == null) return;

    const reqHash = keccak256(stringToBytes(payloadText)) as `0x${string}`;
    const guardMessage = paymentStartBlock(operation);
    if (guardMessage) { setPhase({ kind: "failed", message: guardMessage }); return; }

    if (!(await ensureArc())) return;
    if (!(await ensureAllowance(price, label, operation))) return;

    const recheck = paymentStartBlock(operation);
    if (recheck) { setPhase({ kind: "failed", message: recheck }); return; }

    setPhase({ kind: "awaiting-signature", label: `${label}: create call` });
    let hash: `0x${string}`;
    try {
      hash = await writeContractAsync({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: PPC_ABI,
        functionName: "callService",
        args: [BigInt(providerIdNum), reqHash],
        chainId: arcTestnet.id,
      });
    } catch (error) {
      const classified = classifyWalletError(error);
      setPhase(classified.kind === "rejected" ? { kind: "rejected" } : { kind: "failed", message: classified.message });
      return;
    }

    rememberPending(hash);
    setPhase({ kind: "submitted", hash });
    const result = await waitForReceipt(hash);
    if (result.kind === "reverted") {
      forgetPending();
      setPhase({ kind: "reverted", hash });
      return;
    }
    if (result.kind !== "confirmed" || !("receipt" in result)) {
      setPhase({
        kind: "failed",
        message: `The call transaction was submitted but its receipt could not be read. It may still confirm; check ${CONFIG.explorerTx(hash)} before retrying. Retrying could create a second charge.`,
      });
      return;
    }

    forgetPending();
    let realCallId: `0x${string}` | null = null;
    for (const log of result.receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: CALL_STARTED_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === "CallStarted") {
          realCallId = (decoded.args as { callId?: `0x${string}` }).callId ?? null;
          break;
        }
      } catch { /* not a CallStarted log */ }
    }
    if (realCallId) setLastCallId(realCallId);
    spendBudget(Number(formatUsdc(price)));
    refreshAfterSettlement();
    setPhase({ kind: "confirmed", hash });
    setNote(realCallId
      ? `Call created: ${realCallId}. The provider response, receipt and any settlement are separate and not known yet.`
      : "Transaction confirmed. No CallStarted event was decoded, so the call id is unverified.");
  }, [address, price, paymentStartBlock, ensureArc, ensureAllowance, writeContractAsync, providerIdNum, waitForReceipt, spendBudget, refreshAfterSettlement, rememberPending, forgetPending]);

  // ── Standard call (Arc direct) ──────────────────────────────────
  const handleCall = useCallback(async () => {
    if (!isConnected || !address) { setPhase({ kind: "failed", message: "Connect a wallet first." }); return; }
    if (submittingRef.current) return;
    if (assessment.blockers.length > 0) { setPhase({ kind: "failed", message: BLOCKER_TEXT[assessment.blockers[0]] }); return; }
    if (price == null) { setPhase({ kind: "failed", message: "The provider price could not be read. Nothing was submitted." }); return; }
    if (!payloadTrimmed) { setPhase({ kind: "failed", message: "Enter a request payload first." }); return; }
    const guardMessage = paymentStartBlock("call");
    if (guardMessage) { setPhase({ kind: "failed", message: guardMessage }); return; }
    if (!beginOperation("call")) {
      setPhase({ kind: "failed", message: "Another payment flow is still running in this tab. Wait for it to finish." });
      return;
    }
    const budgetCheck = checkBudget(Number(formatUsdc(price)));
    if (!budgetCheck.ok) {
      endOperation("call");
      setPhase({ kind: "failed", message: budgetCheck.message || "The session budget cap would be exceeded." });
      return;
    }

    submittingRef.current = true;
    setNote(null);
    setSettlement(null);
    try {
      await runCall(payload, "Call", "call");
    } finally {
      submittingRef.current = false;
      endOperation("call");
    }
  }, [isConnected, address, assessment.blockers, price, payload, payloadTrimmed, paymentStartBlock, checkBudget, runCall]);

  // ── CCTP cross-chain path ───────────────────────────────────────
  // Kept for the existing advanced screen, but the UI does not offer it as a call:
  // the transfer below carries no hookData, so CrossChainReceiver never calls
  // callServiceFor. It only moves USDC to the receiver contract.
  const handleCCTPCall = useCallback(async () => {
    if (!isConnected || !address || price == null) { setPhase({ kind: "failed", message: "Connect a wallet and load a provider first." }); return; }
    if (submittingRef.current) return;
    const guardMessage = paymentStartBlock("cctp");
    if (guardMessage) { setPhase({ kind: "failed", message: guardMessage }); return; }

    const storage = browserSessionStorage();
    const preflight = readCctpOperation(storage);
    if (!preflight.ok) {
      setPhase({ kind: "failed", message: "The cross-chain operation marker cannot be read, so a repeated approval, burn or mint cannot be ruled out. Nothing was sent." });
      return;
    }
    if (preflight.operation) {
      setPhase({ kind: "failed", message: `A cross-chain operation is already unresolved (stage: ${preflight.operation.stage}). Resolve it before starting another.` });
      return;
    }
    if (!beginOperation("cctp")) {
      setPhase({ kind: "failed", message: "Another payment flow is still running in this tab. Wait for it to finish." });
      return;
    }

    submittingRef.current = true;
    setPhase({ kind: "preparing", label: "CCTP bridge" });
    setNote(null);

    /* True once any transaction in this operation was submitted. Until then an
       error means nothing reached a chain and the operation marker may be
       cleared; afterwards it never is. */
    let anySubmitted = false;
    let lastHash: `0x${string}` | null = null;

    const keepMarker = (message: string) => {
      setPhase({ kind: "failed", message });
      setStorageWarning("The cross-chain operation marker stays in place, so no new payment can start in this tab. Check the explorer for the recorded hash and resolve the operation manually; do not retry the burn or mint.");
    };

    try {
      const sourceChainKey = chain as string;
      const sourceChain = CCTP_CONFIG.chains[sourceChainKey];
      const sourceDomain = CCTP_CONFIG.domains[sourceChainKey];
      const sourceUsdcAddr = CCTP_CONFIG.usdc[sourceChainKey] as `0x${string}`;
      const amount = price;

      const started = startCctpOperation(storage, { chain: sourceChainKey, amount: amount.toString() });
      if (!started.ok) {
        setPhase({ kind: "failed", message: "The cross-chain operation marker could not be saved and verified, so no approval or burn was sent." });
        return;
      }

      setPhase({ kind: "preparing", label: "CCTP step 1/5: switch to the source chain" });
      await switchToChain(sourceChainKey);
      await new Promise(r => setTimeout(r, 1500));

      setPhase({ kind: "preparing", label: `CCTP step 2/5: check USDC allowance on ${sourceChain.name}` });
      const allowanceRes = await fetch(sourceChain.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"eth_call", params:[{
          to: sourceUsdcAddr,
          data: `0xdd62ed3e${pad(address as `0x${string}`, { size: 32 }).slice(2)}${pad(CCTP_CONFIG.contracts.TokenMessengerV2 as `0x${string}`, { size: 32 }).slice(2)}`,
        }, "latest"]}),
      });
      const allowanceJson = await allowanceRes.json();
      const allowance = BigInt(allowanceJson.result || "0x0");

      if (allowance < amount) {
        const stage = updateCctpOperation(storage, { stage: "approval-pending" });
        if (!stage.ok) { keepMarker("The approval marker could not be saved, so no approval was sent. Nothing was submitted."); return; }

        setPhase({ kind: "awaiting-signature", label: "CCTP step 2/5: approve USDC on the source chain" });
        let approveHash: `0x${string}`;
        try {
          approveHash = await writeContractAsync({
            address: sourceUsdcAddr,
            abi: USDC_APPROVE_ABI,
            functionName: "approve",
            args: [CCTP_CONFIG.contracts.TokenMessengerV2 as `0x${string}`, maxUint256],
            chainId: sourceChain.chainId,
          });
        } catch (error) {
          const classified = classifyWalletError(error);
          if (classified.kind === "rejected") {
            /* The wallet refused: nothing was submitted, so the operation can
               be cleared after verifying the removal. */
            const cleared = clearCctpOperation(storage);
            if (!cleared.ok) setStorageWarning("The wallet rejected the approval, but the operation marker could not be cleared. It keeps blocking.");
            setPhase({ kind: "rejected" });
          } else {
            keepMarker(`The approval did not return a hash: ${classified.message}. The operation stays blocked because a transaction may have been submitted.`);
          }
          return;
        }

        anySubmitted = true;
        lastHash = approveHash;
        rememberPending(approveHash);
        const recorded = updateCctpOperation(storage, { stage: "approval-pending", approvalHash: approveHash });
        if (!recorded.ok) { keepMarker(`The approval was submitted (${approveHash}), but the operation marker could not record its hash. Check the explorer before anything else.`); return; }
        setPhase({ kind: "submitted", hash: approveHash });

        const approvalReceipt = await waitForReceipt(approveHash, sourceChain.rpcUrl);
        const decision = cctpStageDecision("approval-pending", approvalReceipt.kind);
        if (decision.action === "stop") { keepMarker(decision.message); return; }
        if (decision.action === "fail") {
          const cleared = clearCctpOperation(storage);
          forgetPending();
          if (!cleared.ok) setStorageWarning("The approval reverted, but the operation marker could not be cleared. It keeps blocking.");
          setPhase({ kind: "reverted", hash: approveHash });
          setNote(decision.message);
          return;
        }
        const advanced = updateCctpOperation(storage, { stage: "approval-confirmed" });
        if (!advanced.ok) { keepMarker(`The approval confirmed, but the marker could not record that stage. Check ${CONFIG.explorerTx(approveHash)} before continuing.`); return; }
        forgetPending();
        lastHash = null;
      }

      const burnStage = updateCctpOperation(storage, { stage: "burn-pending" });
      if (!burnStage.ok) { keepMarker("The burn marker could not be saved, so no burn was sent. Nothing was submitted."); return; }

      setPhase({ kind: "awaiting-signature", label: "CCTP step 3/5: burn USDC" });
      const mintRecipient = pad(CCTP_CONFIG.crossChainReceiver as `0x${string}`, { size: 32 });
      let burnHash: `0x${string}`;
      try {
        burnHash = await writeContractAsync({
          address: CCTP_CONFIG.contracts.TokenMessengerV2 as `0x${string}`,
          abi: TOKEN_MESSENGER_ABI,
          functionName: "depositForBurn",
          args: [amount, CCTP_CONFIG.domains.arc, mintRecipient, sourceUsdcAddr, "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`, BigInt(0), 1000],
          chainId: sourceChain.chainId,
        });
      } catch (error) {
        const classified = classifyWalletError(error);
        if (classified.kind === "rejected" && !anySubmitted) {
          const cleared = clearCctpOperation(storage);
          if (!cleared.ok) setStorageWarning("The wallet rejected the burn, but the operation marker could not be cleared. It keeps blocking.");
          setPhase({ kind: "rejected" });
        } else {
          keepMarker(`The burn did not return a hash: ${classified.kind === "rejected" ? "the wallet rejected it after an earlier submitted step" : classified.message}. The operation stays blocked because a burn may have been submitted.`);
        }
        return;
      }

      anySubmitted = true;
      lastHash = burnHash;
      rememberPending(burnHash);
      const burnRecorded = updateCctpOperation(storage, { stage: "burn-pending", burnHash });
      if (!burnRecorded.ok) { keepMarker(`The burn was submitted (${burnHash}), but the operation marker could not record its hash. Check the explorer before anything else.`); return; }
      setPhase({ kind: "submitted", hash: burnHash });

      const burnReceipt = await waitForReceipt(burnHash, sourceChain.rpcUrl);
      const burnDecision = cctpStageDecision("burn-pending", burnReceipt.kind);
      if (burnDecision.action === "stop") { keepMarker(burnDecision.message); return; }
      if (burnDecision.action === "fail") {
        const cleared = clearCctpOperation(storage);
        forgetPending();
        if (!cleared.ok) setStorageWarning("The burn reverted, but the operation marker could not be cleared. It keeps blocking.");
        setPhase({ kind: "reverted", hash: burnHash });
        setNote(burnDecision.message);
        return;
      }
      const burnAdvanced = updateCctpOperation(storage, { stage: "burn-confirmed" });
      if (!burnAdvanced.ok) { keepMarker(`The burn confirmed, but the marker could not record that stage. Check ${CONFIG.explorerTx(burnHash)} before continuing.`); return; }
      forgetPending();
      lastHash = null;

      setPhase({ kind: "preparing", label: "CCTP step 4/5: wait for the Circle attestation" });
      let attestation: string;
      let message: string;
      try {
        const attested = await waitForAttestation(sourceDomain, burnHash);
        message = attested.message;
        attestation = attested.attestation;
      } catch {
        /* No write happened, and the operation is not complete: the burn is
           confirmed and must not be repeated. */
        keepMarker(`The burn ${burnHash} is confirmed, but the Circle attestation could not be read. The operation stays blocked; do not burn again. The mint can only be completed from the attested message.`);
        return;
      }
      setPhase({ kind: "preparing", label: "CCTP step 5/5: mint on Arc" });

      await switchToChain("arc");
      await new Promise(r => setTimeout(r, 2000));

      const mintStage = updateCctpOperation(storage, { stage: "mint-pending" });
      if (!mintStage.ok) { keepMarker("The burn is confirmed, but the mint marker could not be saved, so no mint was sent. The operation stays blocked."); return; }

      setPhase({ kind: "awaiting-signature", label: "CCTP step 5/5: mint on Arc" });
      let mintHash: `0x${string}`;
      try {
        mintHash = await writeContractAsync({
          address: CCTP_CONFIG.contracts.MessageTransmitterV2 as `0x${string}`,
          abi: MESSAGE_TRANSMITTER_ABI,
          functionName: "receiveMessage",
          args: [message as `0x${string}`, attestation as `0x${string}`],
          chainId: arcTestnet.id,
        });
      } catch (error) {
        const classified = classifyWalletError(error);
        if (classified.kind === "rejected" && !anySubmitted) {
          const cleared = clearCctpOperation(storage);
          if (!cleared.ok) setStorageWarning("The wallet rejected the mint, but the operation marker could not be cleared. It keeps blocking.");
          setPhase({ kind: "rejected" });
        } else {
          keepMarker(`The mint did not return a hash: ${classified.kind === "rejected" ? "the wallet rejected it after an earlier submitted step" : classified.message}. The operation stays blocked because a mint may have been submitted.`);
        }
        return;
      }

      anySubmitted = true;
      lastHash = mintHash;
      rememberPending(mintHash);
      const mintRecorded = updateCctpOperation(storage, { stage: "mint-pending", mintHash });
      if (!mintRecorded.ok) { keepMarker(`The mint was submitted (${mintHash}), but the operation marker could not record its hash. Check the explorer before anything else.`); return; }
      setPhase({ kind: "submitted", hash: mintHash });

      const mintReceipt = await waitForReceipt(mintHash);
      const mintDecision = cctpStageDecision("mint-pending", mintReceipt.kind);
      if (mintDecision.action === "stop") { keepMarker(mintDecision.message); return; }
      if (mintDecision.action === "fail") {
        const cleared = clearCctpOperation(storage);
        forgetPending();
        if (!cleared.ok) setStorageWarning("The mint reverted, but the operation marker could not be cleared. It keeps blocking.");
        setPhase({ kind: "reverted", hash: mintHash });
        setNote(mintDecision.message);
        return;
      }

      /* Whole operation proven complete: only now is the marker removed. */
      const cleared = clearCctpOperation(storage);
      forgetPending();
      if (!cleared.ok) setStorageWarning("The mint confirmed, but the operation marker could not be cleared. It may keep blocking.");
      setPhase({ kind: "confirmed", hash: mintHash });
      setNote("Mint confirmed on Arc. This transfer carries no hookData, so CrossChainReceiver does not create a PayPerCall call; the USDC sits at the receiver contract.");
    } catch (error) {
      const classified = classifyWalletError(error);
      if (!anySubmitted && classified.kind === "rejected") {
        const cleared = clearCctpOperation(storage);
        if (!cleared.ok) setStorageWarning("The wallet rejected the step, but the operation marker could not be cleared. It keeps blocking.");
        setPhase({ kind: "rejected" });
      } else {
        keepMarker(`CCTP stopped: ${classified.kind === "rejected" ? "the wallet rejected a later step" : classified.message}${lastHash ? ` (last submitted hash: ${lastHash})` : ""}. The operation stays blocked.`);
      }
    } finally {
      submittingRef.current = false;
      endOperation("cctp");
    }
  }, [isConnected, address, price, chain, paymentStartBlock, writeContractAsync, waitForReceipt, rememberPending, forgetPending]);

  // ── Timeout claim ───────────────────────────────────────────────
  const handleClaimTimeout = useCallback(async () => {
    const id = callIdInput || lastCallId;
    if (!id) { setPhase({ kind: "failed", message: "Enter a call ID first." }); return; }
    if (!CALL_ID_PATTERN.test(id)) { setPhase({ kind: "failed", message: "A call ID is 0x followed by 64 hex characters." }); return; }
    if (!address) { setPhase({ kind: "failed", message: "Connect a wallet first." }); return; }
    if (submittingRef.current) return;
    const guardMessage = paymentStartBlock("claim");
    if (guardMessage) { setPhase({ kind: "failed", message: guardMessage }); return; }
    if (!beginOperation("claim")) { setPhase({ kind: "failed", message: "Another payment flow is still running in this tab. Wait for it to finish." }); return; }
    submittingRef.current = true;
    setSettlement(null);
    setNote(null);
    try {
      if (!(await ensureArc())) return;
      if (!publicClient) { setPhase({ kind: "failed", message: "Arc RPC is unavailable. Nothing was submitted." }); return; }
      setPhase({ kind: "preparing", label: "Checking whether this call can be claimed" });
      try {
        await publicClient.simulateContract({
          address: CONFIG.payPerCall as `0x${string}`,
          abi: PPC_ABI,
          functionName: "claimTimeout",
          args: [id as `0x${string}`],
          account: address as `0x${string}`,
        });
      } catch (error) {
        setPhase({ kind: "failed", message: `The claim would revert, so nothing was submitted and no gas was spent: ${friendlyError(error)}` });
        return;
      }
      setPhase({ kind: "awaiting-signature", label: "Claim timeout" });
      let hash: `0x${string}`;
      try {
        hash = await writeContractAsync({
          address: CONFIG.payPerCall as `0x${string}`,
          abi: PPC_ABI,
          functionName: "claimTimeout",
          args: [id as `0x${string}`],
          chainId: arcTestnet.id,
        });
      } catch (error) {
        const classified = classifyWalletError(error);
        setPhase(classified.kind === "rejected" ? { kind: "rejected" } : { kind: "failed", message: classified.message });
        return;
      }
      rememberPending(hash);
      setPhase({ kind: "submitted", hash });
      const result = await waitForReceipt(hash);
      if (result.kind === "reverted") {
        forgetPending();
        setPhase({ kind: "reverted", hash });
        setNote("The claim reverted, so nothing was refunded or slashed by it. claimTimeout only succeeds after the response window plus grace, and only once per call.");
        return;
      }
      if (result.kind !== "confirmed" || !("receipt" in result)) {
        setPhase({ kind: "failed", message: `The claim was submitted but its receipt could not be read. Check ${CONFIG.explorerTx(hash)} before retrying.` });
        return;
      }
      forgetPending();
      let decodedSlashed = false;
      for (const log of result.receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: PPC_ABI, data: log.data, topics: log.topics });
          if (decoded.eventName === "CallSlashed") {
            const args = decoded.args as { refunded?: bigint; slashed?: bigint };
            if (args.refunded != null && args.slashed != null) {
              setSettlement({ refunded: args.refunded, slashed: args.slashed });
              decodedSlashed = true;
            }
            break;
          }
        } catch { /* not a CallSlashed log */ }
      }
      refreshAfterSettlement();
      setPhase({ kind: "confirmed", hash });
      setNote(decodedSlashed
        ? "Timeout claim confirmed on-chain. The amounts below come from the decoded CallSlashed event."
        : "Timeout claim transaction confirmed, but no CallSlashed event was decoded. The refund and slash amounts are unavailable; check the explorer and call status.");
    } finally {
      submittingRef.current = false;
      endOperation("claim");
    }
  }, [callIdInput, lastCallId, ensureArc, writeContractAsync, waitForReceipt, publicClient, address, paymentStartBlock, rememberPending, forgetPending, refreshAfterSettlement]);

  // ── Submit receipt (provider side) ─────────────────────────────
  const handleSubmitReceipt = useCallback(async () => {
    const id = callIdInput || lastCallId;
    if (!id || !CALL_ID_PATTERN.test(id)) { setPhase({ kind: "failed", message: "Enter a valid 32-byte call ID." }); return; }
    if (!walletClient || !address) { setPhase({ kind: "failed", message: "Connect a wallet first." }); return; }
    if (submittingRef.current) return;
    const guardMessage = paymentStartBlock("receipt");
    if (guardMessage) { setPhase({ kind: "failed", message: guardMessage }); return; }
    if (!beginOperation("receipt")) { setPhase({ kind: "failed", message: "Another payment flow is still running in this tab. Wait for it to finish." }); return; }
    submittingRef.current = true;
    setNote(null);
    try {
      if (!(await ensureArc())) return;
      setPhase({ kind: "awaiting-signature", label: "Sign the EIP-712 receipt" });
      const responseHash = keccak256(stringToBytes(responsePayload)) as `0x${string}`;
      const respondedAt = BigInt(Math.floor(Date.now() / 1000));
      const domain = { name: "ArcSLA", version: "1", chainId: arcTestnet.id, verifyingContract: CONFIG.payPerCall as `0x${string}` } as const;
      const types = { Receipt: [
        { name: "callId",       type: "bytes32" },
        { name: "responseHash", type: "bytes32" },
        { name: "respondedAt",  type: "uint64"  },
      ] } as const;
      let sig: `0x${string}`;
      try {
        sig = await walletClient.signTypedData({
          domain, types, primaryType: "Receipt",
          message: { callId: id as `0x${string}`, responseHash, respondedAt },
        });
      } catch (error) {
        const classified = classifyWalletError(error);
        setPhase(classified.kind === "rejected" ? { kind: "rejected" } : { kind: "failed", message: classified.message });
        return;
      }

      if (!publicClient) { setPhase({ kind: "failed", message: "Arc RPC is unavailable. Nothing was submitted." }); return; }
      setPhase({ kind: "preparing", label: "Checking whether the receipt can be submitted" });
      try {
        await publicClient.simulateContract({
          address: CONFIG.payPerCall as `0x${string}`,
          abi: SUBMIT_RECEIPT_ABI,
          functionName: "submitReceipt",
          args: [id as `0x${string}`, responseHash, respondedAt, sig],
          account: address as `0x${string}`,
        });
      } catch (error) {
        setPhase({ kind: "failed", message: `The receipt would revert, so nothing was submitted and no gas was spent: ${friendlyError(error)}` });
        return;
      }

      setPhase({ kind: "awaiting-signature", label: "Submit the receipt" });
      let hash: `0x${string}`;
      try {
        hash = await writeContractAsync({
          address: CONFIG.payPerCall as `0x${string}`,
          abi: SUBMIT_RECEIPT_ABI,
          functionName: "submitReceipt",
          args: [id as `0x${string}`, responseHash, respondedAt, sig],
          chainId: arcTestnet.id,
        });
      } catch (error) {
        const classified = classifyWalletError(error);
        setPhase(classified.kind === "rejected" ? { kind: "rejected" } : { kind: "failed", message: classified.message });
        return;
      }
      rememberPending(hash);
      setPhase({ kind: "submitted", hash });
      const result = await waitForReceipt(hash);
      if (result.kind === "reverted") {
        forgetPending();
        setPhase({ kind: "reverted", hash });
        setNote("The receipt transaction reverted, so the escrow was not released. submitReceipt only succeeds inside the response window.");
        return;
      }
      if (result.kind !== "confirmed" || !("receipt" in result)) {
        setPhase({ kind: "failed", message: `The receipt was submitted but its receipt could not be read. Check ${CONFIG.explorerTx(hash)} before retrying.` });
        return;
      }
      forgetPending();
      let decodedEvent = false;
      for (const log of result.receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: PPC_ABI, data: log.data, topics: log.topics });
          if (decoded.eventName === "ReceiptSubmitted") { decodedEvent = true; break; }
        } catch { /* not a ReceiptSubmitted log */ }
      }
      refreshAfterSettlement();
      setPhase({ kind: "confirmed", hash });
      setNote(decodedEvent
        ? "Receipt confirmed on-chain. The contract made the escrow claimable by the provider; the receipt itself does not transfer USDC."
        : "Transaction confirmed, but no ReceiptSubmitted event was decoded. Treat the receipt as unverified.");
    } finally {
      submittingRef.current = false;
      endOperation("receipt");
    }
  }, [callIdInput, lastCallId, responsePayload, walletClient, address, ensureArc, writeContractAsync, waitForReceipt, publicClient, paymentStartBlock, rememberPending, forgetPending, refreshAfterSettlement]);

  // ── x402 / EIP-3009 path ───────────────────────────────────────
  const handleX402Call = useCallback(async () => {
    if (!isConnected || !address) { setPhase({ kind: "failed", message: "Connect a wallet first." }); return; }
    if (!walletClient) { setPhase({ kind: "failed", message: "Wallet client not ready." }); return; }
    if (submittingRef.current) return;
    if (assessment.blockers.length > 0) { setPhase({ kind: "failed", message: BLOCKER_TEXT[assessment.blockers[0]] }); return; }
    if (price == null) { setPhase({ kind: "failed", message: "The provider price could not be read. Nothing was signed." }); return; }
    if (!payloadTrimmed) { setPhase({ kind: "failed", message: "Enter a request payload first." }); return; }

    const attempt = { providerId: providerIdNum, requestHash };
    const storage = browserSessionStorage();
    const gateMessage = paymentStartBlock("x402");
    if (gateMessage) { setPhase({ kind: "failed", message: gateMessage }); return; }
    if (!storage) {
      setGuardView({ status: "error", message: guardFailureMessage("storage-unavailable") });
      setPhase({ kind: "failed", message: "x402 payments are blocked because the payment safety state cannot be read. Allow site storage for this tab, then retry." });
      return;
    }
    if (!beginOperation("x402")) { setPhase({ kind: "failed", message: "Another payment flow is still running in this tab. Wait for it to finish." }); return; }

    const budgetCheck = checkBudget(Number(formatUsdc(price)));
    if (!budgetCheck.ok) {
      endOperation("x402");
      setPhase({ kind: "failed", message: budgetCheck.message || "The session budget cap would be exceeded." });
      return;
    }

    submittingRef.current = true;
    setNote(null);
    setSettlement(null);
    setStorageWarning(null);
    try {
      const facilitatorUrl = CONFIG.facilitatorUrl;
      const now = Math.floor(Date.now() / 1000);
      const validAfter = BigInt(0);
      const validBefore = BigInt(now + 120);
      const authNonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2,'0')).join('')}` as `0x${string}`;

      setPhase({ kind: "awaiting-signature", label: "x402: sign EIP-3009 (off-chain, no gas)" });
      let eip3009Sig: `0x${string}`;
      try {
        eip3009Sig = await walletClient.signTypedData({
          domain: { name: "USDC", version: "2", chainId: arcTestnet.id, verifyingContract: CONFIG.usdcAddress as `0x${string}` },
          types: { TransferWithAuthorization: [
            { name: "from", type: "address" }, { name: "to", type: "address" },
            { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
          ]},
          primaryType: "TransferWithAuthorization",
          message: { from: address, to: CONFIG.payPerCall as `0x${string}`, value: price, validAfter, validBefore, nonce: authNonce },
        });
      } catch (error) {
        const classified = classifyWalletError(error);
        setPhase(classified.kind === "rejected" ? { kind: "rejected" } : { kind: "failed", message: classified.message });
        return;
      }

      /* Re-check immediately before the settlement write: the signature wait
         may have taken long enough for another tab action or a storage failure
         to change the picture. */
      const recheck = paymentStartBlock("x402");
      if (recheck) { setPhase({ kind: "failed", message: recheck }); return; }

      /* Establish and verify the `prepared` marker BEFORE the facilitator
         request. If that is impossible, the helper never calls `request`. */
      const began = await beginGuardedFacilitatorRequest<{
        reached: boolean;
        status: number;
        body: FacilitatorBody | null;
      }>({
        storage,
        attempt,
        onPrepared: (guard) => setGuardView({ status: "ok", guard }),
        request: async () => {
          setPhase({ kind: "preparing", label: "x402: ask the facilitator to settle" });
          let body: FacilitatorBody | null = null;
          let reached = false;
          let status = 0;
          try {
            const facRes = await fetch(`${facilitatorUrl}/api/call-service`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                providerId: providerIdNum.toString(), requestHash,
                authorization: { from: address, to: CONFIG.payPerCall, value: price.toString(), validAfter: "0", validBefore: validBefore.toString(), nonce: authNonce },
                signature: eip3009Sig,
              }),
            });
            reached = true;
            status = facRes.status;
            body = await facRes.json().catch(() => null) as FacilitatorBody | null;
          } catch {
            reached = false;
          }
          return { reached, status, body };
        },
      });
      if (!began.ok) {
        setGuardView({ status: "error", message: guardFailureMessage(began.reason) });
        setPhase({ kind: "failed", message: "The payment safety marker could not be saved and verified, so no facilitator request was sent. Nothing was paid by this action." });
        return;
      }
      const attemptGuard = began.guard;
      const { reached: facilitatorReached, status: facilitatorStatus, body: facData } = began.response;

      /* Keep the durable preflight marker on every uncertain outcome. */
      const markUncertain = (message: string) => {
        const updated = upsertFacilitatorGuard(storage, { ...attempt, stage: "uncertain" });
        if (updated.ok) {
          setGuardView({ status: "ok", guard: updated.guard });
        } else {
          setGuardView({ status: "ok", guard: attemptGuard });
          setStorageWarning("The x402 safety marker could not be updated, but the durable preflight marker still blocks a retry.");
        }
        setPhase({ kind: "failed", message });
      };

      const outcome = classifyFacilitatorResult({ reached: facilitatorReached, status: facilitatorStatus, body: facData });

      /* Every non-settled response is uncertain. `PRE_SETTLEMENT`, `demo` and
         `settled:false` are unauthenticated claims: they never clear the guard
         and never start an automatic on-chain fallback. Recovery is explicit. */
      if (outcome.kind === "uncertain") {
        markUncertain(`${outcome.detail} Payment may already have occurred. The guard stays and no automatic on-chain fallback was sent. Check the explorer and the registry, then acknowledge the warning yourself if it is safe.`);
        return;
      }

      /* A terminal reverted settlement carries a valid hash. It is not
         uncertain: clear the pending and x402 markers and show the revert. */
      if (outcome.kind === "reverted") {
        const pendingCleared = forgetPending();
        const cleared = removeFacilitatorGuard(storage, attempt);
        if (cleared.ok) setGuardView({ status: "ok", guard: null });
        else setStorageWarning("The transaction reverted, but the local x402 marker could not be cleared. It may keep blocking this attempt.");
        if (!pendingCleared) setStorageWarning("The transaction reverted, but the local pending marker could not be cleared. It may keep blocking until you recover it.");
        setPhase({ kind: "reverted", hash: outcome.txHash });
        setNote("The settlement transaction reverted. No USDC moved and the x402 attempt is cleared.");
        return;
      }

      const hash = outcome.txHash;
      const tracked = recordFacilitatorSettlement({
        storage,
        attempt,
        existing: attemptGuard,
        hash,
        persistPending: (pendingHash) => recordSubmittedTx(pendingHash, storage).persisted,
      });
      setGuardView({ status: "ok", guard: tracked.guard });
      setPendingHash(hash);
      setPendingPersisted(tracked.pendingPersisted);
      if (!tracked.guardPersisted || !tracked.pendingPersisted) {
        setStorageWarning(
          !tracked.pendingPersisted && !tracked.guardPersisted
            ? "The transaction hash was received but neither the pending marker nor the updated x402 marker could be saved. The hash is shown from memory; the earlier x402 marker still blocks a retry."
            : !tracked.pendingPersisted
              ? "The transaction hash was received but the pending marker could not be saved. The hash is shown from memory; the x402 marker still blocks a retry until the outcome is known."
              : "The transaction hash was received and pending tracking was saved, but the x402 marker update could not be verified. The attempt stays blocked.",
        );
      }
      setPhase({ kind: "submitted", hash });

      const result = await waitForReceipt(hash);
      if (result.kind === "reverted") {
        const pendingCleared = forgetPending();
        const cleared = removeFacilitatorGuard(storage, attempt);
        if (cleared.ok) setGuardView({ status: "ok", guard: null });
        else setStorageWarning("The transaction reverted, but the local x402 marker could not be cleared. It may keep blocking this attempt.");
        if (!pendingCleared) setStorageWarning("The transaction reverted, but the local pending marker could not be cleared. It may keep blocking until you recover it.");
        setPhase({ kind: "reverted", hash });
        return;
      }
      if (result.kind !== "confirmed") {
        setPhase({ kind: "failed", message: `The facilitator returned a transaction hash, but its receipt could not be read. Check ${CONFIG.explorerTx(hash)} before retrying.` });
        return;
      }

      const pendingCleared = forgetPending();
      const cleared = removeFacilitatorGuard(storage, attempt);
      if (cleared.ok) setGuardView({ status: "ok", guard: null });
      if (!pendingCleared) setStorageWarning("The transaction confirmed, but the local pending marker could not be cleared. It may keep blocking until you recover it.");
      else if (!cleared.ok) setStorageWarning("The transaction confirmed, but the local x402 marker could not be cleared. It may keep blocking this attempt.");
      if (facData?.callId) setLastCallId(facData.callId);
      spendBudget(Number(formatUsdc(price)));
      refreshAfterSettlement();
      setPhase({ kind: "confirmed", hash });
      setNote(facData?.callId
        ? `Call created: ${facData.callId}. The facilitator paid the network fee; the provider response and settlement are still unknown.`
        : "Settlement transaction confirmed, but the facilitator returned no call id. The call is unverified.");
    } finally {
      submittingRef.current = false;
      endOperation("x402");
    }
  }, [isConnected, address, walletClient, assessment.blockers, price, payloadTrimmed, checkBudget, providerIdNum, requestHash, paymentStartBlock, waitForReceipt, spendBudget, forgetPending, refreshAfterSettlement]);

  // ── Batch call ──────────────────────────────────────────────────
  const handleBatch = useCallback(async () => {
    if (!isConnected || !address) { setPhase({ kind: "failed", message: "Connect a wallet first." }); return; }
    if (submittingRef.current) return;
    if (assessment.blockers.length > 0) { setPhase({ kind: "failed", message: BLOCKER_TEXT[assessment.blockers[0]] }); return; }
    if (price == null || batchTotal == null) { setPhase({ kind: "failed", message: "The provider price is unavailable, so the batch total cannot be shown. Nothing was sent." }); return; }
    if (!payloadTrimmed) { setPhase({ kind: "failed", message: "Enter a request payload first." }); return; }
    const guardMessage = paymentStartBlock("batch");
    if (guardMessage) { setPhase({ kind: "failed", message: guardMessage }); return; }
    const budgetCheck = checkBudget(Number(formatUsdc(batchTotal)));
    if (!budgetCheck.ok) { setPhase({ kind: "failed", message: budgetCheck.message || "The session budget cap would be exceeded." }); return; }
    if (!beginOperation("batch")) { setPhase({ kind: "failed", message: "Another payment flow is still running in this tab. Wait for it to finish." }); return; }

    submittingRef.current = true;
    setBatchRunning(true);
    setBatchResults([]);
    setNote(null);
    let failedAt: number | null = null;
    let anyConfirmed = false;
    try {
      if (!(await ensureArc())) return;
      if (!(await ensureAllowance(price, "Batch", "batch"))) return;
      for (let i = 0; i < batchCount; i++) {
        /* Re-check before every item: an earlier item may have left an
           unpersisted hash, an unresolved marker or an active guard. */
        const recheck = paymentStartBlock("batch");
        if (recheck) {
          setPhase({ kind: "failed", message: `Batch stopped before call ${i + 1}. ${recheck}` });
          failedAt = i;
          break;
        }
        setPhase({ kind: "awaiting-signature", label: `Batch ${i + 1}/${batchCount}: create call` });
        let hash: `0x${string}`;
        try {
          hash = await writeContractAsync({
            address: CONFIG.payPerCall as `0x${string}`,
            abi: PPC_ABI,
            functionName: "callService",
            args: [BigInt(providerIdNum), keccak256(stringToBytes(`${payload}-${i}-${Date.now()}`))],
            chainId: arcTestnet.id,
          });
        } catch (error) {
          const classified = classifyWalletError(error);
          const message = classified.kind === "rejected" ? "Rejected in the wallet; not submitted." : classified.message;
          setBatchResults(r => [...r, { i: i + 1, error: message, state: "rejected" }]);
          setPhase(classified.kind === "rejected" ? { kind: "rejected" } : { kind: "failed", message: classified.message });
          failedAt = i;
          break;
        }
        const persisted = rememberPending(hash);
        setBatchResults(r => [...r, { i: i + 1, hash, state: "pending" }]);
        setPhase({ kind: "submitted", hash });
        if (!persisted) {
          setPhase({ kind: "failed", message: `Batch stopped at call ${i + 1}: the transaction was submitted (${hash}) but its pending marker could not be saved. Check the explorer before doing anything else.` });
          failedAt = i;
          break;
        }
        const result = await waitForReceipt(hash);
        const state = result.kind === "confirmed" ? "confirmed" : result.kind === "reverted" ? "reverted" : "pending";
        setBatchResults(r => r.map(row => row.i === i + 1 ? { ...row, state } : row));
        if (result.kind === "confirmed") {
          forgetPending();
          anyConfirmed = true;
          spendBudget(Number(formatUsdc(price)));
        }
        if (result.kind === "reverted") forgetPending();
        if (result.kind === "unknown") {
          setPhase({ kind: "failed", message: `Batch stopped at call ${i + 1}: the receipt could not be read. Check the explorer before retrying; a retry could charge again.` });
          failedAt = i;
          break;
        }
      }
      if (anyConfirmed) refreshAfterSettlement();
      if (failedAt == null) setPhase({ kind: "idle" });
      setNote("Each batch entry is a separate charge. Retrying a failed entry sends and charges a new call.");
    } finally {
      setBatchRunning(false);
      submittingRef.current = false;
      endOperation("batch");
    }
  }, [isConnected, address, assessment.blockers, price, batchTotal, payload, payloadTrimmed, paymentStartBlock, providerIdNum, checkBudget, batchCount, ensureArc, ensureAllowance, writeContractAsync, waitForReceipt, spendBudget, rememberPending, forgetPending, refreshAfterSettlement]);

  const endpointRowValue = endpoint.kind === "usable"
    ? endpoint.value
    : endpoint.kind === "placeholder" ? `${endpoint.value} (placeholder stored by the provider)`
    : endpoint.kind === "invalid" ? `${endpoint.value} (not a valid http(s) URL)`
    : endpoint.kind === "loading" ? "Reading…"
    : endpoint.kind === "error" ? "Read failed"
    : "Not set";

  return (
    <div style={{ padding:"20px 16px 96px",maxWidth:1100,margin:"0 auto" }}>
      <PageHeader
        eyebrow="Call Builder"
        title="Create your custom SLA call."
        subtitle="Configure and execute an API call with on-chain SLA enforcement."
        actions={
          <div className="cb-pill">
            <span className="cb-pill__dot" />
            On-chain escrow
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "basic", label: "Basic" },
          { id: "advanced", label: "Advanced" },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="cg-split-rail" style={{ display:"grid",gap:16 }}>
        {/* Left: form */}
        <SectionCard>
          <div style={{ background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--text-dim)",marginBottom:18 }}>
            <strong style={{ color: "var(--text)" }}>Two ways to start a call.</strong> An on-chain call escrows the provider&apos;s price in USDC and pays a network fee in Arc&apos;s native gas token. The x402 path signs an EIP-3009 authorization off-chain and the facilitator pays that network fee.
          </div>

          {/* Provider + Payload */}
          <div className="cb-fields" style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
            <div>
              <label htmlFor="cb-provider" style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text)",fontWeight:600,display:"block",marginBottom:6 }}>Provider</label>
              <select
                id="cb-provider"
                value={providerId}
                onChange={e => changeProvider(e.target.value)}
                disabled={busy}
                style={{ width:"100%",background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:10,padding:"9px 12px",color:"var(--text)",fontSize:13,fontFamily:"var(--font-mono)",boxSizing:"border-box" as const }}
              >
                {!providers.some(p => String(p.id) === providerId) && providerId && (
                  <option value={providerId}>#{providerId}{providerNotFound ? " · not found" : ""}</option>
                )}
                {providers.map(p => (
                  <option key={p.id} value={String(p.id)}>
                    #{p.id} · {p.owner.slice(0, 6)}…{p.owner.slice(-4)} · {formatUsdc(BigInt(p.pricePerCall || 0))} USDC
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cb-payload" style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text)",fontWeight:600,display:"block",marginBottom:6 }}>Request payload</label>
              <input
                id="cb-payload"
                type="text" value={payload} onChange={e => setPayload(e.target.value)}
                aria-invalid={payloadError ? true : undefined}
                aria-describedby={payloadError ? "cb-payload-error" : undefined}
                style={{ width:"100%",background:"var(--bg-3)",border:`1px solid ${payloadError ? "var(--danger)" : "var(--border)"}`,borderRadius:10,padding:"9px 12px",color:"var(--text)",fontSize:13,boxSizing:"border-box" as const }}
                placeholder="ping"
              />
              {payloadError && <p id="cb-payload-error" role="alert" style={{ fontSize:12,color:"var(--danger)",margin:"6px 0 0" }}>{payloadError}</p>}
            </div>
          </div>

          {/* SLA terms read from the registry */}
          <div className="cb-terms" style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16 }}>
            {[
              { label:"Price (USDC)",    value: price != null ? formatUsdc(price) : "—" },
              { label:"Max response",    value: slaWindow ? `${slaWindow}s` : "—" },
              { label:"Slash",           value: slashBps != null ? `${slashBps / 100}%` : "—" },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text)",fontWeight:600,display:"block",marginBottom:6 }}>{f.label}</div>
                <div style={{ background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color: providerData ? "var(--text)" : "var(--text-dim)",fontSize:13,fontFamily:"var(--font-mono)" }}>{f.value}</div>
              </div>
            ))}
          </div>

          {/* Endpoint from the registry record */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text)",fontWeight:600,display:"block",marginBottom:6 }}>Endpoint (from the registry record)</div>
            <div style={{ background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",fontSize:12,fontFamily:"var(--font-mono)",color: endpointLink ? "var(--text)" : "var(--text-dim)",overflowWrap:"anywhere" as const }}>
              {endpoint.kind === "usable" && endpointLink
                ? <a href={endpointLink} target="_blank" rel="noreferrer noopener" style={{ color:"var(--accent-ink)" }}>{endpoint.value}</a>
                : endpointRowValue}
            </div>
          </div>

          {/* Provider record notice */}
          {providerData && <RiskBadge completed={completedN} slashed={slashedN} />}

          {/* Call ID */}
          <div style={{ marginBottom:16 }}>
            <label htmlFor="cb-callid" style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text)",fontWeight:600,display:"block",marginBottom:6 }}>Call ID (for receipt / timeout)</label>
            <input
              id="cb-callid"
              type="text" value={callIdInput} onChange={e => setCallIdInput(e.target.value)}
              aria-invalid={callIdError ? true : undefined}
              aria-describedby={callIdError ? "cb-callid-error" : undefined}
              style={{ width:"100%",background:"var(--bg-3)",border:`1px solid ${callIdError ? "var(--danger)" : "var(--border)"}`,borderRadius:10,padding:"9px 12px",color:"var(--text)",fontSize:13,fontFamily:"var(--font-mono)",boxSizing:"border-box" as const }}
              placeholder="Auto-filled after call"
            />
            {callIdError && <p id="cb-callid-error" role="alert" style={{ fontSize:12,color:"var(--danger)",margin:"6px 0 0" }}>{callIdError}</p>}
          </div>

          {/* Readiness: the same preconditions the contract enforces */}
          {(assessment.blockers.length > 0 || assessment.warnings.length > 0 || providerLoadError) && (
            <div style={{ marginBottom:16,fontSize:12 }}>
              {providerLoadError && (
                <p role="alert" style={{ color:"var(--danger)",margin:"0 0 6px" }}>
                  The provider record could not be read from Arc. Submission stays disabled; a reload may help.
                </p>
              )}
              {assessment.blockers.length > 0 && (
                <ul aria-label="Call blocked" style={{ margin:"0 0 6px",paddingLeft:18,color:"var(--danger)" }}>
                  {assessment.blockers.map(b => <li key={b}>{BLOCKER_TEXT[b]}</li>)}
                </ul>
              )}
              {assessment.warnings.length > 0 && (
                <ul aria-label="Call warnings" style={{ margin:0,paddingLeft:18,color:"var(--text-dim)" }}>
                  {assessment.warnings.map(w => <li key={w}>{WARNING_TEXT[w]}</li>)}
                </ul>
              )}
            </div>
          )}

          {!initialPending.ok && (
            <div role="alert" style={{ marginBottom:16,border:"1px solid rgba(238,69,57,0.35)",background:"rgba(238,69,57,0.06)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--text)" }}>
              <strong>Pending-transaction state is unavailable.</strong> Session storage could not be read, so a duplicate write cannot be ruled out.
              All write actions are blocked until site storage works for this tab; reload after enabling it.
            </div>
          )}

          {/* A hash is not a result. Keep the previous write visible until a receipt resolves it. */}
          {pendingHash && (
            <div role="alert" style={{ marginBottom:16,border:"1px solid rgba(245,158,11,0.35)",background:"rgba(245,158,11,0.08)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--text)" }}>
              <strong>Unresolved transaction.</strong> <code style={{ userSelect:"all", overflowWrap:"anywhere" }}>{pendingHash}</code> was submitted, but its receipt has not been proven.
              Do not resubmit it. Check the receipt first.
              <div style={{ display:"flex",gap:10,flexWrap:"wrap",marginTop:8 }}>
                <button
                  type="button"
                  onClick={() => void handleCheckPending()}
                  disabled={busy || checkingPending}
                  aria-busy={checkingPending}
                  style={{ padding:"7px 11px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontWeight:600,fontSize:12,cursor: busy||checkingPending ? "not-allowed":"pointer",opacity: busy||checkingPending ? 0.6:1 }}
                >
                  {checkingPending ? "Checking…" : "Check receipt"}
                </button>
                <a href={CONFIG.explorerTx(pendingHash)} target="_blank" rel="noreferrer noopener" style={{ alignSelf:"center",color:"var(--accent-ink)",fontSize:12 }}>
                  View on explorer
                </a>
              </div>
              {!pendingPersisted && (
                <p role="alert" style={{ margin:"8px 0 0",color:"var(--danger)" }}>
                  This hash is shown from memory: the pending marker could not be saved, so a reload will not remember it.
                  Copy the hash and check the explorer before any retry.
                </p>
              )}
              {!confirmDiscardPending ? (
                <button
                  type="button"
                  onClick={() => setConfirmDiscardPending(true)}
                  disabled={busy || checkingPending}
                  style={{ marginTop:10,padding:"7px 11px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text-dim)",fontWeight:600,fontSize:12,cursor: busy||checkingPending ? "not-allowed":"pointer",opacity: busy||checkingPending ? 0.6:1 }}
                >
                  Recover a stuck transaction…
                </button>
              ) : (
                <div style={{ marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)" }}>
                  <p style={{ margin:"0 0 8px" }}>
                    Discarding removes only this local marker. It does not make the transaction successful and does not prove it failed. If the explorer shows it confirmed or replaced, or the registry shows the call, do not resubmit blindly. If it is still pending, wait: resubmitting can pay twice.
                  </p>
                  <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                    <button
                      type="button"
                      onClick={discardPendingMarker}
                      style={{ padding:"7px 11px",borderRadius:8,border:"1px solid rgba(238,69,57,0.3)",background:"rgba(238,69,57,0.06)",color:"var(--danger)",fontWeight:600,fontSize:12,cursor:"pointer" }}
                    >
                      I reviewed the explorer; discard marker
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDiscardPending(false)}
                      style={{ padding:"7px 11px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontWeight:600,fontSize:12,cursor:"pointer" }}
                    >
                      Keep marker
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CTA */}
          <div className="cb-actions" style={{ display:"grid",gridTemplateColumns: isCCTP ? "1fr" : "1fr 1fr",gap:10,marginBottom:8 }}>
            <button
              onClick={isCCTP ? handleCCTPCall : handleCall}
              disabled={!canRun}
              style={{ padding:"12px 8px",borderRadius:999,border:"none",background:"var(--accent)",color:"var(--on-accent)",fontWeight:700,fontSize:13,cursor: canRun ? "pointer":"not-allowed",opacity: canRun ? 1:0.4 }}
            >
              {isCCTP ? "Cross-chain path unavailable" : "Create call"}<br/>
              <span style={{ fontSize:11,fontWeight:400,opacity:0.8 }}>{isCCTP ? "See the notice above" : "Escrow + network fee"}</span>
            </button>
            {!isCCTP && (
              <button
                onClick={handleX402Call}
                disabled={!canRun || guardBlocked}
                title={guardBlocked ? "x402 payments are blocked until the payment safety state is resolved" : undefined}
                style={{ padding:"12px 8px",borderRadius:999,border:"1px solid rgba(25,209,134,0.4)",background:"transparent",color:"var(--accent-ink)",fontWeight:600,fontSize:13,cursor: canRun && !guardBlocked ? "pointer":"not-allowed",opacity: canRun && !guardBlocked ? 1:0.4 }}
              >
                Sign EIP-3009<br/>
                <span style={{ fontSize:11,fontWeight:400 }}>Facilitator pays gas</span>
              </button>
            )}
          </div>

          {/* A storage failure is not "no unresolved payment". */}
          {guardView.status === "error" && (
            <div role="alert" style={{ marginBottom:16,border:"1px solid rgba(238,69,57,0.35)",background:"rgba(238,69,57,0.06)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--text)" }}>
              <strong>Payment safety check failed.</strong> {guardView.message}
              <div style={{ marginTop:8 }}>
                <button
                  type="button"
                  onClick={refreshGuard}
                  style={{ padding:"7px 11px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontWeight:600,fontSize:12,cursor:"pointer" }}
                >
                  Re-check storage
                </button>
              </div>
            </div>
          )}

          {/* An x402 attempt stays visible until its outcome is known or the
              user explicitly acknowledges the uncertainty. */}
          {activeGuard && (
            <div role="alert" style={{ marginBottom:16,border:"1px solid rgba(245,158,11,0.35)",background:"rgba(245,158,11,0.08)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--text)" }}>
              <strong>
                {activeGuard.stage === "submitted"
                  ? "x402 settlement submitted — transaction hash received"
                  : activeGuard.stage === "prepared"
                    ? "x402 payment attempt in progress"
                    : "Unsettled x402 payment attempt"}{" "}
                (provider #{activeGuard.providerId}).
              </strong>{" "}
              {activeGuard.stage === "submitted"
                ? "A transaction hash was received, but the transaction is not confirmed. A hash is not proof of payment or success."
                : activeGuard.stage === "prepared"
                  ? "The safety marker is saved, but the facilitator has not returned a result yet. Do not retry while this attempt is unresolved."
                  : "The facilitator did not return a confirmed settlement for this provider and request, so payment may already have occurred."}{" "}
              No fallback was sent automatically, and a payment cannot be reversed here. Check transaction history and
              the registry before retrying.
              {activeGuard.txHash && (
                <div style={{ marginTop:8,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center" }}>
                  <code style={{ userSelect:"all",overflowWrap:"anywhere" }}>{activeGuard.txHash}</code>
                  <a href={CONFIG.explorerTx(activeGuard.txHash as `0x${string}`)} target="_blank" rel="noreferrer noopener" style={{ color:"var(--accent-ink)",fontSize:12 }}>
                    View on explorer
                  </a>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard?.writeText(activeGuard.txHash ?? "").catch(() => {}); }}
                    style={{ padding:"5px 9px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontWeight:600,fontSize:11,cursor:"pointer" }}
                  >
                    Copy hash
                  </button>
                </div>
              )}
              {!pendingPersisted && activeGuard.txHash && (
                <p role="alert" style={{ margin:"8px 0 0",color:"var(--danger)" }}>
                  The transaction hash is shown from memory because the pending marker could not be saved. The durable
                  x402 safety marker still blocks another attempt, but confirm the outcome on the explorer first.
                </p>
              )}
              <div style={{ marginTop:8 }}>
                <button
                  type="button"
                  onClick={() => setPanel("history")}
                  style={{ padding:"7px 11px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontWeight:600,fontSize:12,cursor:"pointer" }}
                >
                  Check transaction history
                </button>
              </div>
              {!ackConfirm ? (
                <div style={{ marginTop:8 }}>
                  <button
                    type="button"
                    onClick={() => setAckConfirm(true)}
                    disabled={busy}
                    style={{ padding:"7px 11px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontWeight:600,fontSize:12,cursor: busy ? "not-allowed":"pointer",opacity: busy ? 0.6:1 }}
                  >
                    Review and discard warning…
                  </button>
                </div>
              ) : (
                <div style={{ marginTop:10,paddingTop:10,borderTop:"1px solid var(--border)" }}>
                  <p style={{ margin:"0 0 8px" }}>
                    Discarding removes only this local warning. It is not proof that no payment occurred. Continue only if
                    the explorer and the registry show no call for this attempt.
                  </p>
                  <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                    <button
                      type="button"
                      onClick={discardFacGuard}
                      style={{ padding:"7px 11px",borderRadius:8,border:"1px solid rgba(238,69,57,0.3)",background:"rgba(238,69,57,0.06)",color:"var(--danger)",fontWeight:600,fontSize:12,cursor:"pointer" }}
                    >
                      I checked; discard warning
                    </button>
                    <button
                      type="button"
                      onClick={() => setAckConfirm(false)}
                      style={{ padding:"7px 11px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontWeight:600,fontSize:12,cursor:"pointer" }}
                    >
                      Keep warning
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {storageWarning && (
            <p role="alert" style={{ margin:"0 0 16px",fontSize:12,color:"var(--danger)" }}>{storageWarning}</p>
          )}

          {isCCTP && (
            <p role="note" style={{ fontSize:12,color:"var(--warn)",margin:"0 0 16px" }}>
              This build disables the cross-chain call. The transfer it prepares carries no hookData, so CrossChainReceiver never calls callServiceFor and no PayPerCall call would exist. Use Arc Testnet direct.
            </p>
          )}

          {/* ── Advanced ── */}
          {tab === "advanced" && (
            <>
              {/* Chain select */}
              <div style={{ marginBottom:16 }}>
                <label htmlFor="cb-chain" style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text)",fontWeight:600,display:"block",marginBottom:6 }}>Pay from chain</label>
                <select
                  id="cb-chain"
                  value={chain}
                  onChange={e => setChain(e.target.value as Chain)}
                  disabled={busy}
                  style={{ width:"100%",background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13 }}
                >
                  {CHAINS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <p style={{ fontSize:12,color:"var(--text-dim)",marginTop:6 }}>{chainInfo.hint}</p>
                <div style={{ marginTop:6 }}>
                  <span style={{ padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,background: isCCTP ? "rgba(31,119,239,0.1)" : "rgba(25,209,134,0.1)",color: isCCTP ? "var(--info)" : "var(--accent)" }}>
                    {isCCTP ? "CCTP bridge — no call created" : "1 TX — escrow + network fee"}
                  </span>
                </div>
              </div>

              {/* Provider actions */}
              <div style={{ borderTop:"1px solid var(--border)",paddingTop:16 }}>
            <div style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text)",fontWeight:600,marginBottom:10 }}>Provider actions</div>
            <div style={{ marginBottom:10 }}>
              <label htmlFor="cb-response" style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text)",fontWeight:600,display:"block",marginBottom:6 }}>Response payload</label>
              <input
                id="cb-response"
                type="text" value={responsePayload} onChange={e => setResponsePayload(e.target.value)}
                style={{ width:"100%",background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:10,padding:"9px 12px",color:"var(--text)",fontSize:13,boxSizing:"border-box" as const }}
                placeholder="pong"
              />
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <button
                onClick={handleSubmitReceipt}
                disabled={busy || !!pendingHash || !isConnected || !!callIdError}
                style={{ padding:"10px 8px",borderRadius:999,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontWeight:600,fontSize:12,cursor: busy||pendingHash||!isConnected ? "not-allowed":"pointer",opacity: busy||pendingHash||!isConnected ? 0.5:1 }}
              >
                Submit receipt (EIP-712)
              </button>
              <button
                onClick={handleClaimTimeout}
                disabled={busy || !!pendingHash || !isConnected || !!callIdError}
                style={{ padding:"10px 8px",borderRadius:999,border:"1px solid rgba(238,69,57,0.3)",background:"rgba(238,69,57,0.06)",color:"var(--danger)",fontWeight:600,fontSize:12,cursor: busy||pendingHash||!isConnected ? "not-allowed":"pointer",opacity: busy||pendingHash||!isConnected ? 0.5:1 }}
              >
                Claim timeout
              </button>
            </div>
              </div>
            </>
          )}

          {/* Status: announced, never encoded in colour alone */}
          <div
            role="status"
            aria-live={statusCopy.tone === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            style={{
              marginTop:14,borderRadius:8,padding:"10px 14px",fontSize:12,fontFamily:"var(--font-mono)",
              background: statusCopy.tone === "ok" ? "rgba(25,209,134,0.08)" : statusCopy.tone === "error" ? "rgba(238,69,57,0.08)" : "var(--bg-3)",
              color: statusCopy.tone === "ok" ? "var(--accent-ink)" : statusCopy.tone === "error" ? "var(--danger)" : "var(--text-dim)",
              border:`1px solid ${statusCopy.tone === "ok" ? "rgba(25,209,134,0.2)" : statusCopy.tone === "error" ? "rgba(238,69,57,0.2)" : "var(--border)"}`,
            }}
          >
            <span>{statusCopy.text}</span>
            {phase.kind === "submitted" || phase.kind === "confirmed" || phase.kind === "reverted" ? (
              <a href={CONFIG.explorerTx(phase.hash)} target="_blank" rel="noreferrer noopener" style={{ display:"inline-block",marginLeft:8,color:"var(--accent-ink)",textDecoration:"underline" }}>
                View transaction
              </a>
            ) : null}
            {note && <div style={{ marginTop:6,color:"var(--text-dim)" }}>{note}</div>}
            {settlement && (
              <div style={{ marginTop:6 }}>
                Refunded {formatUsdc(settlement.refunded)} USDC · slashed {formatUsdc(settlement.slashed)} USDC (CallSlashed event).
              </div>
            )}
          </div>
        </SectionCard>

        {/* Right panel */}
        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {/* Cost and execution summary */}
          <div style={{ background:"linear-gradient(135deg,rgba(25,209,134,0.07) 0%,rgba(31,119,239,0.05) 100%)",border:"1px solid rgba(25,209,134,0.25)",borderRadius:14,padding:18,backdropFilter:"blur(12px)",boxShadow:"0 4px 24px rgba(0,0,0,0.12)" }}>
            <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:14 }}>
              <span style={{ width:6,height:6,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s infinite",display:"block" }} />
              <span style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.08em",color: "var(--accent-ink)",fontWeight:700 }}>Cost &amp; execution</span>
            </div>
            {providerNotFound && (
              <div style={{ display:"flex",gap:8,alignItems:"flex-start",background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:8,padding:"9px 11px",fontSize:11.5,color:"var(--warn)",marginBottom:12 }}>
                <span>Provider #{providerIdNum} was not found on the Arc Testnet registry. Pick an existing provider id.</span>
              </div>
            )}
            {[
              { label:"Provider",    value: providerIdNum ? (providerNotFound ? `#${providerIdNum} · not found` : `#${providerIdNum}`) : "—",      highlight: !!providerIdNum && !providerNotFound },
              { label:"Provider payment (escrow)", value: cost.escrow != null ? `${formatUsdc(cost.escrow)} USDC` : "unavailable", highlight: cost.escrow != null },
              { label:"Network fee (estimate)",    value: cost.gasMicro != null ? `~${formatUsdc(cost.gasMicro)} USDC` : "unavailable", highlight: false },
              { label:"Total (estimated)",         value: cost.totalMicro != null ? `~${formatUsdc(cost.totalMicro)} USDC` : "price + fee (fee unavailable)", highlight: false },
              { label:"Your USDC balance",         value: usdcBal ? `${formatUsdc(usdcBal.value)} USDC` : "unavailable", highlight: false },
              { label:"Native gas balance",        value: nativeBal ? `${formatUsdc(nativeBal.value / 10n ** 12n)} USDC` : "unavailable", highlight: false },
              { label:"USDC approval",             value: allowanceRaw == null ? "unknown" : cost.escrow != null && BigInt(allowanceRaw) >= cost.escrow ? "approved" : "will be requested", highlight: false },
              { label:"SLA window",                value: slaWindow ? `${slaWindow}s` : "—",              highlight: false },
              { label:"Slash",                     value: slashBps != null ? `${slashBps/100}% of stake` : "—", highlight: false },
              { label:"Network",                   value: isCCTP ? `${chainInfo.label}` : "Arc Testnet",  highlight: false },
              { label:"Payment",                   value: isCCTP ? "CCTP bridge" : "Escrow transfer",   highlight: true },
            ].map(row => (
              <div key={row.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"7px 0",borderBottom:"1px solid var(--border)" }}>
                <span style={{ fontSize:12,color:"var(--text)" }}>{row.label}</span>
                <span style={{ fontSize:12,fontFamily:"var(--font-mono)",color: row.highlight ? "var(--accent-ink)" : "var(--text)",fontWeight: row.highlight ? 600 : 400,textAlign:"right" as const }}>{row.value}</span>
              </div>
            ))}
            <p style={{ fontSize:11,color:"var(--text)",margin:"10px 0 0" }}>
              The provider payment is the exact `pricePerCall` the contract escrows; there is no protocol fee in this build. The network fee is a live estimate and is charged by the chain, not by CallGuard. Retrying a transaction can charge again.
            </p>
            <button
              onClick={isCCTP ? handleCCTPCall : handleCall}
              disabled={!canRun}
              style={{ width:"100%",marginTop:14,background:"linear-gradient(135deg,var(--accent),var(--accent-dim))",color:"#fff",border:"none",borderRadius:999,padding:"13px",fontSize:14,fontWeight:800,cursor: canRun ? "pointer":"not-allowed",opacity: canRun ? 1:0.5,boxShadow:"0 4px 20px rgba(25,209,134,0.4)",letterSpacing:"0.01em",transition:"transform 0.15s,box-shadow 0.15s" }}
              onMouseEnter={e=>{if(canRun){(e.target as HTMLElement).style.transform="translateY(-2px)";(e.target as HTMLElement).style.boxShadow="0 6px 28px rgba(25,209,134,0.5)";}}}
              onMouseLeave={e=>{(e.target as HTMLElement).style.transform="";(e.target as HTMLElement).style.boxShadow="0 4px 20px rgba(25,209,134,0.4)";}}
            >
              {busy ? "Working…" : isCCTP ? "Cross-chain path unavailable" : "Create call →"}
            </button>
            {!canRun && blockers.length > 0 && (
              <p style={{ fontSize:11,color:"var(--text-dim)",margin:"8px 0 0" }}>
                Disabled: {blockers.includes("facilitator-guard") ? "an unresolved x402 payment attempt blocks every new payment for this provider and request; check transaction history and the registry, then acknowledge the warning if appropriate." : blockers.includes("pending-transaction") ? "an earlier transaction is unresolved; check its receipt first." : blockers.includes("payload-invalid") ? "the request payload is required." : blockers.includes("wrong-network") ? "switch the wallet to Arc Testnet." : blockers.includes("cctp-no-call") ? "the cross-chain path cannot create a call." : "a precondition above is not met."}
              </p>
            )}
            {lastCallId && (
              <div style={{ marginTop:12,paddingTop:12,borderTop:"1px solid var(--border)" }}>
                <div style={{ fontSize:10,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text)",fontWeight:600,marginBottom:4 }}>Last Call ID</div>
                <div style={{ fontSize:11,fontFamily:"var(--font-mono)",color:"var(--text-dim)",wordBreak:"break-all" as const }}>{lastCallId}</div>
                <div style={{ fontSize:11,color:"var(--text)",marginTop:4 }}>A created call is not a completed call. Provider execution, receipt and settlement are reported by their own evidence.</div>
              </div>
            )}
          </div>

          {/* Batch */}
          <div style={{ background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:12,padding:18 }}>
            <div style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"var(--text)",fontWeight:600,marginBottom:12 }}>Quick Batch</div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
              <span style={{ fontSize:12,color:"var(--text-dim)" }}>Calls</span>
              <span style={{ fontSize:14,fontWeight:700,color: "var(--accent-ink)",fontFamily:"var(--font-mono)" }}>{batchCount}</span>
            </div>
            <input type="range" min="1" max="20" value={batchCount} aria-label="Calls" onChange={e => setBatchCount(Number(e.target.value))}
              disabled={batchRunning}
              style={{ width:"100%",accentColor:"var(--accent)",marginBottom:8 }} />
            <div style={{ background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:6,padding:"8px 10px",fontSize:12,marginBottom:10 }}>
              Batch total: <strong style={{ color: batchTotal != null ? "var(--accent-ink)" : "var(--text-dim)" }}>{batchTotal != null ? `${formatUsdc(batchTotal)} USDC` : "unavailable (provider price unknown)"}</strong>
              <div style={{ fontSize:11,color:"var(--text)",marginTop:4 }}>{batchCount} separate escrow charges; network fees are extra.</div>
            </div>
            <button
              onClick={handleBatch}
              disabled={!canRun || batchRunning || batchTotal == null}
              style={{ width:"100%",background:"var(--accent)",color:"#000",border:"none",borderRadius:999,padding:"10px",fontSize:13,fontWeight:700,cursor: canRun&&!batchRunning ? "pointer":"not-allowed",opacity: canRun&&!batchRunning ? 1:0.5 }}
            >
              {batchRunning ? `Running (${batchResults.length}/${batchCount})…` : `Run ${batchCount} calls →`}
            </button>
            {batchResults.length > 0 && (
              <div style={{ marginTop:10,maxHeight:120,overflowY:"auto" as const }}>
                {batchResults.map(r => (
                  <div key={r.i} style={{ display:"flex",gap:8,fontSize:11,padding:"3px 0",borderBottom:"1px solid var(--border)" }}>
                    <span style={{ color:"var(--text)",width:18 }}>#{r.i}</span>
                    {r.hash
                      ? <a href={CONFIG.explorerTx(r.hash)} target="_blank" rel="noreferrer noopener" style={{ color: "var(--accent-ink)",fontFamily:"var(--font-mono)" }}>{r.hash.slice(0,14)}…</a>
                      : <span style={{ color:"var(--danger)" }}>{r.error}</span>
                    }
                    <span style={{ marginLeft:"auto",color: r.state === "confirmed" ? "var(--accent-ink)" : r.state === "reverted" || r.state === "rejected" ? "var(--danger)" : "var(--text-dim)" }}>
                      {r.state === "pending" ? "submitted, unconfirmed" : r.state}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick nav */}
          <div style={{ background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:12,padding:14 }}>
            <div style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text)",fontWeight:600,marginBottom:10 }}>Quick navigation</div>
            {[
              { label:"Browse providers",  panel:"marketplace" as const, icon:"🏪" },
              { label:"View my receipts",  panel:"receipts" as const,    icon:"🧾" },
              { label:"Claim a timeout",   panel:"disputes" as const,    icon:"⏱" },
              { label:"Verify a receipt",  panel:"verify" as const,      icon:"✅" },
            ].map(item => (
              <button key={item.panel} onClick={() => setPanel(item.panel)}
                style={{ display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left" as const,fontSize:12,color:"var(--text-dim)",background:"none",border:"none",cursor:"pointer",padding:"6px 8px",borderRadius:6,transition:"background 0.15s,color 0.15s" }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="var(--bg-3)";(e.currentTarget as HTMLElement).style.color="var(--text)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="none";(e.currentTarget as HTMLElement).style.color="var(--text-dim)";}}>
                <span style={{fontSize:14}}>{item.icon}</span>
                <span style={{flex:1}}>{item.label}</span>
                <span style={{opacity:0.4}}>→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
