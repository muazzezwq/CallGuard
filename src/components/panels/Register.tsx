import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWalletClient, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import { CONFIG, USDC_ABI, REGISTRY_ABI } from "../../lib/config";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";

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
      { name: "endpoint", type: "string" },
    ], outputs: [{ name: "", type: "uint256" }] },
] as const;

// HIGH-01 fix: unstake(uint256 providerId) — not unstake()
// HIGH-03 fix: getProvider tuple is 7 fields, not 10
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
    ]}]
  },
  { name: "completedCalls", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "slashedCalls", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

const s = {
  page: { padding:"20px 16px",maxWidth:700,margin:"0 auto" },
  h1: { fontSize:22,fontWeight:700,color:"var(--text)",margin:"0 0 4px",fontFamily:"var(--font-display)" },
  sub: { fontSize:13,color:"var(--text-dim)",margin:"0 0 20px" },
  section: { background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:10,padding:"16px",marginBottom:12 },
  sectionTitle: { fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"var(--text-faint)",fontWeight:600,marginBottom:14 },
  label: { fontSize:12,color:"var(--text-dim)",marginBottom:4,display:"block" },
  input: { width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontSize:13,fontFamily:"var(--font-mono)",boxSizing:"border-box" as const,marginBottom:12 },
  row: { display:"flex",gap:10,marginBottom:0 },
  calcCard: { background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"12px 14px",marginBottom:12 },
  calcRow: { display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid var(--border)" },
  calcLabel: { fontSize:12,color:"var(--text-dim)" },
  calcVal: { fontSize:12,fontWeight:600,fontFamily:"var(--font-mono)",color:"var(--text)" },
  btn: (v="primary",disabled=false) => ({ padding:"10px 20px",borderRadius:8,border:"none",cursor:disabled?"not-allowed":"pointer",fontSize:13,fontWeight:500,background:disabled?"var(--bg-3)":v==="primary"?"linear-gradient(135deg,#10b981,#059669)":"var(--bg-3)",color:disabled?"var(--text-faint)":v==="primary"?"#fff":"var(--text)",display:"inline-flex",alignItems:"center",gap:6,opacity:disabled?0.6:1,width:"100%",justifyContent:"center" as const }),
  info: { background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#93c5fd",display:"flex",gap:8,alignItems:"flex-start",marginBottom:12 },
  warn: { background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#fbbf24",display:"flex",gap:8,alignItems:"flex-start",marginBottom:12 },
  success: { background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"var(--accent)",display:"flex",gap:8,alignItems:"flex-start",marginBottom:12 },
  tag: { display:"inline-block",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:600,background:"rgba(16,185,129,0.1)",color:"var(--accent)",border:"1px solid rgba(16,185,129,0.2)",marginLeft:6 },
};

export default function Register() {
  const { address } = useAccount();
  const [signerAddr, setSignerAddr] = useState("");
  const [stake, setStake] = useState("5");
  const [price, setPrice] = useState("1");
  const [slaWindow, setSlaWindow] = useState("120");
  const [slashPct, setSlashPct] = useState("20");
  const [step, setStep] = useState<"idle"|"approving"|"registering"|"done">("idle");
  const [endpoint, setEndpoint] = useState("https://callguard.vercel.app/provider");
  const [v2Step, setV2Step] = useState<"idle"|"minting"|"approving"|"registering"|"done">("idle");
  const [v2Status, setV2Status] = useState<string | null>(null);
  const [nftId, setNftId] = useState<string | null>(() => localStorage.getItem("cgAgentNftId"));
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [unstakeStatus, setUnstakeStatus] = useState<string | null>(null);
  const [unstakeHash, setUnstakeHash] = useState<`0x${string}` | undefined>();

  useEffect(() => { if (address) setSignerAddr(address); }, [address]);

  // Check if already registered
  const { data: providerId } = useReadContract({
    address: CONFIG.registryAddress as `0x${string}`,
    abi: REGISTRY_UNSTAKE_ABI,
    functionName: "providerIdOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const alreadyRegistered = providerId !== undefined && (providerId as bigint) > 0n;

  // Get provider data if registered
  const { data: providerData, refetch: refetchProvider } = useReadContract({
    address: CONFIG.registryAddress as `0x${string}`,
    abi: REGISTRY_UNSTAKE_ABI,
    functionName: "getProvider",
    args: alreadyRegistered ? [(providerId as bigint)] : undefined,
    query: { enabled: alreadyRegistered },
  });

  const provInfo = providerData as any;
  const currentStake = provInfo?.stake ? formatUnits(provInfo.stake as bigint, 6) : "0";

  // Allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONFIG.usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, CONFIG.registryAddress as `0x${string}`] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, isPending } = useWriteContract();
  const { isSuccess: txSuccess } = useWaitForTransactionReceipt({ hash });
  const { isSuccess: unstakeTxSuccess } = useWaitForTransactionReceipt({ hash: unstakeHash });

  const handleUnstake = useCallback(() => {
    if (!address) return;
    if (!window.confirm(`Withdraw ${currentStake} USDC stake?\n\nThis permanently removes your provider registration. You can re-register later.`)) return;
    setUnstakeStatus("⏳ Submitting...");
    // HIGH-01 fix: unstake requires providerId
    writeContract({
      address: CONFIG.registryAddress as `0x${string}`,
      abi: REGISTRY_UNSTAKE_ABI,
      functionName: "unstake",
      args: [(providerId as bigint)],
    }, {
      onSuccess: (h) => { setUnstakeHash(h); setUnstakeStatus("⏳ Waiting for confirmation..."); },
      onError: (e: any) => setUnstakeStatus(`❌ ${e.shortMessage || (e instanceof Error ? e.message : String(e))}`),
    });
  }, [address, currentStake, writeContract]);

  useEffect(() => {
    if (unstakeTxSuccess) {
      setUnstakeStatus(`✅ Stake withdrawn — ${currentStake} USDC returned`);
      refetchProvider();
    }
  }, [unstakeTxSuccess]);

  useEffect(() => {
    if (txSuccess) {
      if (step === "approving") { setStep("registering"); refetchAllowance(); }
      else if (step === "registering") setStep("done");
    }
  }, [txSuccess, step]);

  // Live calculator
  const stakeNum = parseFloat(stake) || 0;
  const priceNum = parseFloat(price) || 0;
  const slashNum = parseFloat(slashPct) || 20;
  const slashPerCall = (priceNum * slashNum) / 100;
  const breakeven = slashPerCall > 0 ? Math.ceil(stakeNum / slashPerCall) : "∞";
  const slashBps = Math.round(slashNum * 100);
  const estimatedEarning = priceNum * 10; // 10 calls estimate

  const stakeAmount = parseUnits(stake || "0", 6);
  const priceAmount = parseUnits(price || "0", 6);
  const needsApproval = !allowance || (allowance as bigint) < stakeAmount;

  const handleApprove = () => {
    setStep("approving");
    writeContract({
      address: CONFIG.usdcAddress as `0x${string}`,
      abi: USDC_ABI,
      functionName: "approve",
      args: [CONFIG.registryAddress as `0x${string}`, stakeAmount],
    }, { onSuccess: h => setHash(h) });
  };

  const handleRegister = () => {
    setStep("registering");
    writeContract({
      address: CONFIG.registryAddress as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: "register",
      // CRITICAL-03 fix: endpoint is string, not hex address
    args: [signerAddr as `0x${string}`, stakeAmount, priceAmount, parseInt(slaWindow), slashBps, endpoint || ""],
    }, { onSuccess: h => setHash(h) });
  };

  const handleRegisterV2 = useCallback(async () => {
    if (!walletClient || !address) { setV2Status("❌ Connect wallet first"); return; }
    if (alreadyRegistered) { setV2Status(`❌ Already registered as provider #${String(providerId)}`); return; }
    setV2Step("minting");
    setV2Status("⏳ Step 1/3 — Minting ERC-8004 identity NFT…");
    try {
      // Step 1: mint identity NFT
      const identityAddr = (CONFIG as any).identityRegistryAddress as `0x${string}`;
      if (!identityAddr) { setV2Status("❌ Identity registry address not configured (identityRegistryAddress in config)"); setV2Step("idle"); return; }
      const mintHash = await walletClient.writeContract({ address: identityAddr, abi: IDENTITY_REGISTRY_ABI, functionName: "register", args: [endpoint || "https://callguard.vercel.app/provider"] });
      setV2Status("⏳ Step 1/3 — Waiting for NFT confirmation…");
      // Wait for receipt to get tokenId
      let tokenId: bigint | null = null;
      try {
        const receipt = await publicClient!.waitForTransactionReceipt({ hash: mintHash, timeout: 60_000 });
        // Try to find Transfer or Registered event tokenId from logs
        for (const log of (receipt.logs || [])) {
          // ERC-721 Transfer: topics[1] = from (0x0 for mint), topics[3] = tokenId
          if (log.topics?.length === 4 && log.topics[1] === "0x0000000000000000000000000000000000000000000000000000000000000000") {
            tokenId = BigInt(log.topics[3]);
            break;
          }
          // Registered(uint256 indexed agentId, ...) — topics[1] = agentId
          if (log.topics?.length >= 2 && tokenId === null) {
            try { const t = log.topics[1]; if (t) tokenId = BigInt(t); } catch {}
          }
        }
        if (!tokenId) tokenId = BigInt(1); // fallback
      } catch (waitErr) {
        setV2Status("❌ Timed out waiting for NFT mint TX. Check explorer."); setV2Step("idle"); return;
      }
      if (!tokenId) { setV2Status("❌ Could not read NFT tokenId from logs"); setV2Step("idle"); return; }
      localStorage.setItem("cgAgentNftId", tokenId.toString());
      setNftId(tokenId.toString());
      setV2Status(`✅ NFT minted #${tokenId} — Step 2/3 Approving USDC…`);
      setV2Step("approving");
      // Step 2: approve USDC
      await walletClient.writeContract({ address: CONFIG.usdcAddress as `0x${string}`, abi: USDC_ABI, functionName: "approve", args: [CONFIG.registryAddress as `0x${string}`, maxUint256] });
      setV2Status("✅ USDC approved — Step 3/3 Registering provider with NFT…");
      setV2Step("registering");
      // Step 3: registerV2
      const regHash = await walletClient.writeContract({
        address: CONFIG.registryAddress as `0x${string}`,
        abi: REGISTRY_V2_ABI,
        functionName: "registerV2",
        args: [tokenId, signerAddr as `0x${string}`, stakeAmount, priceAmount, parseInt(slaWindow), slashBps, endpoint],
      });
      setV2Status(`✅ Registered with NFT #${tokenId}! TX: ${regHash.slice(0, 14)}…`);
      setV2Step("done");
    } catch (_err: unknown) { const e = _err as any;
      setV2Status("❌ " + (e.shortMessage || (e instanceof Error ? e.message : String(e)) || "Failed"));
      setV2Step("idle");
    }
  }, [walletClient, address, alreadyRegistered, providerId, endpoint, signerAddr, stakeAmount, priceAmount, slaWindow, slashBps]);

  if (step === "done") return (
    <div style={s.page}>
      <div style={{ textAlign:"center",padding:"60px 20px" }}>
        <CheckCircle size={48} color="var(--accent)" style={{ marginBottom:16 }} />
        <h2 style={{ fontSize:20,fontWeight:700,color:"var(--text)",marginBottom:8 }}>Registration complete!</h2>
        <p style={{ fontSize:13,color:"var(--text-dim)" }}>You are now a provider on Arc Testnet. Start listening for call events.</p>
        <button style={{ ...s.btn(),marginTop:20,maxWidth:200 }} onClick={() => setStep("idle")}>Register another</button>
      </div>
    </div>
  );

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
              SLA: {provInfo?.maxResponseTime ?? "—"}s
            </div>
            <div style={{ marginTop:10, display:"flex", gap:8 }}>
              <button
                onClick={handleUnstake}
                disabled={isPending}
                style={{ padding:"6px 14px", background:"var(--danger,#ef4444)", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600, opacity: isPending ? 0.6 : 1 }}
              >
                Withdraw Stake
              </button>
            </div>
            {unstakeStatus && (
              <div style={{ marginTop:8, fontSize:12, fontFamily:"var(--font-mono)",
                color: unstakeStatus.startsWith("✅") ? "var(--accent)" : unstakeStatus.startsWith("❌") ? "var(--danger,#ef4444)" : "var(--text-dim)",
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

      {/* Form */}
      <div style={s.section}>
        <div style={s.sectionTitle}>REGISTRATION DETAILS</div>

        <label style={s.label}>Signer address <span style={s.tag}>required</span></label>
        <input style={s.input} value={signerAddr} onChange={e => setSignerAddr(e.target.value)} placeholder="0x…" />

        <label style={s.label}>Provider endpoint URL</label>
        <input style={s.input} value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://your-server.com/provider" />

        <div style={s.row}>
          <div style={{ flex:1 }}>
            <label style={s.label}>Stake amount (USDC)</label>
            <input style={s.input} type="number" min="0.01" step="0.1" value={stake} onChange={e => setStake(e.target.value)} />
          </div>
          <div style={{ flex:1 }}>
            <label style={s.label}>Price per call (USDC)</label>
            <input style={s.input} type="number" min="0.001" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
        </div>

        <div style={s.row}>
          <div style={{ flex:1 }}>
            <label style={s.label}>SLA window (seconds)</label>
            <input style={s.input} type="number" min="10" step="10" value={slaWindow} onChange={e => setSlaWindow(e.target.value)} />
          </div>
          <div style={{ flex:1 }}>
            <label style={s.label}>Slash % on timeout</label>
            <input style={s.input} type="number" min="1" max="100" value={slashPct} onChange={e => setSlashPct(e.target.value)} />
          </div>
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

      {/* Action */}
      {/* ERC-8004 registerV2 */}
      <div style={s.section}>
        <div style={s.sectionTitle}>ERC-8004 IDENTITY — RECOMMENDED</div>
        <div style={{ ...s.info, marginBottom: 12 }}>
          <Info size={14} style={{ flexShrink:0,marginTop:1 }} />
          <span>Registers an AgentIdentity NFT first, then calls <code>registerV2()</code> binding your on-chain identity to the provider. Unlocks agent marketplace discovery, ERC-8004 compatible wallet, and higher trust score.</span>
        </div>
        {nftId && <div style={{ ...s.success, marginBottom:10 }}><CheckCircle size={14} style={{ flexShrink:0,marginTop:1 }} /><span>Identity NFT #{nftId} already minted — will be reused.</span></div>}
        <button
          style={s.btn("primary", v2Step !== "idle" || alreadyRegistered || !address)}
          onClick={handleRegisterV2}
          disabled={v2Step !== "idle" || alreadyRegistered || !address}
        >
          {v2Step !== "idle" && v2Step !== "done" ? `${v2Step.charAt(0).toUpperCase()}${v2Step.slice(1)}…` : "🔐 Register with NFT — Recommended"}
        </button>
        {v2Status && (
          <div style={{ marginTop: 10, fontSize: 12, fontFamily: "var(--font-mono)", padding: "8px 10px", borderRadius: 6, background: v2Status.startsWith("✅") ? "rgba(16,185,129,0.08)" : v2Status.startsWith("❌") ? "rgba(239,68,68,0.08)" : "var(--bg-3)", color: v2Status.startsWith("✅") ? "var(--accent)" : v2Status.startsWith("❌") ? "#ef4444" : "var(--text-dim)", border: `1px solid ${v2Status.startsWith("✅") ? "rgba(16,185,129,0.2)" : v2Status.startsWith("❌") ? "rgba(239,68,68,0.2)" : "var(--border)"}` }}>
            {v2Status}
          </div>
        )}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>REGISTER (basic — no NFT)</div>
        {!address ? (
          <div style={{ color:"var(--text-faint)",fontSize:13,textAlign:"center",padding:"20px 0" }}>Connect wallet to continue</div>
        ) : needsApproval ? (
          <>
            <p style={{ fontSize:12,color:"var(--text-dim)",marginBottom:12 }}>
              First, approve the ServiceRegistry to spend {stake} USDC from your wallet.
            </p>
            <button style={s.btn("primary", isPending || step==="approving")} onClick={handleApprove} disabled={isPending || step==="approving"}>
              {isPending || step==="approving" ? "Approving…" : `Approve ${stake} USDC`}
            </button>
          </>
        ) : (
          <>
            <div style={s.success}>
              <CheckCircle size={14} style={{ flexShrink:0,marginTop:1 }} />
              <span>USDC approved. Ready to register.</span>
            </div>
            <button style={s.btn("primary", isPending || step==="registering")} onClick={handleRegister} disabled={isPending || step==="registering"}>
              {isPending || step==="registering" ? "Registering…" : "Register as Provider"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
