import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useSubgraph } from "../../hooks/useSubgraph";
import { formatUnits } from "viem";

const PAGE_SIZE = 25;

const STATUS_ICON: Record<string, string> = {
  COMPLETED: "✓", STARTED: "◌", SLASHED: "✗", REFUNDED: "↩",
};
const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "var(--accent)",
  STARTED: "var(--warn,#f59e0b)",
  SLASHED: "var(--danger,#ef4444)",
  REFUNDED: "var(--text-dim)",
};

function exportHistory(calls: Record<string,unknown>[], format: "csv" | "json") {
  if (!calls.length) return;
  if (format === "csv") {
    const headers = ["Call ID","Provider","Amount (USDC)","Status","Date","RequestHash"];
    const rows = calls.map(c => [
      c.id ?? "",
      c.providerId ?? "",
      c.amount ? (Number(c.amount) / 1e6).toFixed(4) : "0",
      c.status ?? "",
      c.createdAt ? new Date(Number(c.createdAt) * 1000).toISOString() : "",
      c.requestHash ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `callguard-history-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  } else {
    const blob = new Blob([JSON.stringify(calls, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `callguard-history-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }
}

export default function History() {
  const { address } = useAccount();
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage]               = useState(0);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  const { data, loading, refetch } = useSubgraph<{calls: Record<string,unknown>[]}>(
    address ? `{
      calls(first:500 orderBy:createdAt orderDirection:desc where:{caller:"${address.toLowerCase()}"}) {
        id providerId caller amount status createdAt completedAt requestHash responseHash refunded slashed
      }
    }` : "",
    { skip: !address, pollInterval: 30000 }
  );

  const all = data?.calls ?? [];

  const filtered = all.filter(c => {
    if (statusFilter !== "all" && String(c.status) !== statusFilter.toUpperCase()) return false;
    const s = search.toLowerCase();
    if (s && !String(c.id).includes(s) && !String(c.providerId).includes(s)) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSearch = useCallback((v: string) => {
    setSearch(v); setPage(0);
  }, []);
  const handleFilter = useCallback((v: string) => {
    setStatusFilter(v); setPage(0);
  }, []);

  const stats = {
    Total:     all.length,
    Completed: all.filter(c => c.status === "COMPLETED").length,
    Slashed:   all.filter(c => c.status === "SLASHED").length,
    Open:      all.filter(c => c.status === "STARTED").length,
  };

  return (
    <div className="cg-panel">
      <div className="panel-head">
        <div>
          <h2>Transaction History</h2>
          <p className="text-dim">All on-chain activity · {all.length} total</p>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button className="btn btn-sm" onClick={() => exportHistory(filtered,"csv")} title="Export CSV">↓ CSV</button>
          <button className="btn btn-sm" onClick={() => exportHistory(filtered,"json")} title="Export JSON">↓ JSON</button>
          <button className="btn btn-sm" onClick={refetch} title="Refresh">↻</button>
        </div>
      </div>

      {/* Stats */}
      <div className="hist-stats mb-4">
        {Object.entries(stats).map(([k,v]) => (
          <div key={k} className="hist-stat">
            <span className="text-dim text-xs">{k}</span>
            <strong className="text-lg">{v}</strong>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="hist-filters mb-4">
        <input
          className="cg-input"
          style={{ flex:1 }}
          placeholder="Search by call ID or provider…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
        <select
          className="cg-input"
          style={{ width:"auto" }}
          value={statusFilter}
          onChange={e => handleFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="COMPLETED">Completed</option>
          <option value="STARTED">Open</option>
          <option value="SLASHED">Slashed</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </div>

      {!address && (
        <div className="empty-state">Connect your wallet to see history.</div>
      )}

      {address && loading && (
        <div className="skeleton-list">
          {[...Array(6)].map((_,i) => <div key={i} className="skeleton-row" style={{height:56}}/>)}
        </div>
      )}

      {address && !loading && filtered.length === 0 && (
        <div className="empty-state">No transactions match your filter.</div>
      )}

      {/* List */}
      <div className="hist-list">
        {paged.map(c => {
          const id = String(c.id);
          const isExpanded = expandedId === id;
          return (
            <div
              key={id}
              className="hist-row"
              onClick={() => setExpandedId(isExpanded ? null : id)}
              style={{ cursor:"pointer" }}
            >
              <div className="hist-icon" style={{ color: STATUS_COLOR[String(c.status)] }}>
                {STATUS_ICON[String(c.status)] ?? "?"}
              </div>
              <div className="hist-body">
                <div className="hist-top">
                  <span className="mono text-xs">{id.slice(0,18)}…</span>
                  <span className="text-dim text-xs">
                    {c.createdAt ? new Date(Number(c.createdAt)*1000).toLocaleString() : ""}
                  </span>
                </div>
                <div className="hist-bot">
                  <span className="text-dim text-xs">Provider #{String(c.providerId)}</span>
                  <span className="text-sm">{formatUnits(BigInt(String(c.amount??0)),6)} USDC</span>
                </div>
                {isExpanded && (
                  <div style={{ marginTop:8, fontSize:11, fontFamily:"var(--font-mono)", color:"var(--text-dim)", display:"flex", flexDirection:"column", gap:3 }}>
                    {c.requestHash  && <span>reqHash: {String(c.requestHash).slice(0,30)}…</span>}
                    {c.responseHash && <span>resHash: {String(c.responseHash).slice(0,30)}…</span>}
                    {c.completedAt  && <span>completedAt: {new Date(Number(c.completedAt)*1000).toLocaleString()}</span>}
                    {c.refunded && <span style={{color:"var(--accent)"}}>✓ Refunded</span>}
                    {c.slashed  && <span style={{color:"var(--danger,#ef4444)"}}>⚡ Slashed</span>}
                    <a
                      href={`https://testnet.arcscan.app/tx/${id}`}
                      target="_blank" rel="noreferrer"
                      style={{ color:"var(--accent)", marginTop:2 }}
                      onClick={e => e.stopPropagation()}
                    >
                      View on ArcScan ↗
                    </a>
                  </div>
                )}
              </div>
              <div className="hist-status" style={{ color: STATUS_COLOR[String(c.status)] }}>
                {String(c.status)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, marginTop:20 }}>
          <button
            className="btn btn-sm"
            onClick={() => setPage(p => Math.max(0, p-1))}
            disabled={page === 0}
          >← Prev</button>
          <span className="text-dim text-xs">
            Page {page+1} / {totalPages} · {filtered.length} results
          </span>
          <button
            className="btn btn-sm"
            onClick={() => setPage(p => Math.min(totalPages-1, p+1))}
            disabled={page >= totalPages-1}
          >Next →</button>
        </div>
      )}

      <style>{`
        .hist-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;}
        .hist-stat{background:var(--bg-2);border-radius:var(--radius,8px);padding:12px;display:flex;flex-direction:column;gap:4px;align-items:center;}
        .hist-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
        .hist-list{display:flex;flex-direction:column;gap:6px;}
        .hist-row{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:var(--bg-2);border-radius:var(--radius,8px);border:1px solid var(--border);transition:border-color .15s;}
        .hist-row:hover{border-color:var(--accent);}
        .hist-icon{font-size:16px;font-weight:700;width:20px;text-align:center;margin-top:2px;}
        .hist-body{flex:1;display:flex;flex-direction:column;gap:4px;}
        .hist-top,.hist-bot{display:flex;justify-content:space-between;gap:8px;}
        .hist-status{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;}
        .skeleton-list{display:flex;flex-direction:column;gap:8px;}
        .skeleton-row{border-radius:var(--radius,8px);background:var(--bg-2);animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}
        @media(max-width:560px){.hist-stats{grid-template-columns:repeat(2,1fr);}}
      `}</style>
    </div>
  );
}
