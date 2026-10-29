import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, Users } from "lucide-react";

import { Button, ErrorState, PageHeader, Stat } from "../../ui";
import { CONFIG } from "../../lib/config";
import {
  KeyValue, Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit,
  SignalRow, StatusNotice,
} from "../panel/PanelUi";

const SUBGRAPH_URL = CONFIG.subgraphUrl;

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

function statusTone(st: string): "guard" | "danger" | "warn" {
  const s = String(st).toUpperCase();
  return s === "COMPLETED" ? "guard" : s === "SLASHED" ? "danger" : "warn";
}

function statusColor(st: string) {
  const s = String(st).toUpperCase();
  return s === "COMPLETED" ? "var(--accent)" : s === "SLASHED" ? "var(--danger)" : "var(--warn)";
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
    ? data.honorRate >= 80 ? "var(--accent)" : data.honorRate >= 50 ? "var(--warn)" : "var(--danger)"
    : "var(--text-faint)";

  function ago(ts: string) {
    const nowTs = Math.floor(Date.now() / 1000);
    const diff = nowTs - Number(ts);
    if (!ts || isNaN(diff)) return "";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return `${Math.round(diff / 3600)}h ago`;
  }

  const sourceState = error ? "unavailable" : loading && data ? "cached" : data ? "live" : "idle";

  const providerRows = data?.topProviders.length ? data.topProviders.map(p => {
    const maxTotal = data.topProviders[0]?.total || 1;
    const pct = Math.round((p.total / maxTotal) * 100);
    const honor = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 100;
    const barColor = honor >= 80 ? "var(--accent)" : honor >= 50 ? "var(--warn)" : "var(--danger)";
    return (
      <LedgerRow
        key={p.id}
        lead={
          <span className="pg-bar">
            <span className="pg-bar__id">#{p.id}</span>
            <span className="pg-bar__track" aria-hidden="true">
              <span className="pg-bar__fill" style={{ width: `${pct}%`, background: barColor }} />
            </span>
            <span className="pg-bar__total">{p.total} calls</span>
          </span>
        }
        trailing={<span style={{ color: barColor, fontWeight: 600 }}>{honor}%</span>}
      />
    );
  }) : null;

  const recentRows = data?.recentCalls.length ? data.recentCalls.map(c => (
    <LedgerRow
      key={c.id}
      tone={statusTone(c.status)}
      lead={
        <span className="pg-callrow">
          <span className="pg-dot" style={{ background: statusColor(c.status) }} aria-hidden="true" />
          <span className="pg-mono">#{c.providerId}</span>
          <span style={{ color: statusColor(c.status) }}>{String(c.status).toLowerCase()}</span>
        </span>
      }
      meta={<span className="pg-mono">{(Number(c.amount || 0) / 1e6).toFixed(3)} USDC</span>}
      trailing={ago(c.createdAt)}
    />
  )) : null;

  return (
    <PanelShell>
      <PageHeader
        title="Network Analytics"
        subtitle={`Live on-chain metrics via The Graph subgraph${data ? ` · updated ${data.updatedAt}` : ""}`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={loadAnalytics}
            disabled={loading}
            loading={loading}
            leftIcon={<RefreshCw size={14} />}
          >
            Refresh
          </Button>
        }
      />

      <PanelSource
        label="The Graph subgraph"
        value={data ? `updated ${data.updatedAt}` : "waiting for first response"}
        hint="30 s refresh · 1,000-row caps"
        state={sourceState}
      />

      {error && (
        <ErrorState
          icon={<RefreshCw size={20} />}
          title="Couldn't load analytics"
          description={`${error} — showing cached data if available`}
          action={
            <Button variant="secondary" size="sm" onClick={loadAnalytics} disabled={loading} leftIcon={<RefreshCw size={14} />}>
              Retry
            </Button>
          }
        />
      )}

      <SignalRow label="Network signals">
        <Stat
          label={<span className="pg-stat-label"><TrendingUp size={11} aria-hidden="true" />Total Calls</span>}
          value={<>{loading && !data ? "…" : (data?.totalCalls ?? "—")}{(data?.totalCalls ?? 0) >= 1000 ? "+" : ""}</>}
          hint={data ? `${data.completedCalls} completed · ${data.slashedCalls} slashed` : "loading…"}
        />
        <Stat
          label="Honor Rate"
          value={<span style={{ color: honorColor }}>{data?.honorRate != null ? `${data.honorRate}%` : "—"}</span>}
          hint={data ? `${data.completedCalls} honored / ${data.completedCalls + data.slashedCalls} closed` : "loading…"}
        />
        <Stat
          label={<span className="pg-stat-label"><Users size={11} aria-hidden="true" />Providers</span>}
          value={<>{data?.activeProviders ?? "—"}</>}
          hint={data ? `${data.totalProviders} total registered` : "loading…"}
        />
        <Stat
          label="Avg Price / Call"
          value={<>{data?.avgPrice ? `$${data.avgPrice.toFixed(3)}` : "—"}</>}
          hint="USDC across all providers"
        />
      </SignalRow>

      <PanelSplit
        main={
          <>
            {data && data.recentCalls.length > 0 && (
              <section className="pg-figure" aria-labelledby="analytics-activity-title">
                <div className="pg-figure__head">
                  <h2 className="pg-figure__title" id="analytics-activity-title">
                    Call Activity (last {data.recentCalls.length})
                  </h2>
                  <div className="pg-legend" aria-hidden="true">
                    <span className="pg-legend__item"><span className="pg-legend__dot is-guard" />Completed</span>
                    <span className="pg-legend__item"><span className="pg-legend__dot is-warn" />Pending</span>
                    <span className="pg-legend__item"><span className="pg-legend__dot is-danger" />Slashed</span>
                  </div>
                </div>
                <div className="pg-ticks" aria-hidden="true">
                  {data.recentCalls.map(c => (
                    <span
                      key={c.id}
                      className={`pg-tick is-${statusTone(c.status)}`}
                      title={`#${c.providerId} · ${String(c.status).toLowerCase()}`}
                    />
                  ))}
                </div>
                <p className="pg-figure__note">Most recent calls, newest first.</p>
                <table className="pg-visually-hidden">
                  <caption>Recent call outcomes</caption>
                  <thead>
                    <tr><th scope="col">Provider</th><th scope="col">Status</th><th scope="col">Amount</th><th scope="col">When</th></tr>
                  </thead>
                  <tbody>
                    {data.recentCalls.map(c => (
                      <tr key={c.id}>
                        <td>#{c.providerId}</td>
                        <td>{String(c.status).toLowerCase()}</td>
                        <td>{(Number(c.amount || 0) / 1e6).toFixed(3)} USDC</td>
                        <td>{ago(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <Ledger
              label="Provider Performance (calls)"
              empty={loading && !data ? "Loading…" : "No call data yet"}
            >
              {providerRows}
            </Ledger>

            <Ledger
              label="Recent Calls"
              empty={loading && !data ? "Loading…" : "No recent calls"}
            >
              {recentRows}
            </Ledger>

            {loading && !data && (
              <p className="pg-loading">Loading analytics from The Graph…</p>
            )}
          </>
        }
        rail={
          <>
            <KeyValue
              label="Source & limits"
              rows={[
                { label: "Indexer", value: "The Graph subgraph" },
                { label: "Call cap", value: "1,000 latest calls", mono: true },
                { label: "Provider cap", value: "1,000 providers", mono: true },
                { label: "Auto-refresh", value: "Every 30 seconds" },
                { label: "Recent rows", value: "12" },
                { label: "Provider rows", value: "Top 8 by calls" },
              ]}
            />
            <StatusNotice tone="info" title="Read-only view" live="off">
              This panel reads the public subgraph and never sends a transaction.
            </StatusNotice>
          </>
        }
      />
    </PanelShell>
  );
}
