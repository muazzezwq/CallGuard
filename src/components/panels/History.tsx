import { useState } from "react";
import { useAccount } from "wagmi";
import { useSubgraph } from "../../hooks/useSubgraph";
import { formatUnits } from "viem";

const STATUS_ICON: Record<string, string> = {
  COMPLETED: "✓", STARTED: "◌", SLASHED: "✗", REFUNDED: "↩",
};
const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "var(--accent)", STARTED: "var(--amber)", SLASHED: "var(--red)", REFUNDED: "var(--text-dim)",
};

function exportHistory(calls: any[], format: "csv" | "json") {
  if (!calls.length) return;
  if (format === "csv") {
    const headers = ["Call ID", "Provider", "Amount (USDC)", "Status", "Date", "Request Hash"];
    const rows = calls.map(c => [
      c.id || "",
      c.providerId || "",
      c.amount ? (Number(c.amount) / 1e6).toFixed(4) : "",
      c.status || "",
      c.createdAt ? new Date(Number(c.createdAt) * 1000).toISOString() : "",
      c.requestHash || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `callguard-history-${Date.now()}.csv`; a.click();
  } else {
    const blob = new Blob([JSON.stringify(calls, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `callguard-history-${Date.now()}.json`; a.click();
  }
}

export default function History() {
  const { address } = useAccount();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, loading, refetch } = useSubgraph<{calls:any[]}>(address ? `{
    calls(first:100 orderBy:createdAt orderDirection:desc){
      id providerId caller amount status createdAt completedAt requestHash responseHash
    }
  }` : "", { skip: !address, pollInterval: 15000 });

  const all = data?.calls ?? [];
  const filtered = all.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter.toUpperCase()) return false;
    if (search && !c.id.includes(search) && !c.caller?.includes(search)) return false;
    return true;
  });

  const stats = {
    total: all.length,
    completed: all.filter(c=>c.status==="COMPLETED").length,
    slashed: all.filter(c=>c.status==="SLASHED").length,
    open: all.filter(c=>c.status==="STARTED").length,
  };

  return (
    <div className="cg-panel">
      <div className="panel-head">
        <div><h2>Transaction History</h2><p className="text-dim">All on-chain activity</p></div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-sm" onClick={() => exportHistory(filtered, "csv")} title="Export CSV">↓ CSV</button>
          <button className="btn btn-sm" onClick={() => exportHistory(filtered, "json")} title="Export JSON">↓ JSON</button>
          <button className="btn btn-sm" onClick={refetch}>↻</button>
        </div>
      </div>

      <div className="hist-stats mb-4">
        {Object.entries(stats).map(([k,v]) => (
          <div key={k} className="hist-stat">
            <span className="text-dim text-xs">{k.toUpperCase()}</span>
            <strong className="text-lg">{v}</strong>
          </div>
        ))}
      </div>

      <div className="hist-filters mb-4">
        <input className="cg-input" style={{flex:1}} placeholder="Search by call ID or address..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="cg-input" style={{width:"auto"}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="completed">Completed</option>
          <option value="started">Open</option>
          <option value="slashed">Slashed</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {loading && <div className="skeleton-list">{[...Array(5)].map((_,i)=><div key={i} className="skeleton-row" style={{height:60}}/>)}</div>}

      {!loading && filtered.length === 0 && <div className="empty-state"><p>No transactions match your filter.</p></div>}

      <div className="hist-list">
        {filtered.map(c => (
          <div key={c.id} className="hist-row">
            <div className="hist-icon" style={{color:STATUS_COLOR[c.status]}}>
              {STATUS_ICON[c.status] ?? "?"}
            </div>
            <div className="hist-body">
              <div className="hist-top">
                <span className="mono text-xs">{c.id.slice(0,14)}...</span>
                <span className="hist-time text-dim text-xs">{new Date(Number(c.createdAt)*1000).toLocaleDateString()}</span>
              </div>
              <div className="hist-bot">
                <span className="text-dim text-xs">Provider #{c.providerId}</span>
                <span className="text-sm">{formatUnits(BigInt(c.amount??0),6)} USDC</span>
              </div>
            </div>
            <div className="hist-status" style={{color:STATUS_COLOR[c.status]}}>
              {c.status}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .hist-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
        .hist-stat{background:var(--bg-2);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;gap:4px;align-items:center;}
        .hist-filters{display:flex;gap:10px;flex-wrap:wrap;}
        .hist-list{display:flex;flex-direction:column;gap:4px;}
        .hist-row{display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-2);border-radius:var(--radius);border:1px solid var(--border);}
        .hist-icon{font-size:18px;font-weight:700;width:24px;text-align:center;}
        .hist-body{flex:1;display:flex;flex-direction:column;gap:4px;}
        .hist-top,.hist-bot{display:flex;justify-content:space-between;}
        .hist-status{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;}
        .skeleton-list{display:flex;flex-direction:column;gap:8px;}
        .skeleton-row{border-radius:var(--radius);background:var(--bg-2);animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}
        @media(max-width:560px){.hist-stats{grid-template-columns:repeat(2,1fr);}}
      `}</style>
    </div>
  );
}
