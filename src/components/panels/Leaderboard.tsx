import { useState } from 'react'
import { useSubgraph } from '../../hooks/useSubgraph'

const S = {
  wrap: { padding: '24px', maxWidth: '720px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', marginBottom: '8px', background: 'var(--bg-3)' },
  badge: (n: number) => ({ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0, background: n === 1 ? '#f59e0b' : n === 2 ? '#9ca3af' : n === 3 ? '#cd7c2f' : 'var(--bg-2)', color: n <= 3 ? '#000' : 'var(--text-dim)' }),
}

const PROVIDER_QUERY = `{ providers(first: 20, orderBy: completedCalls, orderDirection: desc) { id, completedCalls, slashedCalls, pricePerCall } }`
const SLASH_QUERY = `{ providers(first: 20, orderBy: slashedCalls, orderDirection: desc) { id, completedCalls, slashedCalls } }`

export default function Leaderboard() {
  const [tab, setTab] = useState<'top' | 'slash'>('top')
  const { data: topData, loading: topLoading } = useSubgraph(PROVIDER_QUERY)
  const { data: slashData, loading: slashLoading } = useSubgraph(SLASH_QUERY)

  const topProviders = (topData as any)?.providers || []
  const slashProviders = (slashData as any)?.providers || []

  const tabs = [{ id: 'top', label: '🏆 Top Providers' }, { id: 'slash', label: '⚡ Top Slashers' }]

  function honorRate(p: any) {
    const total = Number(p.completedCalls) + Number(p.slashedCalls)
    return total > 0 ? Math.round((Number(p.completedCalls) / total) * 100) : 0
  }

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Leaderboard</div>
      <div style={S.sub}>Live provider rankings from Arc Testnet via subgraph.</div>

      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-2)', borderRadius: '10px', padding: '4px', marginBottom: '24px', width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? '#000' : 'var(--text-dim)' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'top' && (
        <div style={S.card}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Most Completed Calls</div>
          {topLoading ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '24px' }}>Loading...</div>
          ) : topProviders.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '24px' }}>No data yet. Make some calls!</div>
          ) : topProviders.map((p: any, i: number) => (
            <div key={p.id} style={S.row}>
              <div style={S.badge(i + 1)}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px' }}>Provider #{p.id}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{p.completedCalls} completed · {p.slashedCalls} slashed</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: honorRate(p) > 80 ? '#10b981' : '#f59e0b' }}>{honorRate(p)}%</div>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>honor</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'slash' && (
        <div style={S.card}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Most Slashed Providers</div>
          {slashLoading ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '24px' }}>Loading...</div>
          ) : slashProviders.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '24px' }}>No slashes yet.</div>
          ) : slashProviders.filter((p: any) => Number(p.slashedCalls) > 0).map((p: any, i: number) => (
            <div key={p.id} style={S.row}>
              <div style={S.badge(i + 1)}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px' }}>Provider #{p.id}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{p.completedCalls} completed · <span style={{ color: '#ef4444' }}>{p.slashedCalls} slashed</span></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#ef4444' }}>{p.slashedCalls}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>slashes</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
