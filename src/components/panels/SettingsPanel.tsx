import { useAppStore } from "../../store/useAppStore";
import { useAccount, useDisconnect } from "wagmi";
import { useState } from "react";
import { CONFIG } from "../../lib/config";

export default function SettingsPanel() {
  const { theme, setTheme, mode, setMode } = useAppStore();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [budget, setBudget] = useState(() => localStorage.getItem("cg_budget") ?? "");
  const [saved, setSaved] = useState(false);

  const saveBudget = () => {
    if (budget) localStorage.setItem("cg_budget", budget);
    else localStorage.removeItem("cg_budget");
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  };

  return (
    <div className="cg-panel">
      <div className="panel-head"><div><h2>Settings</h2><p className="text-dim">Appearance and session preferences</p></div></div>

      <div className="settings-section mb-6">
        <div className="section-title">APPEARANCE</div>
        <div className="setting-row">
          <div>
            <div className="setting-name">Theme</div>
            <div className="text-dim text-xs">Dark or light mode</div>
          </div>
          <div className="toggle-row">
            <button className={`btn btn-sm${theme==="dark"?" btn-primary":""}`} onClick={()=>setTheme("dark")}>Dark</button>
            <button className={`btn btn-sm${theme==="light"?" btn-primary":""}`} onClick={()=>setTheme("light")}>Light</button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-name">Mode</div>
            <div className="text-dim text-xs">Simple shows core features, Pro shows all</div>
          </div>
          <div className="toggle-row">
            <button className={`btn btn-sm${mode==="simple"?" btn-primary":""}`} onClick={()=>setMode("simple")}>Simple</button>
            <button className={`btn btn-sm${mode==="pro"?" btn-primary":""}`} onClick={()=>setMode("pro")}>Pro</button>
          </div>
        </div>
      </div>

      <div className="settings-section mb-6">
        <div className="section-title">SESSION BUDGET</div>
        <div className="setting-row">
          <div>
            <div className="setting-name">Max USDC per session</div>
            <div className="text-dim text-xs">Calls above this limit are blocked</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input className="cg-input" style={{width:100}} type="number" placeholder="e.g. 5" value={budget} onChange={e=>setBudget(e.target.value)}/>
            <button className="btn btn-sm btn-primary" onClick={saveBudget}>{saved?"Saved!":"Set"}</button>
            {budget && <button className="btn btn-sm" onClick={()=>{setBudget("");localStorage.removeItem("cg_budget");}}>Clear</button>}
          </div>
        </div>
      </div>

      <div className="settings-section mb-6">
        <div className="section-title">NETWORK</div>
        <div className="setting-row">
          <div>
            <div className="setting-name">PayPerCall Contract</div>
            <div className="mono text-dim text-xs">{CONFIG.ppcAddress}</div>
          </div>
          <a href={`https://explorer.testnet.arc.io/address/${CONFIG.ppcAddress}`} target="_blank" rel="noreferrer" className="btn btn-sm">ArcScan ↗</a>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-name">Connected Wallet</div>
            <div className="mono text-dim text-xs">{address}</div>
          </div>
          <button className="btn btn-sm" style={{color:"var(--red)"}} onClick={()=>disconnect()}>Disconnect</button>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">SDK — QUICK INTEGRATION</div>
        <div className="info-box">
          <pre className="text-xs mono" style={{overflow:"auto",lineHeight:1.6}}>{`// npm install ethers
import { ethers } from "ethers";
const PPC = "${CONFIG.ppcAddress}";
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const ppc = new ethers.Contract(PPC, ABI, signer);
const tx = await ppc.callService(1, requestHash);`}</pre>
        </div>
      </div>

      <style>{`
        .settings-section{display:flex;flex-direction:column;gap:16px;}
        .section-title{font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--text-dim);text-transform:uppercase;padding:0 0 4px;}
        .setting-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px;background:var(--bg-2);border-radius:var(--radius);border:1px solid var(--border);flex-wrap:wrap;}
        .setting-name{font-weight:600;font-size:14px;}
        .toggle-row{display:flex;gap:6px;}
        .info-box{background:var(--bg-3);border-radius:var(--radius);padding:16px;border:1px solid var(--border);}
      `}</style>
    </div>
  );
}
