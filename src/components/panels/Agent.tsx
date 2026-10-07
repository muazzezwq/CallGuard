import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from "wagmi";
import { parseUnits, formatUnits, keccak256, stringToBytes } from "viem";
import { arcTestnet, CONFIG, USDC_ABI } from "../../lib/config";
import { Wallet, Zap, Settings, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

const AGENT_WALLET_ABI = [
  { name: "deposit",          type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "withdraw",         type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "agentCall",        type: "function", stateMutability: "nonpayable", inputs: [{ name: "providerId", type: "uint256" }, { name: "requestHash", type: "bytes32" }, { name: "amount", type: "uint256" }, { name: "extraData", type: "bytes" }], outputs: [{ name: "", type: "bytes32" }] },
  { name: "setDailyLimit",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "limit", type: "uint256" }], outputs: [] },
  { name: "setMaxPerCall",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "max", type: "uint256" }], outputs: [] },
  { name: "addToWhitelist",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "providerId", type: "uint256" }], outputs: [] },
  { name: "removeFromWhitelist", type: "function", stateMutability: "nonpayable", inputs: [{ name: "providerId", type: "uint256" }], outputs: [] },
  { name: "pause",            type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "unpause",          type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "getStats",         type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "tuple", components: [{ name: "balance", type: "uint256" }, { name: "spentToday", type: "uint256" }, { name: "remainingToday", type: "uint256" }, { name: "totalSpent", type: "uint256" }, { name: "totalCalls", type: "uint256" }] }] },
  { name: "paused",           type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { name: "dailyLimit",       type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "maxPerCall",       type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/3.0.0/gn";

const s = {
  page: { padding: "20px 16px", maxWidth: 860, margin: "0 auto" },
  h1: { fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  section: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 },
  sectionTitle: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 12 },
  label: { fontSize: 11, color: "var(--text-dim)", fontWeight: 600, display: "block", marginBottom: 6 },
  input: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" as const },
  btn: (variant = "default", disabled = false) => ({
    padding: "9px 16px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
    background: variant === "primary" ? "linear-gradient(135deg,#10b981,#059669)" : variant === "danger" ? "rgba(239,68,68,0.12)" : "var(--bg-3)",
    color: variant === "primary" ? "#fff" : variant === "danger" ? "#ef4444" : "var(--text)",
    opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6,
  }) as React.CSSProperties,
  stat: { background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", textAlign: "center" as const },
  statVal: { fontSize: 18, fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-display)" },
  statLbl: { fontSize: 10, textTransform: "uppercase" as const, color: "var(--text-faint)", letterSpacing: "0.06em", marginTop: 2 },
  tabs: { display: "flex", gap: 4, marginBottom: 16, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 },
  tab: (active: boolean) => ({ flex: 1, padding: "8px 4px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: active ? "var(--accent)" : "transparent", color: active ? "#fff" : "var(--text-dim)", transition: "all .15s" }) as React.CSSProperties,
};

type Tab = "setup" | "autoroute" | "settings";

export default function Agent() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const [tab, setTab] = useState<Tab>("setup");
  const [agentAddr, setAgentAddr] = useState<string>(() => localStorage.getItem("cg_agent_wallet") || CONFIG.agentWallet);
  const [addrInput, setAddrInput] = useState(localStorage.getItem("cg_agent_wallet") || CONFIG.agentWallet);
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dailyLimit, setDailyLimit] = useState("10");
  const [maxPerCall, setMaxPerCall] = useState("1");
  const [whitelistId, setWhitelistId] = useState("");
  const [autoPayload, setAutoPayload] = useState("ping");
  const [autoMaxPrice, setAutoMaxPrice] = useState("1");
  const [autoResult, setAutoResult] = useState<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);

  // Read agent wallet stats
  const { data: stats, refetch: refetchStats } = useReadContract({
    address: agentAddr as `0x${string}`,
    abi: AGENT_WALLET_ABI,
    functionName: "getStats",
    chainId: arcTestnet.id,
    query: { enabled: !!agentAddr && agentAddr.startsWith("0x") && agentAddr.length === 42, refetchInterval: 15_000 },
  });
  const { data: isPaused, refetch: refetchPaused } = useReadContract({
    address: agentAddr as `0x${string}`,
    abi: AGENT_WALLET_ABI,
    functionName: "paused",
    chainId: arcTestnet.id,
    query: { enabled: !!agentAddr && agentAddr.startsWith("0x") && agentAddr.length === 42, refetchInterval: 15_000 },
  });
  const { data: currentDailyLimit } = useReadContract({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "dailyLimit", chainId: arcTestnet.id, query: { enabled: !!agentAddr && agentAddr.startsWith("0x") && agentAddr.length === 42 } });
  const { data: currentMaxPerCall } = useReadContract({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "maxPerCall", chainId: arcTestnet.id, query: { enabled: !!agentAddr && agentAddr.startsWith("0x") && agentAddr.length === 42 } });

  const st = stats as any;

  const connectAddr = () => {
    if (!addrInput.startsWith("0x") || addrInput.length !== 42) { setStatus("❌ Invalid address"); return; }
    setAgentAddr(addrInput);
    localStorage.setItem("cg_agent_wallet", addrInput);
    setStatus("✅ Agent Wallet connected");
    refetchStats();
  };

  const handleDeposit = useCallback(async () => {
    if (!isConnected || !address) { setStatus("❌ Connect wallet"); return; }
    if (!agentAddr) { setStatus("❌ Set agent wallet address"); return; }
    const amtWei = parseUnits(amount || "0", 6);
    if (amtWei <= 0n) { setStatus("❌ Enter amount"); return; }
    setLoading(true);
    setStatus("⏳ Step 1/2: Approving USDC…");
    try {
      const approveTx = await writeContractAsync({
        address: CONFIG.usdcAddress as `0x${string}`, abi: USDC_ABI,
        functionName: "approve", args: [agentAddr as `0x${string}`, amtWei], chainId: arcTestnet.id,
      });
      setStatus("⏳ Step 2/2: Depositing…");
      await writeContractAsync({
        address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI,
        functionName: "deposit", args: [amtWei], chainId: arcTestnet.id,
      });
      setStatus(`✅ Deposited ${amount} USDC`);
      refetchStats();
    } catch (_err: unknown) { const e = _err as any; setStatus("❌ " + (e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Error")); }
    setLoading(false);
  }, [isConnected, address, agentAddr, amount, writeContractAsync, refetchStats]);

  const handleWithdraw = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    const amtWei = parseUnits(amount || "0", 6);
    setLoading(true);
    setStatus("⏳ Withdrawing…");
    try {
      await writeContractAsync({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "withdraw", args: [amtWei], chainId: arcTestnet.id });
      setStatus(`✅ Withdrawn ${amount} USDC`);
      refetchStats();
    } catch (_err: unknown) { const e = _err as any; setStatus("❌ " + (e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Error")); }
    setLoading(false);
  }, [isConnected, agentAddr, amount, writeContractAsync, refetchStats]);

  const handlePauseToggle = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    setStatus("⏳ Toggling pause…");
    try {
      await writeContractAsync({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: isPaused ? "unpause" : "pause", args: [], chainId: arcTestnet.id });
      setStatus(isPaused ? "✅ Unpaused" : "✅ Paused");
      refetchPaused(); refetchStats();
    } catch (_err: unknown) { const e = _err as any; setStatus("❌ " + (e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Error")); }
    setLoading(false);
  }, [isConnected, agentAddr, isPaused, writeContractAsync, refetchPaused, refetchStats]);

  const handleSetDailyLimit = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    try {
      await writeContractAsync({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "setDailyLimit", args: [parseUnits(dailyLimit || "0", 6)], chainId: arcTestnet.id });
      setStatus(`✅ Daily limit set to ${dailyLimit} USDC/day`);
    } catch (_err: unknown) { const e = _err as any; setStatus("❌ " + (e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Error")); }
    setLoading(false);
  }, [isConnected, agentAddr, dailyLimit, writeContractAsync]);

  const handleSetMaxPerCall = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    try {
      await writeContractAsync({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "setMaxPerCall", args: [parseUnits(maxPerCall || "0", 6)], chainId: arcTestnet.id });
      setStatus(`✅ Max-per-call set to ${maxPerCall} USDC`);
    } catch (_err: unknown) { const e = _err as any; setStatus("❌ " + (e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Error")); }
    setLoading(false);
  }, [isConnected, agentAddr, maxPerCall, writeContractAsync]);

  const handleWhitelist = useCallback(async (add: boolean) => {
    if (!isConnected || !whitelistId) { setStatus("❌ Connect wallet / enter provider ID"); return; }
    setLoading(true);
    try {
      await writeContractAsync({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: add ? "addToWhitelist" : "removeFromWhitelist", args: [BigInt(whitelistId)], chainId: arcTestnet.id });
      setStatus(`✅ Provider #${whitelistId} ${add ? "added to" : "removed from"} whitelist`);
    } catch (_err: unknown) { const e = _err as any; setStatus("❌ " + (e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Error")); }
    setLoading(false);
  }, [isConnected, agentAddr, whitelistId, writeContractAsync]);

  const handleAutoRoute = useCallback(async () => {
    if (!isConnected) { setAutoResult("❌ Connect wallet first"); return; }
    if (!agentAddr) { setAutoResult("❌ Set agent wallet address"); return; }
    setAutoRunning(true);
    setAutoResult("🔍 Querying subgraph for best providers…");
    try {
      const res = await fetch(SUBGRAPH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: `{ providers(first:50,where:{active:true}){ id pricePerCall completedCalls slashedCalls stake } }` }) });
      const data = await res.json();
      const providers = (data.data?.providers ?? []) as Record<string, string>[];
      const maxPrice = parseFloat(autoMaxPrice);
      const scored = providers
        .filter(p => Number(p.pricePerCall) / 1e6 <= maxPrice)
        .map(p => {
          const c = Number(p.completedCalls || 0), sl = Number(p.slashedCalls || 0), t = c + sl;
          const honor = t > 0 ? c / t : 0.66;
          const price = Number(p.pricePerCall) / 1e6;
          const stake = Number(p.stake) / 1e6;
          return { ...p, score: honor * 0.5 + (1 / (price + 0.001)) * 0.2 + Math.min(stake / 1000, 1) * 0.3, price, honor };
        })
        .sort((a, b) => b.score - a.score);
      if (!scored.length) { setAutoResult("No providers found under " + maxPrice + " USDC/call"); setAutoRunning(false); return; }
      const best = scored[0] as any;
      setAutoResult(`✅ Best provider: #${best.id}\nPrice: ${best.price.toFixed(4)} USDC\nHonor rate: ${(best.honor * 100).toFixed(1)}%\nScore: ${best.score.toFixed(3)}\n\n⏳ Sending autonomous call via AgentWallet…`);
      const reqHash = keccak256(stringToBytes(autoPayload)) as `0x${string}`;
      const amount = BigInt(Math.round(best.price * 1e6));
      const txHash = await writeContractAsync({
        address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI,
        functionName: "agentCall", args: [BigInt(best.id), reqHash, amount, "0x"], chainId: arcTestnet.id,
      });
      setAutoResult(`✅ Autonomous call complete!\nProvider: #${best.id} (score: ${best.score.toFixed(2)})\nPaid: ${best.price.toFixed(4)} USDC\nHonor: ${(best.honor * 100).toFixed(1)}%\nTX: ${txHash}`);
      refetchStats();
    } catch (_err: unknown) { const e = _err as any; setAutoResult("❌ " + (e.shortMessage || (e instanceof Error ? e.message : String(e)) || "Unknown error")); }
    setAutoRunning(false);
  }, [isConnected, agentAddr, autoPayload, autoMaxPrice, writeContractAsync, refetchStats]);

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Agent Wallet</h1>
      <p style={s.sub}>Autonomous USDC spending wallet with daily limits, per-call caps, and whitelist enforcement.</p>

      {/* Stats */}
      {st && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
          {[
            ["Balance", formatUnits(BigInt(st.balance ?? 0), 6) + " USDC"],
            ["Spent Today", formatUnits(BigInt(st.spentToday ?? 0), 6) + " USDC"],
            ["Total Calls", String(st.totalCalls ?? 0)],
          ].map(([l, v]) => (
            <div key={l} style={s.stat}>
              <div style={s.statVal}>{v}</div>
              <div style={s.statLbl}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Status */}
      {status && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: status.startsWith("✅") ? "rgba(16,185,129,0.08)" : status.startsWith("❌") ? "rgba(239,68,68,0.08)" : "var(--bg-2)", border: `1px solid ${status.startsWith("✅") ? "rgba(16,185,129,0.2)" : status.startsWith("❌") ? "rgba(239,68,68,0.2)" : "var(--border)"}`, fontSize: 12, fontFamily: "var(--font-mono)", color: status.startsWith("✅") ? "var(--accent)" : status.startsWith("❌") ? "#ef4444" : "var(--text-dim)" }}>
          {status}
        </div>
      )}

      {/* Tabs */}
      <div style={s.tabs}>
        {(["setup", "autoroute", "settings"] as Tab[]).map(t => (
          <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
            {t === "setup" ? "💳 Setup" : t === "autoroute" ? "⚡ Auto-Route" : "⚙ Settings"}
          </button>
        ))}
      </div>

      {/* Setup tab */}
      {tab === "setup" && (
        <>
          <div style={s.section}>
            <div style={s.sectionTitle}>AGENT WALLET ADDRESS</div>
            <label style={s.label}>Agent Wallet Contract</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...s.input, flex: 1 }} value={addrInput} onChange={e => setAddrInput(e.target.value)} placeholder="0x…" />
              <button style={s.btn("primary")} onClick={connectAddr}>Connect</button>
            </div>
            {agentAddr && (
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                Connected: {agentAddr.slice(0, 12)}…{agentAddr.slice(-6)}
                {isPaused !== undefined && (
                  <span style={{ marginLeft: 10, color: isPaused ? "#ef4444" : "var(--accent)", fontWeight: 600 }}>
                    {isPaused ? "⏸ PAUSED" : "▶ ACTIVE"}
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>DEPOSIT / WITHDRAW</div>
            <label style={s.label}>Amount (USDC)</label>
            <input style={s.input} type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1.0" />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button style={s.btn("primary", loading || !isConnected)} onClick={handleDeposit} disabled={loading || !isConnected}>
                {loading ? "⏳" : "Deposit"}
              </button>
              <button style={s.btn("default", loading || !isConnected)} onClick={handleWithdraw} disabled={loading || !isConnected}>
                {loading ? "⏳" : "Withdraw"}
              </button>
              <button style={s.btn("danger", loading || !isConnected)} onClick={handlePauseToggle} disabled={loading || !isConnected}>
                {isPaused ? "▶ Unpause" : "⏸ Pause"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Auto-route tab */}
      {tab === "autoroute" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>AUTONOMOUS CALL — AUTO-ROUTER</div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Agent scores providers by honor rate, price, and stake. Picks the best and calls autonomously.
          </p>
          <label style={s.label}>Request payload</label>
          <input style={s.input} value={autoPayload} onChange={e => setAutoPayload(e.target.value)} placeholder="ping" />
          <label style={{ ...s.label, marginTop: 10 }}>Max price per call (USDC)</label>
          <input style={s.input} type="number" min="0.001" step="0.01" value={autoMaxPrice} onChange={e => setAutoMaxPrice(e.target.value)} />
          <button
            style={{ ...s.btn("primary", autoRunning || !isConnected), marginTop: 12, width: "100%" }}
            onClick={handleAutoRoute}
            disabled={autoRunning || !isConnected}
          >
            {autoRunning ? "⏳ Routing…" : "⚡ Auto-route & call"}
          </button>
          {autoResult && (
            <pre style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-3)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {autoResult}
            </pre>
          )}
        </div>
      )}

      {/* Settings tab */}
      {tab === "settings" && (
        <>
          <div style={s.section}>
            <div style={s.sectionTitle}>SPENDING LIMITS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={s.label}>Daily limit (USDC){currentDailyLimit ? ` · current: ${formatUnits(currentDailyLimit as bigint, 6)}` : ""}</label>
                <input style={s.input} type="number" min="0" step="1" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} />
                <button style={{ ...s.btn("primary", loading || !isConnected), marginTop: 8 }} onClick={handleSetDailyLimit} disabled={loading || !isConnected}>Set</button>
              </div>
              <div>
                <label style={s.label}>Max per call (USDC){currentMaxPerCall ? ` · current: ${formatUnits(currentMaxPerCall as bigint, 6)}` : ""}</label>
                <input style={s.input} type="number" min="0" step="0.1" value={maxPerCall} onChange={e => setMaxPerCall(e.target.value)} />
                <button style={{ ...s.btn("primary", loading || !isConnected), marginTop: 8 }} onClick={handleSetMaxPerCall} disabled={loading || !isConnected}>Set</button>
              </div>
            </div>
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>PROVIDER WHITELIST</div>
            <label style={s.label}>Provider ID</label>
            <input style={s.input} type="number" min="1" value={whitelistId} onChange={e => setWhitelistId(e.target.value)} placeholder="1" />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={s.btn("primary", loading || !isConnected)} onClick={() => handleWhitelist(true)} disabled={loading || !isConnected}>Add to whitelist</button>
              <button style={s.btn("danger", loading || !isConnected)} onClick={() => handleWhitelist(false)} disabled={loading || !isConnected}>Remove</button>
            </div>
          </div>
        </>
      )}

      {!isConnected && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-faint)", fontSize: 13 }}>Connect wallet to interact</div>
      )}
    </div>
  );
}
