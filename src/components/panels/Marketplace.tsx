import { useState, useMemo } from "react";
import { formatUnits } from "viem";
import { useProviders } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import type { Provider } from "../../lib/subgraph";

type SortKey = "reputation" | "pricePerCall" | "completedCalls" | "maxResponseTime";
type SortDir = "asc" | "desc";

function HonorBadge({ rate }: { rate: number }) {
  if (rate >= 90) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-accent-bg text-accent">{rate}%</span>;
  if (rate >= 60) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-warn-bg text-warn">{rate}%</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-bg text-danger">{rate}%</span>;
}

function StatusDot({ active }: { active: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${active ? "bg-accent shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-text-faint"}`} />;
}

function ProviderCard({ p, onCall, onCompare, compareList }: {
  p: Provider;
  onCall: (p: Provider) => void;
  onCompare: (p: Provider) => void;
  compareList: number[];
}) {
  const price = formatUnits(BigInt(p.pricePerCall || 0), 6);
  const inCompare = compareList.includes(p.id);

  return (
    <div className={`bg-bg-1 border rounded-xl p-4 hover:border-accent/40 transition-all group ${inCompare ? "border-accent/60 shadow-[0_0_12px_rgba(16,185,129,0.15)]" : "border-border"}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <StatusDot active={p.active} />
          <span className="font-mono text-sm font-bold text-text">#{p.id}</span>
          {p.reputation >= 90 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">✓ Verified</span>
          )}
        </div>
        <HonorBadge rate={p.reputation} />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
        <div className="bg-bg-2 rounded-lg p-2">
          <div className="text-text-faint mb-0.5">Price / call</div>
          <div className="font-mono font-semibold text-accent">{price} USDC</div>
        </div>
        <div className="bg-bg-2 rounded-lg p-2">
          <div className="text-text-faint mb-0.5">SLA window</div>
          <div className="font-mono font-semibold text-text">{p.maxResponseTime}s</div>
        </div>
        <div className="bg-bg-2 rounded-lg p-2">
          <div className="text-text-faint mb-0.5">Completed</div>
          <div className="font-mono font-semibold text-text">{p.completedCalls}</div>
        </div>
        <div className="bg-bg-2 rounded-lg p-2">
          <div className="text-text-faint mb-0.5">Slashed</div>
          <div className={`font-mono font-semibold ${p.slashedCalls > 0 ? "text-danger" : "text-text"}`}>{p.slashedCalls}</div>
        </div>
      </div>

      {p.reputation < 30 && (
        <div className="text-xs text-danger bg-danger-bg border border-danger/20 rounded-lg px-2 py-1.5 mb-3">
          ⚠ Low honor rate — high timeout risk
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onCall(p)}
          className="flex-1 bg-accent text-white rounded-lg py-2 text-xs font-semibold hover:bg-accent-dim transition-colors"
        >
          Call this provider →
        </button>
        <button
          onClick={() => onCompare(p)}
          className={`px-3 rounded-lg text-xs font-medium transition-colors border ${inCompare ? "border-accent bg-accent-bg text-accent" : "border-border text-text-dim hover:border-text-dim"}`}
        >
          {inCompare ? "✓" : "+"}
        </button>
      </div>
    </div>
  );
}

function CompareModal({ providers, onClose }: { providers: Provider[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-1 border border-border rounded-2xl p-6 max-w-3xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold font-display text-text">Provider Comparison</h2>
          <button onClick={onClose} className="text-text-dim hover:text-text transition-colors">✕</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs uppercase tracking-widest text-text-faint pb-3 pr-4">Metric</th>
                {providers.map(p => (
                  <th key={p.id} className="text-center text-xs font-mono text-text pb-3 px-4">#{p.id}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Price / call", fn: (p: Provider) => `${formatUnits(BigInt(p.pricePerCall || 0), 6)} USDC` },
                { label: "Honor rate", fn: (p: Provider) => `${p.reputation}%` },
                { label: "SLA window", fn: (p: Provider) => `${p.maxResponseTime}s` },
                { label: "Completed", fn: (p: Provider) => p.completedCalls.toString() },
                { label: "Slashed", fn: (p: Provider) => p.slashedCalls.toString() },
                { label: "Slash %", fn: (p: Provider) => `${p.slashBps / 100}%` },
                { label: "Status", fn: (p: Provider) => p.active ? "Active" : "Inactive" },
              ].map(row => (
                <tr key={row.label} className="border-b border-border/50">
                  <td className="text-xs text-text-dim py-3 pr-4">{row.label}</td>
                  {providers.map(p => (
                    <td key={p.id} className="text-center text-xs font-mono text-text py-3 px-4">{row.fn(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 mt-6">
          {providers.map(p => (
            <button key={p.id} className="flex-1 bg-accent text-white rounded-lg py-2.5 text-xs font-semibold hover:bg-accent-dim transition-colors">
              Call #{p.id} →
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Marketplace() {
  const { data: providers = [], isLoading } = useProviders();
  const { setPanel } = useAppStore();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("reputation");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeOnly, setActiveOnly] = useState(false);
  const [compareList, setCompareList] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const filtered = useMemo(() => {
    let list = providers;
    if (activeOnly) list = list.filter(p => p.active);
    if (search) list = list.filter(p =>
      String(p.id).includes(search) ||
      p.owner.toLowerCase().includes(search.toLowerCase())
    );
    list = [...list].sort((a, b) => {
      const av = Number(a[sortKey] ?? 0);
      const bv = Number(b[sortKey] ?? 0);
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [providers, activeOnly, search, sortKey, sortDir]);

  const compareProviders = useMemo(() =>
    providers.filter(p => compareList.includes(p.id)),
    [providers, compareList]
  );

  const handleCall = (p: Provider) => {
    setPanel("calls");
  };

  const handleCompare = (p: Provider) => {
    setCompareList(prev =>
      prev.includes(p.id)
        ? prev.filter(id => id !== p.id)
        : prev.length < 4 ? [...prev, p.id] : prev
    );
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-accent mb-1">Marketplace</div>
        <h1 className="text-3xl font-bold font-display text-text">Browse Providers</h1>
        <p className="text-text-dim text-sm mt-1">Find a service provider, compare SLAs, and make your first call.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by ID or address..."
          className="flex-1 min-w-[200px] bg-bg-1 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
        <label className="flex items-center gap-2 text-sm text-text-dim cursor-pointer">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={e => setActiveOnly(e.target.checked)}
            className="accent-accent"
          />
          Active only
        </label>
        <div className="flex gap-2 flex-wrap">
          {(["reputation", "pricePerCall", "completedCalls", "maxResponseTime"] as SortKey[]).map(key => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${sortKey === key ? "border-accent bg-accent-bg text-accent" : "border-border text-text-dim hover:border-text-dim"}`}
            >
              {key === "reputation" ? "Honor Rate" : key === "pricePerCall" ? "Price" : key === "completedCalls" ? "Completed" : "SLA"}
              {sortKey === key && (sortDir === "desc" ? " ↓" : " ↑")}
            </button>
          ))}
        </div>
      </div>

      {/* Compare bar */}
      {compareList.length >= 2 && (
        <div className="mb-4 bg-accent-bg border border-accent/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-accent font-medium">{compareList.length} providers selected</span>
          <button
            onClick={() => setShowCompare(true)}
            className="bg-accent text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-accent-dim transition-colors"
          >
            Compare →
          </button>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-bg-1 border border-border rounded-xl p-4 animate-pulse h-48" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-text-dim">
          <div className="text-4xl mb-3">🔍</div>
          <div className="font-semibold text-text mb-1">No providers found</div>
          <div className="text-sm">{activeOnly ? "Try removing the active filter." : "No providers match your search."}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <ProviderCard
              key={p.id}
              p={p}
              onCall={handleCall}
              onCompare={handleCompare}
              compareList={compareList}
            />
          ))}
        </div>
      )}

      {/* Stats footer */}
      {!isLoading && (
        <div className="mt-6 text-center text-xs text-text-faint">
          {filtered.length} of {providers.length} providers · Goldsky subgraph · 15s refresh
        </div>
      )}

      {/* Compare modal */}
      {showCompare && compareList.length >= 2 && (
        <CompareModal providers={compareProviders} onClose={() => setShowCompare(false)} />
      )}
    </div>
  );
}
