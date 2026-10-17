import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { formatUnits } from "viem";
import { useProviders } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import type { Provider } from "../../lib/subgraph";
import { PageHeader, Chip, ChipRow, Select } from "../../ui";
import { Search } from "lucide-react";

type SortKey = "reputation" | "pricePerCall" | "completedCalls" | "stake";
type SortDir = "asc" | "desc";

/* ─────────────────────────────────────────────
   Sparkline Canvas  (per-card reputation bars)
───────────────────────────────────────────── */
function SparklineCanvas({ completed, slashed, glow }: {
  completed: number; slashed: number; glow: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = 120, H = 32;
    ctx.clearRect(0, 0, W, H);

    const total = completed + slashed;
    const base = total > 0 ? completed / total : 0.5;
    const BARS = 12;
    const data = Array.from({ length: BARS }, (_, i) => {
      const noise = (Math.random() - 0.5) * 0.18;
      const fade = 0.4 + (i / BARS) * 0.6;
      return { v: Math.max(0.04, Math.min(1, base + noise)), fade };
    });
    data[BARS - 1] = { v: base, fade: 1 };

    const bw = W / BARS - 2;
    for (let i = 0; i < BARS; i++) {
      const { v, fade } = data[i];
      const bh = Math.max(3, v * (H - 4));
      const x = i * (bw + 2);
      const y = H - bh;
      const isLast = i === BARS - 1;
      const color = v > 0.7
        ? `rgba(25,209,134,${isLast ? 1 : fade * 0.7})`
        : v > 0.4
          ? `rgba(245,158,11,${isLast ? 1 : fade * 0.7})`
          : `rgba(238,69,57,${isLast ? 1 : fade * 0.7})`;

      if (glow && isLast) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [completed, slashed, glow]);

  return <canvas ref={ref} width={120} height={32} className="mp-spark" />;
}

/* ─────────────────────────────────────────────
   Honor Ring  (SVG arc gauge)
───────────────────────────────────────────── */
function HonorRing({ rate }: { rate: number }) {
  const R = 18, CX = 22, CY = 22, SW = 3.5;
  const circ = 2 * Math.PI * R;
  const dash = (rate / 100) * circ;
  const col = rate >= 90 ? "#19D186" : rate >= 60 ? "#f59e0b" : "#EE4539";
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" className="mp-ring">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={SW} />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={col} strokeWidth={SW}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${CX} ${CY})`}
        style={{ transition: "stroke-dasharray 0.7s cubic-bezier(.4,0,.2,1)" }} />
      <text x={CX} y={CY + 4} textAnchor="middle" fontSize={7.5}
        fill={col} fontFamily="var(--font-mono)" fontWeight="bold">
        {rate}%
      </text>
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Tier Badge
───────────────────────────────────────────── */
function TierBadge({ rate }: { rate: number }) {
  if (rate >= 95) return <span className="mp-tier mp-tier-elite">Elite</span>;
  if (rate >= 80) return <span className="mp-tier mp-tier-pro">Pro</span>;
  if (rate >= 60) return <span className="mp-tier mp-tier-std">Standard</span>;
  return <span className="mp-tier mp-tier-risk">At Risk</span>;
}

/* ─────────────────────────────────────────────
   Provider Card
───────────────────────────────────────────── */
function ProviderCard({ p, onCall, onCompare, onProfile, inCompare, top }: {
  p: Provider; onCall: (p: Provider) => void; onCompare: (p: Provider) => void;
  onProfile: (id: string) => void;
  inCompare: boolean; top: boolean;
}) {
  const [hov, setHov] = useState(false);
  const price = formatUnits(BigInt(p.pricePerCall || 0), 6);
  const stake = formatUnits(BigInt(p.stake || 0), 6);
  const total = p.completedCalls + p.slashedCalls;

  return (
    <div
      className={`mp-card${inCompare ? " mp-card-sel" : ""}${top ? " mp-card-top" : ""}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {top && <div className="mp-card-topbar" />}

      {/* header */}
      <div className="mp-card-head">
        <div className="mp-card-id-row">
          <span className={`mp-dot${p.active ? " mp-dot-on" : ""}`} />
          <span className="mp-card-id">#{p.id}</span>
          <TierBadge rate={p.reputation} />
        </div>
        <HonorRing rate={p.reputation} />
      </div>

      {/* owner */}
      <div className="mp-card-owner">{p.owner.slice(0, 6)}…{p.owner.slice(-4)}</div>

      {/* metrics 2×2 */}
      <div className="mp-metrics">
        <div className="mp-metric">
          <div className="mp-metric-lbl">Price</div>
          <div className="mp-metric-val mp-val-green">{price} <span className="mp-metric-unit">USDC</span></div>
        </div>
        <div className="mp-metric">
          <div className="mp-metric-lbl">Stake</div>
          <div className="mp-metric-val">{Number(stake).toFixed(2)}<span className="mp-metric-unit"> USDC</span></div>
        </div>
        <div className="mp-metric">
          <div className="mp-metric-lbl">Done</div>
          <div className="mp-metric-val">{p.completedCalls}</div>
        </div>
        <div className="mp-metric">
          <div className="mp-metric-lbl">Slash</div>
          <div className={`mp-metric-val${p.slashedCalls > 0 ? " mp-val-red" : ""}`}>{p.slashedCalls}</div>
        </div>
      </div>

      {/* sparkline */}
      <div className="mp-spark-row">
        <span className="mp-spark-lbl">Reputation trend</span>
        <SparklineCanvas completed={p.completedCalls} slashed={p.slashedCalls} glow={hov} />
      </div>

      {/* total pill */}
      {total > 0 && <div className="mp-calls-pill">{total} total calls</div>}

      {/* risk */}
      {p.reputation < 30 && (
        <div className="mp-risk">⚠ Low honor rate — high timeout risk</div>
      )}

      {/* actions */}
      <div className="mp-card-actions">
        <button className="mp-btn-call" onClick={() => onCall(p)}>
          Call Provider <span className="mp-arrow">→</span>
        </button>
        <button
          className="mp-btn-profile"
          onClick={() => onProfile(p.id)}
          title="View profile"
          style={{ padding:"0 10px",borderRadius:999,border:"1px solid var(--border)",background:"var(--bg-3)",color:"var(--text-dim)",fontSize:12,cursor:"pointer",height:36,display:"inline-flex",alignItems:"center" }}
        >
          👤
        </button>
        <button
          className={`mp-btn-cmp${inCompare ? " mp-btn-cmp-on" : ""}`}
          onClick={() => onCompare(p)}
          title={inCompare ? "Remove from compare" : "Add to compare"}
        >
          {inCompare ? "✓" : "+"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Compare Modal
───────────────────────────────────────────── */
function CompareModal({ providers, onClose, onCall }: {
  providers: Provider[]; onClose: () => void; onCall: (p: Provider) => void;
}) {
  const rows: { l: string; fn: (p: Provider) => string; hi?: boolean }[] = [
    { l: "Honor Rate", fn: p => `${p.reputation}%`, hi: true },
    { l: "Price / call", fn: p => `${formatUnits(BigInt(p.pricePerCall || 0), 6)} USDC` },
    { l: "Stake", fn: p => `${Number(formatUnits(BigInt(p.stake || 0), 6)).toFixed(2)} USDC` },
    { l: "Completed", fn: p => p.completedCalls.toString() },
    { l: "Slashed", fn: p => p.slashedCalls.toString() },
    { l: "Total slashed", fn: p => `${Number(formatUnits(BigInt(p.totalSlashed || 0), 6)).toFixed(2)} USDC` },
    { l: "Status", fn: p => p.active ? "Active" : "Inactive" },
  ];

  return (
    <div className="mp-overlay" onClick={onClose}>
      <div className="mp-modal" onClick={e => e.stopPropagation()}>
        <div className="mp-modal-head">
          <div>
            <div className="mp-modal-title">Provider Comparison</div>
            <div className="mp-modal-sub">{providers.length} providers selected</div>
          </div>
          <button className="mp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mp-modal-body">
          <table className="mp-cmp-table">
            <thead>
              <tr>
                <th className="mp-cth mp-cth-lbl">Metric</th>
                {providers.map(p => (
                  <th key={p.id} className="mp-cth">
                    <div className="mp-cth-id">#{p.id}</div>
                    <HonorRing rate={p.reputation} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.l} className="mp-crow">
                  <td className="mp-ctd mp-ctd-lbl">{row.l}</td>
                  {providers.map(p => {
                    const isBest = row.hi && providers.every(q => p.reputation >= q.reputation);
                    return (
                      <td key={p.id} className={`mp-ctd${isBest ? " mp-ctd-best" : ""}`}>
                        {row.fn(p)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mp-modal-foot">
          {providers.map(p => (
            <button key={p.id} className="mp-btn-call" onClick={() => { onCall(p); onClose(); }}>
              Call #{p.id} →
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Skeleton Card
───────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="mp-card mp-skel">
      <div className="mp-skel-head">
        <div className="mp-skel-line mp-skel-w60" />
        <div className="mp-skel-ring" />
      </div>
      <div className="mp-skel-line mp-skel-w40" />
      <div className="mp-skel-grid" />
      <div className="mp-skel-spark-area" />
      <div className="mp-skel-btn" />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main
───────────────────────────────────────────── */
export default function Marketplace() {
  const { data: providers = [], isLoading } = useProviders();
  const { setPanel } = useAppStore();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("reputation");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeOnly, setActiveOnly] = useState(false);
  const [compareList, setCompareList] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [view, setView] = useState<"grid" | "list">("list");
  const [highRep, setHighRep] = useState(false);

  const filtered = useMemo(() => {
    let list = [...providers];
    if (activeOnly) list = list.filter(p => p.active);
    if (highRep) list = list.filter(p => (p.reputation ?? 0) >= 90);
    if (search) list = list.filter(p =>
      String(p.id).includes(search) || p.owner.toLowerCase().includes(search.toLowerCase())
    );
    list.sort((a, b) => {
      const av = Number(a[sortKey] ?? 0), bv = Number(b[sortKey] ?? 0);
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [providers, activeOnly, highRep, search, sortKey, sortDir]);

  const cmpProviders = useMemo(() => providers.filter(p => compareList.includes(p.id)), [providers, compareList]);

  const handleCall = useCallback(() => setPanel("calls"), [setPanel]);
  const handleCompare = useCallback((p: Provider) => {
    setCompareList(prev =>
      prev.includes(p.id) ? prev.filter(id => id !== p.id) : prev.length < 4 ? [...prev, p.id] : prev
    );
  }, []);

  return (
    <div className="mp-root">

      <PageHeader
        eyebrow={<><span className="ov-live-dot" />Arc Testnet · Live</>}
        title="Marketplace"
        subtitle="Find and connect with the best providers."
      />

      {/* ── Toolbar ── */}
      <div className="mp-controls">
        <div className="mp-search-wrap">
          <Search size={15} className="mp-search-icon" />
          <input
            className="mp-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search providers…"
          />
          {search && <button className="mp-search-x" onClick={() => setSearch("")} aria-label="Clear search">✕</button>}
        </div>

        <ChipRow>
          <Chip active={!activeOnly && !highRep} onClick={() => { setActiveOnly(false); setHighRep(false); }}>All</Chip>
          <Chip active={activeOnly} onClick={() => setActiveOnly(o => !o)}>Active</Chip>
          <Chip active={highRep} onClick={() => setHighRep(o => !o)}>High reputation</Chip>
        </ChipRow>

        <div className="mp-ctrl-right">
          <Select
            value={sortKey}
            onChange={e => { setSortKey(e.target.value as SortKey); setSortDir("desc"); }}
            aria-label="Sort providers"
          >
            <option value="reputation">Top rated</option>
            <option value="pricePerCall">Lowest price</option>
            <option value="completedCalls">Most calls</option>
            <option value="stake">Most stake</option>
          </Select>
          <div className="mp-view-grp">
            <button className={`mp-view-btn${view === "list" ? " mp-view-on" : ""}`} onClick={() => setView("list")} aria-label="List view">≡</button>
            <button className={`mp-view-btn${view === "grid" ? " mp-view-on" : ""}`} onClick={() => setView("grid")} aria-label="Grid view">⊞</button>
          </div>
        </div>
      </div>

      {/* ── Compare bar ── */}
      {compareList.length >= 2 && (
        <div className="mp-cmp-bar">
          <div className="mp-cmp-bar-l">
            <span className="mp-cmp-count">{compareList.length}</span>
            <span className="mp-cmp-lbl">selected</span>
            {compareList.map(id => (
              <span key={id} className="mp-cmp-pill">
                #{id}
                <button onClick={() => setCompareList(l => l.filter(x => x !== id))}>✕</button>
              </span>
            ))}
          </div>
          <button className="mp-btn-cmp-go" onClick={() => setShowCompare(true)}>Compare →</button>
        </div>
      )}

      {/* ── Cards ── */}
      <div className="mp-content">
        {isLoading ? (
          <div className={view === "grid" ? "mp-grid" : "mp-list"}>
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mp-empty">
            <div className="mp-empty-icon">◎</div>
            <div className="mp-empty-title">No providers found</div>
            <div className="mp-empty-sub">
              {activeOnly && highRep
                ? "No providers match the active + high-reputation filters."
                : activeOnly
                  ? "Try removing the active filter."
                  : highRep
                    ? "No providers have a reputation of 90 or higher."
                    : "No providers match your search."}
            </div>
            {(activeOnly || highRep) && (
              <button className="mp-btn-call" style={{ marginTop: 16 }} onClick={() => { setActiveOnly(false); setHighRep(false); }}>
                Show all providers
              </button>
            )}
          </div>
        ) : (
          <div className={view === "grid" ? "mp-grid" : "mp-list"}>
            {filtered.map((p, i) => (
              <ProviderCard
                key={p.id} p={p}
                onCall={handleCall}
                onCompare={handleCompare}
                onProfile={(id) => { sessionStorage.setItem("provprofile_id", id); setPanel("provprofile"); }}
                inCompare={compareList.includes(p.id)}
                top={i === 0 && sortKey === "reputation"}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      {!isLoading && filtered.length > 0 && (
        <div className="mp-footer">
          {filtered.length} of {providers.length} providers
          <span className="mp-sep">·</span>Goldsky subgraph
          <span className="mp-sep">·</span>15s refresh
        </div>
      )}

      {/* ── Compare modal ── */}
      {showCompare && cmpProviders.length >= 2 && (
        <CompareModal providers={cmpProviders} onClose={() => setShowCompare(false)} onCall={handleCall} />
      )}
    </div>
  );
}
