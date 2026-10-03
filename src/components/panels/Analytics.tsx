import { useProviderCount, useCallCount, useSlashCount } from "../../hooks/useOnchain";
export default function Analytics() {
  const providerCount = useProviderCount();
  const callCount = useCallCount();
  const slashCount = useSlashCount();
  const honorRate = callCount > 0 ? ((callCount - slashCount) / callCount * 100).toFixed(1) : "0";
  return (
    <div className="panel-body">
      <div className="panel-head"><h2>Analytics</h2><p className="panel-sub">Network-wide stats from Arc Testnet.</p></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
        {[{l:"Providers",v:providerCount},{l:"Total Calls",v:callCount},{l:"Slashes",v:slashCount},{l:"Honor Rate",v:honorRate+"%"}].map(s=>(
          <div key={s.l} className="stat-card"><div className="stat-label">{s.l.toUpperCase()}</div><div className="stat-val">{s.v}</div></div>
        ))}
      </div>
    </div>
  );
}
