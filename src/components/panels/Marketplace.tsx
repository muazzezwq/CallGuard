import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { formatUnits } from "viem";
import { useProviders } from "../../hooks/useSubgraph";
import { useAppStore } from "../../store/useAppStore";
import type { Provider } from "../../lib/subgraph";

type SortKey = "reputation" | "pricePerCall" | "completedCalls" | "maxResponseTime";
type SortDir = "asc" | "desc";

/* ─────────────────────────────────────────────
   Particle Network Canvas  (header bg)
───────────────────────────────────────────── */
function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = ctx;

    let W = 0, H = 0;

    function resize() {
      if (!canvas) return;
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * window.devicePixelRatio;
      canvas.height = H * window.devicePixelRatio;
      c.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();

    const N = Math.min(55, Math.floor((W * H) / 9000));
    type Dot = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    const dots: Dot[] = Array.from({ length: N }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.5, a: Math.random() * 0.45 + 0.18,
    }));

    function tick() {
      c.clearRect(0, 0, W, H);
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x, dy = dots[i].y - dots[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            c.beginPath();
            c.strokeStyle = `rgba(16,185,129,${0.11 * (1 - d / 110)})`;
            c.lineWidth = 0.5;
            c.moveTo(dots[i].x, dots[i].y);
            c.lineTo(dots[j].x, dots[j].y);
            c.stroke();
          }
        }
      }
      for (const d of dots) {
        c.beginPath();
        c.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        c.fillStyle = `rgba(16,185,129,${d.a})`;
        c.fill();
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0 || d.x > W) d.vx *= -1;
        if (d.y < 0 || d.y > H) d.vy *= -1;
      }
      raf.current = requestAnimationFrame(tick);
    }
    tick();

    const obs = new ResizeObserver(resize);
    obs.observe(canvas);
    return () => { cancelAnimationFrame(raf.current); obs.disconnect(); };
  }, []);

  return <canvas ref={ref} className="mp-particle-canvas" aria-hidden="true" />;
}

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
        ? `rgba(16,185,129,${isLast ? 1 : fade * 0.7})`
        : v > 0.4
          ? `rgba(245,158,11,${isLast ? 1 : fade * 0.7})`
          : `rgba(239,68,68,${isLast ? 1 : fade * 0.7})`;

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
  const col = rate >= 90 ? "#10b981" : rate >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" className="mp-ring">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={SW} />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={col} strokeWidth={SW}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${CX} ${CY})`}
        style={{ transition: "stroke-dasharray 0.7s cubic-bezier(.4,0,.2,1)" }} />
      <text x={CX} y={CY + 4} textAnchor="middle" fontSize={7.5}
        fill={col} fontFamily="monospace" fontWeight="bold">
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
   Stats Bar  (header summary)
───────────────────────────────────────────── */
function StatsBar({ providers }: { providers: Provider[] }) {
  const active = providers.filter(p => p.active).length;
  const avg = providers.length
    ? Math.round(providers.reduce((s, p) => s + p.reputation, 0) / providers.length) : 0;
  const calls = providers.reduce((s, p) => s + p.completedCalls, 0);
  const elite = providers.filter(p => p.reputation >= 95).length;

  return (
    <div className="mp-stats-bar">
      {[
        { v: providers.length, l: "Total", c: "" },
        { v: active, l: "Active", c: "green" },
        { v: `${avg}%`, l: "Avg Honor", c: "" },
        { v: calls.toLocaleString(), l: "Calls", c: "" },
        { v: elite, l: "Elite", c: "purple" },
      ].map((s, i) => (
        <div key={s.l} className="mp-stats-item">
          {i > 0 && <div className="mp-stats-div" />}
          <div className={`mp-stats-val ${s.c ? `mp-stats-${s.c}` : ""}`}>{s.v}</div>
          <div className="mp-stats-lbl">{s.l}</div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Provider Card
───────────────────────────────────────────── */
function ProviderCard({ p, onCall, onCompare, inCompare, top }: {
  p: Provider; onCall: (p: Provider) => void; onCompare: (p: Provider) => void;
  inCompare: boolean; top: boolean;
}) {
  const [hov, setHov] = useState(false);
  const price = formatUnits(BigInt(p.pricePerCall || 0), 6);
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
          <div className="mp-metric-lbl">SLA</div>
          <div className="mp-metric-val">{p.maxResponseTime ?? "—"}<span className="mp-metric-unit">s</span></div>
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
    { l: "SLA window", fn: p => p.maxResponseTime ? `${p.maxResponseTime}s` : "—" },
    { l: "Completed", fn: p => p.completedCalls.toString() },
    { l: "Slashed", fn: p => p.slashedCalls.toString() },
    { l: "Slash %", fn: p => p.slashBps ? `${(p.slashBps / 100).toFixed(1)}%` : "—" },
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
   Sort Button
───────────────────────────────────────────── */
function SortBtn({ label, active, dir, onClick }: {
  label: string; active: boolean; dir: SortDir; onClick: () => void;
}) {
  return (
    <button className={`mp-sort${active ? " mp-sort-on" : ""}`} onClick={onClick}>
      {label}{active && <span className="mp-sort-arrow">{dir === "desc" ? " ↓" : " ↑"}</span>}
    </button>
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
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = useMemo(() => {
    let list = [...providers];
    if (activeOnly) list = list.filter(p => p.active);
    if (search) list = list.filter(p =>
      String(p.id).includes(search) || p.owner.toLowerCase().includes(search.toLowerCase())
    );
    list.sort((a, b) => {
      const av = Number(a[sortKey] ?? 0), bv = Number(b[sortKey] ?? 0);
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [providers, activeOnly, search, sortKey, sortDir]);

  const cmpProviders = useMemo(() => providers.filter(p => compareList.includes(p.id)), [providers, compareList]);

  const handleCall = useCallback(() => setPanel("calls"), [setPanel]);
  const handleCompare = useCallback((p: Provider) => {
    setCompareList(prev =>
      prev.includes(p.id) ? prev.filter(id => id !== p.id) : prev.length < 4 ? [...prev, p.id] : prev
    );
  }, []);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  return (
    <div className="mp-root">

      {/* ── Hero ── */}
      <div className="mp-hero">
        <ParticleCanvas />
        <div className="mp-hero-body">
          <div className="mp-hero-eyebrow">
            <span className="mp-live-dot" />
            <span>Arc Testnet · Live</span>
          </div>
          <h1 className="mp-hero-title">Browse Providers</h1>
          <p className="mp-hero-sub">
            Discover verified AI service providers, compare SLAs, and call with a single transaction.
          </p>
          {!isLoading && providers.length > 0 && <StatsBar providers={providers} />}
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="mp-controls">
        <div className="mp-search-wrap">
          <span className="mp-search-icon">⌕</span>
          <input
            className="mp-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by ID or address…"
          />
          {search && <button className="mp-search-x" onClick={() => setSearch("")}>✕</button>}
        </div>

        <div className="mp-ctrl-right">
          {/* active toggle */}
          <button
            className={`mp-active-toggle${activeOnly ? " mp-active-on" : ""}`}
            onClick={() => setActiveOnly(o => !o)}
          >
            <span className="mp-active-knob" />
            <span className="mp-active-lbl">Active only</span>
          </button>

          {/* sort */}
          <div className="mp-sort-group">
            {(["reputation", "pricePerCall", "completedCalls", "maxResponseTime"] as SortKey[]).map(k => (
              <SortBtn
                key={k} label={k === "reputation" ? "Honor" : k === "pricePerCall" ? "Price" : k === "completedCalls" ? "Calls" : "SLA"}
                active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)}
              />
            ))}
          </div>

          {/* view toggle */}
          <div className="mp-view-grp">
            <button className={`mp-view-btn${view === "grid" ? " mp-view-on" : ""}`} onClick={() => setView("grid")}>⊞</button>
            <button className={`mp-view-btn${view === "list" ? " mp-view-on" : ""}`} onClick={() => setView("list")}>≡</button>
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
              {activeOnly ? "Try removing the active filter." : "No providers match your search."}
            </div>
            {activeOnly && (
              <button className="mp-btn-call" style={{ marginTop: 16 }} onClick={() => setActiveOnly(false)}>
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
