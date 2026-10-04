import { useSubgraph } from '../../hooks/useSubgraph'
import { formatUnits } from 'viem'

const QUERY = `{ providers(first: 10, orderBy: completedCalls, orderDirection: desc) { id, completedCalls, slashedCalls, pricePerCall } calls(first: 5, orderBy: createdAt, orderDirection: desc) { id, status, amount, createdAt } }`

const S = {
  wrap: { padding: '24px', maxWidth: '800px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  stat: { background: 'var(--bg-3)', borderRadius: '8px', padding: '16px', textAlign: 'center' as const },
}

export default function Analytics() {
  const { data, loading } = useSubgraph(QUERY)
  const d = data as any
  const providers = d?.providers || []
  const calls = d?.calls || []

  const totalCompleted = providers.reduce((a: number, p: any) => a + Number(p.completedCalls), 0)
  const totalSlashed = providers.reduce((a: number, p: any) => a + Number(p.slashedCalls), 0)
  const totalCalls = totalCompleted + totalSlashed
  const overallHonor = totalCalls > 0 ? Math.round((totalCompleted / totalCalls) * 100) : 0
  const activeProviders = providers.filter((p: any) => Number(p.completedCalls) + Number(p.slashedCalls) > 0).length

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Analytics</div>
      <div style={S.sub}>Network-wide statistics from Arc Testnet subgraph.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <div style={S.stat}><div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Total Calls</div><div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent)' }}>{loading ? '—' : totalCalls}</div></div>
        <div style={S.stat}><div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Honor Rate</div><div style={{ fontSize: '28px', fontWeight: 700, color: overallHonor > 80 ? '#10b981' : '#f59e0b' }}>{loading ? '—' : `${overallHonor}%`}</div></div>
        <div style={S.stat}><div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Slashes</div><div style={{ fontSize: '28px', fontWeight: 700, color: '#ef4444' }}>{loading ? '—' : totalSlashed}</div></div>
        <div style={S.stat}><div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Active Providers</div><div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text)' }}>{loading ? '—' : activeProviders}</div></div>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Provider Performance</div>
        {loading ? <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '24px' }}>Loading...</div> : providers.map((p: any) => {
          const total = Number(p.completedCalls) + Number(p.slashedCalls)
          const honor = total > 0 ? (Number(p.completedCalls) / total) * 100 : 0
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: '32px', fontWeight: 700, color: 'var(--text-dim)', fontSize: '13px' }}>#{p.id}</div>
              <div style={{ flex: 1 }}>
                <div style={{ height: '6px', background: 'var(--bg-3)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${honor}%`, background: honor > 80 ? '#10b981' : honor > 50 ? '#f59e0b' : '#ef4444', borderRadius: '3px' }} />
                </div>
              </div>
              <div style={{ width: '40px', textAlign: 'right', fontWeight: 600, fontSize: '13px', color: honor > 80 ? '#10b981' : '#f59e0b' }}>{Math.round(honor)}%</div>
              <div style={{ width: '60px', textAlign: 'right', fontSize: '12px', color: 'var(--text-dim)' }}>{total} calls</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
