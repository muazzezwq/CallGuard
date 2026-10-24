// v8 dispute panel.
//
// DisputeV2 is call-bound: `openDispute` only accepts a call that PayPerCallV8
// already marked Completed, reads `completedAt` from the call instead of a
// caller-supplied timestamp, and holds the first upward slash in the contract
// until the appeal window closes. The panel therefore shows the real windows
// (dispute, resolution, appeal) and gates every action on the same conditions
// the contract checks, so a click cannot waste gas on a guaranteed revert.
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  CONFIG,
  DISPUTE_V2_ABI,
  DISPUTE_V3_ENABLED,
  PPC_ABI_V8,
  REGISTRY_ABI_V8,
  USDC_ABI,
  V8_CONFIG,
  V8_ENABLED,
  arcTestnet,
} from "../../lib/config";
import { formatUsdc, friendlyError, shortAddr } from "../../lib/utils";
import { useSubgraph } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import { Badge, Button, Field, Input, Stat, Tabs, Textarea } from "../../ui";
import {
  KeyValue,
  Ledger,
  LedgerRow,
  PanelShell,
  PanelSource,
  PanelSplit,
  SignalRow,
  StatusNotice,
} from "../panel/PanelUi";

const DISPUTE_ADDRESS = (V8_CONFIG.dispute || "") as `0x${string}`;
const LIVE = V8_ENABLED && DISPUTE_ADDRESS.length === 42;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// IDisputeV2.Status. The enum order matters: a wrong name would relabel a
// rejected dispute as a resolved one.
const PENDING = 1;
const UPHELD = 2;
const REJECTED = 3;
const APPEALED = 4;
const APPEAL_UPHELD = 5;
const APPEAL_REJECTED = 6;
const STATUS_LABELS = [
  "None",
  "Pending",
  "Upheld",
  "Rejected",
  "Appealed",
  "Appeal upheld",
  "Appeal rejected",
] as const;

// The contract has no per-wallet dispute index, so the list is the newest slice
// of `disputeCount`.
const RECENT_LIMIT = 12;

type DisputeRecord = {
  callId: `0x${string}`;
  caller: `0x${string}`;
  providerId: bigint;
  openedAt: bigint;
  resolvedAt: bigint;
  appealAt: bigint;
  bond: bigint;
  appealBond: bigint;
  status: number;
  evidenceUri: string;
  appealUri: string;
};

type Params = {
  bond: bigint;
  appealBond: bigint;
  disputeWindow: number;
  appealWindow: number;
  resolutionWindow: number;
  slashBps: number;
  arbiter: string;
  appealArbiter: string;
};

// viem hands back the struct as a positional tuple for these ABIs instead of a
// named record, so a field is read by name and falls back to its index. Reading
// only `record.providerId` yields `undefined` and the panel used to die on
// `.toString()` the moment a call id was entered.
function field(source: unknown, name: string, index: number): unknown {
  if (source == null) return undefined;
  const record = source as Record<string, unknown> & readonly unknown[];
  return record[name] ?? record[index];
}

function asBigInt(value: unknown, fallback = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return fallback;
}

/// PayPerCallV8.Call order: providerId, caller, amount, startedAt, deadline,
/// completedAt, termsVersion, termsHash, requestHash, responseHash, status.
function normalizeCall(raw: unknown) {
  if (raw == null) return undefined;
  const caller = field(raw, "caller", 1);
  if (typeof caller !== "string") return undefined;
  return {
    providerId: asBigInt(field(raw, "providerId", 0)),
    caller: caller as `0x${string}`,
    amount: asBigInt(field(raw, "amount", 2)),
    startedAt: Number(asBigInt(field(raw, "startedAt", 3))),
    deadline: Number(asBigInt(field(raw, "deadline", 4))),
    completedAt: Number(asBigInt(field(raw, "completedAt", 5))),
    termsVersion: Number(asBigInt(field(raw, "termsVersion", 6))),
    status: Number(asBigInt(field(raw, "status", 10))),
  };
}

/// IDisputeV2.DisputeRecord order: callId, caller, providerId, openedAt,
/// resolvedAt, appealAt, bond, appealBond, status, evidenceUri, appealUri.
function normalizeDispute(raw: unknown): DisputeRecord | undefined {
  if (raw == null) return undefined;
  const caller = field(raw, "caller", 1);
  if (typeof caller !== "string") return undefined;
  return {
    callId: (field(raw, "callId", 0) ?? "0x") as `0x${string}`,
    caller: caller as `0x${string}`,
    providerId: asBigInt(field(raw, "providerId", 2)),
    openedAt: asBigInt(field(raw, "openedAt", 3)),
    resolvedAt: asBigInt(field(raw, "resolvedAt", 4)),
    appealAt: asBigInt(field(raw, "appealAt", 5)),
    bond: asBigInt(field(raw, "bond", 6)),
    appealBond: asBigInt(field(raw, "appealBond", 7)),
    status: Number(asBigInt(field(raw, "status", 8))),
    evidenceUri: typeof field(raw, "evidenceUri", 9) === "string" ? String(field(raw, "evidenceUri", 9)) : "",
    appealUri: typeof field(raw, "appealUri", 10) === "string" ? String(field(raw, "appealUri", 10)) : "",
  };
}

function same(a?: string, b?: string) {
  return Boolean(a && b) && a!.toLowerCase() === b!.toLowerCase();
}

function isCallId(raw: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(raw.trim());
}

function stamp(seconds: bigint | number) {
  const n = Number(seconds);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

function remaining(deadline: number, now: number) {
  const diff = deadline - now;
  if (diff <= 0) return "closed";
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

function statusTone(status: number) {
  if (status === PENDING) return "pending" as const;
  if (status === APPEALED) return "info" as const;
  if (status === UPHELD || status === APPEAL_UPHELD) return "guard" as const;
  if (status === REJECTED || status === APPEAL_REJECTED) return "slash" as const;
  return "neutral" as const;
}

type SubgraphCall = {
  id: string;
  providerId: string;
  amount: string;
  status: string;
  completedAt: string;
  createdAt: string;
};

// Nobody knows their own call id by heart, so the panel lists the calls this
// wallet can actually dispute and fills the whole form from one click. The
// window is evaluated against the same `disputeWindow` the contract enforces,
// and `disputeIdByCallId` hides calls that already have a dispute.
function DisputeableRow({
  call, params, now, onPick,
}: {
  call: SubgraphCall;
  params: Params;
  now: number;
  onPick: (call: SubgraphCall) => void;
}) {
  const { data: disputeId } = useReadContract({
    address: DISPUTE_ADDRESS,
    abi: DISPUTE_V2_ABI,
    functionName: "disputeIdByCallId",
    args: [call.id as `0x${string}`],
    query: { enabled: LIVE },
  });
  const completedAt = Number(call.completedAt || 0);
  const deadline = completedAt + params.disputeWindow;
  const disputed = typeof disputeId === "bigint" && disputeId > 0n;

  return (
    <LedgerRow
      tone={disputed ? "muted" : "neutral"}
      lead={shortAddr(call.id, 10)}
      meta={(
        <>
          provider {call.providerId} · {formatUsdc(asBigInt(call.amount))} USDC · completed {stamp(completedAt)}
        </>
      )}
      trailing={(
        <span style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Badge tone={disputed ? "slash" : "guard"} dot>
            {disputed ? "already disputed" : remaining(deadline, now)}
          </Badge>
          <Button size="sm" variant="secondary" disabled={disputed} onClick={() => onPick(call)}>
            Use this call
          </Button>
        </span>
      )}
    />
  );
}

function DisputeEntry({
  id,
  params,
  now,
  address,
  providerId,
  appealEvidence,
  busy,
  onAction,
}: {
  id: number;
  params: Params;
  now: number;
  address?: `0x${string}`;
  providerId?: bigint;
  appealEvidence: string;
  busy: string | null;
  onAction: (label: string, send: () => Promise<`0x${string}`>) => void;
}) {
  const { writeContractAsync } = useWriteContract();
  const { data: record } = useReadContract({
    address: DISPUTE_ADDRESS,
    abi: DISPUTE_V2_ABI,
    functionName: "getDispute",
    args: [BigInt(id)],
    query: { enabled: LIVE, refetchInterval: 20_000 },
  });
  const { data: settled } = useReadContract({
    address: DISPUTE_ADDRESS,
    abi: DISPUTE_V2_ABI,
    functionName: "settled",
    args: [BigInt(id)],
    query: { enabled: LIVE, refetchInterval: 20_000 },
  });
  const { data: heldSlash } = useReadContract({
    address: DISPUTE_ADDRESS,
    abi: DISPUTE_V2_ABI,
    functionName: "heldSlash",
    args: [BigInt(id)],
    query: { enabled: LIVE, refetchInterval: 20_000 },
  });

  const d = normalizeDispute(record);
  if (!d || d.openedAt === 0n) return null;

  const isSettled = Boolean(settled);
  const held = (heldSlash as bigint | undefined) ?? 0n;
  const isCaller = same(address, d.caller);
  const isProviderOwner = providerId !== undefined && providerId === d.providerId;
  const isArbiter = same(address, params.arbiter);
  const isAppealArbiter = same(address, params.appealArbiter);

  const resolutionDeadline = Number(d.openedAt) + params.resolutionWindow;
  const appealDeadline = Number(d.resolvedAt) + params.appealWindow;

  const canReclaim = isCaller && d.status === PENDING && !isSettled && now > resolutionDeadline;
  const canResolve = isArbiter && d.status === PENDING && !isSettled && now <= resolutionDeadline;
  const canAppeal = !isSettled && (isCaller || isProviderOwner)
    && (d.status === UPHELD || d.status === REJECTED)
    && now <= appealDeadline;
  const canFinalize = !isSettled && (d.status === UPHELD || d.status === REJECTED)
    && now > appealDeadline;
  const canResolveAppeal = isAppealArbiter && d.status === APPEALED && !isSettled;

  const appealReady = appealEvidence.trim().length > 0;
  const disabled = busy !== null;

  const buttons = [] as React.ReactNode[];
  if (canReclaim) {
    buttons.push(
      <Button
        key="reclaim"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => onAction("Reclaim bond", () => writeContractAsync({
          address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "reclaimExpiredBond", args: [BigInt(id)],
        }))}
      >
        Reclaim bond
      </Button>,
    );
  }
  if (canResolve) {
    buttons.push(
      <Button
        key="uphold"
        size="sm"
        variant="primary"
        disabled={disabled}
        onClick={() => onAction("Resolve as upheld", () => writeContractAsync({
          address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "resolve", args: [BigInt(id), true],
        }))}
      >
        Uphold caller
      </Button>,
      <Button
        key="reject"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => onAction("Resolve as rejected", () => writeContractAsync({
          address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "resolve", args: [BigInt(id), false],
        }))}
      >
        Reject
      </Button>,
    );
  }
  if (canAppeal) {
    buttons.push(
      <Button
        key="appeal"
        size="sm"
        variant="secondary"
        disabled={disabled || !appealReady}
        title={appealReady ? "Appeal with the evidence URI from the form" : "Add an appeal evidence URI first"}
        onClick={() => onAction("Appeal", () => writeContractAsync({
          address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "appeal", args: [BigInt(id), appealEvidence.trim()],
        }))}
      >
        Appeal
      </Button>,
    );
  }
  if (canFinalize) {
    buttons.push(
      <Button
        key="finalize"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => onAction("Finalize", () => writeContractAsync({
          address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "finalize", args: [BigInt(id)],
        }))}
      >
        {d.status === UPHELD && held > 0n ? `Finalize (release ${formatUsdc(held)})` : "Finalize"}
      </Button>,
    );
  }
  if (canResolveAppeal) {
    buttons.push(
      <Button
        key="appeal-upheld"
        size="sm"
        variant="primary"
        disabled={disabled}
        onClick={() => onAction("Appeal upheld", () => writeContractAsync({
          address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "resolveAppeal", args: [BigInt(id), true],
        }))}
      >
        Appeal upheld
      </Button>,
      <Button
        key="appeal-rejected"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => onAction("Appeal rejected", () => writeContractAsync({
          address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "resolveAppeal", args: [BigInt(id), false],
        }))}
      >
        Appeal rejected
      </Button>,
    );
  }

  return (
    <LedgerRow
      tone={isSettled ? "muted" : d.status === PENDING ? "warn" : "neutral"}
      lead={`Dispute #${id}`}
      meta={(
        <>
          provider {d.providerId.toString()} · {shortAddr(d.caller)} ·{" "}
          {STATUS_LABELS[d.status] ?? `status ${d.status}`} · opened {stamp(d.openedAt)}
          {d.resolvedAt > 0n ? ` · resolved ${stamp(d.resolvedAt)}` : ""}
          {d.appealAt > 0n ? ` · appealed ${stamp(d.appealAt)}` : ""}
          {held > 0n ? ` · holding ${formatUsdc(held)} USDC` : ""}
          {isSettled ? " · settled" : ""}
        </>
      )}
      trailing={(
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
          <Badge tone={statusTone(d.status)} dot>{STATUS_LABELS[d.status] ?? d.status}</Badge>
          {buttons}
        </span>
      )}
    />
  );
}

export default function DisputesV8() {
  const { address } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [tab, setTab] = useState<"open" | "list">("open");
  const [callIdInput, setCallIdInput] = useState("");
  const [providerInput, setProviderInput] = useState("1");
  const [providerTouched, setProviderTouched] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [appealEvidence, setAppealEvidence] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);

  const pendingDispute = useAppStore((s) => s.pendingDispute);
  const clearPendingDispute = useAppStore((s) => s.clearPendingDispute);

  const now = Math.floor(Date.now() / 1000);
  const readQuery = { enabled: LIVE, refetchInterval: 20_000 } as const;

  const { data: bondRaw, refetch: refetchBond } = useReadContract({ address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "disputeBond", query: readQuery });
  const { data: appealBondRaw } = useReadContract({ address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "appealBond", query: readQuery });
  const { data: disputeWindowRaw } = useReadContract({ address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "disputeWindow", query: readQuery });
  const { data: appealWindowRaw } = useReadContract({ address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "appealWindow", query: readQuery });
  const { data: resolutionWindowRaw } = useReadContract({ address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "resolutionWindow", query: readQuery });
  const { data: slashBpsRaw } = useReadContract({ address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "disputeSlashBps", query: readQuery });
  const { data: arbiterRaw } = useReadContract({ address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "arbiter", query: readQuery });
  const { data: appealArbiterRaw } = useReadContract({ address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "appealArbiter", query: readQuery });
  const { data: disputeCount, refetch: refetchCount } = useReadContract({
    address: DISPUTE_ADDRESS, abi: DISPUTE_V2_ABI, functionName: "disputeCount", query: readQuery,
  });

  const { data: myProviderId, refetch: refetchProviderId } = useReadContract({
    address: V8_CONFIG.registryAddress,
    abi: REGISTRY_ABI_V8,
    functionName: "providerIdOf",
    args: address ? [address] : undefined,
    query: { enabled: LIVE && !!address, refetchInterval: 30_000 },
  });

  const callReady = isCallId(callIdInput);
  const myCallsQuery = address ? `{
    calls(first: 25, orderBy: createdAt, orderDirection: desc,
      where: { caller: "${address.toLowerCase()}", status: "COMPLETED" }) {
      id providerId amount status completedAt createdAt
    }
  }` : "";
  const { data: myCallsData, refetch: refetchMyCalls } = useSubgraph<{ calls: SubgraphCall[] }>(
    myCallsQuery, { enabled: LIVE && !!address, pollInterval: 60_000 },
  );
  const { data: call, refetch: refetchCall } = useReadContract({
    address: V8_CONFIG.ppcAddress,
    abi: PPC_ABI_V8,
    functionName: "getCall",
    args: callReady ? [callIdInput.trim() as `0x${string}`] : undefined,
    query: { enabled: LIVE && callReady },
  });

  const { data: existingDispute, refetch: refetchExisting, isError: noExistingDispute } = useReadContract({
    address: DISPUTE_ADDRESS,
    abi: DISPUTE_V2_ABI,
    functionName: "getDisputeByCallId",
    args: callReady ? [callIdInput.trim() as `0x${string}`] : undefined,
    query: { enabled: LIVE && callReady },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONFIG.usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, DISPUTE_ADDRESS] : undefined,
    query: { enabled: LIVE && !!address, refetchInterval: 30_000 },
  });

  const { data: balance } = useReadContract({
    address: CONFIG.usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: LIVE && !!address, refetchInterval: 30_000 },
  });

  // DisputeV3 escrows the slash at open. Show the amount before the click so the
  // provider's stake is not cut by a number the caller never saw.
  const previewProviderId = (() => {
    const text = providerInput.trim();
    if (!/^\d+$/.test(text) || text === "0" || text.length > 20) return undefined;
    return BigInt(text);
  })();
  const { data: slashPreviewRaw } = useReadContract({
    address: DISPUTE_ADDRESS,
    abi: DISPUTE_V2_ABI,
    functionName: "previewSlash",
    args: previewProviderId !== undefined ? [previewProviderId] : undefined,
    query: { enabled: LIVE && DISPUTE_V3_ENABLED, refetchInterval: 30_000 },
  });
  const slashPreview = typeof slashPreviewRaw === "bigint" ? slashPreviewRaw : null;

  const params: Params = {
    bond: (bondRaw as bigint | undefined) ?? 0n,
    appealBond: (appealBondRaw as bigint | undefined) ?? 0n,
    disputeWindow: Number(disputeWindowRaw ?? 0),
    appealWindow: Number(appealWindowRaw ?? 0),
    resolutionWindow: Number(resolutionWindowRaw ?? 0),
    slashBps: Number(slashBpsRaw ?? 0),
    arbiter: (arbiterRaw as string | undefined) ?? ZERO_ADDRESS,
    appealArbiter: (appealArbiterRaw as string | undefined) ?? ZERO_ADDRESS,
  };

  const ids = useMemo(() => {
    const count = Number(disputeCount ?? 0n);
    const out: number[] = [];
    for (let id = count; id >= 1 && out.length < RECENT_LIMIT; id -= 1) out.push(id);
    return out;
  }, [disputeCount]);

  // Newest Completed calls that are still inside the dispute window. Anything
  // older than `disputeWindow` is excluded here because the contract would
  // reject it, so the list only offers rows that can actually be submitted.
  const disputeable = useMemo(() => {
    const rows = (myCallsData?.calls ?? []).filter((row) => {
      const completedAt = Number(row.completedAt || 0);
      return completedAt > 0 && now <= completedAt + params.disputeWindow;
    });
    return rows.slice(0, 5);
  }, [myCallsData, now, params.disputeWindow]);

  const callRecord = normalizeCall(call);

  // Handoff from Verify Receipt and History: those panels already know the call
  // id, so landing here with an empty form was the step where users gave up.
  // Fill the form once, then drop the pending value so a later remount does not
  // overwrite edits the user has made since.
  useEffect(() => {
    if (!pendingDispute) return;
    setTab("open");
    setCallIdInput(pendingDispute.callId);
    if (pendingDispute.providerId) {
      setProviderInput(pendingDispute.providerId);
      setProviderTouched(true);
    }
    setEvidence((prev) => (prev.trim().length > 0 ? prev : (
      `data:application/json,{"callId":"${pendingDispute.callId}","claim":"response did not match the SLA"}`
    )));
    setStatus("Loaded the call from the previous panel. Check the facts, edit the evidence if you want, then open the dispute.");
    clearPendingDispute();
  }, [pendingDispute, clearPendingDispute]);

  // `openDispute` reverts with ProviderMismatch on a wrong provider id, so mirror
  // the provider the call actually belongs to until the user types their own.
  useEffect(() => {
    if (providerTouched || !callRecord) return;
    setProviderInput(String(callRecord.providerId));
  }, [callRecord, providerTouched]);

  const disputeDeadline = callRecord ? Number(callRecord.completedAt) + params.disputeWindow : 0;
  const callCompleted = callRecord?.status === 2 && Number(callRecord.completedAt) > 0;
  const alreadyDisputed = !noExistingDispute && existingDispute !== undefined;
  const canOpenNow = Boolean(
    callRecord && callCompleted && same(address, callRecord.caller)
      && now <= disputeDeadline && !alreadyDisputed,
  );

  async function run(label: string, send: () => Promise<`0x${string}`>) {
    if (!publicClient) {
      setStatus("❌ No RPC client available. Reconnect your wallet and retry.");
      return;
    }
    setBusy(label);
    setStatus(`Confirm ${label.toLowerCase()} in your wallet…`);
    try {
      if (walletChainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id });
      const hash = await send();
      setStatus(`Submitted ${label.toLowerCase()} (${hash.slice(0, 10)}…). Waiting for confirmation…`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        setStatus(`❌ ${label} reverted on-chain.`);
        return;
      }
      setStatus(`✅ ${label} confirmed.`);
      setEpoch((n) => n + 1);
      void Promise.all([refetchCount(), refetchCall(), refetchExisting(), refetchAllowance(), refetchBond(), refetchProviderId(), refetchMyCalls()]);
    } catch (e) {
      setStatus(`❌ ${friendlyError(e)}`);
    } finally {
      setBusy(null);
    }
  }

  /// One click fills the three fields a user cannot know by heart: the call id,
  /// the provider it belongs to, and a self-contained evidence pointer. The
  /// data URI keeps the claim with the call id without needing any hosting, and
  /// it stays short enough for the on-chain string.
  function pickCall(row: SubgraphCall) {
    setCallIdInput(row.id);
    setProviderInput(row.providerId || "1");
    if (evidence.trim().length === 0) {
      setEvidence(
        `data:application/json,{"callId":"${row.id}","claim":"response did not match the SLA"}`,
      );
    }
    setStatus("Loaded the call. Check the facts above, edit the evidence if you want, then open the dispute.");
  }

  function openDispute() {
    if (!callRecord || !callReady) return;
    const bondAmount = params.bond;
    void run("Open dispute", async () => {
      // Read the allowance at send time: a cached value would skip the approve
      // that openDispute needs, and the transaction would revert on transferFrom.
      const currentAllowance = await publicClient!.readContract({
        address: CONFIG.usdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: "allowance",
        args: [address as `0x${string}`, DISPUTE_ADDRESS],
      });
      if (bondAmount > 0n && currentAllowance < bondAmount) {
        const approveHash = await writeContractAsync({
          address: CONFIG.usdcAddress as `0x${string}`,
          abi: USDC_ABI,
          functionName: "approve",
          args: [DISPUTE_ADDRESS, bondAmount],
        });
        const approveReceipt = await publicClient!.waitForTransactionReceipt({ hash: approveHash });
        if (approveReceipt.status !== "success") throw new Error("the bond approval reverted");
      }
      return writeContractAsync({
        address: DISPUTE_ADDRESS,
        abi: DISPUTE_V2_ABI,
        functionName: "openDispute",
        args: [callIdInput.trim() as `0x${string}`, BigInt(providerInput.trim() || "0"), evidence.trim()],
      });
    });
  }

  if (!LIVE) {
    return (
      <PanelShell>
        <StatusNotice tone="warn" title="DisputeV2 is not configured">
          Set <code>VITE_DISPUTE_V2</code> to the deployed DisputeV2 address and rebuild. Without it
          the panel cannot read bonds, windows or records.
        </StatusNotice>
      </PanelShell>
    );
  }

  const evidenceMissing = evidence.trim().length === 0;
  const providerValid = /^\d+$/.test(providerInput.trim()) && providerInput.trim() !== "0";
  const bondLabel = `${formatUsdc(params.bond)} USDC`;
  const allowanceShort = params.bond > 0n && ((allowance as bigint | undefined) ?? 0n) < params.bond;
  const balanceShort = params.bond > 0n && ((balance as bigint | undefined) ?? 0n) < params.bond;

  const blockers = [
    !callReady && "Paste the 32-byte call id of a Completed call.",
    callReady && !callRecord && "No call exists for that id on PayPerCallV8.",
    callRecord && !callCompleted && "That call is not Completed yet, so it cannot be disputed.",
    callRecord && callCompleted && now > disputeDeadline && "The dispute window has closed for that call.",
    callRecord && address && !same(address, callRecord.caller) && "The connected wallet is not the call's caller.",
    alreadyDisputed && "That call already has a dispute.",
    !providerValid && "Set the provider id to a nonzero number.",
    evidenceMissing && "Add an Evidence URI (IPFS CID or HTTPS URL).",
  ].filter(Boolean) as string[];

  return (
    <PanelShell>
      <PanelSource
        label="DisputeV2"
        value={shortAddr(DISPUTE_ADDRESS)}
        hint="call-bound arbitration on ServiceRegistryV8 + PayPerCallV8"
        state="live"
      />

      <SignalRow label="Dispute parameters">
        <Stat label="Dispute bond" value={bondLabel} hint="returned when upheld" />
        <Stat label="Appeal bond" value={`${formatUsdc(params.appealBond)} USDC`} hint="forfeited when the appeal fails" />
        <Stat label="Dispute slash" value={`${(params.slashBps / 100).toFixed(2)}%`} hint="of provider stake" />
        <Stat label="Disputes" value={Number(disputeCount ?? 0n)} hint={`${RECENT_LIMIT} most recent listed`} />
      </SignalRow>

      {status && (
        <StatusNotice
          tone={status.startsWith("✅") ? "success" : status.startsWith("❌") ? "danger" : "info"}
          title={status.replace(/^[✅❌]\s*/u, "")}
        />
      )}

      <PanelSplit
        main={(
          <>
            <Tabs
              tabs={[{ id: "open", label: "Open dispute" }, { id: "list", label: "Recent disputes" }]}
              value={tab}
              onChange={setTab}
            />

            {tab === "open" && (
              <>
                <Ledger
                  label="Your disputeable calls"
                  empty="No Completed call from this wallet is inside the dispute window yet. Open a call in Call Builder, submit its receipt in Verify Receipt, then come back."
                >
                  {disputeable.map((row) => (
                    <DisputeableRow
                      key={row.id}
                      call={row}
                      params={params}
                      now={now}
                      onPick={pickCall}
                    />
                  ))}
                </Ledger>

                <Field
                  label="Call id"
                  hint="32-byte call id returned by PayPerCallV8.callService. Pick a call above, or paste an id you already have."
                  htmlFor="dispute-call-id"
                >
                  <Input
                    id="dispute-call-id"
                    mono
                    value={callIdInput}
                    onChange={(e) => setCallIdInput(e.target.value)}
                    placeholder="0x…"
                  />
                </Field>

                {callReady && (
                  <StatusNotice
                    tone={
                      !callRecord
                        ? "warn"
                        : callRecord.status !== 2
                          ? "warn"
                          : now > disputeDeadline
                            ? "danger"
                            : alreadyDisputed
                              ? "warn"
                              : "success"
                    }
                    title={
                      !callRecord
                        ? "No call found for this id"
                        : callRecord.status !== 2
                          ? "Call is not completed yet"
                          : now > disputeDeadline
                            ? "Dispute window closed"
                            : alreadyDisputed
                              ? "This call already has a dispute"
                              : "Call can be disputed"
                    }
                  >
                    {callRecord && (
                      <KeyValue
                        rows={[
                          { label: "Provider", value: callRecord.providerId.toString(), mono: true },
                          { label: "Caller", value: shortAddr(callRecord.caller), mono: true },
                          { label: "Amount", value: `${formatUsdc(callRecord.amount)} USDC`, mono: true },
                          { label: "Completed", value: stamp(callRecord.completedAt), mono: true },
                          {
                            label: "Dispute window",
                            value: `${remaining(disputeDeadline, now)} (${Math.round(params.disputeWindow / 86400)}d)`,
                            mono: true,
                          },
                          { label: "Existing dispute", value: alreadyDisputed ? "yes" : "none", mono: true },
                        ]}
                      />
                    )}
                  </StatusNotice>
                )}

                <Field label="Provider id" hint="Must match the call's provider." htmlFor="dispute-provider">
                  <Input
                    id="dispute-provider"
                    mono
                    value={providerInput}
                    onChange={(e) => { setProviderTouched(true); setProviderInput(e.target.value); }}
                    inputMode="numeric"
                  />
                </Field>

                <Field
                  label="Evidence URI"
                  hint="Immutable pointer: IPFS CID or HTTPS URL. It is stored on-chain, so keep it short."
                  htmlFor="dispute-evidence"
                  required
                >
                  <Textarea
                    id="dispute-evidence"
                    mono
                    rows={3}
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    placeholder="ipfs://…"
                  />
                </Field>

                {address && callRecord && !same(address, callRecord.caller) && (
                  <StatusNotice tone="warn" title="Only the call's caller can open this dispute" />
                )}
                {allowanceShort && !balanceShort && (
                  <StatusNotice tone="info" title={`Approval needed for the ${bondLabel} bond`}>
                    The first send approves the bond, the second opens the dispute.
                  </StatusNotice>
                )}
                {balanceShort && (
                  <StatusNotice tone="danger" title={`Wallet balance is below the ${bondLabel} bond`} />
                )}
                {providerValid && slashPreview !== null && slashPreview > 0n && (
                  <StatusNotice tone="info" title={`Opening this dispute escrows ${formatUsdc(slashPreview)} USDC of the provider's stake`}>
                    The slash is taken from the stake when the dispute opens, so the provider cannot
                    withdraw it before the decision. A rejected claim returns it at finalize.
                  </StatusNotice>
                )}

                <Button
                  variant="primary"
                  onClick={openDispute}
                  loading={busy === "Open dispute"}
                  disabled={!canOpenNow || !providerValid || evidenceMissing || busy !== null}
                >
                  Open dispute {params.bond > 0n ? `(bond ${bondLabel})` : "(no bond)"}
                </Button>
                {!canOpenNow && callReady && (
                  <p className="pg-hint">
                    The button unlocks once the call is Completed, the connected wallet sent the call,
                    the dispute window is still open and no dispute exists for it.
                  </p>
                )}
                {/* A disabled button is silent, so name every unmet requirement
                    instead of leaving the click dead with no explanation. */}
                {blockers.length > 0 && busy === null && (
                  <StatusNotice tone="warn" title="Open dispute is not available yet">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {blockers.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  </StatusNotice>
                )}
              </>
            )}

            {tab === "list" && (
              <>
                <Field
                  label="Appeal evidence URI"
                  hint="Used by an Appeal button below. Appeal is only available inside the appeal window."
                  htmlFor="dispute-appeal-evidence"
                >
                  <Input
                    id="dispute-appeal-evidence"
                    mono
                    value={appealEvidence}
                    onChange={(e) => setAppealEvidence(e.target.value)}
                    placeholder="ipfs://…"
                  />
                </Field>
                <Ledger label="Recent disputes" empty="No disputes on this contract yet.">
                  {ids.map((id) => (
                    <DisputeEntry
                      key={`${id}-${epoch}`}
                      id={id}
                      params={params}
                      now={now}
                      address={address}
                      providerId={typeof myProviderId === "bigint" && myProviderId > 0n ? myProviderId : undefined}
                      appealEvidence={appealEvidence}
                      busy={busy}
                      onAction={(label, send) => { void run(label, send); }}
                    />
                  ))}
                </Ledger>
              </>
            )}
          </>
        )}
        rail={(
          <KeyValue
            label="Contract roles and windows"
            rows={[
              { label: "Arbiter", value: shortAddr(params.arbiter), mono: true },
              { label: "Appeal arbiter", value: shortAddr(params.appealArbiter), mono: true },
              { label: "Dispute window", value: `${Math.round(params.disputeWindow / 86400)}d`, mono: true },
              { label: "Resolution window", value: `${Math.round(params.resolutionWindow / 86400)}d`, mono: true },
              { label: "Appeal window", value: `${Math.round(params.appealWindow / 86400)}d`, mono: true },
              {
                label: "You are",
                value: same(address, params.arbiter)
                  ? "arbiter"
                  : same(address, params.appealArbiter)
                    ? "appeal arbiter"
                    : typeof myProviderId === "bigint" && myProviderId > 0n
                      ? "provider owner"
                      : "caller",
                mono: true,
              },
            ]}
          />
        )}
      />
    </PanelShell>
  );
}
