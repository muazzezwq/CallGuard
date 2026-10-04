import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'

const S = {
  wrap: { padding: '24px', maxWidth: '680px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  statCard: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', textAlign: 'center' as const },
  btn: { padding: '10px 20px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  btnSecondary: { padding: '10px 20px', background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  pre: { background: '#0a0e14', color: '#a8b5c8', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', lineHeight: '1.7', padding: '16px', borderRadius: '8px', overflowX: 'auto' as const, border: '1px solid #1e2530', marginTop: '12px' },
}

export default function Nano() {
  const { address } = useAccount()
  const [callCount, setCallCount] = useState(0)
  const [balance, setBalance] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [output, setOutput] = useState('Result will appear here.')
  const [loading, setLoading] = useState(false)

  async function refreshBalance() {
    if (!address) return
    try {
      const res = await fetch(`/api/nano-balance?address=${address}`)
      const data = await res.json()
      if (data.balance !== undefined) setBalance(data.balance)
      if (data.pending !== undefined) setPending(data.pending)
    } catch { setBalance('—') }
  }

  async function makeNanoCall() {
    if (!address || loading) return
    setLoading(true)
    setOutput('⚡ Initiating nanopayment call...')
    try {
      const res = await fetch('/api/nano-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller: address, providerId: 1, payload: 'nano-ping' })
      })
      const data = await res.json()
      if (data.ok) {
        setCallCount(c => c + 1)
        setOutput(`✅ Call success\nTX: ${data.txHash || 'pending batch'}\nGateway: ${data.gateway || 'Circle Gateway'}\nAmount: 0.001 USDC\nTimestamp: ${new Date().toISOString()}`)
        await refreshBalance()
      } else {
        setOutput(`❌ Failed: ${data.error || 'Unknown error'}`)
      }
    } catch (e: any) {
      setOutput(`❌ Network error: ${e.message}`)
    }
    setLoading(false)
  }

  useEffect(() => { if (address) refreshBalance() }, [address])

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Nanopayment</div>
      <div style={S.sub}>Gasless micropayments via Circle Gateway · 0.001 USDC · no wallet prompt</div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <div style={S.statCard}>
          <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: '4px' }}>Calls Made</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>{callCount}</div>
        </div>
        <div style={S.statCard}>
          <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: '4px' }}>Pending Batch</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>{pending || '—'}</div>
        </div>
        <div style={S.statCard}>
          <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: '4px' }}>Settled Balance</div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>{balance || '—'}</div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.6' }}>
        <strong style={{ color: 'var(--accent)' }}>How it works:</strong>
        {' '}1. You click → 2. Facilitator signs EIP-3009 off-chain → 3. Circle Gateway verifies instantly → 4. Batch settles on-chain later.
        No wallet prompt. No gas. Payments batch into a single on-chain tx.
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <button style={{ ...S.btn, opacity: loading || !address ? 0.6 : 1 }} onClick={makeNanoCall} disabled={loading || !address}>
          {loading ? '⚡ Calling...' : '⚡ Call /nano/service (0.001 USDC)'}
        </button>
        <button style={S.btnSecondary} onClick={refreshBalance}>↻ Refresh balance</button>
      </div>

      {/* Output */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-dim)', minHeight: '60px', whiteSpace: 'pre-wrap', marginBottom: '24px' }}>
        {output}
      </div>

      {/* x402 Tester */}
      <div style={S.card}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>x402 Endpoints</div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px' }}>Test HTTP 402 payment-required endpoints. Pay & try in one click.</div>
        {[
          { name: 'energy-data', path: '/api/energy-data', price: '0.001 USDC', desc: 'Real-time energy usage data' },
          { name: 'premium-report', path: '/api/premium-report', price: '0.01 USDC', desc: 'Premium analytics report' },
        ].map(ep => (
          <div key={ep.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{ep.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{ep.desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>{ep.price}</span>
              <button
                style={{ padding: '6px 14px', background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                onClick={async () => {
                  const r = await fetch(ep.path, { headers: { 'x-address': address || '' } })
                  const d = await r.json()
                  setOutput(JSON.stringify(d, null, 2))
                }}
              >Pay & Try →</button>
            </div>
          </div>
        ))}
      </div>

      {/* Integration snippet */}
      <div style={S.card}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>Integration (Node.js)</div>
        <pre style={S.pre}>{`// Install: npm i @circle-fin/x402-batching
import { GatewayClient } from '@circle-fin/x402-batching'

const client = new GatewayClient({ apiKey: process.env.CIRCLE_API_KEY })

// Make a nanopayment call
const result = await client.pay({
  to: '${address || '0xYOUR_ADDRESS'}',
  amount: '0.001',   // USDC
  currency: 'USDC',
  chain: 'ARC-TESTNET',
})

console.log('TX:', result.txHash)  // batched on-chain`}</pre>
      </div>
    </div>
  )
}
