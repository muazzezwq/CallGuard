import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { CONFIG, REGISTRY_ABI, USDC_ABI } from "../../lib/config";
export default function Register() {
  const { address } = useAccount();
  const [price,setPrice] = useState("1");
  const [stake,setStake] = useState("50");
  const [sla,setSla] = useState("120");
  const [busy,setBusy] = useState(false);
  const { writeContractAsync } = useWriteContract();
  const register = async () => {
    if (!address) return;
    setBusy(true);
    try {
      const amt = parseUnits(stake,6);
      await writeContractAsync({ address:CONFIG.usdcAddress, abi:USDC_ABI, functionName:"approve", args:[CONFIG.registryAddress, amt] });
      await writeContractAsync({ address:CONFIG.registryAddress, abi:REGISTRY_ABI, functionName:"register", args:[address, amt, parseUnits(price,6), Number(sla), 2000, "0x"] });
      alert("Registered!");
    } catch(e:any){ alert(e.shortMessage||e.message); }
    setBusy(false);
  };
  return (
    <div className="panel-body">
      <div className="panel-head"><h2>Become a Provider</h2><p className="panel-sub">Stake USDC, set your SLA terms, and earn per request.</p></div>
      <div className="action-card">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div><label className="input-label">Price / call (USDC)</label><input className="input-field" type="number" value={price} onChange={e=>setPrice(e.target.value)} /></div>
          <div><label className="input-label">Stake (USDC)</label><input className="input-field" type="number" value={stake} onChange={e=>setStake(e.target.value)} /></div>
          <div><label className="input-label">SLA window (seconds)</label><input className="input-field" type="number" value={sla} onChange={e=>setSla(e.target.value)} /></div>
        </div>
        <button className="btn-primary" onClick={register} disabled={busy||!address}>{busy?"Registering...":"Register as Provider"}</button>
      </div>
    </div>
  );
}
