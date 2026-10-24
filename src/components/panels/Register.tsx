import { useState, useEffect, useCallback, useRef } from "react";
import type { ChangeEvent } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWalletClient, usePublicClient, useChainId, useSwitchChain } from "wagmi";
import { formatUnits, maxUint256, keccak256, toBytes } from "viem";
import {
  CONFIG, USDC_ABI, V8_ENABLED, ACTIVE_REGISTRY_ADDRESS, REGISTRY_ABI, REGISTRY_ABI_V8, arcTestnet,
} from "../../lib/config";
import { friendlyError, formatUsdc } from "../../lib/utils";
import { collectErrors, parseUsdc6, validateField } from "./registerRules";
import type { FieldKey, Limits } from "./registerRules";
import { Field, Input } from "../../ui";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";
import ArcFeeNotice from "../ArcFeeNotice";
import V7CleanupCard from "./V7Cleanup";

const IDENTITY_REGISTRY_ABI = [
  { name: "register", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

const REGISTRY_V2_ABI = [
  { name: "registerV2", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "erc8004TokenId", type: "uint256" }, { name: "signer", type: "address" },
      { name: "stakeAmount", type: "uint256" }, { name: "pricePerCall", type: "uint256" },
      { name: "maxResponseTime", type: "uint32" }, { name: "slashBps", type: "uint32" },
      { name: "maxConcurrentCalls", type: "uint32" }, { name: "endpoint", type: "string" },
    ], outputs: [{ name: "", type: "uint256" }] },
] as const;

// ServiceRegistry constants + immutable bounds, read on-chain (never hardcoded).
// minStake            — ServiceRegistry.sol:100 (immutable, constructor arg)
// MIN_RESPONSE_TIME   — ServiceRegistry.sol:56  (uint32 constant = 5)
// MAX_SLASH_BPS       — ServiceRegistry.sol:57  (uint32 constant = 10000)
const REGISTRY_LIMITS_ABI = [
  { name: "minStake", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "MIN_RESPONSE_TIME", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { name: "MAX_SLASH_BPS", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
] as const;

// HIGH-01 fix: unstake(uint256 providerId) — not unstake()
// HIGH-03 fix: getProvider returns a 9-field ProviderView tuple
const REGISTRY_UNSTAKE_ABI = [
  { name: "unstake",     type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "providerId", type: "uint256" }], outputs: [] },
  { name: "deactivate",  type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "providerId", type: "uint256" }], outputs: [] },
  { name: "updatePrice", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "providerId", type: "uint256" }, { name: "newPrice", type: "uint256" }], outputs: [] },
  { name: "providerIdOf", type: "function", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "getProvider", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "owner",           type: "address"  },
      { name: "signer",          type: "address"  },
      { name: "stake",           type: "uint256"  },
      { name: "pricePerCall",    type: "uint256"  },
      { name: "maxResponseTime", type: "uint32"   },
      { name: "slashBps",        type: "uint32"   },
      { name: "active",          type: "bool"     },
      { name: "maxConcurrentCalls", type: "uint32" },
      { name: "zkTier",          type: "uint8"    },
    ]}]
  },
  { name: "completedCalls", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "slashedCalls", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

const FIELD_STYLE = { marginBottom: 12 } as const;

const s = {
  page: { padding:"20px 16px",maxWidth:700,margin:"0 auto" },
  h1: { fontSize:22,fontWeight:700,color:"var(--text)",margin:"0 0 4px",fontFamily:"var(--font-display)" },
  sub: { fontSize:13,color:"var(--text-dim)",margin:"0 0 20px" },
  section: { background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:14,padding:"16px",marginBottom:12 },
  sectionTitle: { fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"var(--text-faint)",fontWeight:600,marginBottom:14 },
  row: { display:"flex",gap:10,marginBottom:0 },
  calcCard: { background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 14px",marginBottom:12 },
  calcRow: { display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid var(--border)" },
  calcLabel: { fontSize:12,color:"var(--text-dim)" },
  calcVal: { fontSize:12,fontWeight:600,fontFamily:"var(--font-mono)",color:"var(--text)" },
  btn: (v="primary",disabled=false) => ({ padding:"10px 20px",borderRadius:999,border:"none",cursor:disabled?"not-allowed":"pointer",fontSize:13,fontWeight:500,background:disabled?"var(--bg-3)":v==="primary"?"linear-gradient(135deg,var(--accent),var(--accent-dim))":"var(--bg-3)",color:disabled?"var(--text-faint)":v==="primary"?"#fff":"var(--text)",display:"inline-flex",alignItems:"center",gap:6,opacity:disabled?0.6:1,width:"100%",justifyContent:"center" as const }),
  info: { background:"rgba(31,119,239,0.08)",border:"1px solid rgba(31,119,239,0.2)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--info)",display:"flex",gap:8,alignItems:"flex-start",marginBottom:12 },
  warn: { background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--warn)",display:"flex",gap:8,alignItems:"flex-start",marginBottom:12 },
  err:  { background:"rgba(238,69,57,0.08)",border:"1px solid rgba(238,69,57,0.2)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--danger)",display:"flex",gap:8,alignItems:"flex-start",marginBottom:12 },
  success: { background:"rgba(25,209,134,0.08)",border:"1px solid rgba(25,209,134,0.2)",borderRadius:8,padding:"10px 12px",fontSize:12,color: "var(--accent-ink)",display:"flex",gap:8,alignItems:"flex-start",marginBottom:12 },
  tag: { display:"inline-block",padding:"2px 10px",borderRadius:999,fontSize:10,fontWeight:600,background:"var(--accent-bg)",color: "var(--accent-ink)",border:"1px solid var(--accent-fg)",marginLeft:6 },
  hint: { fontSize:11.5,color:"var(--text-faint)",marginTop:8,marginBottom:0 },
};


type TxState =
  | { kind: "idle" }
  | { kind: "approve-signing" }
  | { kind: "approve-pending"; hash: `0x${string}` }
  | { kind: "register-signing" }
  | { kind: "register-pending"; hash: `0x${string}` }
  | { kind: "success"; hash: `0x${string}` }
  | { kind: "rejected"; message: string }
  | { kind: "reverted"; message: string }
  | { kind: "error"; message: string };

const shortHash = (h: string) => `${h.slice(0, 10)}…`;

// Distinct rejection vs on-chain revert vs generic failure, with friendlyError text.
function txFailure(e: unknown): TxState {
  const err = e as { code?: number | string; shortMessage?: string; message?: string };
  const text = `${err?.shortMessage ?? ""} ${err?.message ?? ""}`.toLowerCase();
  if (err?.code === 4001 || err?.code === "ACTION_REJECTED" ||
      text.includes("user rejected") || text.includes("user denied") || text.includes("rejected the request")) {
    return { kind: "rejected", message: friendlyError(e) };
  }
  if (text.includes("revert")) return { kind: "reverted", message: friendlyError(e) };
  return { kind: "error", message: friendlyError(e) };
}

// friendlyError text for a failed write, for call sites that only need a string.
function failureText(e: unknown): string {
  const f = txFailure(e);
  return f.kind === "rejected" || f.kind === "reverted" || f.kind === "error" ? f.message : "Transaction failed.";
}

function txText(state: TxState): string {
  switch (state.kind) {
    case "approve-signing":  return "Step 1 of 2 — approve the USDC stake in your wallet.";
    case "approve-pending":  return `Step 1 of 2 — approval submitted (${shortHash(state.hash)}). Waiting for confirmation…`;
    case "register-signing": return "Step 2 of 2 — confirm the register transaction in your wallet.";
    case "register-pending": return `Step 2 of 2 — register submitted (${shortHash(state.hash)}). Waiting for confirmation…`;
    case "rejected": return `Rejected in your wallet — nothing was submitted. Edit the form and try again. (${state.message})`;
    case "reverted": return `Transaction reverted on-chain: ${state.message}`;
    case "error":    return `Transaction failed: ${state.message}`;
    default:         return "";
  }
}

const busyKinds: TxState["kind"][] = ["approve-signing","approve-pending","register-signing","register-pending"];


export default function Register() {
  const { address } = useAccount();
  const identityAddr = CONFIG.identityRegistryAddress as `0x${string}` | undefined;
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [signerAddr, setSignerAddr] = useState("");
  const [stake, setStake] = useState("10");
  const [price, setPrice] = useState("1");
  const [slaWindow, setSlaWindow] = useState("120");
  const [slashPct, setSlashPct] = useState("20");
  const [maxConcurrent, setMaxConcurrent] = useState("10");
  const [phase, setPhase] = useState<"edit"|"review"|"done">("edit");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [txState, setTxState] = useState<TxState>({ kind: "idle" });
  const [endpoint, setEndpoint] = useState("https://your-provider-endpoint.com/api");
  const [v2Step, setV2Step] = useState<"idle"|"minting"|"approving"|"registering"|"done">("idle");
  const [v2Status, setV2Status] = useState<string | null>(null);
  const [nftId, setNftId] = useState<string | null>(() => localStorage.getItem("cgAgentNftId"));
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [registeredHash, setRegisteredHash] = useState<`0x${string}` | undefined>();
  const [unstakeStatus, setUnstakeStatus] = useState<string | null>(null);
  const [unstakeHash, setUnstakeHash] = useState<`0x${string}` | undefined>();
  const inFlightRef = useRef(false);
  const v2BusyRef = useRef(false);

  useEffect(() => { if (address) setSignerAddr(address); }, [address]);

  // On-chain limits — read, never hardcoded.
  const { data: minStakeRaw } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_LIMITS_ABI,
    functionName: "minStake",
    query: { refetchInterval: 60_000 },
  });
  const { data: minRespRaw } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_LIMITS_ABI,
    functionName: "MIN_RESPONSE_TIME",
  });
  const { data: maxSlashRaw } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_LIMITS_ABI,
    functionName: "MAX_SLASH_BPS",
  });
  const minStake = minStakeRaw as bigint | undefined;
  const limits: Limits = {
    minStake,
    minResponseTime: minRespRaw !== undefined ? Number(minRespRaw) : 5,      // ServiceRegistry.sol:56
    maxSlashBps: maxSlashRaw !== undefined ? Number(maxSlashRaw) : 10000,   // ServiceRegistry.sol:57
  };

  // Check if already registered
  const { data: providerId } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_UNSTAKE_ABI,
    functionName: "providerIdOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const alreadyRegistered = providerId !== undefined && (providerId as bigint) > 0n;

  // Get provider data if registered
  const { data: providerData, refetch: refetchProvider } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: V8_ENABLED ? REGISTRY_ABI_V8 : REGISTRY_UNSTAKE_ABI,
    functionName: "getProvider",
    args: alreadyRegistered ? [(providerId as bigint)] : undefined,
    query: { enabled: alreadyRegistered },
  });

  const provInfo = providerData as {
    stake?: bigint | number;
    pricePerCall?: bigint | number;
    maxResponseTime?: bigint | number;
    latestTermsVersion?: bigint | number;
  } | undefined;
  const currentStake = provInfo?.stake ? formatUnits(provInfo.stake as bigint, 6) : "0";
  const registeredTermsVersion = provInfo?.latestTermsVersion != null ? Number(provInfo.latestTermsVersion) : null;

  const { data: providerTermsData } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_V8,
    functionName: "getTerms",
    args: [providerId as bigint, registeredTermsVersion ?? 0],
    query: { enabled: V8_ENABLED && alreadyRegistered && (registeredTermsVersion ?? 0) > 0 },
  });
  const providerTerms = providerTermsData as Record<string | number, unknown> | undefined;
  const registeredSlaWindow = V8_ENABLED
    ? Number(providerTerms?.maxResponseTime ?? providerTerms?.[1] ?? 0)
    : Number(provInfo?.maxResponseTime ?? 0);

  // Allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONFIG.usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, ACTIVE_REGISTRY_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, writeContractAsync, isPending } = useWriteContract();
  const { isSuccess: unstakeTxSuccess } = useWaitForTransactionReceipt({ hash: unstakeHash });

  const handleUnstake = useCallback(() => {
    if (!address) return;
    if (!window.confirm(`Withdraw ${currentStake} USDC stake?\n\nThis permanently removes your provider registration. You can re-register later.`)) return;
    setUnstakeStatus("⏳ Submitting...");
    // HIGH-01 fix: unstake requires providerId
    writeContract({
      address: ACTIVE_REGISTRY_ADDRESS,
      abi: REGISTRY_UNSTAKE_ABI,
      functionName: "unstake",
      args: [(providerId as bigint)],
    }, {
      onSuccess: (h) => { setUnstakeHash(h); setUnstakeStatus("⏳ Waiting for confirmation..."); },
      onError: (e: unknown) => setUnstakeStatus(`❌ ${failureText(e)}`),
    });
  }, [address, currentStake, writeContract, providerId]);

  useEffect(() => {
    if (unstakeTxSuccess) {
      setUnstakeStatus(`✅ Stake withdrawn — ${currentStake} USDC returned (receipt confirmed)`);
      refetchProvider();
    }
  }, [unstakeTxSuccess, currentStake, refetchProvider]);

  // Live calculator
  const stakeNum = parseFloat(stake) || 0;
  const priceNum = parseFloat(price) || 0;
  const slashNum = parseFloat(slashPct) || 20;
  const slashPerCall = (priceNum * slashNum) / 100;
  const breakeven = slashPerCall > 0 ? Math.ceil(stakeNum / slashPerCall) : "∞";
  const slashBps = Math.round(slashNum * 100);
  const estimatedEarning = priceNum * 10; // 10 calls estimate

  const stakeAmount = parseUsdc6(stake);
  const priceAmount = parseUsdc6(price);
  const allowanceKnown = allowance !== undefined;
  const allowanceSufficient = allowanceKnown && stakeAmount !== null && (allowance as bigint) >= stakeAmount;
  const needsApproval = !allowanceSufficient;

  const values: Record<FieldKey, string> = { signerAddr, endpoint, stake, price, slaWindow, slashPct, maxConcurrent };
  const setters: Record<FieldKey, (v: string) => void> = {
    signerAddr: setSignerAddr, endpoint: setEndpoint, stake: setStake,
    price: setPrice, slaWindow: setSlaWindow, slashPct: setSlashPct, maxConcurrent: setMaxConcurrent,
  };

  function handleChange(key: FieldKey) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setters[key](v);
      // Clear an error as soon as the field becomes valid.
      setErrors(prev => {
        if (!prev[key]) return prev;
        if (validateField(key, v, limits) === null) { const next = { ...prev }; delete next[key]; return next; }
        return prev;
      });
    };
  }
  function handleBlur(key: FieldKey) {
    return () => setErrors(prev => {
      const m = validateField(key, values[key], limits);
      const next = { ...prev };
      if (m) next[key] = m; else delete next[key];
      return next;
    });
  }

  type Params = {
    signer: `0x${string}`; stakeAmount: bigint; priceAmount: bigint;
    maxResponseTime: number; slashBps: number; maxConcurrentCalls: number;
    endpoint: string; availabilityTargetBps: number; termsHash: `0x${string}`; termsUri: string;
  };
  function collectParams(): Params | null {
    const es = collectErrors(values, limits);
    if (Object.keys(es).length > 0) { setErrors(es); setPhase("edit"); return null; }
    const trimmedEndpoint = endpoint.trim();
    return {
      signer: signerAddr as `0x${string}`,
      stakeAmount: parseUsdc6(stake) ?? 0n,
      priceAmount: parseUsdc6(price) ?? 0n,
      maxResponseTime: Number(slaWindow.trim()),
      slashBps: Math.round(Number(slashPct.trim()) * 100),
      maxConcurrentCalls: Number(maxConcurrent.trim()),
      endpoint: trimmedEndpoint,
      // P0 defaults: 99.5% availability target, and the endpoint doubles as the
      // human-readable terms URI until the provider publishes a separate doc.
      availabilityTargetBps: 9_950,
      termsHash: keccak256(toBytes(trimmedEndpoint)),
      termsUri: trimmedEndpoint,
    };
  }

  function goToReview() {
    const es = collectErrors(values, limits);
    if (Object.keys(es).length > 0) { setErrors(es); return; }
    setErrors({});
    setTxState({ kind: "idle" });
    setPhase("review");
  }

  // One submit per parameter set while a write is in flight. Released on
  // rejection, revert or failure (the finally block always clears the guard).
  const busy = busyKinds.includes(txState.kind);
  const v2Busy = v2Step === "minting" || v2Step === "approving" || v2Step === "registering";

  async function runFlow() {
    if (inFlightRef.current || v2BusyRef.current) return;
    const p = collectParams();
    if (!p) return;
    if (!publicClient) { setTxState({ kind: "error", message: "No RPC client available. Reconnect your wallet and retry." }); return; }
    inFlightRef.current = true;
    try {
      // Writes must land on Arc Testnet. Other panels switch before writing; the
      // register flow did not, so a wallet on another chain failed the approve
      // request with "Requested resource not available" instead of prompting.
      if (walletChainId !== arcTestnet.id) {
        await switchChainAsync({ chainId: arcTestnet.id });
      }
      const mustApprove = !allowanceKnown || (allowance as bigint) < p.stakeAmount;
      if (mustApprove) {
        setTxState({ kind: "approve-signing" });
        const approveHash = await writeContractAsync({
          address: CONFIG.usdcAddress as `0x${string}`,
          abi: USDC_ABI,
          functionName: "approve",
          args: [ACTIVE_REGISTRY_ADDRESS, p.stakeAmount],
        });
        setTxState({ kind: "approve-pending", hash: approveHash });
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
        if (approveReceipt.status !== "success") {
          setTxState({ kind: "reverted", message: "The USDC approval reverted on-chain. No registration was sent." });
          return;
        }
        refetchAllowance();
      }
      setTxState({ kind: "register-signing" });
      const regHash = V8_ENABLED
        ? await writeContractAsync({
            address: ACTIVE_REGISTRY_ADDRESS,
            abi: REGISTRY_ABI_V8,
            functionName: "register",
            args: [
              p.signer, p.stakeAmount, p.priceAmount, p.maxResponseTime, p.slashBps,
              p.availabilityTargetBps, p.maxConcurrentCalls, p.endpoint, p.termsHash, p.termsUri,
            ],
          })
        : await writeContractAsync({
            address: ACTIVE_REGISTRY_ADDRESS,
            abi: REGISTRY_ABI,
            functionName: "register",
            args: [p.signer, p.stakeAmount, p.priceAmount, p.maxResponseTime, p.slashBps, p.maxConcurrentCalls, p.endpoint],
          });
      setTxState({ kind: "register-pending", hash: regHash });
      // Success is claimed only after the receipt confirms — never from a hash alone.
      const regReceipt = await publicClient.waitForTransactionReceipt({ hash: regHash });
      if (regReceipt.status === "success") {
        setRegisteredHash(regHash);
        setTxState({ kind: "success", hash: regHash });
        refetchProvider();
        setPhase("done");
      } else {
        setTxState({ kind: "reverted", message: "The register transaction reverted on-chain. No provider was created." });
      }
    } catch (e) {
      setTxState(txFailure(e));
    } finally {
      inFlightRef.current = false;
    }
  }

  const handleRegisterV2 = async () => {
    if (v2BusyRef.current || inFlightRef.current) return;
    if (V8_ENABLED) {
      setV2Status("v8 uses the standard versioned-terms register flow; ERC-8004 binding is not part of P0.");
      return;
    }
    if (!walletClient || !publicClient || !address) { setV2Status("❌ Connect wallet first"); return; }
    if (alreadyRegistered) { setV2Status(`❌ Already registered as provider #${String(providerId)}`); return; }
    /* Parsed once, before any wallet prompt: a second parse after the NFT mint
       could fail and yank the review UI mid-flow. */
    const params = collectParams();
    if (!params) { setV2Status("❌ Fix the highlighted fields before registering."); return; }
    v2BusyRef.current = true;
    setV2Step("minting");
    setV2Status("⏳ Step 1/3 — Minting ERC-8004 identity NFT…");
    try {
      const identity = CONFIG.identityRegistryAddress;
      if (!identity) { setV2Status("❌ Identity registry address not configured (identityRegistryAddress in config)"); setV2Step("idle"); return; }
      const mintHash = await walletClient.writeContract({ address: identity, abi: IDENTITY_REGISTRY_ABI, functionName: "register", args: [endpoint || "https://callguard.vercel.app/provider"] });
      setV2Status("⏳ Step 1/3 — Waiting for NFT confirmation…");
      let tokenId: bigint | null = null;
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: mintHash, timeout: 60_000 });
        for (const log of (receipt.logs || [])) {
          // ERC-721 Transfer: topics[1] = from (0x0 for mint), topics[3] = tokenId
          if (log.topics?.length === 4 && log.topics[1] === "0x0000000000000000000000000000000000000000000000000000000000000000") {
            tokenId = BigInt(log.topics[3]);
            break;
          }
          // Registered(uint256 indexed agentId, ...) — topics[1] = agentId
          if (log.topics?.length >= 2 && tokenId === null) {
            try { const t = log.topics[1]; if (t) tokenId = BigInt(t); } catch { /* topic is not a tokenId */ }
          }
        }
        if (!tokenId) tokenId = BigInt(1); // fallback
      } catch {
        setV2Status("❌ Timed out waiting for NFT mint TX. Check explorer."); setV2Step("idle"); return;
      }
      if (!tokenId) { setV2Status("❌ Could not read NFT tokenId from logs"); setV2Step("idle"); return; }
      localStorage.setItem("cgAgentNftId", tokenId.toString());
      setNftId(tokenId.toString());
      setV2Step("approving");
      setV2Status(`✅ NFT minted #${tokenId} — Step 2/3 Approving USDC…`);
      const approveHash = await walletClient.writeContract({ address: CONFIG.usdcAddress as `0x${string}`, abi: USDC_ABI, functionName: "approve", args: [ACTIVE_REGISTRY_ADDRESS, maxUint256] });
      setV2Status(`⏳ Step 2/3 — approval submitted (${shortHash(approveHash)}). Waiting for confirmation…`);
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 60_000 });
      if (approveReceipt.status !== "success") { setV2Status("❌ The USDC approval reverted on-chain."); setV2Step("idle"); return; }
      refetchAllowance();
      setV2Step("registering");
      setV2Status("✅ USDC approved — Step 3/3 Registering provider with NFT…");
      const p = params;
      const regHash = await walletClient.writeContract({
        address: ACTIVE_REGISTRY_ADDRESS,
        abi: REGISTRY_V2_ABI,
        functionName: "registerV2",
        args: [tokenId, p.signer, p.stakeAmount, p.priceAmount, p.maxResponseTime, p.slashBps, p.maxConcurrentCalls, p.endpoint],
      });
      setV2Status(`⏳ Step 3/3 — registerV2 submitted (${shortHash(regHash)}). Waiting for confirmation…`);
      const regReceipt = await publicClient.waitForTransactionReceipt({ hash: regHash, timeout: 60_000 });
      if (regReceipt.status === "success") {
        setV2Status(`✅ Registered with NFT #${tokenId}! TX: ${regHash.slice(0, 14)}…`);
        setV2Step("done");
        setRegisteredHash(regHash);
        refetchProvider();
        setPhase("done");
      } else {
        setV2Status("❌ The registerV2 transaction reverted on-chain.");
        setV2Step("idle");
      }
    } catch (e: unknown) {
      setV2Status(`❌ ${txFailure(e).kind === "rejected" ? "Rejected in your wallet — nothing was submitted." : failureText(e)}`);
      setV2Step("idle");
    } finally {
      v2BusyRef.current = false;
    }
  };

  if (phase === "done") return (
    <div style={s.page}>
      <div style={{ textAlign:"center",padding:"60px 20px" }}>
        <CheckCircle size={48} color="var(--accent)" style={{ marginBottom:16 }} />
        <h2 style={{ fontSize:20,fontWeight:700,color:"var(--text)",marginBottom:8 }}>Registration complete!</h2>
        <p style={{ fontSize:13,color:"var(--text-dim)" }}>You are now a provider on Arc Testnet. Start listening for call events.</p>
        {registeredHash && (
          <p style={{ fontSize:12,marginTop:8 }}>
            <a href={`https://explorer.testnet.arc.io/tx/${registeredHash}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)",fontFamily:"var(--font-mono)" }}>View transaction ↗</a>
          </p>
        )}
        <button style={{ ...s.btn(),marginTop:20,maxWidth:220 }} onClick={() => { setPhase("edit"); setTxState({ kind:"idle" }); setErrors({}); }}>Register another</button>
      </div>
      <V7CleanupCard />
    </div>
  );

  const minStakeLabel = minStake !== undefined ? `${formatUsdc(minStake)} USDC` : "reading…";

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Become a Provider</h1>
      <p style={s.sub}>Stake USDC, define your SLA, and start earning per request.</p>

      {/* Already registered banner */}
      {alreadyRegistered && (
        <div style={s.success}>
          <CheckCircle size={14} style={{ flexShrink:0,marginTop:1 }} />
          <div>
            <strong>Already registered as Provider #{String(providerId)}</strong>
            <div style={{ marginTop:4, fontSize:11, color:"var(--text-dim)" }}>
              Stake: {currentStake} USDC ·
              Price: {provInfo?.pricePerCall ? formatUnits(provInfo.pricePerCall as bigint, 6) : "—"} USDC/call ·
              SLA: {registeredSlaWindow > 0 ? `${registeredSlaWindow}s` : "—"} ·
              Terms: {registeredTermsVersion != null ? `v${registeredTermsVersion}` : "v7"}
            </div>
            <div style={{ marginTop:10, display:"flex", gap:8 }}>
              <button
                onClick={handleUnstake}
                disabled={isPending}
                style={{ padding:"6px 14px", background:"var(--danger)", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600, opacity: isPending ? 0.6 : 1 }}
              >
                Withdraw Stake
              </button>
            </div>
            {unstakeStatus && (
              <div style={{ marginTop:8, fontSize:12, fontFamily:"var(--font-mono)",
                color: unstakeStatus.startsWith("✅") ? "var(--accent-ink)" : unstakeStatus.startsWith("❌") ? "var(--danger)" : "var(--text-dim)",
                padding:"5px 8px", background:"var(--bg-3)", borderRadius:5 }}>
                {unstakeStatus}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info */}
      <div style={s.info}>
        <Info size={14} style={{ flexShrink:0,marginTop:1 }} />
        <span>Provider = sell API calls with a stake guarantee. Miss deadline → stake slashed. Honor it → earn USDC per call.</span>
      </div>

      {phase === "edit" && (
        <>
          {/* Form */}
          <div style={s.section}>
            <div style={s.sectionTitle}>REGISTRATION DETAILS</div>

            <Field label="Signer address" htmlFor="rg-signer" required style={FIELD_STYLE}
              hint="Editable · the address that signs receipts for this provider."
              error={errors.signerAddr}>
              <Input id="rg-signer" mono value={signerAddr} onChange={handleChange("signerAddr")} onBlur={handleBlur("signerAddr")}
                placeholder="0x…" error={Boolean(errors.signerAddr)} aria-required
                aria-invalid={errors.signerAddr ? true : undefined}
                aria-describedby={errors.signerAddr ? "rg-signer-err" : "rg-signer-hint"} />
            </Field>

            <Field label="Provider endpoint URL" htmlFor="rg-endpoint" required style={FIELD_STYLE}
              hint="Editable · must start with http://, https://, ws:// or wss://."
              error={errors.endpoint}>
              <Input id="rg-endpoint" mono value={endpoint} onChange={handleChange("endpoint")} onBlur={handleBlur("endpoint")}
                placeholder="https://your-server.com/provider" error={Boolean(errors.endpoint)} aria-required
                aria-invalid={errors.endpoint ? true : undefined}
                aria-describedby={errors.endpoint ? "rg-endpoint-err" : "rg-endpoint-hint"} />
            </Field>

            <div style={s.row}>
              <div style={{ flex:1 }}>
                <Field label="Stake amount (USDC)" htmlFor="rg-stake" required style={FIELD_STYLE}
                  hint={`Editable · on-chain minimum ${minStakeLabel} (read-only).`} error={errors.stake}>
                  <Input id="rg-stake" mono inputMode="decimal" value={stake} onChange={handleChange("stake")} onBlur={handleBlur("stake")}
                    error={Boolean(errors.stake)} aria-required
                    aria-invalid={errors.stake ? true : undefined}
                    aria-describedby={errors.stake ? "rg-stake-err" : "rg-stake-hint"} />
                </Field>
              </div>
              <div style={{ flex:1 }}>
                <Field label="Price per call (USDC)" htmlFor="rg-price" required style={FIELD_STYLE}
                  hint="Editable · charged per successful call, 6-decimal USDC." error={errors.price}>
                  <Input id="rg-price" mono inputMode="decimal" value={price} onChange={handleChange("price")} onBlur={handleBlur("price")}
                    error={Boolean(errors.price)} aria-required
                    aria-invalid={errors.price ? true : undefined}
                    aria-describedby={errors.price ? "rg-price-err" : "rg-price-hint"} />
                </Field>
              </div>
            </div>

            <div style={s.row}>
              <div style={{ flex:1 }}>
                <Field label="SLA window (seconds)" htmlFor="rg-slwindow" required style={FIELD_STYLE}
                  hint={`Editable · minimum ${limits.minResponseTime}s (read-only, MIN_RESPONSE_TIME).`} error={errors.slaWindow}>
                  <Input id="rg-slwindow" mono inputMode="numeric" value={slaWindow} onChange={handleChange("slaWindow")} onBlur={handleBlur("slaWindow")}
                    error={Boolean(errors.slaWindow)} aria-required
                    aria-invalid={errors.slaWindow ? true : undefined}
                    aria-describedby={errors.slaWindow ? "rg-slwindow-err" : "rg-slwindow-hint"} />
                </Field>
              </div>
              <div style={{ flex:1 }}>
                <Field label="Slash % on timeout" htmlFor="rg-slashpct" required style={FIELD_STYLE}
                  hint={`Editable · computed slashBps = ${slashBps} (max ${limits.maxSlashBps / 100}%, MAX_SLASH_BPS = ${limits.maxSlashBps}).`} error={errors.slashPct}>
                  <Input id="rg-slashpct" mono inputMode="decimal" value={slashPct} onChange={handleChange("slashPct")} onBlur={handleBlur("slashPct")}
                    error={Boolean(errors.slashPct)} aria-required
                    aria-invalid={errors.slashPct ? true : undefined}
                    aria-describedby={errors.slashPct ? "rg-slashpct-err" : "rg-slashpct-hint"} />
                </Field>
              </div>
              <div style={{ flex:1 }}>
                <Field label="Max concurrent calls" htmlFor="rg-maxconc" required style={FIELD_STYLE}
                  hint="Editable · 0 uses the protocol default (10 per caller)." error={errors.maxConcurrent}>
                  <Input id="rg-maxconc" mono inputMode="numeric" value={maxConcurrent} onChange={handleChange("maxConcurrent")} onBlur={handleBlur("maxConcurrent")}
                    error={Boolean(errors.maxConcurrent)} aria-required
                    aria-invalid={errors.maxConcurrent ? true : undefined}
                    aria-describedby={errors.maxConcurrent ? "rg-maxconc-err" : "rg-maxconc-hint"} />
                </Field>
              </div>
            </div>

            {/* Computed / read-only values, labelled in words (not colour) */}
            <div style={s.calcCard}>
              {([
                ["On-chain minimum stake (read-only)", minStakeLabel],
                ["Computed slashBps from Slash % (computed)", String(slashBps)],
                ["Required USDC allowance = stake (computed)", `${stake} USDC`],
              ] as [string,string][]).map(([k,v]) => (
                <div key={k} style={s.calcRow}><span style={s.calcLabel}>{k}</span><span style={s.calcVal}>{v}</span></div>
              ))}
            </div>
          </div>

          {/* Live Calculator */}
          <div style={s.section}>
            <div style={s.sectionTitle}>LIVE ECONOMICS CALCULATOR</div>
            <div style={s.calcCard}>
              {[
                ["Stake", `${stakeNum.toFixed(2)} USDC`],
                ["Price per call", `${priceNum.toFixed(3)} USDC`],
                ["Slash per missed call", `${slashPerCall.toFixed(3)} USDC (${slashPct}%)`],
                ["Break-even calls", String(breakeven)],
                ["Estimated earnings (10 calls)", `${estimatedEarning.toFixed(2)} USDC`],
                ["Slash BPS (on-chain value)", String(slashBps)],
                ["Max concurrent calls", maxConcurrent || "0"],
              ].map(([k,v]) => (
                <div key={k} style={s.calcRow}>
                  <span style={s.calcLabel}>{k}</span>
                  <span style={s.calcVal}>{v}</span>
                </div>
              ))}
            </div>

            {stakeNum < slashPerCall && slashPerCall > 0 && (
              <div style={s.warn}>
                <AlertTriangle size={14} style={{ flexShrink:0,marginTop:1 }} />
                <span>Your stake is less than one slash amount. Callers may not be fully covered on timeout.</span>
              </div>
            )}

            {stakeNum >= slashPerCall * 10 && (
              <div style={s.success}>
                <CheckCircle size={14} style={{ flexShrink:0,marginTop:1 }} />
                <span>Strong stake coverage — you can miss up to {Math.floor(stakeNum / slashPerCall)} calls before stake is depleted.</span>
              </div>
            )}
          </div>

          {/* ERC-8004 identity — informational on this step; the button is on review */}
          <div style={s.section}>
            <div style={s.sectionTitle}>ERC-8004 IDENTITY — RECOMMENDED</div>
            <div style={{ ...s.info, marginBottom: nftId ? 10 : 0 }}>
              <Info size={14} style={{ flexShrink:0,marginTop:1 }} />
              <span>Registers an AgentIdentity NFT first, then calls <code>registerV2()</code> binding your on-chain identity to the provider. Unlocks agent marketplace discovery, ERC-8004 compatible wallet, and higher trust score.</span>
            </div>
            {nftId && <div style={{ ...s.success, marginBottom:0 }}><CheckCircle size={14} style={{ flexShrink:0,marginTop:1 }} /><span>Identity NFT #{nftId} already minted — will be reused.</span></div>}
            <p style={s.hint}>Choose this option on the review step.</p>
          </div>

          {/* Review entry point — the wallet is not asked to sign here. The title is
              the original section's copy, kept verbatim: the default path is the
              basic (no-NFT) register; the NFT path is opt-in on the review step. */}
          <div style={s.section}>
            <div style={s.sectionTitle}>REGISTER (basic — no NFT)</div>
            {!address ? (
              <div style={{ color:"var(--text-faint)",fontSize:13,textAlign:"center",padding:"20px 0" }}>Connect wallet to continue</div>
            ) : (
              <button style={s.btn("primary", false)} onClick={goToReview}>Review registration →</button>
            )}
          </div>
        </>
      )}

      {phase === "review" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>REVIEW REGISTRATION</div>
          <div style={s.info} id="rg-flow-note">
            <Info size={14} style={{ flexShrink:0,marginTop:1 }} />
            <span>
              Nothing is submitted until you confirm in your wallet.{" "}
              {needsApproval
                ? `This flow asks your wallet twice: (1) approve ${stake} USDC, then (2) register the provider.`
                : "This flow asks your wallet once: register the provider."}
            </span>
          </div>

          <div style={s.calcCard}>
            {([
              ["Provider address (read-only)", address ?? "—"],
              ["Signer address", signerAddr],
              ["Endpoint", endpoint],
              ["Stake (USDC)", stakeAmount !== null ? `${stake} = ${stakeAmount} base units (6 decimals)` : stake],
              ["Price per call (USDC)", priceAmount !== null ? `${price} = ${priceAmount} base units (6 decimals)` : price],
              ["SLA window", `${slaWindow}s`],
              ["Slash", `${slashPct}% = ${slashBps} bps`],
              ["Max concurrent calls", Number(maxConcurrent) === 0 ? `${maxConcurrent} (protocol default 10)` : maxConcurrent],
              ["Required USDC allowance (computed)", `${stake} USDC`],
            ] as [string,string][]).map(([k,v]) => (
              <div key={k} style={s.calcRow}><span style={s.calcLabel}>{k}</span><span style={s.calcVal}>{v}</span></div>
            ))}
          </div>

          <div style={needsApproval ? s.warn : s.success}>
            {needsApproval
              ? <AlertTriangle size={14} style={{ flexShrink:0,marginTop:1 }} />
              : <CheckCircle size={14} style={{ flexShrink:0,marginTop:1 }} />}
            <span>
              {allowanceKnown
                ? needsApproval
                  ? `Needs approval — current allowance ${formatUsdc(allowance as bigint)} USDC is below the ${stake} USDC stake.`
                  : `USDC approved. Ready to register.`
                : `Allowance not loaded yet — the app will approve the ${stake} USDC stake first.`}
            </span>
          </div>
          {allowanceKnown && !needsApproval && (
            <p style={s.hint}>Current allowance {formatUsdc(allowance as bigint)} USDC covers the {stake} USDC stake.</p>
          )}

          <button
            style={s.btn("primary", busy || v2Busy)}
            onClick={runFlow}
            aria-disabled={busy || v2Busy}
            aria-describedby="rg-flow-note"
          >
            {txState.kind === "approve-signing" || txState.kind === "approve-pending"
              ? "Approving…"
              : txState.kind === "register-signing" || txState.kind === "register-pending"
                ? "Registering…"
                : needsApproval ? `Approve ${stake} USDC` : "Register as Provider"}
          </button>
          {(busy || v2Busy) && <p style={s.hint}>The form is locked until this transaction confirms, is rejected, or fails.</p>}

          <ArcFeeNotice
            address={CONFIG.usdcAddress as `0x${string}`}
            abi={USDC_ABI}
            functionName="approve"
            args={[ACTIVE_REGISTRY_ADDRESS, stakeAmount ?? 0n]}
            enabled={needsApproval && !busy}
          />
          <ArcFeeNotice
            address={ACTIVE_REGISTRY_ADDRESS}
            abi={V8_ENABLED ? REGISTRY_ABI_V8 : REGISTRY_ABI}
            functionName="register"
            args={V8_ENABLED
              ? [
                  signerAddr as `0x${string}`, stakeAmount ?? 0n, priceAmount ?? 0n,
                  Number(slaWindow) || 0, slashBps, 9_950, Number(maxConcurrent) || 0,
                  endpoint, keccak256(toBytes(endpoint)), endpoint,
                ]
              : [signerAddr as `0x${string}`, stakeAmount ?? 0n, priceAmount ?? 0n, Number(slaWindow) || 0, slashBps, Number(maxConcurrent) || 0, endpoint]}
            enabled={!busy}
          />

          {txState.kind !== "idle" && txState.kind !== "success" && (
            <div
              style={txState.kind === "rejected" ? s.warn : txState.kind === "reverted" || txState.kind === "error" ? s.err : s.info}
              role="status" aria-live="polite"
            >
              {txState.kind === "rejected" || txState.kind === "reverted" || txState.kind === "error"
                ? <AlertTriangle size={14} style={{ flexShrink:0,marginTop:1 }} />
                : <Info size={14} style={{ flexShrink:0,marginTop:1 }} />}
              <span>{txText(txState)}</span>
            </div>
          )}

          {/* ERC-8004 alternative — also gated behind review */}
          <div style={{ marginTop:16, borderTop:"1px solid var(--border)", paddingTop:14 }}>
            <div style={s.sectionTitle}>ERC-8004 IDENTITY — RECOMMENDED</div>
            {nftId && (
              <div style={s.success}>
                <CheckCircle size={14} style={{ flexShrink:0,marginTop:1 }} />
                <span>Identity NFT #{nftId} already minted — will be reused.</span>
              </div>
            )}
            <button
              style={s.btn("secondary", v2Busy || busy || alreadyRegistered || !address)}
              onClick={handleRegisterV2}
              aria-disabled={v2Busy || busy || alreadyRegistered || !address}
            >
              {v2Busy ? `${v2Step.charAt(0).toUpperCase()}${v2Step.slice(1)}…` : "🔐 Register with NFT — Recommended"}
            </button>
            {identityAddr && (
              <ArcFeeNotice
                address={identityAddr}
                abi={IDENTITY_REGISTRY_ABI}
                functionName="register"
                args={[endpoint || "https://callguard.vercel.app/provider"]}
                enabled={!!address && !alreadyRegistered && v2Step === "idle" && !busy}
              />
            )}
            {v2Status && (
              <div style={{ marginTop: 10, fontSize: 12, fontFamily: "var(--font-mono)", padding: "8px 10px", borderRadius: 6, background: v2Status.startsWith("✅") ? "rgba(25,209,134,0.08)" : v2Status.startsWith("❌") ? "rgba(238,69,57,0.08)" : "var(--bg-3)", color: v2Status.startsWith("✅") ? "var(--accent-ink)" : v2Status.startsWith("❌") ? "var(--danger)" : "var(--text-dim)", border: `1px solid ${v2Status.startsWith("✅") ? "rgba(25,209,134,0.2)" : v2Status.startsWith("❌") ? "rgba(238,69,57,0.2)" : "var(--border)"}` }} role="status" aria-live="polite">
                {v2Status}
              </div>
            )}
          </div>

          <button
            style={{ ...s.btn("secondary", busy || v2Busy), marginTop: 12 }}
            onClick={() => { if (busy || v2Busy) return; setPhase("edit"); }}
            aria-disabled={busy || v2Busy}
          >
            ← Back to editing
          </button>
        </div>
      )}

      <V7CleanupCard />
    </div>
  );
}
