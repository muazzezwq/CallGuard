import { useState, useEffect } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { parseUnits, encodeFunctionData, keccak256, toBytes } from 'viem'
// MEDIUM-09: import canonical ABIs from config
import { CONFIG, PPC_ABI, USDC_ABI, REGISTRY_ABI } from '../../lib/config'

const MULTICALL3_ABI = [
  { name: 'aggregate3', type: 'function', stateMutability: 'payable', inputs: [{ name: 'calls', type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'allowFailure', type: 'bool' }, { name: 'callData', type: 'bytes' }] }], outputs: [{ name: 'results', type: 'tuple[]', components: [{ name: 'success', type: 'bool' }, { name: 'returnData', type: 'bytes' }] }] },
] as const

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
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [nanoPId] = useState(() => { const s = sessionStorage.getItem("nano_provider"); if (s) { sessionStorage.removeItem("nano_provider"); return Number(s) || 1; } return 1; })
  const [callCount, setCallCount] = useState(0)
  const [balance, setBalance] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [output, setOutput] = useState('Result will appear here.')
  const [loading, setLoading] = useState(false)
  // Multicall3
  const [multiIds, setMultiIds] = useState<string[]>(['', ''])
  const [multiPayload, setMultiPayload] = useState('ping')
  const [multiResult, setMultiResult] = useState('')
  const [multiLoading, setMultiLoading] = useState(false)

  async function refreshBalance() {
    if (!address) return
    try {
      const res = await fetch(`/api/nano-balance?address=${address}`)
      const data = await res.json()
      // HIGH-05 fix: API returns `formatted` field, not `balance`
      if (data.formatted !== undefined) setBalance(data.formatted)
      else if (data.balance !== undefined) setBalance(data.balance)
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
        body: JSON.stringify({ caller: address, providerId: nanoPId, payload: 'nano-ping', amount: '0.001' })
      })
      const data = await res.json()
      if (data.ok || data.success) {
        setCallCount(c => c + 1)
        const txLine = data.txHash ? `TX: ${data.txHash}` : data.batchId ? `BatchID: ${data.batchId}` : 'pending batch'
        setOutput(`✅ Nanopayment call success\n${txLine}\nGateway: ${data.gateway || 'Circle Gateway'}\nAmount: ${data.amount || '0.001'} USDC\nTimestamp: ${new Date().toISOString()}`)
        await refreshBalance()
      } else {
        setOutput(`❌ Failed: ${data.error || data.message || 'Unknown error'}\n\nNote: Nanopayments require Circle Gateway API key in server config.`)
      }
    } catch (e: unknown) {
      setOutput(`❌ Network error: ${(e instanceof Error ? e.message : String(e))}`)
    }
    setLoading(false)
  }

  async function tryX402Endpoint(path: string, price: string) {
    if (!address) { setOutput('❌ Connect wallet first'); return }
    setOutput(`⏳ Calling ${path} via x402...`)
    try {
      // First request — expect 402
      const r1 = await fetch(path, { headers: { 'x-address': address } })
      if (r1.status === 402) {
        const terms = await r1.json()
        setOutput(`ℹ️ HTTP 402 received — payment required\nAmount: ${price}\nTerms: ${JSON.stringify(terms.accepts?.[0] ?? terms, null, 2)}\n\nUse the CallBuilder panel with x402 mode to complete payment.`)
      } else {
        const d = await r1.json()
        setOutput(`✅ Response (${r1.status}):\n${JSON.stringify(d, null, 2)}`)
      }
    } catch (e: unknown) {
      setOutput(`❌ ${(e instanceof Error ? e.message : String(e))}`)
    }
  }

  async function doMultiCallNative() {
    const ids = multiIds.filter(Boolean)
    if (ids.length === 0) { setMultiResult('❌ Enter at least one provider ID'); return }
    if (ids.length > 3) { setMultiResult('❌ Max 3 providers'); return }
    if (!address || !walletClient || !publicClient) { setMultiResult('❌ Connect wallet first'); return }
    setMultiLoading(true)
    setMultiResult('⏳ Preparing batch...')
    try {
      const requestHash = keccak256(toBytes(multiPayload || 'ping'))
      const MULTICALL3 = CONFIG.multicall3From as `0x${string}`
      const USDC = CONFIG.usdc as `0x${string}`
      const PPC = CONFIG.payPerCall as `0x${string}`

      // Get provider prices
      let total = 0n
      for (const id of ids) {
        try {
          const p = await publicClient.readContract({ address: CONFIG.registry as `0x${string}`, abi: REGISTRY_ABI, functionName: 'getProvider', args: [BigInt(id)] })
          if (p.active) total += p.pricePerCall // active → add pricePerCall
        } catch { /* skip */ }
      }

      // Approve if needed
      if (total > 0n) {
        setMultiResult('⏳ Checking USDC allowance...')
        const allowance = await publicClient.readContract({ address: USDC, abi: USDC_ABI, functionName: 'allowance', args: [address as `0x${string}`, MULTICALL3] })
        if (allowance < total) {
          setMultiResult('⏳ Approving USDC...')
          const approveTx = await walletClient.writeContract({ address: USDC, abi: USDC_ABI, functionName: 'approve', args: [MULTICALL3, total] })
          await publicClient.waitForTransactionReceipt({ hash: approveTx })
        }
      }

      // Build aggregate3 calls
      setMultiResult('⏳ Signing batch tx...')
      const calls = ids.map(id => ({
        target: PPC,
        allowFailure: true,
        callData: encodeFunctionData({ abi: PPC_ABI, functionName: 'callService', args: [BigInt(id), requestHash] })
      }))

      const hash = await walletClient.writeContract({ address: MULTICALL3, abi: MULTICALL3_ABI, functionName: 'aggregate3', args: [calls] })
      setMultiResult('⏳ Confirming...')
      const rc = await publicClient.waitForTransactionReceipt({ hash })
      const explorerUrl = `${CONFIG.explorerBase}/tx/${hash}`
      setMultiResult(`✅ Multicall3From batch settled in 1 transaction!\n${ids.map(id => `Provider #${id}: ${rc.status === 'success' ? '✅ called' : '❌ failed'}`).join('\n')}\n\nTX: ${hash}\n${explorerUrl}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setMultiResult(`❌ ${msg.slice(0, 200)}`)
    }
    setMultiLoading(false)
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
                onClick={() => tryX402Endpoint(ep.path, ep.price)}
              >Pay & Try →</button>
            </div>
          </div>
        ))}
      </div>

      {/* Multicall3From */}
      <div style={S.card}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Multicall3 (1 tx)</div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px' }}>Batch-call up to 3 providers in a single on-chain tx via Multicall3From.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {multiIds.map((id, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text" placeholder={`Provider ID ${i + 1}`} value={id}
                onChange={e => { const n = [...multiIds]; n[i] = e.target.value; setMultiIds(n) }}
                style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px' }}
              />
              {multiIds.length > 1 && (
                <button onClick={() => setMultiIds(multiIds.filter((_, j) => j !== i))}
                  style={{ padding: '6px 10px', background: 'var(--bg-3)', color: 'var(--danger)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>−</button>
              )}
            </div>
          ))}
          {multiIds.length < 3 && (
            <button onClick={() => setMultiIds([...multiIds, ''])}
              style={{ alignSelf: 'flex-start', padding: '6px 12px', background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>+ Add Provider</button>
          )}
        </div>
        <textarea
          rows={2} placeholder="Payload (will be hashed on-chain)" value={multiPayload}
          onChange={e => setMultiPayload(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', marginBottom: '12px' }}
        />
        <button
          onClick={doMultiCallNative} disabled={multiLoading || !address}
          style={{ ...S.btn, width: '100%', opacity: multiLoading || !address ? 0.6 : 1 }}>
          {multiLoading ? '⏳ Processing...' : '⚡ Multicall3 (1 tx)'}
        </button>
        {multiResult && (
          <pre style={{ ...S.pre, marginTop: '12px', whiteSpace: 'pre-wrap' }}>{multiResult}</pre>
        )}
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
