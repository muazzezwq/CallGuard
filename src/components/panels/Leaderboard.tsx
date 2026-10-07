import { useState } from 'react'
import { useAccount } from 'wagmi'
import { formatUnits } from 'viem'
import { useSubgraph } from '../../hooks/useSubgraph'
import { useAppStore } from '../../store/useAppStore'

const PROVIDER_QUERY = `{
  providers(first: 20, orderBy: completedCalls, orderDirection: desc) {
    id owner completedCalls slashedCalls pricePerCall stake active
  }
}`
const SLASH_QUERY = `{
  providers(first: 20, orderBy: slashedCalls, orderDirection: desc) {
    id owner completedCalls slashedCalls pricePerCall stake active
  }
}`
const PRICE_QUERY = `{
  providers(first: 20, where: { active: true }, orderBy: pricePerCall, orderDirection: asc) {
    id owner completedCalls slashedCalls pricePerCall stake active
  }
}`

function honorRate(p: any) {
  const total = Number(p.completedCalls) + Number(p.slashedCalls)
  return total > 0 ? Math.round((Number(p.completedCalls) / total) * 100) : 100
}

function short(addr: string, n = 4) {
  if (!addr) return "—"
  return addr.slice(0, n + 2) + "…" + addr.slice(-n)
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

function ProviderRow({ p, rank, isSelf, onSelect, selected }: {
  p: any; rank: number; isSelf: boolean; onSelect: (id: string) => void; selected: boolean
}) {
  const rate = honorRate(p)
  const price = p.pricePerCall ? Number(formatUnits(BigInt(p.pricePerCall), 6)) : 0
  const stake = p.stake ? Number(formatUnits(BigInt(p.stake), 6)) : 0
  const barColor = rate >= 80 ? "var(--accent)" : rate >= 50 ? "var(--amber,#f59e0b)" : "#ef4444"

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      borderRadius: 8, marginBottom: 6,
      background: selected ? "rgba(16,185,129,0.07)" : isSelf ? "rgba(16,185,129,0.04)" : "var(--bg-3)",
      border: `1px solid ${selected ? "var(--accent)" : isSelf ? "rgba(16,185,129,0.2)" : "transparent"}`,
      cursor: "pointer", transition: "all .15s",
    }} onClick={() => onSelect(p.id)}>
      {/* rank */}
      <div style={{ width: 28, textAlign: "center", fontSize: rank <= 3 ? 18 : 13, fontWeight: 700, color: rank <= 3 ? "" : "var(--text-faint)", flexShrink: 0 }}>
        {MEDAL[rank] ?? rank}
      </div>
      {/* info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>Provider #{p.id}</span>
          {isSelf && <span style={{ fontSize: 9, fontWeight: 700, background: "var(--accent)", color: "#000", borderRadius: 4, padding: "1px 5px" }}>YOU</span>}
          {!p.active && <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 700 }}>INACTIVE</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>
          {short(p.owner || "")} · {price.toFixed(4)} USDC/call · {Number(p.completedCalls)} completed
        </div>
        {/* Honor bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          <div style={{ flex: 1, height: 4, background: "var(--bg-2)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${rate}%`, height: "100%", background: barColor, borderRadius: 2, transition: "width .4s" }} />
          </div>
          <span style={{ fontSize: 10, color: "var(--text-faint)", width: 32, textAlign: "right" }}>{rate}%</span>
        </div>
      </div>
      {/* right stats */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: barColor }}>{rate}%</div>
        <div style={{ fontSize: 10, color: "var(--text-faint)" }}>honor</div>
        <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
          {Number(p.completedCalls)}✓ / {Number(p.slashedCalls)}✗
        </div>
      </div>
    </div>
  )
}

export default function Leaderboard() {
  const { address } = useAccount()
  const { setPanel } = useAppStore()
  const [tab, setTab] = useState<'top' | 'slash' | 'price'>('top')
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set())

  const { data: topData, loading: topLoading, refetch: refetchTop } = useSubgraph(PROVIDER_QUERY, { pollInterval: 60_000 })
  const { data: slashData, loading: slashLoading } = useSubgraph(SLASH_QUERY, { pollInterval: 60_000 })
  const { data: priceData, loading: priceLoading } = useSubgraph(PRICE_QUERY, { pollInterval: 60_000 })

  const topProviders = (topData as any)?.providers || []
  const slashProviders = ((slashData as any)?.providers || []).filter((p: any) => Number(p.slashedCalls) > 0)
  const priceProviders = (priceData as any)?.providers || []

  const myAddr = address?.toLowerCase()

  const toggleCompare = (id: string) => {
    setCompareSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else if (next.size < 3) { next.add(id) }
      return next
    })
  }

  const tabs = [
    { id: 'top', label: '🏆 Top Providers' },
    { id: 'price', label: '💰 Best Price' },
    { id: 'slash', label: '⚡ Most Slashed' },
  ]

  function activeList() {
    if (tab === 'top') return topProviders
    if (tab === 'price') return priceProviders
    return slashProviders
  }
  const loading = tab === 'top' ? topLoading : tab === 'price' ? priceLoading : slashLoading
  const list = activeList()

  // compare card
  const compareProviders = topProviders.filter((p: any) => compareSet.has(p.id))

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>Leaderboard</h2>
        <button style={{ fontSize: 11, padding: "5px 10px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-dim)", cursor: "pointer" }} onClick={refetchTop}>↻ Refresh</button>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20 }}>
        Live provider rankings from Arc Testnet. Click rows to compare.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, background: "var(--bg-2)", borderRadius: 10, padding: 4, marginBottom: 20, width: "fit-content" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{
            padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
            fontWeight: 600, fontSize: 12, background: tab === t.id ? "var(--accent)" : "transparent",
            color: tab === t.id ? "#000" : "var(--text-dim)"
          }}>{t.label}</button>
        ))}
      </div>

      {/* Compare strip */}
      {compareSet.size > 0 && (
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 10 }}>
            Comparing ({compareSet.size}/3)
          </div>
          <div style={{ display: "flex", gap: 12, overflowX: "auto" as const }}>
            {compareProviders.map((p: any) => (
              <div key={p.id} style={{ flex: 1, minWidth: 140, background: "var(--bg-3)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Provider #{p.id}</div>
                {[
                  ["Honor", `${honorRate(p)}%`],
                  ["Price", `${p.pricePerCall ? Number(formatUnits(BigInt(p.pricePerCall), 6)).toFixed(4) : "—"} USDC`],
                  ["SLA", `${p.maxResponseTime}s`],
                  ["Stake", `${p.stake ? Number(formatUnits(BigInt(p.stake), 6)).toFixed(2) : "—"} USDC`],
                  ["Calls", `${Number(p.completedCalls)}`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--text-faint)" }}>{k}</span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
                <button onClick={() => toggleCompare(p.id)} style={{ marginTop: 8, width: "100%", fontSize: 10, padding: "4px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer", color: "var(--text-dim)" }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const best = compareProviders.sort((a: any, b: any) => honorRate(b) - honorRate(a))[0]
              if (best) { setPanel("callbuilder" as any); }
            }}
            style={{ marginTop: 10, padding: "7px 16px", background: "var(--accent)", color: "#000", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 12 }}
          >
            Use Best Provider →
          </button>
        </div>
      )}

      {/* Provider list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--text-dim)" }}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--text-dim)" }}>No data yet.</div>
      ) : (
        list.map((p: any, i: number) => (
          <ProviderRow
            key={p.id}
            p={p}
            rank={i + 1}
            isSelf={!!myAddr && (p.owner?.toLowerCase() === myAddr)}
            onSelect={toggleCompare}
            selected={compareSet.has(p.id)}
          />
        ))
      )}

      {compareSet.size === 0 && list.length > 0 && (
        <p style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center", marginTop: 12 }}>
          Click up to 3 rows to compare providers side by side.
        </p>
      )}
    </div>
  )
}
