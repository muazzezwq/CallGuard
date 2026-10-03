import { useState } from "react";
import { useAccount } from "wagmi";
import { useSubgraph } from "../../hooks/useSubgraph";
import { formatUnits } from "viem";

const STATUS_COLORS: Record<string, string> = {
  STARTED: "var(--amber)",
  COMPLETED: "var(--accent)",
  SLASHED: "var(--red)",
  REFUNDED: "var(--text-dim)",
};

export default function Requests() {
  const { address } = useAccount();
  const [filter, setFilter] = useState<"all" | "open" | "completed" | "slashed">("all");

  const q = `{
    calls(
      where: { caller: "${address?.toLowerCase() ?? "0x0"}" }
      orderBy: createdAt orderDirection: desc first: 50
    ) {
      id providerId caller amount status createdAt completedAt
      requestHash responseHash refunded slashed
    }
  }`;

  const { data, loading, refetch } = useSubgraph<{ calls: any[] }>(address ? q : "", {
    skip: !address,
    pollInterval: 15000,
  });

  const calls = data?.calls ?? [];
  const filtered = filter === "all" ? calls
    : filter === "open" ? calls.filter(c => c.status === "STARTED")
    : filter === "completed" ? calls.filter(c => c.status === "COMPLETED")
    : calls.filter(c => c.status === "SLASHED");

  return (
    <div className="cg-panel">
      <div className="panel-head">
        <div>
          <h2>My Requests</h2>
          <p className="text-dim">Your call history on Arc Testnet</p>
        </div>
        <button className="btn btn-sm" onClick={refetch}>Refresh</button>
      </div>

      <div className="cg-tabs mb-4">
        {(["all","open","completed","slashed"] as const).map(f => (
          <button key={f} className={`cg-tab${filter===f?" active":""}`}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
            {f === "open" && calls.filter(c=>c.status==="STARTED").length > 0 &&
              <span className="badge-dot ml-1">{calls.filter(c=>c.status==="STARTED").length}</span>}
          </button>
        ))}
      </div>

      {loading && <div className="skeleton-list">{[...Array(4)].map((_,i)=><div key={i} className="skeleton-row"/>)}</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <p>No {filter === "all" ? "" : filter} requests yet.</p>
          {filter === "all" && <button className="btn btn-primary mt-3" onClick={() => window.dispatchEvent(new CustomEvent("cg:nav","callbuilder" as any))}>Make your first call →</button>}
        </div>
      )}

      <div className="call-list">
        {filtered.map(call => (
          <div key={call.id} className="call-row">
            <div className="call-row-left">
              <span className="call-id mono">{call.id.slice(0,10)}...</span>
              <span className="call-provider text-dim">Provider #{call.providerId}</span>
            </div>
            <div className="call-row-mid">
              <span className="call-amount">{formatUnits(BigInt(call.amount??0),6)} USDC</span>
              <span className="call-time text-dim text-xs">
                {new Date(Number(call.createdAt)*1000).toLocaleString()}
              </span>
            </div>
            <div className="call-row-right">
              <span className="status-badge" style={{color: STATUS_COLORS[call.status] ?? "var(--text-dim)"}}>
                {call.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .call-list { display:flex; flex-direction:column; gap:8px; }
        .call-row { display:flex; align-items:center; justify-content:space-between;
          padding:12px 16px; background:var(--bg-2); border-radius:var(--radius);
          border:1px solid var(--border); gap:12px; flex-wrap:wrap; }
        .call-row-left { display:flex; flex-direction:column; gap:2px; min-width:120px; }
        .call-row-mid { display:flex; flex-direction:column; gap:2px; }
        .call-row-right { margin-left:auto; }
        .call-id { font-family:var(--font-mono); font-size:13px; }
        .status-badge { font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
        .badge-dot { background:var(--accent); color:#000; border-radius:99px;
          font-size:10px; padding:1px 5px; font-weight:700; }
        .skeleton-list { display:flex; flex-direction:column; gap:8px; }
        .skeleton-row { height:56px; border-radius:var(--radius); background:var(--bg-2);
          animation:shimmer 1.4s infinite; }
        @keyframes shimmer { 0%{opacity:.5} 50%{opacity:1} 100%{opacity:.5} }
        @media(max-width:480px){ .call-row{ flex-direction:column; align-items:flex-start; } .call-row-right{margin-left:0;} }
      `}</style>
    </div>
  );
}
