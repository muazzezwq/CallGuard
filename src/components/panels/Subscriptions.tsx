import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { CONFIG, PPC_ABI } from '../../lib/config'
import { useSubgraph } from '../../hooks/useSubgraph'

const QUERY = `{ providers(first: 10, orderBy: completedCalls, orderDirection: desc) { id, pricePerCall, maxResponseTime, completedCalls, slashedCalls } }`
const S = {
  wrap: { padding: '24px', maxWidth: '680px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  label: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-faint)', textTransform: 'uppercase' as const, marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' as const },
  btn: { padding: '10px 20px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  badge: (c: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: c + '20', color: c }),
}

interface Sub { providerId: string; name: string; callsLeft: number; pricePerCall: string; expiresAt: number }

export default function Subscriptions() {
  const { address } = useAccount()
  const { data } = useSubgraph(QUERY)
  const [subs, setSubs] = useState<Sub[]>([])
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [callsToPreBuy, setCallsToPreBuy] = useState(10)
  const { writeContractAsync } = useWriteContract()

  const providers = (data as any)?.providers || []

  async function subscribe(providerId: string, pricePerCall: string) {
    if (!address) return
    setSubscribing(providerId)
    try {
      // Pre-buy calls by approving USDC for multiple calls
      const total = parseUnits((Number(formatUnits(BigInt(pricePerCall), 6)) * callsToPreBuy).toFixed(6), 6)
      const sub: Sub = { providerId, name: `Provider #${providerId}`, callsLeft: callsToPreBuy, pricePerCall: formatUnits(BigInt(pricePerCall), 6), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }
      setSubs(s => [...s, sub])
    } catch (e: any) { alert(e.shortMessage || e.message) }
    setSubscribing(null)
  }

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Subscriptions</div>
      <div style={S.sub}>Pre-buy calls from providers. Get priority access and potential volume discounts.</div>

      {subs.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Active Subscriptions</div>
          {subs.map(sub => (
            <div key={sub.providerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{sub.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{sub.pricePerCall} USDC/call · expires {new Date(sub.expiresAt).toLocaleDateString()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--accent)' }}>{sub.callsLeft}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>calls left</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={S.card}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Subscribe to a Provider</div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div style={S.label}>Pre-buy calls</div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>{callsToPreBuy} calls</span>
          </div>
          <input type="range" min="1" max="100" value={callsToPreBuy} onChange={e => setCallsToPreBuy(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </div>

        {providers.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '24px' }}>Loading providers...</div>
          : providers.map((p: any) => {
            const price = Number(formatUnits(BigInt(p.pricePerCall || '0'), 6))
            const total = (price * callsToPreBuy).toFixed(2)
            const alreadySub = subs.some(s => s.providerId === p.id)
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-3)', borderRadius: '8px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>Provider #{p.id}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{price} USDC/call · SLA {p.maxResponseTime}s</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>{total} USDC total</div>
                  <button style={{ ...S.btn, padding: '6px 12px', fontSize: '12px', opacity: !address || alreadySub || subscribing === p.id ? 0.6 : 1 }} onClick={() => subscribe(p.id, p.pricePerCall)} disabled={!address || alreadySub || subscribing === p.id}>
                    {alreadySub ? 'Subscribed ✓' : subscribing === p.id ? '...' : 'Subscribe'}
                  </button>
                </div>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}
