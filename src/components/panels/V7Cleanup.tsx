// v7 provider cleanup — legacy only.
//
// v8 is the active registry, so the register/unstake controls above only ever
// touch the v8 pair. A wallet that registered on v7 still has stake locked in
// the old registry, and v7 contracts are not verified on Blockscout, so there is
// no explorer write path. This card is the only way to drain that stake.
//
// Order is enforced by the contract: deactivate() first, then pendingCalls must
// be 0, then unstake() after UNSTAKE_COOLDOWN (1 hour on v7). The view surface
// does not expose deactivatedAt, so the cooldown clock here starts from the
// deactivate receipt in this session; a reload falls back to letting unstake
// revert with CooldownActive until the hour is up.
import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from "wagmi";import { CONFIG, arcTestnet } from "../../lib/config";
import { formatUsdc, friendlyError } from "../../lib/utils";
import { AlertTriangle } from "lucide-react";

const V7_REGISTRY = CONFIG.registryAddress;

const V7_ABI = [
  { name: "providerIdOf", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getProvider", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "owner", type: "address" }, { name: "signer", type: "address" },
      { name: "stake", type: "uint256" }, { name: "pricePerCall", type: "uint256" },
      { name: "maxResponseTime", type: "uint32" }, { name: "slashBps", type: "uint32" },
      { name: "active", type: "bool" }, { name: "maxConcurrentCalls", type: "uint32" },
      { name: "zkTier", type: "uint8" },
    ] }] },
  { name: "pendingCalls", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint32" }] },
  { name: "UNSTAKE_COOLDOWN", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint32" }] },
  { name: "deactivate", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "providerId", type: "uint256" }], outputs: [] },
  { name: "unstake", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "providerId", type: "uint256" }], outputs: [] },
] as const;

const box = {
  marginTop: 24,
  padding: 18,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-2)",
} as const;

const row = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "4px 0" } as const;
const label = { color: "var(--text-faint)" } as const;
const value = { color: "var(--text)", fontFamily: "var(--font-mono)" } as const;

function actionBtn(disabled: boolean) {
  return {
    width: "100%",
    marginTop: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "var(--accent)",
    color: "#04120c",
    fontWeight: 600,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

export default function V7CleanupCard() {
  const { address } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deactivatedAtMs, setDeactivatedAtMs] = useState<number | null>(null);
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const [pendingKind, setPendingKind] = useState<"deactivate" | "unstake" | null>(null);

  const { data: providerId } = useReadContract({
    address: V7_REGISTRY, abi: V7_ABI, functionName: "providerIdOf",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });

  const hasV7 = typeof providerId === "bigint" && providerId > 0n;

  const { data: provider, refetch: refetchProvider } = useReadContract({
    address: V7_REGISTRY, abi: V7_ABI, functionName: "getProvider",
    args: hasV7 ? [providerId as bigint] : undefined,
    query: { enabled: hasV7, refetchInterval: 15_000 },
  });

  const { data: pendingCalls, refetch: refetchPending } = useReadContract({
    address: V7_REGISTRY, abi: V7_ABI, functionName: "pendingCalls",
    args: hasV7 ? [providerId as bigint] : undefined,
    query: { enabled: hasV7, refetchInterval: 15_000 },
  });

  const { data: cooldown } = useReadContract({
    address: V7_REGISTRY, abi: V7_ABI, functionName: "UNSTAKE_COOLDOWN",
    query: { enabled: hasV7 },
  });

  const { data: receipt } = useWaitForTransactionReceipt({
    hash: pendingHash,
    query: { enabled: !!pendingHash },
  });

  // TanStack v5 dropped query.onSuccess, so the receipt is handled in an effect.
  useEffect(() => {
    if (!receipt || !pendingKind) return;
    if (receipt.status !== "success") {
      setStatus("❌ The transaction reverted on-chain.");
      setBusy(false);
      setPendingHash(undefined);
      return;
    }
    if (pendingKind === "deactivate") setDeactivatedAtMs(Date.now());
    setStatus(pendingKind === "deactivate"
      ? `✅ v7 provider deactivated. Unstake unlocks in ${Math.round(Number(cooldown ?? 3600) / 60)} min.`
      : "✅ v7 stake withdrawn.");
    void Promise.all([refetchProvider(), refetchPending()]);
    setBusy(false);
    setPendingHash(undefined);
  }, [receipt, pendingKind, cooldown, refetchProvider, refetchPending]);

  if (!address || !hasV7 || !provider) return null;

  const owner = provider.owner;
  const stake = provider.stake;
  const active = provider.active;

  const isOwner = owner.toLowerCase() === address.toLowerCase();
  const pending = Number(pendingCalls ?? 0);
  const cooldownSec = Number(cooldown ?? 3600);

  const waitMs = deactivatedAtMs === null ? null : deactivatedAtMs + cooldownSec * 1000;
  const remainingMs = waitMs === null ? 0 : Math.max(0, waitMs - Date.now());
  const cooldownDone = deactivatedAtMs !== null && remainingMs === 0;
  const canDeactivate = isOwner && active && !busy;
  const canUnstake = isOwner && !active && pending === 0 && !busy && (deactivatedAtMs === null || cooldownDone);

  async function send(kind: "deactivate" | "unstake") {
    if (busy || providerId === undefined) return;
    setBusy(true);
    setStatus(kind === "deactivate" ? "Confirm deactivate in your wallet…" : "Confirm unstake in your wallet…");
    try {
      if (walletChainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id });
      setPendingKind(kind);
      const hash = await writeContractAsync({
        address: V7_REGISTRY, abi: V7_ABI, functionName: kind, args: [providerId as bigint],
      });
      setPendingHash(hash);
      setStatus("Waiting for confirmation…");
    } catch (e) {
      setStatus(`❌ ${friendlyError(e)}`);
      setBusy(false);
    }
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <AlertTriangle size={14} color="var(--text-faint)" />
        <span style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--text-faint)", fontWeight: 700 }}>
          LEGACY v7 PROVIDER — CLEANUP
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        This wallet is still registered on the retired v7 registry. Calls no longer use it, but
        the {formatUsdc(stake)} USDC stake stays locked until you deactivate and unstake.
      </div>

      <div style={row}><span style={label}>v7 provider id</span><span style={value}>{providerId?.toString()}</span></div>
      <div style={row}><span style={label}>v7 stake</span><span style={value}>{formatUsdc(stake)} USDC</span></div>
      <div style={row}><span style={label}>v7 status</span><span style={value}>{active ? "active" : "deactivated"}</span></div>
      <div style={row}><span style={label}>pending calls</span><span style={value}>{pending}</span></div>
      <div style={row}><span style={label}>cooldown</span><span style={value}>{Math.round(cooldownSec / 60)} min</span></div>

      {!isOwner && (
        <div style={{ ...row, color: "var(--danger)" }}>Only the v7 provider owner can deactivate or unstake.</div>
      )}

      {pending > 0 && (
        <div style={{ ...row, color: "var(--text-dim)" }}>
          Unstake needs pendingCalls = 0. Wait for those v7 calls to settle first.
        </div>
      )}

      {active ? (
        <button style={actionBtn(!canDeactivate)} aria-disabled={!canDeactivate}
          onClick={() => { if (canDeactivate) void send("deactivate"); }}>
          Deactivate v7 provider
        </button>
      ) : (
        <button style={actionBtn(!canUnstake)} aria-disabled={!canUnstake}
          onClick={() => { if (canUnstake) void send("unstake"); }}>
          {deactivatedAtMs !== null && !cooldownDone
            ? `Unstake locked for ${Math.ceil(remainingMs / 60000)} more min`
            : `Unstake ${formatUsdc(stake)} USDC`}
        </button>
      )}

      {status && (
        <div role="status" aria-live="polite" style={{
          marginTop: 10, fontSize: 12, fontFamily: "var(--font-mono)", padding: "8px 10px", borderRadius: 6,
          background: status.startsWith("✅") ? "rgba(25,209,134,0.08)" : status.startsWith("❌") ? "rgba(238,69,57,0.08)" : "var(--bg-3)",
          color: status.startsWith("✅") ? "var(--accent-ink)" : status.startsWith("❌") ? "var(--danger)" : "var(--text-dim)",
          border: `1px solid ${status.startsWith("✅") ? "rgba(25,209,134,0.2)" : status.startsWith("❌") ? "rgba(238,69,57,0.2)" : "var(--border)"}`,
        }}>
          {status}
        </div>
      )}
    </div>
  );
}
