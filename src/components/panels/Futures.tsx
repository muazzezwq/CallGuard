import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { CONFIG, SLA_FUTURES_ABI, USDC_ABI } from "../../lib/config";

export default function Futures() {
  const { address } = useAccount();
  const [tab, setTab] = useState<"browse"|"mint"|"redeem">("browse");
  const [batchId, setBatchId] = useState("1");
  const [callCount, setCallCount] = useState("100");
  const [price, setPrice] = useState("1");
  const [deadline, setDeadline] = useState("30");
  const [redeemBatch, setRedeemBatch] = useState("1");
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState("");

  const { data: nextBatchId } = useReadContract({ address: CONFIG.slaFutures as `0x${string}`, abi: SLA_FUTURES_ABI, functionName: "nextBatchId" });
  const { data: batchData } = useReadContract({ address: CONFIG.slaFutures as `0x${string}`, abi: SLA_FUTURES_ABI, functionName: "batches", args: [BigInt(batchId || 1)], query: { enabled: !!batchId } });

  const { writeContractAsync } = useWriteContract();
  const total = nextBatchId ? Number(nextBatchId) : 0;

  const mintBatch = async () => {
    setBusy(true);
    try {
      const deadlineTs = BigInt(Math.floor(Date.now()/1000) + Number(deadline)*24*3600);
      const hash = await writeContractAsync({
        address: CONFIG.slaFutures as `0x${string}`,
        abi: SLA_FUTURES_ABI,
        functionName: "mintCapacity",
        args: [BigInt(callCount), parseUnits(price, 6), deadlineTs],
      });
      setTxHash(hash);
    } catch (e: any) { alert(e.shortMessage || e.message); }
    setBusy(false);
  };

  const redeemFuture = async () => {
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: CONFIG.slaFutures as `0x${string}`,
        abi: SLA_FUTURES_ABI,
        functionName: "redeem",
        args: [BigInt(redeemBatch), BigInt(1)],
      });
      setTxHash(hash);
    } catch (e: any) { alert(e.shortMessage || e.message); }
    setBusy(false);
  };

  const batch = batchData as any;

  return (
    <div className="panel-body">
      <div className="panel-head">
        <h2>SLA Futures</h2>
        <p className="panel-sub">Providers tokenize future capacity as ERC-1155 NFTs. Callers reserve priority slots. NFTs trade on secondary markets.</p>
      </div>
      <div className="stat-grid" style={{gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        <div className="stat-card"><div className="stat-label">TOTAL BATCHES</div><div className="stat-val">{total}</div></div>
        <div className="stat-card"><div className="stat-label">CONTRACT</div><div className="stat-val" style={{fontSize:11,fontFamily:"var(--font-mono)"}}>{CONFIG.slaFutures.slice(0,10)}...</div></div>
      </div>
      {total === 0 && (
        <div className="info-box" style={{marginBottom:16,borderColor:"var(--amber)"}}>
          <strong>No capacity batches yet.</strong> Be the first provider to mint future call capacity and earn upfront!
        </div>
      )}
      <div className="tab-bar" style={{marginBottom:16}}>
        {(["browse","mint","redeem"] as const).map(t => (
          <button key={t} className={`tab-btn${tab===t?" active":""}`} onClick={()=>setTab(t)} style={{textTransform:"capitalize"}}>{t}</button>
        ))}
      </div>
      {tab === "browse" && (
        <div className="action-card">
          <div className="action-title">Browse Batch</div>
          <label className="input-label">Batch ID</label>
          <input className="input-field" type="number" value={batchId} onChange={e=>setBatchId(e.target.value)} min="1" style={{marginBottom:12}} />
          {batch && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div className="stat-card"><div className="stat-label">CALL COUNT</div><div className="stat-val">{Number(batch.callCount)}</div></div>
              <div className="stat-card"><div className="stat-label">PRICE</div><div className="stat-val">{Number(formatUnits(batch.price,6)).toFixed(2)} USDC</div></div>
              <div className="stat-card"><div className="stat-label">REDEEMED</div><div className="stat-val">{Number(batch.redeemed)}</div></div>
              <div className="stat-card"><div className="stat-label">DEADLINE</div><div className="stat-val" style={{fontSize:11}}>{new Date(Number(batch.deadline)*1000).toLocaleDateString()}</div></div>
            </div>
          )}
        </div>
      )}
      {tab === "mint" && (
        <div className="action-card">
          <div className="action-title">Mint Capacity Batch</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><label className="input-label">Call count</label><input className="input-field" type="number" value={callCount} onChange={e=>setCallCount(e.target.value)} /></div>
            <div><label className="input-label">Price/call (USDC)</label><input className="input-field" type="number" value={price} onChange={e=>setPrice(e.target.value)} /></div>
            <div><label className="input-label">Deadline (days)</label><input className="input-field" type="number" value={deadline} onChange={e=>setDeadline(e.target.value)} /></div>
          </div>
          <button className="btn-primary" onClick={mintBatch} disabled={busy || !address}>{busy ? "Minting..." : "Mint Capacity"}</button>
          {txHash && <div className="success-box" style={{marginTop:8}}>✓ <a href={CONFIG.explorerTx(txHash)} target="_blank" rel="noreferrer" style={{color:"var(--accent)"}}>View TX</a></div>}
        </div>
      )}
      {tab === "redeem" && (
        <div className="action-card">
          <div className="action-title">Redeem Future Token</div>
          <label className="input-label">Batch ID</label>
          <input className="input-field" type="number" value={redeemBatch} onChange={e=>setRedeemBatch(e.target.value)} style={{marginBottom:12}} />
          <button className="btn-primary" onClick={redeemFuture} disabled={busy || !address}>{busy ? "Redeeming..." : "Redeem"}</button>
          {txHash && <div className="success-box" style={{marginTop:8}}>✓ <a href={CONFIG.explorerTx(txHash)} target="_blank" rel="noreferrer" style={{color:"var(--accent)"}}>View TX</a></div>}
        </div>
      )}
    </div>
  );
}
