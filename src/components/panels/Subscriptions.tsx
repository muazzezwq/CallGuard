import { useState } from 'react'
import { useAccount } from 'wagmi'
import { formatUnits } from 'viem'
import { useSubgraph } from '../../hooks/useSubgraph'
import { Badge, Button, PageHeader, Skeleton, Stat } from '../../ui'
import {
  KeyValue, Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit,
  SignalRow, StatusNotice,
} from '../panel/PanelUi'
import { toast } from 'sonner'

const QUERY = `{
  providers(first: 20, orderBy: completedCalls, orderDirection: desc, where: { active: true }) {
    id pricePerCall completedCalls slashedCalls stake
  }
}`

const PREVIEW_TOAST = "Subscriptions aren't live on Arc Testnet yet — pre-buying calls is coming soon."

interface Sub { providerId: string; name: string; callsLeft: number; pricePerCall: string; expiresAt: number }

export default function Subscriptions() {
  const { address } = useAccount()
  const { data, loading } = useSubgraph(QUERY)
  const [subs] = useState<Sub[]>([])
  const [subscribing] = useState<string | null>(null)
  const [callsToPreBuy, setCallsToPreBuy] = useState(10)

  const providers = (data as { providers?: { id: string; pricePerCall: string; completedCalls?: string | number }[] })?.providers || []

  function subscribe(_providerId: string, _pricePerCall: string) {
    toast.info(PREVIEW_TOAST)
  }

  const sourceValue = loading && providers.length === 0
    ? 'fetching providers'
    : providers.length === 1
      ? '1 active provider indexed'
      : `${providers.length} active providers indexed`

  return (
    <PanelShell>
      <PageHeader
        title="Subscriptions"
        subtitle="Pre-buy calls from providers. Get priority access and potential volume discounts."
      />

      <PanelSource
        label="The Graph subgraph"
        value={sourceValue}
        hint="active providers · 20 provider cap"
        state={loading && providers.length === 0 ? 'idle' : providers.length > 0 ? 'live' : 'idle'}
      />

      <StatusNotice tone="preview" title="Preview surface">
        {PREVIEW_TOAST}
      </StatusNotice>

      <SignalRow label="Subscription preview">
        <Stat
          label="Pre-buy calls"
          value={callsToPreBuy}
          hint="Range 1–100 calls"
        />
        <Stat
          label="Active providers"
          value={loading && providers.length === 0 ? '—' : providers.length}
          hint="Indexed by The Graph"
        />
        <Stat
          label="Protocol state"
          value="Not live"
          hint="Arc Testnet"
        />
      </SignalRow>

      <PanelSplit
        main={
          <>
            <section className="ui-section">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Pre-buy calls</h2>
              </div>
              <div className="ui-section__body">
                <div className="pg-range">
                  <div className="pg-range__head">
                    <span className="pg-range__label">Pre-buy calls</span>
                    <span className="pg-range__value">{callsToPreBuy} calls</span>
                  </div>
                  <input
                    type="range" min="1" max="100" value={callsToPreBuy} aria-label="Pre-buy calls"
                    onChange={e => setCallsToPreBuy(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </div>
              </div>
            </section>

            <Ledger
              label="Subscribe to a Provider"
              empty={
                <div className="pg-empty">
                  <strong>No active providers</strong>
                  <span>No active providers indexed yet.</span>
                </div>
              }
            >
              {loading && providers.length === 0 ? (
                <>
                  {[...Array(3)].map((_, i) => (
                    <li key={i} className="pg-skeleton-row"><Skeleton height={62} /></li>
                  ))}
                </>
              ) : (
                providers.map((p) => {
                  const price = Number(formatUnits(BigInt(p.pricePerCall || '0'), 6))
                  const total = (price * callsToPreBuy).toFixed(2)
                  const alreadySub = subs.some(s => s.providerId === p.id)
                  return (
                    <LedgerRow
                      key={p.id}
                      lead={`Provider #${p.id}`}
                      meta={`${price} USDC/call · ${p.completedCalls ?? 0} calls completed`}
                      trailing={
                        <>
                          <span className="pg-sub-total">{total} USDC total</span>
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
                        </>
                      }
                    />
                  )
                })
              )}
            </Ledger>

            {subs.length > 0 && (
              <Ledger label="Active Subscriptions" className="pg-section--spaced">
                {subs.map(sub => (
                  <LedgerRow
                    key={sub.providerId}
                    lead={sub.name}
                    meta={`${sub.pricePerCall} USDC/call · expires ${new Date(sub.expiresAt).toLocaleDateString()}`}
                    trailing={`${sub.callsLeft} calls left`}
                  />
                ))}
              </Ledger>
            )}
          </>
        }
        rail={
          <>
            <KeyValue
              label="Preview status"
              rows={[
                { label: 'Network', value: 'Arc Testnet' },
                { label: 'State', value: 'Not live' },
                { label: 'Pre-buy range', value: '1–100 calls', mono: true },
                { label: 'Pricing', value: 'Provider price × calls' },
                { label: 'Source', value: 'The Graph subgraph' },
                { label: 'Provider cap', value: '20 active providers', mono: true },
              ]}
            />
            <StatusNotice tone="preview" title="No active subscriptions">
              No subscription rows are stored until the protocol is live on Arc Testnet.
            </StatusNotice>
          </>
        }
      />
    </PanelShell>
  )
}
