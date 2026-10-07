import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, Users } from "lucide-react";

const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/3.0.0/gn";
const ARCSCAN = "https://explorer.testnet.arc.io";

const s = {
  page: { padding: "20px 16px", maxWidth: 900, margin: "0 auto" },
  h1: { fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 } as React.CSSProperties,
  card: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" },
  cardLabel: { fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 4 },
  cardVal: { fontSize: 22, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-display)" },
  cardSub: { fontSize: 11, color: "var(--text-dim)", marginTop: 2 },
  section: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 },
  sectionTitle: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 12 },
  btn: { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: "var(--bg-3)", color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 6 } as React.CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 11 } as React.CSSProperties,
};

interface AnalyticsData {
  totalCalls: number;
  completedCalls: number;
  slashedCalls: number;
  activeProviders: number;
  totalProviders: number;
  honorRate: number | null;
  avgPrice: number;
  topProviders: { id: string; total: number; completed: number; slashed: number }[];
  recentCalls: { id: string; providerId: string; amount: string; status: string; createdAt: string }[];
  updatedAt: string;
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `{
            providers(first:1000) { id completedCalls slashedCalls stake pricePerCall active }
            calls(first:1000,orderBy:createdAt,orderDirection:desc) { id providerId amount createdAt status }
          }`
        }),
      });
      const json = await res.json();
      const providers = (json.data?.providers ?? []) as Record<string, string>[];
      const calls = (json.data?.calls ?? []) as Record<string, string>[];

      const active = providers.filter(p => p.active).length;
      const totalCompleted = providers.reduce((a, p) => a + Number(p.completedCalls || 0), 0);
      const totalSlashed = providers.reduce((a, p) => a + Number(p.slashedCalls || 0), 0);
      const totalClosed = totalCompleted + totalSlashed;
      const honorRate = totalClosed > 0 ? Math.round((totalCompleted / totalClosed) * 100) : null;
      const avgPrice = providers.length > 0
        ? providers.reduce((a, p) => a + Number(p.pricePerCall || 0), 0) / providers.length / 1e6
        : 0;

      const topProviders = providers
        .map(p => ({ id: p.id, total: Number(p.completedCalls || 0) + Number(p.slashedCalls || 0), completed: Number(p.completedCalls || 0), slashed: Number(p.slashedCalls || 0) }))
        .filter(p => p.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

      setData({
        totalCalls: calls.length,
        completedCalls: totalCompleted,
        slashedCalls: totalSlashed,
        activeProviders: active,
        totalProviders: providers.length,
        honorRate,
        avgPrice,
        topProviders,
        recentCalls: calls.slice(0, 12).map(c => ({ id: String(c.id), providerId: String(c.providerId), amount: String(c.amount), status: String(c.status), createdAt: String(c.createdAt) })),
        updatedAt: new Date().toLocaleTimeString("en-US", { hour12: false }),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? (e instanceof Error ? e.message : String(e)) : "Failed to load analytics");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAnalytics();
    const interval = setInterval(() => { void loadAnalytics(); }, 30_000);
    return () => clearInterval(interval);
  }, [loadAnalytics]);

  const honorColor = data?.honorRate != null
    ? data.honorRate >= 80 ? "var(--accent)" : data.honorRate >= 50 ? "#f59e0b" : "#ef4444"
    : "var(--text-faint)";

  function ago(ts: string) {
    const nowTs = Math.floor(Date.now() / 1000);
    const diff = nowTs - Number(ts);
    if (!ts || isNaN(diff)) return "";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return `${Math.round(diff / 3600)}h ago`;
  }
  function statusColor(st: string) {
    const s = String(st).toUpperCase();
    return s === "COMPLETED" ? "var(--accent)" : s === "SLASHED" ? "#ef4444" : "#f59e0b";
  }

  return (
    <div style={s.page}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={s.h1}>Network Analytics</h1>
          <p style={s.sub}>Live on-chain metrics via Goldsky subgraph{data ? ` · updated ${data.updatedAt}` : ""}</p>
        </div>
        <button style={s.btn} onClick={loadAnalytics} disabled={loading}>
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, fontSize: 13, color: "#ef4444" }}>
          ⚠ {error} — showing cached data if available
        </div>
      )}

      {/* Stats grid */}
      <div style={s.grid4}>
        <div style={s.card}>
          <div style={s.cardLabel}><TrendingUp size={10} style={{ marginRight: 4 }} />Total Calls</div>
          <div style={s.cardVal}>{loading && !data ? "…" : (data?.totalCalls ?? "—")}{(data?.totalCalls ?? 0) >= 1000 ? "+" : ""}</div>
          <div style={s.cardSub}>{data ? `${data.completedCalls} completed · ${data.slashedCalls} slashed` : "loading…"}</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}>Honor Rate</div>
          <div style={{ ...s.cardVal, color: honorColor }}>{data?.honorRate != null ? `${data.honorRate}%` : "—"}</div>
          <div style={s.cardSub}>{data ? `${data.completedCalls} honored / ${data.completedCalls + data.slashedCalls} closed` : "loading…"}</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}><Users size={10} style={{ marginRight: 4 }} />Providers</div>
          <div style={s.cardVal}>{data?.activeProviders ?? "—"}</div>
          <div style={s.cardSub}>{data ? `${data.totalProviders} total registered` : "loading…"}</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}>Avg Price / Call</div>
          <div style={s.cardVal}>{data?.avgPrice ? `$${data.avgPrice.toFixed(3)}` : "—"}</div>
          <div style={s.cardSub}>USDC across all providers</div>
        </div>
      </div>

      {/* Provider performance bars */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Provider Performance (calls)</div>
        {loading && !data ? (
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</div>
        ) : data?.topProviders.length ? (() => {
          const maxTotal = data.topProviders[0]?.total || 1;
          return data.topProviders.map(p => {
            const pct = Math.round((p.total / maxTotal) * 100);
            const honor = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 100;
            const barColor = honor >= 80 ? "var(--accent)" : honor >= 50 ? "#f59e0b" : "#ef4444";
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12 }}>
                <span style={{ width: 44, color: "var(--text-faint)", flexShrink: 0 }}>#{p.id}</span>
                <div style={{ flex: 1, background: "var(--bg-3)", borderRadius: 4, height: 20, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 4, transition: "width .3s" }} />
                </div>
                <span style={{ width: 60, color: "var(--text-dim)", fontSize: 11 }}>{p.total} calls</span>
                <span style={{ width: 40, color: barColor, fontWeight: 600 }}>{honor}%</span>
              </div>
            );
          });
        })() : (
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No call data yet</div>
        )}
      </div>

      {/* Recent calls */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Recent Calls</div>
        {loading && !data ? (
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</div>
        ) : data?.recentCalls.length ? data.recentCalls.map(c => (
          <div key={c.id} style={s.row}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(c.status), flexShrink: 0, display: "inline-block" }} />
            <span style={{ color: "var(--text-faint)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>#{c.providerId}</span>
            <span style={{ color: statusColor(c.status), flexShrink: 0 }}>{String(c.status).toLowerCase()}</span>
            <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{(Number(c.amount || 0) / 1e6).toFixed(3)} USDC</span>
            <span style={{ marginLeft: "auto", color: "var(--text-faint)", whiteSpace: "nowrap" }}>{ago(c.createdAt)}</span>
            <a
              href={`${ARCSCAN}/tx/${c.id}`} target="_blank" rel="noreferrer"
              style={{ color: "var(--accent)", fontSize: 10, textDecoration: "none", marginLeft: 4 }}
            >↗</a>
          </div>
        )) : (
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No recent calls</div>
        )}
      </div>

      {loading && !data && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-faint)", fontSize: 13 }}>
          Loading analytics from Goldsky…
        </div>
      )}
    </div>
  );
}
