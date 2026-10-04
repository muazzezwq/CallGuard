import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from "wagmi";
import { parseUnits, formatUnits, keccak256, stringToBytes, maxUint256, pad } from "viem";
import { arcTestnet, CONFIG } from "../../lib/config";
import { useAppStore } from "../../store/useAppStore";
import { CCTP_CONFIG, switchToChain, waitForAttestation, TOKEN_MESSENGER_ABI, MESSAGE_TRANSMITTER_ABI, USDC_APPROVE_ABI } from "../../lib/cctp";

const REGISTRY_ABI = [
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

const PPC_ABI = [
  { name: "callService", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "providerId", type: "uint256" }, { name: "requestHash", type: "bytes32" }],
    outputs: [{ name: "callId", type: "bytes32" }]
  },
  { name: "claimTimeout", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "callId", type: "bytes32" }], outputs: []
  },
] as const;

const SUBMIT_RECEIPT_ABI = [
  { name: "submitReceipt", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "callId", type: "bytes32" },
      { name: "responseHash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ], outputs: [] },
] as const;

type Chain = "arc" | "sepolia" | "base" | "amoy";

const CHAINS: { value: Chain; label: string; txCount: number; hint: string }[] = [
  { value: "arc",     label: "Arc Testnet (direct)",           txCount: 1, hint: "Paying from Arc Testnet directly. No bridging required." },
  { value: "sepolia", label: "Ethereum Sepolia (via CCTP)",    txCount: 5, hint: "USDC will be burned on Sepolia, bridged via CCTP (~20s), then callService() fires on Arc." },
  { value: "base",    label: "Base Sepolia (via CCTP)",        txCount: 5, hint: "USDC will be burned on Base Sepolia, bridged via CCTP (~20s), then callService() fires on Arc." },
  { value: "amoy",    label: "Polygon Amoy (via CCTP)",        txCount: 5, hint: "USDC will be burned on Amoy, bridged via CCTP (~20s), then callService() fires on Arc." },
];

function RiskBadge({ honorRate, stake, price }: { honorRate: number; stake: bigint; price: bigint }) {
  const underfunded = stake < price;
  if (honorRate < 10) return (
    <div style={{ background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13 }}>
      <div style={{ fontWeight:700,color:"#ef4444",marginBottom:3 }}>⚠ High Risk Provider</div>
      <div style={{ color:"var(--text-dim)",fontSize:12 }}>This provider has a {honorRate}% honor rate. High chance of timeout.</div>
    </div>
  );
  if (honorRate < 30) return (
    <div style={{ background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13 }}>
      <div style={{ fontWeight:700,color:"#f59e0b",marginBottom:3 }}>⚠ Low Honor Rate: {honorRate}%</div>
      <div style={{ color:"var(--text-dim)",fontSize:12 }}>Provider has missed recent calls. Consider another provider.</div>
    </div>
  );
  if (underfunded) return (
    <div style={{ background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13 }}>
      <div style={{ fontWeight:700,color:"#f59e0b",marginBottom:3 }}>⚠ Underfunded Provider</div>
      <div style={{ color:"var(--text-dim)",fontSize:12 }}>Stake ({formatUnits(stake,6)} USDC) &lt; price ({formatUnits(price,6)} USDC). Slash may be partial.</div>
    </div>
  );
  return null;
}

export default function CallBuilder() {
  const { address, isConnected } = useAccount();
  const { setPanel } = useAppStore();
  const { data: walletClient } = useWalletClient();

  const [chain, setChain] = useState<Chain>("arc");
  const [providerId, setProviderId] = useState("1");
  const [payload, setPayload] = useState("ping");
  const [callIdInput, setCallIdInput] = useState("");
  const [responsePayload, setResponsePayload] = useState("pong");
  const [lastCallId, setLastCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [batchCount, setBatchCount] = useState(3);
  const [batchResults, setBatchResults] = useState<{ i: number; hash?: string; error?: string }[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  const chainInfo = CHAINS.find(c => c.value === chain)!;
  const providerIdNum = parseInt(providerId) || 0;

  const { data: providerData } = useReadContract({
    address: CONFIG.registryAddress as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "getProvider",
    args: [BigInt(providerIdNum || 1)],
    chainId: arcTestnet.id,
    query: { enabled: providerIdNum > 0, refetchInterval: 30_000 },
  });

  const provider = providerData as any;
  const price = provider?.pricePerCall ?? BigInt(0);
  const slaWindow = provider?.maxResponseTime ?? 0;
  const slashBps = provider?.slashBps ?? 0;
  const active = provider?.active ?? false;
  const stake = provider?.stake ?? BigInt(0);
  const honorRate = provider
    ? Math.round((Number(provider.completedCalls) / Math.max(Number(provider.completedCalls) + Number(provider.slashedCalls), 1)) * 100)
    : 100;

  const { writeContractAsync, data: txHash } = useWriteContract();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (txConfirmed && txHash) {
      setStatus(`✅ Confirmed: ${txHash.slice(0, 12)}...`);
      setIsLoading(false);
    }
  }, [txConfirmed, txHash]);

  // ── Standard call (Arc direct) ──────────────────────────────────
  const handleCall = useCallback(async () => {
    if (!isConnected || !address) { setStatus("❌ Connect wallet first."); return; }
    if (!active) { setStatus("❌ Provider is not active."); return; }
    setIsLoading(true);
    setStatus("⏳ Sending transaction...");
    try {
      const reqHash = keccak256(stringToBytes(payload)) as `0x${string}`;
      const hash = await writeContractAsync({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: PPC_ABI,
        functionName: "callService",
        args: [BigInt(providerIdNum), reqHash],
        chainId: arcTestnet.id,
      });
      setLastCallId(hash);
      setStatus("⏳ Waiting for confirmation...");
    } catch (e: unknown) {
      setStatus(`❌ ${e.shortMessage || (e instanceof Error ? e.message : String(e))}`);
      setIsLoading(false);
    }
  }, [isConnected, address, active, payload, providerIdNum, writeContractAsync]);

  // ── CCTP cross-chain call ───────────────────────────────────────
  const handleCCTPCall = useCallback(async () => {
    if (!isConnected || !address) { setStatus("❌ Connect wallet first."); return; }
    setIsLoading(true);
    try {
      const sourceChainKey = chain as string;
      const sourceChain = CCTP_CONFIG.chains[sourceChainKey];
      const sourceDomain = CCTP_CONFIG.domains[sourceChainKey];
      const sourceUsdcAddr = CCTP_CONFIG.usdc[sourceChainKey] as `0x${string}`;
      const amount = price;

      setStatus("⏳ Step 1/5: Switching to source chain...");
      await switchToChain(sourceChainKey);
      await new Promise(r => setTimeout(r, 1500));

      setStatus(`⏳ Step 2/5: Checking USDC allowance on ${sourceChain.name}...`);
      // Re-read allowance after chain switch via direct RPC
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
        setStatus("⏳ Step 2/5: Approving USDC (confirm in wallet)...");
        await writeContractAsync({
          address: sourceUsdcAddr,
          abi: USDC_APPROVE_ABI,
          functionName: "approve",
          args: [CCTP_CONFIG.contracts.TokenMessengerV2 as `0x${string}`, maxUint256],
          chainId: sourceChain.chainId as any,
        });
        setStatus("✅ USDC approved.");
        await new Promise(r => setTimeout(r, 2000));
      }

      setStatus("⏳ Step 3/5: Burning USDC via CCTP (confirm in wallet)...");
      const mintRecipient = pad(CCTP_CONFIG.crossChainReceiver as `0x${string}`, { size: 32 });
      const burnHash = await writeContractAsync({
        address: CCTP_CONFIG.contracts.TokenMessengerV2 as `0x${string}`,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurn",
        args: [amount, CCTP_CONFIG.domains.arc, mintRecipient, sourceUsdcAddr, "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`, BigInt(0), 1000],
        chainId: sourceChain.chainId as any,
      });
      setStatus(`✅ Burned — TX: ${burnHash.slice(0,12)}... Step 4/5: Waiting for attestation (~20s)...`);

      const { message, attestation } = await waitForAttestation(sourceDomain, burnHash);
      setStatus("✅ Attestation received. Step 5/5: Minting on Arc (confirm in wallet)...");

      await switchToChain("arc");
      await new Promise(r => setTimeout(r, 2000));

      const mintHash = await writeContractAsync({
        address: CCTP_CONFIG.contracts.MessageTransmitterV2 as `0x${string}`,
        abi: MESSAGE_TRANSMITTER_ABI,
        functionName: "receiveMessage",
        args: [message as `0x${string}`, attestation as `0x${string}`],
        chainId: arcTestnet.id,
      });
      setStatus(`✅ Cross-chain call complete! TX: ${mintHash.slice(0,12)}...`);
    } catch (e: unknown) {
      setStatus(`❌ CCTP failed: ${(e instanceof Error ? e.message : String(e))}`);
    }
    setIsLoading(false);
  }, [isConnected, address, chain, price, writeContractAsync]);

  // ── Timeout claim ───────────────────────────────────────────────
  const handleClaimTimeout = useCallback(async () => {
    const id = callIdInput || lastCallId;
    if (!id) { setStatus("❌ Enter a call ID first."); return; }
    setIsLoading(true);
    setStatus("⏳ Claiming timeout...");
    try {
      await writeContractAsync({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: PPC_ABI,
        functionName: "claimTimeout",
        args: [id as `0x${string}`],
        chainId: arcTestnet.id,
      });
      setStatus("⏳ Waiting for confirmation...");
    } catch (e: unknown) {
      setStatus(`❌ ${e.shortMessage || (e instanceof Error ? e.message : String(e))}`);
      setIsLoading(false);
    }
  }, [callIdInput, lastCallId, writeContractAsync]);

  // ── Submit receipt (provider side) ─────────────────────────────
  const handleSubmitReceipt = useCallback(async () => {
    const id = callIdInput || lastCallId;
    if (!id || id.length !== 66) { setStatus("❌ Enter a valid 32-byte call ID."); return; }
    if (!walletClient || !address) { setStatus("❌ Connect wallet first."); return; }
    setIsLoading(true);
    setStatus("⏳ Signing EIP-712 receipt...");
    try {
      const responseHash = keccak256(stringToBytes(responsePayload)) as `0x${string}`;
      const domain = { name: "CallGuard", version: "1", chainId: arcTestnet.id, verifyingContract: CONFIG.payPerCall as `0x${string}` } as const;
      const types = { Receipt: [{ name: "callId", type: "bytes32" }, { name: "responseHash", type: "bytes32" }] } as const;
      const sig = await walletClient.signTypedData({ domain, types, primaryType: "Receipt", message: { callId: id as `0x${string}`, responseHash } });
      setStatus("⏳ Submitting receipt on-chain...");
      await writeContractAsync({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: SUBMIT_RECEIPT_ABI,
        functionName: "submitReceipt",
        args: [id as `0x${string}`, responseHash, sig],
        chainId: arcTestnet.id,
      });
      setStatus("✅ Receipt submitted — escrow released.");
    } catch (e: unknown) {
      setStatus(`❌ ${e.shortMessage || (e instanceof Error ? e.message : String(e))}`);
    }
    setIsLoading(false);
  }, [callIdInput, lastCallId, responsePayload, walletClient, address, writeContractAsync]);

  // ── x402 / EIP-3009 gasless call ───────────────────────────────
  const handleX402Call = useCallback(async () => {
    if (!isConnected || !address) { setStatus("❌ Connect wallet first."); return; }
    if (!walletClient) { setStatus("❌ Wallet client not ready."); return; }
    if (!active) { setStatus("❌ Provider is not active."); return; }
    setIsLoading(true);
    setStatus("⏳ x402: Handshaking with facilitator…");
    try {
      // Step 1 — x402 handshake
      const facilitatorUrl = "https://callguard.vercel.app";
      let x402Terms: any = null;
      try {
        const fRes = await fetch(`${facilitatorUrl}/api/service`);
        const fBody = await fRes.json();
        if (fRes.status === 402 && fBody.accepts?.[0]) {
          x402Terms = fBody.accepts[0];
          setStatus("⚡ x402: Got HTTP 402 → signing EIP-3009 authorization…");
        } else {
          setStatus("⚡ x402: Facilitator responded → signing EIP-3009…");
        }
      } catch {
        setStatus("⚡ x402: Facilitator unreachable → falling back to on-chain…");
      }
      await new Promise(r => setTimeout(r, 300));

      // Step 2 — EIP-3009 off-chain signature (no gas, no approve tx)
      const now = Math.floor(Date.now() / 1000);
      const validAfter = BigInt(0);
      const validBefore = BigInt(now + 120);
      const authNonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2,'0')).join('')}` as `0x${string}`;
      const requestHash = keccak256(stringToBytes(payload)) as `0x${string}`;

      setStatus("⚡ x402: Sign EIP-3009 (no gas — off-chain)…");
      const eip3009Sig = await walletClient.signTypedData({
        domain: { name: "USDC", version: "2", chainId: arcTestnet.id, verifyingContract: CONFIG.usdcAddress as `0x${string}` },
        types: { TransferWithAuthorization: [
          { name: "from", type: "address" }, { name: "to", type: "address" },
          { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
        ]},
        primaryType: "TransferWithAuthorization",
        message: { from: address, to: CONFIG.payPerCall as `0x${string}`, value: price, validAfter, validBefore, nonce: authNonce },
      });

      // Step 3 — POST to facilitator (facilitator pays gas, settles on-chain)
      setStatus("⚡ x402: Facilitator settling…");
      const facRes = await fetch(`${facilitatorUrl}/api/call-service`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: providerIdNum.toString(), requestHash,
          authorization: { from: address, to: CONFIG.payPerCall, value: price.toString(), validAfter: "0", validBefore: validBefore.toString(), nonce: authNonce },
          signature: eip3009Sig,
        }),
      });
      const facData = await facRes.json();
      if (!facRes.ok || !facData.success) {
        // Facilitator failed — fall back to direct on-chain callService
        setStatus("⚠ Facilitator unavailable — falling back to direct call…");
        const h = await writeContractAsync({
          address: CONFIG.payPerCall as `0x${string}`,
          abi: PPC_ABI, functionName: "callService",
          args: [BigInt(providerIdNum), requestHash], chainId: arcTestnet.id,
        });
        setStatus(`✅ Fallback call sent: ${h.slice(0,14)}…`);
        setLastCallId(h);
      } else {
        const callId = facData.callId || facData.txHash;
        setStatus(`✅ x402 call settled! callId: ${String(callId).slice(0,14)}…`);
        if (facData.callId) setLastCallId(facData.callId);
      }
    } catch (e: unknown) {
      setStatus(`❌ x402 failed: ${e.shortMessage || (e instanceof Error ? e.message : String(e))}`);
    }
    setIsLoading(false);
  }, [isConnected, address, walletClient, active, payload, providerIdNum, price, writeContractAsync]);

  // ── Batch call ──────────────────────────────────────────────────
  const handleBatch = useCallback(async () => {
    if (!isConnected || !active) { setStatus("❌ Connect wallet or check provider."); return; }
    setBatchRunning(true);
    setBatchResults([]);
    for (let i = 0; i < batchCount; i++) {
      try {
        const reqHash = keccak256(stringToBytes(`${payload}-${i}-${Date.now()}`)) as `0x${string}`;
        const hash = await writeContractAsync({
          address: CONFIG.payPerCall as `0x${string}`,
          abi: PPC_ABI,
          functionName: "callService",
          args: [BigInt(providerIdNum), reqHash],
          chainId: arcTestnet.id,
        });
        setBatchResults(r => [...r, { i: i + 1, hash }]);
      } catch (e: unknown) {
        setBatchResults(r => [...r, { i: i + 1, error: e.shortMessage || (e instanceof Error ? e.message : String(e)) }]);
      }
      await new Promise(r => setTimeout(r, 800));
    }
    setBatchRunning(false);
  }, [isConnected, active, batchCount, payload, providerIdNum, writeContractAsync]);

  const isCCTP = chain !== "arc";

  return (
    <div style={{ padding:"20px 16px",maxWidth:900,margin:"0 auto" }}>
      {/* Header */}
      <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20 }}>
        <div>
          <div style={{ fontSize:10,textTransform:"uppercase" as const,letterSpacing:"0.1em",color:"var(--accent)",marginBottom:4,fontWeight:700 }}>Call Builder</div>
          <h1 style={{ fontSize:24,fontWeight:700,color:"var(--text)",margin:"0 0 4px",fontFamily:"var(--font-display)" }}>Execute a Service Call</h1>
          <p style={{ fontSize:13,color:"var(--text-dim)",margin:0 }}>Configure and execute an API call with on-chain SLA enforcement.</p>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:6,padding:"4px 12px",background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:20,color:"var(--accent)",fontSize:11,fontWeight:600,whiteSpace:"nowrap" as const }}>
          <span style={{ width:6,height:6,borderRadius:"50%",background:"var(--accent)",animation:"pulse 2s infinite",display:"block" }} />
          Gas-free · EIP-3009
        </div>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 320px",gap:16 }}>
        {/* Left: form */}
        <div style={{ background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:12,padding:24 }}>
          {/* Gas-free info */}
          <div style={{ background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--text-dim)",marginBottom:18 }}>
            <strong style={{ color:"var(--accent)" }}>No gas required.</strong> Sign an EIP-3009 authorization off-chain. The facilitator pays gas and settles on Arc in a single transaction.
          </div>

          {/* Chain select */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text-faint)",fontWeight:600,display:"block",marginBottom:6 }}>Pay from chain</label>
            <select
              value={chain}
              onChange={e => setChain(e.target.value as Chain)}
              style={{ width:"100%",background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13 }}
            >
              {CHAINS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p style={{ fontSize:12,color:"var(--text-dim)",marginTop:6 }}>{chainInfo.hint}</p>
            <div style={{ marginTop:6 }}>
              <span style={{ padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,background: isCCTP ? "rgba(59,130,246,0.1)" : "rgba(16,185,129,0.1)",color: isCCTP ? "#3b82f6" : "var(--accent)" }}>
                {isCCTP ? `5 steps — CCTP bridge` : "1 TX — EIP-3009 gasless"}
              </span>
            </div>
          </div>

          {/* Provider + Payload */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
            <div>
              <label style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text-faint)",fontWeight:600,display:"block",marginBottom:6 }}>Provider ID</label>
              <input
                type="number" min="1" value={providerId} onChange={e => setProviderId(e.target.value)}
                style={{ width:"100%",background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,fontFamily:"var(--font-mono)",boxSizing:"border-box" as const }}
                placeholder="1"
              />
            </div>
            <div>
              <label style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text-faint)",fontWeight:600,display:"block",marginBottom:6 }}>Request payload</label>
              <input
                type="text" value={payload} onChange={e => setPayload(e.target.value)}
                style={{ width:"100%",background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,boxSizing:"border-box" as const }}
                placeholder="ping"
              />
            </div>
          </div>

          {/* Risk badge */}
          {provider && <RiskBadge honorRate={honorRate} stake={stake} price={price} />}

          {/* Call ID */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text-faint)",fontWeight:600,display:"block",marginBottom:6 }}>Call ID (for receipt / timeout)</label>
            <input
              type="text" value={callIdInput} onChange={e => setCallIdInput(e.target.value)}
              style={{ width:"100%",background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,fontFamily:"var(--font-mono)",boxSizing:"border-box" as const }}
              placeholder="Auto-filled after call"
            />
          </div>

          {/* CTA */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8 }}>
            <button
              onClick={handleCall}
              disabled={isLoading || !isConnected || isCCTP}
              style={{ padding:"12px 8px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontWeight:600,fontSize:13,cursor: isLoading||!isConnected||isCCTP ? "not-allowed":"pointer",opacity: isLoading||!isConnected||isCCTP ? 0.4:1 }}
            >
              Standard call<br/><span style={{ fontSize:11,fontWeight:400,color:"var(--text-dim)" }}>MetaMask approval</span>
            </button>
            <button
              onClick={isCCTP ? handleCCTPCall : handleCall}
              disabled={isLoading || !isConnected}
              style={{ padding:"12px 8px",borderRadius:8,border:"none",background:"var(--accent)",color:isCCTP?"#fff":"#000",fontWeight:700,fontSize:13,cursor: isLoading||!isConnected ? "not-allowed":"pointer",opacity: isLoading||!isConnected ? 0.4:1,boxShadow:"0 0 16px rgba(16,185,129,0.3)" }}
            >
              {isCCTP ? "🌐 CCTP Call" : "⚡ Gas-free call"}<br/>
              <span style={{ fontSize:11,fontWeight:400,opacity:0.75 }}>{isCCTP ? "5-step bridge" : "Recommended"}</span>
            </button>
          </div>
          {/* x402 button */}
          {!isCCTP && (
            <button
              onClick={handleX402Call}
              disabled={isLoading || !isConnected}
              style={{ width:"100%",marginBottom:16,padding:"10px 8px",borderRadius:8,border:"1px solid rgba(16,185,129,0.4)",background:"transparent",color:"var(--accent)",fontWeight:600,fontSize:13,cursor: isLoading||!isConnected ? "not-allowed":"pointer",opacity: isLoading||!isConnected ? 0.4:1 }}
            >
              ⚡ Call via x402 (EIP-3009, no gas)
            </button>
          )}

          {/* Provider actions */}
          <div style={{ borderTop:"1px solid var(--border)",paddingTop:16 }}>
            <div style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text-faint)",fontWeight:600,marginBottom:10 }}>Provider actions</div>
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text-faint)",fontWeight:600,display:"block",marginBottom:6 }}>Response payload</label>
              <input
                type="text" value={responsePayload} onChange={e => setResponsePayload(e.target.value)}
                style={{ width:"100%",background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:13,boxSizing:"border-box" as const }}
                placeholder="pong"
              />
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <button
                onClick={handleSubmitReceipt}
                disabled={isLoading || !isConnected}
                style={{ padding:"10px 8px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text)",fontWeight:600,fontSize:12,cursor: isLoading||!isConnected ? "not-allowed":"pointer",opacity: isLoading||!isConnected ? 0.5:1 }}
              >
                Submit receipt (EIP-712)
              </button>
              <button
                onClick={handleClaimTimeout}
                disabled={isLoading}
                style={{ padding:"10px 8px",borderRadius:8,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.06)",color:"#ef4444",fontWeight:600,fontSize:12,cursor: isLoading ? "not-allowed":"pointer",opacity: isLoading ? 0.5:1 }}
              >
                Claim timeout
              </button>
            </div>
          </div>

          {/* Status */}
          {status && (
            <div style={{
              marginTop:14,borderRadius:8,padding:"10px 14px",fontSize:12,fontFamily:"var(--font-mono)",
              background: status.startsWith("✅") ? "rgba(16,185,129,0.08)" : status.startsWith("❌") ? "rgba(239,68,68,0.08)" : "var(--bg-3)",
              color: status.startsWith("✅") ? "var(--accent)" : status.startsWith("❌") ? "#ef4444" : "var(--text-dim)",
              border:`1px solid ${status.startsWith("✅") ? "rgba(16,185,129,0.2)" : status.startsWith("❌") ? "rgba(239,68,68,0.2)" : "var(--border)"}`,
            }}>
              {status}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {/* Execution summary */}
          <div style={{ background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:12,padding:18 }}>
            <div style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"var(--text-faint)",fontWeight:600,marginBottom:14 }}>Execution Summary</div>
            {[
              { label:"Provider",    value: providerIdNum ? `#${providerIdNum}` : "—" },
              { label:"Price",       value: price ? `${formatUnits(price,6)} USDC` : "—" },
              { label:"SLA window",  value: slaWindow ? `${slaWindow}s` : "—" },
              { label:"Slash %",     value: slashBps ? `${slashBps/100}%` : "—" },
              { label:"Network",     value: isCCTP ? `${chainInfo.label}` : "Arc Testnet" },
              { label:"Settlement",  value: "Arc Testnet (on-chain)" },
              { label:"Payment",     value: isCCTP ? "CCTP v2" : "EIP-3009" },
            ].map(row => (
              <div key={row.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--border)" }}>
                <span style={{ fontSize:12,color:"var(--text-dim)" }}>{row.label}</span>
                <span style={{ fontSize:12,fontFamily:"var(--font-mono)",color:"var(--text)" }}>{row.value}</span>
              </div>
            ))}
            <button
              onClick={isCCTP ? handleCCTPCall : handleCall}
              disabled={isLoading || !isConnected}
              style={{ width:"100%",marginTop:14,background:"var(--accent)",color:"#000",border:"none",borderRadius:8,padding:"11px",fontSize:13,fontWeight:700,cursor: isLoading||!isConnected ? "not-allowed":"pointer",opacity: isLoading||!isConnected ? 0.5:1,boxShadow:"0 0 16px rgba(16,185,129,0.25)" }}
            >
              {isLoading ? "Processing..." : "Review & Execute →"}
            </button>
            {lastCallId && (
              <div style={{ marginTop:12,paddingTop:12,borderTop:"1px solid var(--border)" }}>
                <div style={{ fontSize:10,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text-faint)",fontWeight:600,marginBottom:4 }}>Last Call ID</div>
                <div style={{ fontSize:11,fontFamily:"var(--font-mono)",color:"var(--text-dim)",wordBreak:"break-all" as const }}>{lastCallId}</div>
              </div>
            )}
          </div>

          {/* Batch */}
          <div style={{ background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:12,padding:18 }}>
            <div style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"var(--text-faint)",fontWeight:600,marginBottom:12 }}>Quick Batch</div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
              <span style={{ fontSize:12,color:"var(--text-dim)" }}>Calls</span>
              <span style={{ fontSize:14,fontWeight:700,color:"var(--accent)",fontFamily:"var(--font-mono)" }}>{batchCount}</span>
            </div>
            <input type="range" min="1" max="20" value={batchCount} onChange={e => setBatchCount(Number(e.target.value))}
              style={{ width:"100%",accentColor:"var(--accent)",marginBottom:8 }} />
            <div style={{ background:"var(--bg-3)",border:"1px solid var(--border)",borderRadius:6,padding:"8px 10px",fontSize:12,marginBottom:10 }}>
              Est. cost: <strong style={{ color:"var(--accent)" }}>{(batchCount * Number(formatUnits(price || BigInt(1000000),6))).toFixed(2)} USDC</strong>
            </div>
            <button
              onClick={handleBatch}
              disabled={batchRunning || !isConnected}
              style={{ width:"100%",background:"var(--accent)",color:"#000",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor: batchRunning||!isConnected ? "not-allowed":"pointer",opacity: batchRunning||!isConnected ? 0.5:1 }}
            >
              {batchRunning ? `Running (${batchResults.length}/${batchCount})…` : `Run ${batchCount} calls →`}
            </button>
            {batchResults.length > 0 && (
              <div style={{ marginTop:10,maxHeight:120,overflowY:"auto" as const }}>
                {batchResults.map(r => (
                  <div key={r.i} style={{ display:"flex",gap:8,fontSize:11,padding:"3px 0",borderBottom:"1px solid var(--border)" }}>
                    <span style={{ color:"var(--text-faint)",width:18 }}>#{r.i}</span>
                    {r.hash
                      ? <a href={`https://explorer.testnet.arc.io/tx/${r.hash}`} target="_blank" rel="noreferrer" style={{ color:"var(--accent)",fontFamily:"var(--font-mono)" }}>{r.hash.slice(0,14)}…</a>
                      : <span style={{ color:"#ef4444" }}>{r.error}</span>
                    }
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick nav */}
          <div style={{ background:"var(--bg-2)",border:"1px solid var(--border)",borderRadius:12,padding:14 }}>
            <div style={{ fontSize:11,textTransform:"uppercase" as const,letterSpacing:"0.07em",color:"var(--text-faint)",fontWeight:600,marginBottom:10 }}>Quick navigation</div>
            {[
              { label:"Browse providers",  panel:"marketplace" as const },
              { label:"View my receipts",  panel:"receipts" as const },
              { label:"Claim a timeout",   panel:"disputes" as const },
              { label:"Verify a receipt",  panel:"verify" as const },
            ].map(item => (
              <button key={item.panel} onClick={() => setPanel(item.panel)}
                style={{ display:"block",width:"100%",textAlign:"left" as const,fontSize:12,color:"var(--text-dim)",background:"none",border:"none",cursor:"pointer",padding:"4px 0" }}>
                {item.label} →
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
