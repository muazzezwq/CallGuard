import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useSubgraph } from "../../hooks/useSubgraph";
import { formatUnits } from "viem";
import {
  PageHeader, SectionCard, StatCard, Toolbar, Chip, ChipRow,
  Input, Button, Badge, EmptyState, Skeleton,
} from "../../ui";
import { SLACanvas, slaStages } from "../viz/SLACanvas";

const PAGE_SIZE = 25;

type Call = Record<string, unknown>;

const STATUS_TONE: Record<string, "guard" | "pending" | "slash" | "neutral" | "info"> = {
  COMPLETED: "guard",
  STARTED: "pending",
  SLASHED: "slash",
  REFUNDED: "info",
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "COMPLETED", label: "Completed" },
  { id: "STARTED", label: "Open" },
  { id: "SLASHED", label: "Slashed" },
  { id: "REFUNDED", label: "Refunded" },
];

function usdc(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  try { return formatUnits(BigInt(String(v)), 6); } catch { return null; }
}

function when(v: unknown) {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toLocaleString() : null;
}

function exportHistory(calls: Call[], format: "csv" | "json") {
  if (!calls.length) return;
  if (format === "csv") {
    const headers = ["Call ID", "Provider", "Amount (USDC)", "Status", "Date", "RequestHash"];
    const rows = calls.map(c => [
      c.id ?? "",
      c.providerId ?? "",
      usdc(c.amount) ?? "0",
      c.status ?? "",
      when(c.createdAt) ?? "",
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, loading, refetch } = useSubgraph<{ calls: Call[] }>(
    address ? `{
      calls(first:500 orderBy:createdAt orderDirection:desc where:{caller:"${address.toLowerCase()}"}) {
        id providerId caller amount status createdAt completedAt requestHash responseHash refunded slashed
      }
    }` : "",
    { enabled: !!address, pollInterval: 30000 }
  );

  const all = data?.calls ?? [];

  const filtered = all.filter(c => {
    if (statusFilter !== "all" && String(c.status) !== statusFilter) return false;
    const s = search.toLowerCase();
    if (s && !String(c.id).includes(s) && !String(c.providerId).includes(s)) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const onSearch = useCallback((v: string) => { setSearch(v); setPage(0); }, []);
  const onFilter = useCallback((v: string) => { setStatusFilter(v); setPage(0); }, []);

  const completed = all.filter(c => c.status === "COMPLETED").length;
  const slashed = all.filter(c => c.status === "SLASHED").length;
  const open = all.filter(c => c.status === "STARTED").length;

  const selected = all.find(c => String(c.id) === selectedId) ?? null;

  return (
    <div className="ov-page tx-page">
      <PageHeader
        eyebrow={<><span className="ov-live-dot" />Arc Testnet · Live</>}
        title="Transactions"
        subtitle="Every call, receipt and settlement recorded on chain."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => exportHistory(filtered, "csv")}>Export CSV</Button>
            <Button variant="secondary" size="sm" onClick={() => exportHistory(filtered, "json")}>Export JSON</Button>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>Refresh</Button>
          </>
        }
      />

      <div className="ov-grid4">
        <StatCard label="Total calls" value={all.length} loading={loading} />
        <StatCard label="Completed" value={completed} loading={loading} />
        <StatCard label="Open" value={open} loading={loading} />
        <StatCard label="Slashed" value={slashed} loading={loading} />
      </div>

      <Toolbar>
        <Input
          placeholder="Search by call ID or provider…"
          value={search}
          onChange={e => onSearch(e.target.value)}
          aria-label="Search transactions"
        />
        <ChipRow>
          {FILTERS.map(f => (
            <Chip key={f.id} active={statusFilter === f.id} onClick={() => onFilter(f.id)}>{f.label}</Chip>
          ))}
        </ChipRow>
      </Toolbar>

      {!address && (
        <SectionCard className="tx-block">
          <EmptyState title="Connect a wallet" description="Your on-chain call history appears here once a wallet is connected." />
        </SectionCard>
      )}

      {address && (
        <div className="tx-split">
          <SectionCard className="tx-block" title={`${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`} bodyClass="tx-block__body">
            {loading && (
              <div className="tx-skel">
                {[...Array(6)].map((_, i) => <Skeleton key={i} height={62} />)}
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <EmptyState
                title="No transactions match"
                description={statusFilter === "all" ? "This wallet has no calls on Arc yet." : "Try another status filter."}
              />
            )}

            {!loading && paged.map(c => {
              const id = String(c.id);
              const status = String(c.status);
              const amount = usdc(c.amount);
              const isSel = selectedId === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`tx-row${isSel ? " tx-row--on" : ""}`}
                  onClick={() => setSelectedId(isSel ? null : id)}
                  aria-pressed={isSel}
                >
                  <span className={`tx-row__dot tx-row__dot--${(STATUS_TONE[status] ?? "neutral")}`} />
                  <span className="tx-row__id mono">{id.slice(0, 14)}…</span>
                  <span className="tx-row__meta">
                    <span className="tx-row__prov">Provider #{String(c.providerId)}</span>
                    <span className="tx-row__time">{when(c.createdAt) ?? "—"}</span>
                  </span>
                  <span className="tx-row__amt">{amount ? `${amount} USDC` : "—"}</span>
                  <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status || "UNKNOWN"}</Badge>
                </button>
              );
            })}

            {totalPages > 1 && (
              <div className="tx-pager">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <span className="tx-pager__lbl">Page {page + 1} / {totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </SectionCard>

          <div className="tx-detail">
            {!selected && (
              <SectionCard className="tx-block">
                <EmptyState
                  title="Select a transaction"
                  description="Pick a row to trace its SLA lifecycle, hashes and settlement."
                />
              </SectionCard>
            )}

            {selected && (
              <>
                <SectionCard
                  title="SLA lifecycle"
                  subtitle={`Call ${String(selected.id).slice(0, 18)}…`}
                >
                  <SLACanvas stages={slaStages(String(selected.status), { amount: usdc(selected.amount) ?? undefined })} />
                </SectionCard>

                <SectionCard title="Details" bodyClass="tx-block__body">
                  <dl className="tx-fields">
                    {[
                      { k: "Call ID", v: String(selected.id), mono: true, copy: true },
                      { k: "Provider", v: `#${String(selected.providerId)}`, mono: true },
                      { k: "Amount", v: usdc(selected.amount) ? `${usdc(selected.amount)} USDC` : "—", mono: true },
                      { k: "Status", v: String(selected.status) || "—" },
                      { k: "Created", v: when(selected.createdAt) ?? "—" },
                      { k: "Completed", v: when(selected.completedAt) ?? "—" },
                      { k: "Request hash", v: selected.requestHash ? String(selected.requestHash) : "—", mono: true },
                      { k: "Response hash", v: selected.responseHash ? String(selected.responseHash) : "—", mono: true },
                    ].map(f => (
                      <div key={f.k} className="tx-field">
                        <dt>{f.k}</dt>
                        <dd className={f.mono ? "mono" : undefined}>
                          {f.v}
                          {f.copy && (
                            <button
                              type="button"
                              className="tx-copy"
                              aria-label="Copy call ID"
                              onClick={() => navigator.clipboard?.writeText(String(selected.id)).catch(() => {})}
                            >
                              Copy
                            </button>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {(!!selected.refunded || !!selected.slashed) && (
                    <div className="tx-flags">
                      {!!selected.refunded && <Badge tone="info" dot>Refunded to caller</Badge>}
                      {!!selected.slashed && <Badge tone="slash" dot>Stake slashed</Badge>}
                    </div>
                  )}
                </SectionCard>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
