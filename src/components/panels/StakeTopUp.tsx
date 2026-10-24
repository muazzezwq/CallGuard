// Stake top-up for the active v8 provider.
//
// Slashing is charged against the stake, not against the call price: a missed
// call costs `stake * slashBps / 10_000` (PayPerCallV8.claimTimeout). A provider
// that has been slashed therefore keeps trading with a smaller bond, and once the
// stake drops below minStake the registration can no longer absorb a single miss.
// This card restores it with `addStake(providerId, amount)`.
//
// `addStake` pulls USDC with safeTransferFrom, so the flow is approve (only when
// the allowance is short) then addStake. Both writes need Arc Testnet.
import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  usePublicClient,
  useChainId,
  useSwitchChain,
} from "wagmi";
import {
  ACTIVE_REGISTRY_ADDRESS,
  CONFIG,
  REGISTRY_ABI_V8,
  USDC_ABI,
  V8_ENABLED,
  arcTestnet,
} from "../../lib/config";
import { formatUsdc, friendlyError } from "../../lib/utils";
import { parseUsdc6 } from "./registerRules";
import { Coins } from "lucide-react";

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

export default function StakeTopUpCard() {
  const { address } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const { data: providerId } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_V8,
    functionName: "providerIdOf",
    args: address ? [address] : undefined,
    query: { enabled: V8_ENABLED && !!address },
  });

  const hasProvider = typeof providerId === "bigint" && providerId > 0n;

  const { data: provider, refetch: refetchProvider } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_V8,
    functionName: "getProvider",
    args: hasProvider ? [providerId as bigint] : undefined,
    query: { enabled: hasProvider, refetchInterval: 15_000 },
  });

  const { data: termsVersion } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_V8,
    functionName: "latestTermsVersion",
    args: hasProvider ? [providerId as bigint] : undefined,
    query: { enabled: hasProvider, refetchInterval: 15_000 },
  });

  const { data: terms } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_V8,
    functionName: "getTerms",
    args: hasProvider && termsVersion !== undefined ? [providerId as bigint, termsVersion as number] : undefined,
    query: { enabled: hasProvider && termsVersion !== undefined },
  });

  const { data: minStake } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_V8,
    functionName: "minStake",
    query: { enabled: V8_ENABLED },
  });

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: CONFIG.usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  if (!V8_ENABLED || !address || !hasProvider || !provider) return null;

  const stake = provider.stake;
  const slashBps = BigInt(terms?.slashBps ?? 0);
  const slashPerMiss = (stake * slashBps) / 10_000n;
  const balanceKnown = balance !== undefined;
  const balanceValue = (balance as bigint | undefined) ?? 0n;
  const minStakeValue = (minStake as bigint | undefined) ?? 0n;
  const belowMin = minStakeValue > 0n && stake < minStakeValue;

  const parsed = parseUsdc6(amount);
  const amountValid = parsed !== null && parsed > 0n && parsed <= balanceValue;
  const canSubmit = amountValid && !busy && !!publicClient;

  async function submit() {
    if (!canSubmit || parsed === null || providerId === undefined) return;
    const client = publicClient;
    if (!client) return;
    setBusy(true);
    try {
      setStatus("Preparing transaction…");
      // Both writes must land on Arc Testnet; a wallet on another chain fails the
      // approve request with "Requested resource not available".
      if (walletChainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id });

      // Read the allowance at send time instead of trusting the cached value: the
      // stake may have been topped up from another tab in the meantime.
      const allowance = await client.readContract({
        address: CONFIG.usdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: "allowance",
        args: [address as `0x${string}`, ACTIVE_REGISTRY_ADDRESS],
      });

      if (allowance < parsed) {
        setStatus("Step 1 of 2 — approve the USDC top-up in your wallet…");
        const approveHash = await writeContractAsync({
          address: CONFIG.usdcAddress as `0x${string}`,
          abi: USDC_ABI,
          functionName: "approve",
          args: [ACTIVE_REGISTRY_ADDRESS, parsed],
        });
        setStatus("Step 1 of 2 — approval submitted. Waiting for confirmation…");
        const approveReceipt = await client.waitForTransactionReceipt({ hash: approveHash });
        if (approveReceipt.status !== "success") {
          setStatus("❌ The USDC approval reverted on-chain. Nothing was added to the stake.");
          setBusy(false);
          return;
        }
      }

      setStatus("Step 2 of 2 — confirm the stake top-up in your wallet…");
      const stakeHash = await writeContractAsync({
        address: ACTIVE_REGISTRY_ADDRESS,
        abi: REGISTRY_ABI_V8,
        functionName: "addStake",
        args: [providerId as bigint, parsed],
      });
      setStatus("Step 2 of 2 — top-up submitted. Waiting for confirmation…");
      const stakeReceipt = await client.waitForTransactionReceipt({ hash: stakeHash });
      if (stakeReceipt.status !== "success") {
        setStatus("❌ The stake top-up reverted on-chain.");
        setBusy(false);
        return;
      }

      setStatus(`✅ Added ${formatUsdc(parsed)} USDC to provider ${providerId.toString()}.`);
      setAmount("");
      void Promise.all([refetchProvider(), refetchBalance()]);
    } catch (e) {
      setStatus(`❌ ${friendlyError(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Coins size={14} color="var(--text-faint)" />
        <span style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--text-faint)", fontWeight: 700 }}>
          PROVIDER STAKE — TOP-UP
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        Slashing charges the stake, not the call price: one missed call costs{" "}
        {formatUsdc(slashPerMiss)} USDC at the current terms. Top up to restore the bond.
      </div>

      <div style={row}><span style={label}>v8 provider id</span><span style={value}>{providerId?.toString()}</span></div>
      <div style={row}><span style={label}>current stake</span><span style={value}>{formatUsdc(stake)} USDC</span></div>
      {minStakeValue > 0n && (
        <div style={row}><span style={label}>minimum stake</span><span style={value}>{formatUsdc(minStakeValue)} USDC</span></div>
      )}
      <div style={row}><span style={label}>slash per missed call</span><span style={value}>{formatUsdc(slashPerMiss)} USDC</span></div>
      <div style={row}>
        <span style={label}>wallet balance</span>
        <span style={value}>{balanceKnown ? `${formatUsdc(balanceValue)} USDC` : "reading…"}</span>
      </div>

      {belowMin && (
        <div style={{ ...row, color: "var(--danger)" }}>
          Stake is below the minimum. Restore at least {formatUsdc(minStakeValue - stake)} USDC.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount in USDC"
          inputMode="decimal"
          aria-label="Stake top-up amount in USDC"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg-3)",
            color: "var(--text)",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
          }}
        />
        <button
          onClick={() => { void submit(); }}
          disabled={!canSubmit}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            color: "#04120c",
            fontWeight: 600,
            fontSize: 13,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          Add stake
        </button>
      </div>

      {amount.trim() !== "" && !amountValid && (
        <div style={{ ...row, color: "var(--text-dim)" }}>
          {parsed === null
            ? "Enter a positive amount with at most 6 decimals."
            : parsed === 0n
              ? "Amount must be greater than zero."
              : "Amount exceeds your USDC balance."}
        </div>
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
