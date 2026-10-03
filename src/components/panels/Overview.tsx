import { useProviderCount, useCallCount, useSlashCount, useReceiptCount } from "../../hooks/useOnchain";
import { useSubgraph } from "../../hooks/useSubgraph";
import { CONFIG } from "../../lib/config";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-bg-2 rounded-xl p-4 border border-border hover:border-border-hi transition-colors">
      <div className="text-xs uppercase tracking-widest text-text-faint mb-1">{label}</div>
      <div className="text-2xl font-bold font-display text-text tabular-nums">{value}</div>
      {sub && <div className="text-xs text-text-dim mt-1">{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const { data: providers } = useProviderCount();
  const { data: calls } = useCallCount();
  const { data: slashes } = useSlashCount();
  const { data: receipts } = useReceiptCount();
  const { data: sgData } = useSubgraph(`{ calls(first:5,orderBy:createdAt,orderDirection:desc){ id status providerId caller amount createdAt } }`);

  const fmt = (v: bigint | undefined) => v !== undefined ? v.toString() : "—";
  const honor = calls && receipts && calls > 0n ? Math.round(Number(receipts) * 100 / Number(calls)) : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-accent mb-1">Network</div>
        <h2 className="text-2xl font-bold font-display text-text">Overview</h2>
        <p className="text-sm text-text-dim mt-1">Monitor services, requests and settlements on Arc Testnet.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Providers" value={fmt(providers)} sub="registered" />
        <StatCard label="Total Calls" value={fmt(calls)} sub="all-time" />
        <StatCard label="Receipts" value={fmt(receipts)} sub="SLA honored" />
        <StatCard label="Honor Rate" value={`${honor}%`} sub={`${fmt(slashes)} slashes`} />
      </div>

      {/* Live Activity */}
      {sgData?.calls?.length > 0 && (
        <div className="bg-bg-2 rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-text-faint">Live Activity</span>
            <span className="flex items-center gap-1 text-xs text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> streaming
            </span>
          </div>
          <div className="divide-y divide-border">
            {sgData.calls.map((c: any) => (
              <div key={c.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.status === "SLASHED" ? "bg-danger/20 text-danger" : c.status === "COMPLETED" ? "bg-accent/20 text-accent" : "bg-info/20 text-info"}`}>
                    {c.status}
                  </span>
                  <span className="text-text-dim">provider #{c.providerId}</span>
                </div>
                <span className="text-text-faint font-mono">{c.amount ? (Number(c.amount) / 1e6).toFixed(2) : "?"} USDC</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contracts */}
      <div className="bg-bg-2 rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xs uppercase tracking-widest text-text-faint">Deployed Contracts</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {Object.entries({ ServiceRegistry: CONFIG.registry, PayPerCall: CONFIG.payPerCall, DisputeQuality: CONFIG.disputeQuality, SLAFutures: CONFIG.slaFutures, ReputationLoan: CONFIG.reputationLoan, SLABridge: CONFIG.slaAttestationBridge }).map(([name, addr]) => (
            <div key={name} className="px-4 py-2.5 flex items-center justify-between text-xs">
              <span className="text-text-dim">{name}</span>
              <a href={CONFIG.explorerAddr(addr)} target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">
                {addr.slice(0,6)}…{addr.slice(-4)}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
