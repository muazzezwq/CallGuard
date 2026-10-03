import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { useSubgraph } from "../../hooks/useSubgraph";
import { formatUnits, parseUnits } from "viem";
import { useState } from "react";
import { CONFIG, USDC_ABI, PPC_ABI } from "../../lib/config";

export default function Payments() {
  const { address, isConnected } = useAccount();
  const [sendTo, setSendTo] = useState("");
  const [sendAmt, setSendAmt] = useState("");
  const [status, setStatus] = useState("");

  const { data: balanceData } = useReadContract({
    address: CONFIG.usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  const { writeContractAsync } = useWriteContract();

  const { data, loading } = useSubgraph<{calls:any[]}>(address ? `{
    calls(where:{caller:"${address.toLowerCase()}",status:"COMPLETED"} orderBy:completedAt orderDirection:desc first:20){
      id providerId amount completedAt
    }
  }` : "", { skip: !address, pollInterval: 30000 });

  const totalSpent = (data?.calls ?? []).reduce((s:number,c:any)=>s+Number(formatUnits(BigInt(c.amount??0),6)),0);

  const handleSend = async () => {
    if (!isConnected || !sendTo || !sendAmt) return;
    try {
      setStatus("Sending...");
      await writeContractAsync({
        address: CONFIG.usdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: "transfer",
        args: [sendTo as `0x${string}`, parseUnits(sendAmt, 6)],
      });
      setStatus("Sent!");
      setSendTo(""); setSendAmt("");
    } catch(e:any){ setStatus(e.shortMessage ?? e.message); }
  };

  const balance = balanceData ? formatUnits(balanceData as bigint, 6) : "—";

  return (
    <div className="cg-panel">
      <div className="panel-head"><div><h2>Payments</h2><p className="text-dim">USDC balance and transfers</p></div></div>

      <div className="balance-card mb-6">
        <div className="balance-label text-dim text-xs">USDC BALANCE</div>
        <div className="balance-value">{balance} <span className="text-dim" style={{fontSize:20}}>USDC</span></div>
        <div className="balance-meta text-dim text-xs">On Arc Testnet · {totalSpent.toFixed(2)} USDC spent on calls</div>
      </div>

      <div className="cg-card mb-4">
        <div className="card-title mb-3">Send USDC</div>
        <div className="form-group mb-2">
          <label className="form-label">Recipient address</label>
          <input className="cg-input" placeholder="0x..." value={sendTo} onChange={e=>setSendTo(e.target.value)}/>
        </div>
        <div className="form-group mb-3">
          <label className="form-label">Amount (USDC)</label>
          <input className="cg-input" type="number" placeholder="1.00" value={sendAmt} onChange={e=>setSendAmt(e.target.value)}/>
        </div>
        {status && <p className="text-sm mb-2" style={{color:status==="Sent!"?"var(--accent)":"var(--red)"}}>{status}</p>}
        <button className="btn btn-primary" onClick={handleSend} disabled={!sendTo||!sendAmt}>Send →</button>
      </div>

      {loading && <div className="skeleton-row" style={{height:200}}/>}
      {!loading && (data?.calls??[]).length > 0 && (
        <div className="cg-card">
          <div className="card-title mb-3">Recent Payments</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {(data?.calls??[]).map((c:any)=>(
              <div key={c.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                <span className="text-dim text-sm">Provider #{c.providerId}</span>
                <span className="text-sm" style={{color:"var(--red)"}}>−{formatUnits(BigInt(c.amount??0),6)} USDC</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .balance-card{background:linear-gradient(135deg,var(--bg-2),var(--bg-3));border:1px solid var(--border-hi);border-radius:var(--radius-lg);padding:24px;}
        .balance-value{font-size:36px;font-weight:800;font-family:var(--font-display);tabular-nums;margin:8px 0;}
        .skeleton-row{border-radius:var(--radius);background:var(--bg-2);animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}
      `}</style>
    </div>
  );
}
