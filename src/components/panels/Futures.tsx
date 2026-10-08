import { useState, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { arcTestnet, CONFIG, USDC_ABI } from "../../lib/config";
import { Package, ShoppingCart, Flame, RefreshCw } from "lucide-react";

const FUTURES_ADDR = CONFIG.slaFuturesAddress;
const ARCSCAN = "https://explorer.testnet.arc.io";

const FUTURES_ABI = [
  { name: "mintCapacity",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "providerId", type: "uint256" }, { name: "pricePerCall", type: "uint256" }, { name: "totalSlots", type: "uint256" }, { name: "deadline", type: "uint64" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "buySlots",      type: "function", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "burnSlot",      type: "function", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint256" }], outputs: [] },
  { name: "cancelBatch",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint256" }], outputs: [] },
  { name: "claimRefund",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint256" }], outputs: [] },
  { name: "batchCount",    type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "batches",       type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "providerId", type: "uint256" }, { name: "pricePerCall", type: "uint256" }, { name: "totalSlots", type: "uint256" }, { name: "soldSlots", type: "uint256" }, { name: "usedSlots", type: "uint256" }, { name: "deadline", type: "uint64" }, { name: "active", type: "bool" }, { name: "provider", type: "address" }] }] },
  { name: "purchased",       type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint256" }, { name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  // HLB-02: provider pull settlement
  { name: "providerClaimable", type: "function", stateMutability: "view", inputs: [{ name: "batchId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "claimProceeds",     type: "function", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint256" }], outputs: [] },
] as const;

const s = {
  page: { padding: "20px 16px", maxWidth: 860, margin: "0 auto" },
  h1: { fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  tabs: { display: "flex", gap: 4, marginBottom: 16, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 },
  tab: (a: boolean) => ({ flex: 1, padding: "8px 4px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: a ? "var(--accent)" : "transparent", color: a ? "#fff" : "var(--text-dim)", transition: "all .15s" }) as React.CSSProperties,
  section: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 },
  sectionTitle: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 12 },
  label: { fontSize: 11, color: "var(--text-dim)", fontWeight: 600, display: "block", marginBottom: 6 },
  input: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" as const },
  btn: (v = "default", d = false) => ({ padding: "9px 16px", borderRadius: 8, border: "none", cursor: d ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, background: v === "primary" ? "linear-gradient(135deg,#10b981,#059669)" : "var(--bg-3)", color: v === "primary" ? "#fff" : "var(--text)", opacity: d ? 0.5 : 1 }) as React.CSSProperties,
};

type Tab = "browse" | "myslots" | "mint";

export default function Futures() {
  const { address, isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("browse");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mint form
  const [mintPid, setMintPid] = useState("1");
  const [mintPrice, setMintPrice] = useState("0.5");
  const [mintSlots, setMintSlots] = useState("100");
  const [mintDeadline, setMintDeadline] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  // Buy form
  const [buyBatchId, setBuyBatchId] = useState("1");
  const [buyAmount, setBuyAmount] = useState("1");
  const [burnBatchId, setBurnBatchId] = useState("1");
  const [cancelBatchId, setCancelBatchId] = useState("1");
  // HIGH-09: claimProceeds
  const [claimBatchId, setClaimBatchId] = useState("1");

  const { writeContractAsync } = useWriteContract();
  const { data: batchCount, refetch: refetchCount } = useReadContract({ address: FUTURES_ADDR, abi: FUTURES_ABI, functionName: "batchCount", chainId: arcTestnet.id, query: { refetchInterval: 30_000 } });

  const handleMint = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    setStatus("⏳ Minting capacity batch…");
    try {
      const priceWei = parseUnits(mintPrice || "0", 6);
      const deadline = BigInt(Math.floor(new Date(mintDeadline).getTime() / 1000));
      const txHash = await writeContractAsync({
        address: FUTURES_ADDR, abi: FUTURES_ABI,
        functionName: "mintCapacity",
        args: [BigInt(mintPid), priceWei, BigInt(mintSlots), deadline],
        chainId: arcTestnet.id,
      });
      setStatus(`✅ Capacity batch minted! TX: ${txHash.slice(0, 14)}…`);
      refetchCount();
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, mintPid, mintPrice, mintSlots, mintDeadline, writeContractAsync, refetchCount]);

  const handleBuySlots = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    setStatus("⏳ Buying slots…");
    try {
      const txHash = await writeContractAsync({
        address: FUTURES_ADDR, abi: FUTURES_ABI,
        functionName: "buySlots",
        args: [BigInt(buyBatchId), BigInt(buyAmount)],
        chainId: arcTestnet.id,
      });
      setStatus(`✅ Bought ${buyAmount} slot(s) from batch #${buyBatchId}! TX: ${txHash.slice(0, 14)}…`);
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, buyBatchId, buyAmount, writeContractAsync]);

  const handleBurnSlot = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    setStatus("⏳ Burning slot to call provider…");
    try {
      const txHash = await writeContractAsync({ address: FUTURES_ADDR, abi: FUTURES_ABI, functionName: "burnSlot", args: [BigInt(burnBatchId)], chainId: arcTestnet.id });
      setStatus(`✅ Slot burned (provider called) — TX: ${txHash.slice(0, 14)}…`);
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, burnBatchId, writeContractAsync]);

  // HIGH-09: provider claims proceeds from sold slots (pull settlement)
  const handleClaimProceeds = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    try {
      const txHash = await writeContractAsync({ address: FUTURES_ADDR, abi: FUTURES_ABI, functionName: "claimProceeds", args: [BigInt(claimBatchId)], chainId: arcTestnet.id });
      setStatus(`✅ Proceeds claimed for batch #${claimBatchId}! TX: ${txHash.slice(0, 14)}…`);
    } catch (e: unknown) { setStatus("❌ " + (e instanceof Error ? e.message : String(e))); }
    setLoading(false);
  }, [isConnected, claimBatchId, writeContractAsync]);

  const handleCancel = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    try {
      const txHash = await writeContractAsync({ address: FUTURES_ADDR, abi: FUTURES_ABI, functionName: "cancelBatch", args: [BigInt(cancelBatchId)], chainId: arcTestnet.id });
      setStatus(`✅ Batch #${cancelBatchId} cancelled — TX: ${txHash.slice(0, 14)}…`);
      refetchCount();
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, cancelBatchId, writeContractAsync, refetchCount]);

  const count = batchCount ? Number(batchCount) : 0;

  return (
    <div style={s.page}>
      <h1 style={s.h1}>SLA Futures</h1>
      <p style={s.sub}>Providers tokenize future capacity as ERC-1155 slots. Callers reserve priority calls. Slots trade on secondary markets.</p>

      {status && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: status.startsWith("✅") ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${status.startsWith("✅") ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`, fontSize: 12, fontFamily: "var(--font-mono)", color: status.startsWith("✅") ? "var(--accent)" : "#ef4444" }}>
          {status}
        </div>
      )}

      <div style={s.tabs}>
        {(["browse", "myslots", "mint"] as Tab[]).map(t => (
          <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
            {t === "browse" ? "📦 Browse" : t === "myslots" ? "🎫 My Slots" : "⚒ Mint"}
          </button>
        ))}
      </div>

      {/* Browse */}
      {tab === "browse" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>ACTIVE CAPACITY BATCHES ({count} total)</div>
          {count === 0 ? (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--text-faint)", fontSize: 12 }}>No batches yet — providers can mint capacity batches.</div>
          ) : (
            Array.from({ length: Math.min(count, 10) }, (_, i) => i + 1).map(id => (
              <BatchCard key={id} batchId={id} />
            ))
          )}

          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={{ ...s.sectionTitle, marginBottom: 10 }}>BUY SLOTS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={s.label}>Batch ID</label>
                <input style={s.input} type="number" min="1" value={buyBatchId} onChange={e => setBuyBatchId(e.target.value)} />
              </div>
              <div>
                <label style={s.label}>Amount</label>
                <input style={s.input} type="number" min="1" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} />
              </div>
            </div>
            <button style={{ ...s.btn("primary", loading || !isConnected), marginTop: 10 }} onClick={handleBuySlots} disabled={loading || !isConnected}>
              🛒 Buy {buyAmount} slot(s)
            </button>
          </div>
        </div>
      )}

      {/* My Slots */}
      {tab === "myslots" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>BURN SLOT — USE PRIORITY CALL</div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>Burn a slot to call the provider at the pre-agreed price, bypassing queue.</p>
          <label style={s.label}>Batch ID</label>
          <input style={s.input} type="number" min="1" value={burnBatchId} onChange={e => setBurnBatchId(e.target.value)} />
          <button style={{ ...s.btn("primary", loading || !isConnected), marginTop: 10 }} onClick={handleBurnSlot} disabled={loading || !isConnected}>
            <Flame size={14} /> Burn slot & call
          </button>
        </div>
      )}

      {/* Mint */}
      {tab === "mint" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>MINT CAPACITY BATCH (providers only)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Your Provider ID</label>
              <input style={s.input} type="number" min="1" value={mintPid} onChange={e => setMintPid(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Price per call (USDC)</label>
              <input style={s.input} type="number" min="0.001" step="0.01" value={mintPrice} onChange={e => setMintPrice(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Total slots</label>
              <input style={s.input} type="number" min="1" value={mintSlots} onChange={e => setMintSlots(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Deadline</label>
              <input style={{ ...s.input, fontFamily: "var(--font-sans)" }} type="date" value={mintDeadline} onChange={e => setMintDeadline(e.target.value)} />
            </div>
          </div>
          <button style={{ ...s.btn("primary", loading || !isConnected), width: "100%" }} onClick={handleMint} disabled={loading || !isConnected}>
            <Package size={14} /> Mint capacity batch
          </button>

          <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={s.sectionTitle}>CLAIM PROCEEDS (provider)</div>
            <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>Claim your USDC from sold slots. Funds are held in escrow until you claim.</p>
            <label style={s.label}>Batch ID</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...s.input, flex: 1 }} type="number" min="1" value={claimBatchId} onChange={e => setClaimBatchId(e.target.value)} />
              <button style={s.btn("primary", loading || !isConnected)} onClick={handleClaimProceeds} disabled={loading || !isConnected}>Claim</button>
            </div>
          </div>

          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={s.sectionTitle}>CANCEL BATCH</div>
            <label style={s.label}>Batch ID</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...s.input, flex: 1 }} type="number" min="1" value={cancelBatchId} onChange={e => setCancelBatchId(e.target.value)} />
              <button style={s.btn("default", loading || !isConnected)} onClick={handleCancel} disabled={loading || !isConnected}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BatchCard({ batchId }: { batchId: number }) {
  const { data } = useReadContract({ address: FUTURES_ADDR, abi: FUTURES_ABI, functionName: "batches", args: [BigInt(batchId)], chainId: arcTestnet.id, query: { refetchInterval: 30_000 } });
  const b = data as any;
  if (!b) return <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "8px 0" }}>Loading batch #{batchId}…</div>;
  const price = (Number(b.pricePerCall) / 1e6).toFixed(4);
  const deadline = new Date(Number(b.deadline) * 1000).toLocaleDateString();
  const fill = b.totalSlots > 0 ? Math.round((Number(b.soldSlots) / Number(b.totalSlots)) * 100) : 0;
  return (
    <div style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Batch #{batchId} · Provider #{String(b.providerId)}</span>
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: b.active ? "rgba(16,185,129,0.15)" : "rgba(100,100,100,0.15)", color: b.active ? "var(--accent)" : "var(--text-faint)" }}>
          {b.active ? "Active" : "Closed"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
        <div>Price: <strong style={{ color: "var(--text)" }}>{price} USDC</strong></div>
        <div>Slots: <strong style={{ color: "var(--text)" }}>{String(b.soldSlots)}/{String(b.totalSlots)}</strong></div>
        <div>Deadline: <strong style={{ color: "var(--text)" }}>{deadline}</strong></div>
      </div>
      <div style={{ marginTop: 8, height: 4, background: "var(--bg-2)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${fill}%`, background: fill > 80 ? "#ef4444" : "var(--accent)", borderRadius: 2, transition: "width .3s" }} />
      </div>
    </div>
  );
}
