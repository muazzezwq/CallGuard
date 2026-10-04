import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { CONFIG, USDC_ABI, REGISTRY_ABI } from "../../lib/config";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";

const REGISTRY_UNSTAKE_ABI = [
  { name: "unstake", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "providerIdOf", type: "function", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "getProvider", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "owner", type: "address" }, { name: "signer", type: "address" },
      { name: "stake", type: "uint256" }, { name: "pricePerCall", type: "uint256" },
      { name: "maxResponseTime", type: "uint32" }, { name: "slashBps", type: "uint32" },
      { name: "active", type: "bool" }, { name: "metadataUri", type: "string" },
      { name: "completedCalls", type: "uint256" }, { name: "slashedCalls", type: "uint256" },
    ]}]
  },
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
    writeContract({
      address: CONFIG.registryAddress as `0x${string}`,
      abi: REGISTRY_UNSTAKE_ABI,
      functionName: "unstake",
      args: [],
    }, {
      onSuccess: (h) => { setUnstakeHash(h); setUnstakeStatus("⏳ Waiting for confirmation..."); },
      onError: (e: any) => setUnstakeStatus(`❌ ${e.shortMessage || e.message}`),
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
      args: [signerAddr as `0x${string}`, stakeAmount, priceAmount, parseInt(slaWindow), slashBps],
    }, { onSuccess: h => setHash(h) });
  };

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
      <div style={s.section}>
        <div style={s.sectionTitle}>REGISTER</div>
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
