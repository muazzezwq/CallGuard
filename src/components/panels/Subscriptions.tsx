import { useState } from 'react'
import { useAccount } from 'wagmi'
import { formatUnits } from 'viem'
import { useSubgraph } from '../../hooks/useSubgraph'
import { PageHeader, SectionCard, Button, Badge, EmptyState, Skeleton } from '../../ui'
import { toast } from 'sonner'

const QUERY = `{
  providers(first: 20, orderBy: completedCalls, orderDirection: desc, where: { active: true }) {
    id pricePerCall completedCalls slashedCalls stake
  }
}`

interface Sub { providerId: string; name: string; callsLeft: number; pricePerCall: string; expiresAt: number }

export default function Subscriptions() {
  const { address } = useAccount()
  const { data, loading } = useSubgraph(QUERY)
  const [subs] = useState<Sub[]>([])
  const [subscribing] = useState<string | null>(null)
  const [callsToPreBuy, setCallsToPreBuy] = useState(10)

  const providers = (data as { providers?: { id: string; pricePerCall: string; completedCalls?: string | number }[] })?.providers || []

  function subscribe(_providerId: string, _pricePerCall: string) {
    toast.info("Subscriptions aren't live on Arc Testnet yet — pre-buying calls is coming soon.")
  }

  return (
    <div className="ov-page">
      <PageHeader
        title="Subscriptions"
        subtitle="Pre-buy calls from providers. Get priority access and potential volume discounts."
      />

      {subs.length > 0 && (
        <SectionCard title="Active Subscriptions" bodyClass="ui-section__body--flush">
          <ul className="ov-health">
            {subs.map(sub => (
              <li key={sub.providerId} className="ov-health__row">
                <span className="ov-health__name" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{sub.name}</span>
                  <span className="sub-meta">{sub.pricePerCall} USDC/call · expires {new Date(sub.expiresAt).toLocaleDateString()}</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 18, color: 'var(--accent-ink)' }}>{sub.callsLeft}</span>
                  <span className="sub-meta">calls left</span>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="Subscribe to a Provider">
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="sub-label">Pre-buy calls</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-ink)' }}>{callsToPreBuy} calls</span>
          </div>
          <input
            type="range" min="1" max="100" value={callsToPreBuy} aria-label="Pre-buy calls"
            onChange={e => setCallsToPreBuy(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
        </div>

        {loading && providers.length === 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {[...Array(3)].map((_, i) => <Skeleton key={i} height={62} />)}
          </div>
        ) : providers.length === 0 ? (
          <EmptyState title="No active providers" description="No active providers indexed yet." />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {providers.map((p) => {
              const price = Number(formatUnits(BigInt(p.pricePerCall || '0'), 6))
              const total = (price * callsToPreBuy).toFixed(2)
              const alreadySub = subs.some(s => s.providerId === p.id)
              return (
                <div key={p.id} className="sub-row">
                  <div>
                    <div className="sub-row__title">Provider #{p.id}</div>
                    <div className="sub-meta">{price} USDC/call · {p.completedCalls ?? 0} calls completed</div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="sub-total">{total} USDC total</span>
                    {alreadySub ? (
                      <Badge tone="guard" dot>Subscribed</Badge>
                    ) : (
                      <Button
                        variant="primary" size="sm"
                        disabled={!address || subscribing === p.id}
                        onClick={() => subscribe(p.id, p.pricePerCall)}
                      >
                        {subscribing === p.id ? '…' : 'Subscribe'}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
