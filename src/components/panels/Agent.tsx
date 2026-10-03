import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { CONFIG, AGENT_WALLET_ABI } from "../../lib/config";

const AGENT_FACTORY_ABI = [
  { name: "deploy", type: "function", stateMutability: "nonpayable", inputs: [{name:"owner",type:"address"},{name:"dailyLimit",type:"uint256"}], outputs: [{type:"address"}] },
] as const;

export default function Agent() {
  const { address } = useAccount();
  const [dailyLimit, setDailyLimit] = useState("10");
  const [fundAmount, setFundAmount] = useState("5");
  const [agentAddr, setAgentAddr] = useState(sessionStorage.getItem("cg_agent_wallet") || "");
  const [deployStep, setDeployStep] = useState<"idle"|"deploying"|"funding"|"done">("idle");
  const [txHash, setTxHash] = useState<`0x${string}`|undefined>();

  const { data: spentToday } = useReadContract({
    address: agentAddr as `0x${string}`,
    abi: AGENT_WALLET_ABI,
    functionName: "spentToday",
    query: { enabled: !!agentAddr },
  });
  const { data: dailyLimitOnchain } = useReadContract({
    address: agentAddr as `0x${string}`,
    abi: AGENT_WALLET_ABI,
    functionName: "dailyLimit",
    query: { enabled: !!agentAddr },
  });

  const { writeContractAsync } = useWriteContract();
  const { isLoading: isTxLoading } = useWaitForTransactionReceipt({ hash: txHash });

  const deployAgent = async () => {
    if (!address) return;
    setDeployStep("deploying");
    try {
      const hash = await writeContractAsync({
        address: CONFIG.agentWallet as `0x${string}`,
        abi: AGENT_FACTORY_ABI,
        functionName: "deploy",
        args: [address, parseUnits(dailyLimit, 6)],
      });
      setTxHash(hash);
      setDeployStep("funding");
    } catch (e: any) {
      alert(e.shortMessage || e.message);
      setDeployStep("idle");
    }
  };

  const fundAgent = async () => {
    if (!agentAddr) return;
    try {
      const hash = await writeContractAsync({
        address: CONFIG.usdcAddress,
        abi: [{ name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{name:"to",type:"address"},{name:"amount",type:"uint256"}], outputs: [{type:"bool"}] }] as const,
        functionName: "transfer",
        args: [agentAddr as `0x${string}`, parseUnits(fundAmount, 6)],
      });
      setTxHash(hash);
      setDeployStep("done");
    } catch (e: any) {
      alert(e.shortMessage || e.message);
    }
  };

  const spent = spentToday ? Number(formatUnits(spentToday as bigint, 6)).toFixed(2) : "0.00";
  const limit = dailyLimitOnchain ? Number(formatUnits(dailyLimitOnchain as bigint, 6)).toFixed(2) : dailyLimit;
  const pct = dailyLimitOnchain && spentToday ? Math.min(100, Number(spentToday) * 100 / Number(dailyLimitOnchain)) : 0;

  return (
    <div className="panel-body">
      <div className="panel-head">
        <h2>Autonomous Agent Loop</h2>
        <p className="panel-sub">ERC-4337 smart wallet with daily spend limit. Any AI (Claude, GPT, Llama) calls services with zero human approval.</p>
      </div>

      {agentAddr ? (
        <div className="stat-grid" style={{gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:20}}>
          <div className="stat-card">
            <div className="stat-label">AGENT WALLET</div>
            <div className="stat-val" style={{fontSize:12,fontFamily:"var(--font-mono)"}}>{agentAddr.slice(0,10)}...{agentAddr.slice(-6)}</div>
            <a href={CONFIG.explorerAddr(agentAddr)} target="_blank" rel="noreferrer" style={{fontSize:11,color:"var(--accent)"}}>View on ArcScan →</a>
          </div>
          <div className="stat-card">
            <div className="stat-label">DAILY SPENT</div>
            <div className="stat-val">{spent} <span style={{fontSize:12,color:"var(--text-dim)"}}>/ {limit} USDC</span></div>
            <div style={{height:4,background:"var(--bg-3)",borderRadius:2,marginTop:6}}>
              <div style={{height:"100%",width:`${pct}%`,background:pct>80?"var(--red)":"var(--accent)",borderRadius:2,transition:"width 0.3s"}} />
            </div>
          </div>
        </div>
      ) : (
        <div className="info-box" style={{marginBottom:20}}>
          <strong>No agent wallet deployed.</strong> Deploy one below to enable autonomous AI payments.
        </div>
      )}

      <div className="action-card">
        <div className="action-title">Deploy Agent Wallet</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <label className="input-label">Daily limit (USDC)</label>
            <input className="input-field" type="number" value={dailyLimit} onChange={e=>setDailyLimit(e.target.value)} min="0.1" step="0.1" />
          </div>
          <div>
            <label className="input-label">Initial fund (USDC)</label>
            <input className="input-field" type="number" value={fundAmount} onChange={e=>setFundAmount(e.target.value)} min="0.1" step="0.1" />
          </div>
        </div>
        {deployStep === "idle" && <button className="btn-primary" onClick={deployAgent}>Deploy Agent Wallet</button>}
        {deployStep === "deploying" && <button className="btn-primary" disabled>Deploying... {isTxLoading && "⏳"}</button>}
        {deployStep === "funding" && (
          <div>
            <div className="info-box" style={{marginBottom:8}}>Agent deployed! Enter the address and fund it.</div>
            <input className="input-field" placeholder="Agent wallet address" value={agentAddr} onChange={e=>{ setAgentAddr(e.target.value); sessionStorage.setItem("cg_agent_wallet", e.target.value); }} style={{marginBottom:8}} />
            <button className="btn-primary" onClick={fundAgent}>Fund with {fundAmount} USDC</button>
          </div>
        )}
        {deployStep === "done" && <div className="success-box">✓ Agent wallet funded and ready! AIs can now pay autonomously.</div>}
      </div>

      <div className="action-card" style={{marginTop:12}}>
        <div className="action-title">MCP Integration</div>
        <p style={{fontSize:13,color:"var(--text-dim)",marginBottom:12}}>Connect any Claude/GPT/Llama agent via Model Context Protocol.</p>
        <div style={{background:"var(--bg-0)",borderRadius:8,padding:12,fontFamily:"var(--font-mono)",fontSize:11}}>
          <div style={{color:"var(--text-dim)"}}>// callguard.mcp.json</div>
          <div>{`{`}</div>
          <div>&nbsp;&nbsp;<span style={{color:"var(--accent)"}}>url</span>: <span style={{color:"#f59e0b"}}>"https://arcsla.vercel.app/api/mcp-server"</span>,</div>
          <div>&nbsp;&nbsp;<span style={{color:"var(--accent)"}}>agentWallet</span>: <span style={{color:"#f59e0b"}}>"{agentAddr || '0x...'}"</span></div>
          <div>{`}`}</div>
        </div>
        <a href="https://arcsla.vercel.app/api/mcp-server" target="_blank" rel="noreferrer" className="btn-secondary" style={{marginTop:8,display:"inline-block",fontSize:12}}>Test MCP endpoint →</a>
      </div>
    </div>
  );
}
