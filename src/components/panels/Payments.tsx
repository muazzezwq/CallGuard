import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { useSubgraph } from "../../hooks/useSubgraph";
import { formatUnits, parseUnits } from "viem";
import { useState } from "react";
import { CONFIG, USDC_ABI, PPC_ABI, arcTestnet } from "../../lib/config";
import { friendlyError } from "../../lib/utils";
import {
  checkPaymentStart, recordSubmittedTx, resolvePendingTx, beginOperation, endOperation,
} from "../../lib/paymentGate";

/** Accessing `sessionStorage` itself can throw in restricted browser modes. */
function payStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

type PayCall = { id: string; providerId?: string | number; amount?: string; completedAt?: string };

export default function Payments() {
  const { address, isConnected } = useAccount();
  const [sendTo, setSendTo] = useState("");
  const [sendAmt, setSendAmt] = useState("");
  const [status, setStatus] = useState("");

  const { data: balanceData } = useReadContract({
    address: CONFIG.usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  // CRITICAL-06: claimable balance from PayPerCall pull settlement model
  const { data: claimableData, refetch: refetchClaimable } = useReadContract({
    address: CONFIG.ppcAddress as `0x${string}`,
    abi: PPC_ABI,
    functionName: "claimable",
    args: [address as `0x${string}`],
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 10000 },
  });
  const claimableAmt = claimableData ? formatUnits(claimableData as bigint, 6) : "0";
  const hasClaimable = claimableData ? (claimableData as bigint) > 0n : false;

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const { data, loading } = useSubgraph<{calls: PayCall[]}>(address ? `{
    calls(where:{caller:"${address.toLowerCase()}",status:"COMPLETED"} orderBy:completedAt orderDirection:desc first:20){
      id providerId amount completedAt
    }
  }` : "", { enabled: !!address, pollInterval: 30000 });

  const totalSpent = (data?.calls ?? []).reduce((s:number,c: PayCall)=>s+Number(formatUnits(BigInt(c.amount??0),6)),0);

  // CRITICAL-06: claim() pull settlement
  const handleClaim = async () => {
    if (!isConnected) return;
    try {
      setStatus("Claiming...");
      await writeContractAsync({
        address: CONFIG.ppcAddress as `0x${string}`,
        abi: PPC_ABI,
        functionName: "claim",
        chainId: arcTestnet.id,
      });
      setStatus("Claimed!");
      void refetchClaimable();
    } catch(e:unknown){ setStatus(friendlyError(e) || "Transaction failed"); }
  };

  const handleSend = async () => {
    if (!isConnected || !sendTo || !sendAmt) return;
    // MEDIUM-04: validate address format before sending
    if (!/^0x[0-9a-fA-F]{40}$/.test(sendTo)) { setStatus("Invalid address format"); return; }
    const amt = parseFloat(sendAmt);
    if (isNaN(amt) || amt <= 0) { setStatus("Invalid amount"); return; }
    const gate = checkPaymentStart({ storage: payStorage(), operation: "payments-send" });
    if (!gate.ok) { setStatus(gate.message); return; }
    if (!beginOperation("payments-send")) {
      setStatus("Another payment flow is still running in this tab. Wait for it to finish.");
      return;
    }
    try {
      setStatus("Sending...");
      const hash = await writeContractAsync({
        address: CONFIG.usdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: "transfer",
        args: [sendTo as `0x${string}`, parseUnits(sendAmt, 6)],
      });
      if (!recordSubmittedTx(hash, payStorage()).persisted) {
        setStatus(`Submitted ${hash}, but its pending marker could not be saved. This tab stays blocked; check the explorer before sending again.`);
        return;
      }
      let receipt = null;
      try {
        receipt = await publicClient?.waitForTransactionReceipt({ hash, timeout: 60_000 }) ?? null;
      } catch { receipt = null; }
      if (!receipt) {
        setStatus(`Submitted ${hash}; its receipt is not available yet. Do not resend; check the explorer.`);
        return;
      }
      resolvePendingTx(payStorage());
      if (receipt.status !== "success") {
        setStatus(`Transaction ${hash} reverted; no USDC moved.`);
        return;
      }
      setStatus("Sent!");
      setSendTo(""); setSendAmt("");
    } catch(e:unknown){ setStatus(friendlyError(e) || "Transaction failed"); }
    finally { endOperation("payments-send"); }
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

      {/* CRITICAL-06: Provider claimable settlement */}
      {hasClaimable && (
        <div className="cg-card mb-4" style={{border:"1px solid rgba(25,209,134,0.3)",background:"rgba(25,209,134,0.05)"}}>
          <div className="card-title mb-2" style={{color: "var(--accent-ink)"}}>⬇ Claimable Settlement</div>
          <p className="text-dim text-xs mb-3">You have <strong style={{color: "var(--accent-ink)"}}>{claimableAmt} USDC</strong> from completed calls ready to claim.</p>
          <button className="btn btn-primary" onClick={handleClaim}>Claim {claimableAmt} USDC →</button>
        </div>
      )}

      <div className="cg-card mb-4">
        <div className="card-title mb-3">Send USDC</div>
        <div className="form-group mb-2">
          <label className="form-label" htmlFor="pay-to">Recipient address</label>
          <input id="pay-to" className="cg-input" placeholder="0x..." value={sendTo} onChange={e=>setSendTo(e.target.value)}/>
        </div>
        <div className="form-group mb-3">
          <label className="form-label" htmlFor="pay-amount">Amount (USDC)</label>
          <input id="pay-amount" className="cg-input" type="number" placeholder="1.00" value={sendAmt} onChange={e=>setSendAmt(e.target.value)}/>
        </div>
        {status && <p className="text-sm mb-2" style={{color:status==="Sent!"? "var(--accent-ink)":"var(--danger)"}}>{status}</p>}
        <button className="btn btn-primary" onClick={handleSend} disabled={!sendTo||!sendAmt}>Send →</button>
      </div>

      {loading && <div className="skeleton-row" style={{height:200}}/>}
      {!loading && (data?.calls??[]).length > 0 && (
        <div className="cg-card">
          <div className="card-title mb-3">Recent Payments</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {(data?.calls??[]).map((c: PayCall)=>(
              <div key={c.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                <span className="text-dim text-sm">Provider #{c.providerId}</span>
                <span className="text-sm" style={{color:"var(--danger)"}}>−{formatUnits(BigInt(c.amount??0),6)} USDC</span>
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
