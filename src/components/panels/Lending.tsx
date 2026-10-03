import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { CONFIG, REPUTATION_LOAN_ABI, USDC_ABI } from "../../lib/config";

export default function Lending() {
  const { address } = useAccount();
  const [amount, setAmount] = useState("50");
  const [tab, setTab] = useState<"borrow"|"deposit"|"repay">("borrow");
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: totalShares } = useReadContract({ address: CONFIG.reputationLoan as `0x${string}`, abi: REPUTATION_LOAN_ABI, functionName: "totalShares" });

  const { writeContractAsync } = useWriteContract();

  const execute = async () => {
    setBusy(true);
    try {
      let hash: `0x${string}`;
      const amt = parseUnits(amount, 6);
      if (tab === "borrow") {
        hash = await writeContractAsync({ address: CONFIG.reputationLoan as `0x${string}`, abi: REPUTATION_LOAN_ABI, functionName: "borrow", args: [amt] });
      } else if (tab === "deposit") {
        await writeContractAsync({ address: CONFIG.usdcAddress, abi: USDC_ABI, functionName: "approve", args: [CONFIG.reputationLoan as `0x${string}`, amt] });
        hash = await writeContractAsync({ address: CONFIG.reputationLoan as `0x${string}`, abi: REPUTATION_LOAN_ABI, functionName: "deposit", args: [amt] });
      } else {
        await writeContractAsync({ address: CONFIG.usdcAddress, abi: USDC_ABI, functionName: "approve", args: [CONFIG.reputationLoan as `0x${string}`, amt] });
        hash = await writeContractAsync({ address: CONFIG.reputationLoan as `0x${string}`, abi: REPUTATION_LOAN_ABI, functionName: "repay", args: [amt] });
      }
      setTxHash(hash!);
    } catch (e: any) { alert(e.shortMessage || e.message); }
    setBusy(false);
  };

  const pool = totalShares ? Number(formatUnits(totalShares as bigint, 6)).toFixed(2) : "0.00";

  return (
    <div className="panel-body">
      <div className="panel-head">
        <h2>RepFi Lending</h2>
        <p className="panel-sub">Honor rate &gt; 90%? Borrow USDC stake from the reputation pool. DeFi meets SLA enforcement.</p>
      </div>
      <div className="stat-grid" style={{gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        <div className="stat-card"><div className="stat-label">POOL SIZE</div><div className="stat-val">{pool} <span style={{fontSize:12}}>USDC</span></div></div>
        <div className="stat-card"><div className="stat-label">MIN HONOR RATE</div><div className="stat-val">90%</div></div>
        <div className="stat-card"><div className="stat-label">APY (LENDERS)</div><div className="stat-val">~8%</div></div>
      </div>
      <div className="tab-bar" style={{marginBottom:16}}>
        {(["borrow","deposit","repay"] as const).map(t => (
          <button key={t} className={`tab-btn${tab===t?" active":""}`} onClick={()=>setTab(t)} style={{textTransform:"capitalize"}}>{t}</button>
        ))}
      </div>
      <div className="action-card">
        <div className="action-title">{tab === "borrow" ? "Borrow stake from pool" : tab === "deposit" ? "Deposit to pool (earn APY)" : "Repay loan"}</div>
        {tab === "borrow" && <div className="info-box" style={{marginBottom:12}}>Requires honor rate &gt; 90% and 10+ completed calls. Slashed first if you miss SLA.</div>}
        <label className="input-label">Amount (USDC)</label>
        <input className="input-field" type="number" value={amount} onChange={e=>setAmount(e.target.value)} min="1" step="1" style={{marginBottom:12}} />
        <button className="btn-primary" onClick={execute} disabled={busy || !address}>{busy ? "Processing..." : tab === "borrow" ? "Borrow" : tab === "deposit" ? "Deposit" : "Repay"}</button>
        {txHash && <div className="success-box" style={{marginTop:8}}>✓ TX: <a href={CONFIG.explorerTx(txHash)} target="_blank" rel="noreferrer" style={{color:"var(--accent)"}}>{txHash.slice(0,16)}...</a></div>}
      </div>
    </div>
  );
}
