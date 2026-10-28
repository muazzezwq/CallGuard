import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { encodeFunctionData, keccak256, toBytes } from 'viem'
// MEDIUM-09: import canonical ABIs from config
import {
  ACTIVE_PPC_ADDRESS, ACTIVE_REGISTRY_ADDRESS, CONFIG, PPC_ABI_V8_ACTIVE, REGISTRY_ABI,
  REGISTRY_ABI_V8, USDC_ABI, V8_ENABLED,
} from '../../lib/config'
import { Button, Input, PageHeader, Stat, Textarea } from '../../ui'
import {
  CodeSurface, KeyValue, Ledger, LedgerRow, PanelShell, PanelSource,
  PanelSplit, SignalRow, StatusNotice,
} from '../panel/PanelUi'

const MULTICALL3_ABI = [
  { name: 'aggregate3', type: 'function', stateMutability: 'payable', inputs: [{ name: 'calls', type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'allowFailure', type: 'bool' }, { name: 'callData', type: 'bytes' }] }], outputs: [{ name: 'results', type: 'tuple[]', components: [{ name: 'success', type: 'bool' }, { name: 'returnData', type: 'bytes' }] }] },
] as const

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

  const refreshBalance = useCallback(async () => {
    if (!address) return
    try {
      const res = await fetch(`/api/nano-balance?address=${address}`)
      const data = await res.json()
      // HIGH-05 fix: API returns `formatted` field, not `balance`
      if (data.formatted !== undefined) setBalance(data.formatted)
      else if (data.balance !== undefined) setBalance(data.balance)
      if (data.pending !== undefined) setPending(data.pending)
    } catch { setBalance('—') }
  }, [address])

  async function makeNanoCall() {
    if (!address || loading) return
    setLoading(true)
    setOutput('⚡ Initiating nanopayment call...')
    try {
      // NOTE: no client-side API key — shared secrets must never ship in the
      // bundle (VITE_* is public). The backend gates /api/nano-call with
      // server-side NANO_API_KEY; 401/503 here means it isn't configured.
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
      const PPC = ACTIVE_PPC_ADDRESS

      // Get provider prices
      let total = 0n
      for (const id of ids) {
        try {
          /* Named fields only: `getProvider` is 9 words on v7 and 11 on v8, so a
             positional read would return the wrong column after a cutover. */
          const p = await publicClient.readContract({
            address: ACTIVE_REGISTRY_ADDRESS,
            abi: V8_ENABLED ? REGISTRY_ABI_V8 : REGISTRY_ABI,
            functionName: 'getProvider',
            args: [BigInt(id)],
          }) as Record<string, unknown> | undefined
          const isActive = Boolean(p?.active)
          const callPrice = (p?.pricePerCall ?? 0n) as bigint
          if (isActive) total += (callPrice ?? 0n) // active → add pricePerCall
        } catch { /* skip */ }
      }

      // Approve if needed
      if (total > 0n) {
        setMultiResult('⏳ Checking USDC allowance...')
        /* Multicall3From routes each subcall through the callFrom precompile, so
           PayPerCall sees the wallet as `msg.sender` and pulls the fee from the
           wallet's allowance to PayPerCall. Approving the batch router would leave
           PayPerCall with a zero allowance and every subcall would fail. */
        const allowance = await publicClient.readContract({ address: USDC, abi: USDC_ABI, functionName: 'allowance', args: [address as `0x${string}`, PPC] })
        if (allowance < total) {
          setMultiResult('⏳ Approving USDC to PayPerCall...')
          const approveTx = await walletClient.writeContract({ address: USDC, abi: USDC_ABI, functionName: 'approve', args: [PPC, total] })
          await publicClient.waitForTransactionReceipt({ hash: approveTx })
        }
      }

      // Build aggregate3 calls
      setMultiResult('⏳ Signing batch tx...')
      const calls = ids.map(id => ({
        target: PPC,
        allowFailure: true,
        callData: encodeFunctionData({ abi: PPC_ABI_V8_ACTIVE, functionName: 'callService', args: [BigInt(id), requestHash] })
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

  useEffect(() => { if (address) refreshBalance() }, [address, refreshBalance])

  const sourceState = balance === '—' ? 'unavailable' : balance ? 'live' : 'idle'

  return (
    <PanelShell>
      <PageHeader
        title="Nanopayment"
        subtitle="Gasless micropayments via Circle Gateway · 0.001 USDC · no wallet prompt"
      />

      <PanelSource
        label="Circle Gateway"
        value={balance === '—' ? 'balance unavailable' : balance ? `settled ${balance}` : 'balance not loaded'}
        hint="x402 · batched settlement"
        state={sourceState}
      />

      <SignalRow label="Nanopayment signals">
        <Stat label="Calls Made" value={callCount} hint="This session" />
        <Stat label="Pending Batch" value={pending || '—'} hint="Batched settlement" />
        <Stat label="Settled Balance" value={balance || '—'} hint="USDC" />
      </SignalRow>

      <PanelSplit
        main={
          <>
            <StatusNotice tone="info" title="How it works:">
              1. You click → 2. Facilitator signs EIP-3009 off-chain → 3. Circle Gateway verifies instantly → 4. Batch settles on-chain later.
              No wallet prompt. No gas. Payments batch into a single on-chain tx.
            </StatusNotice>

            <section className="ui-section">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Call console</h2>
              </div>
              <div className="ui-section__body">
                <div className="pg-form__actions">
                  <Button variant="primary" onClick={makeNanoCall} disabled={loading || !address}>
                    {loading ? '⚡ Calling...' : '⚡ Call /nano/service (0.001 USDC)'}
                  </Button>
                  <Button variant="secondary" onClick={refreshBalance}>↻ Refresh balance</Button>
                </div>
                <div className="pg-output" aria-live="polite" aria-atomic="true">{output}</div>
              </div>
            </section>

            <p className="pg-copy pg-copy--tight">Test HTTP 402 payment-required endpoints. Pay &amp; try in one click.</p>
            <Ledger label="x402 Endpoints">
              {[
                { name: 'energy-data', path: '/api/energy-data', price: '0.001 USDC', desc: 'Real-time energy usage data' },
                { name: 'premium-report', path: '/api/premium-report', price: '0.01 USDC', desc: 'Premium analytics report' },
              ].map(ep => (
                <LedgerRow
                  key={ep.name}
                  lead={ep.name}
                  meta={ep.desc}
                  trailing={
                    <>
                      <span className="pg-price">{ep.price}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => tryX402Endpoint(ep.path, ep.price)}
                      >Pay &amp; Try →</Button>
                    </>
                  }
                />
              ))}
            </Ledger>

            <section className="ui-section pg-section--spaced">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Multicall3 (1 tx)</h2>
              </div>
              <div className="ui-section__body">
                <p className="pg-copy">Batch-call up to 3 providers in a single on-chain tx via Multicall3From.</p>
                <div className="pg-stack">
                  {multiIds.map((id, i) => (
                    <div key={i} className="pg-multi-row">
                      <Input
                        type="text" placeholder={`Provider ID ${i + 1}`} value={id}
                        aria-label={`Provider ID ${i + 1}`}
                        onChange={e => { const n = [...multiIds]; n[i] = e.target.value; setMultiIds(n) }}
                      />
                      {multiIds.length > 1 && (
                        <Button
                          variant="secondary" size="sm"
                          aria-label={`Remove provider ${i + 1}`}
                          onClick={() => setMultiIds(multiIds.filter((_, j) => j !== i))}
                        >−</Button>
                      )}
                    </div>
                  ))}
                  {multiIds.length < 3 && (
                    <Button
                      variant="secondary" size="sm"
                      className="pg-self-start"
                      onClick={() => setMultiIds([...multiIds, ''])}
                    >+ Add Provider</Button>
                  )}
                </div>
                <Textarea
                  rows={2} placeholder="Payload (will be hashed on-chain)" value={multiPayload}
                  aria-label="Payload (will be hashed on-chain)"
                  onChange={e => setMultiPayload(e.target.value)}
                  className="pg-textarea"
                />
                <Button
                  variant="primary" block
                  onClick={doMultiCallNative} disabled={multiLoading || !address}
                  className="pg-section--spaced"
                >
                  {multiLoading ? '⏳ Processing...' : '⚡ Multicall3 (1 tx)'}
                </Button>
                {multiResult && (
                  <pre className="pg-output pg-output--pre" aria-live="polite">{multiResult}</pre>
                )}
              </div>
            </section>

            <div className="pg-section--spaced">
              <CodeSurface
                label="Integration (Node.js)"
                language="node"
                code={`// Install: npm i @circle-fin/x402-batching
import { GatewayClient } from '@circle-fin/x402-batching'

const client = new GatewayClient({ apiKey: process.env.CIRCLE_API_KEY })

// Make a nanopayment call
const result = await client.pay({
  to: '${address || '0xYOUR_ADDRESS'}',
  amount: '0.001',   // USDC
  currency: 'USDC',
  chain: 'ARC-TESTNET',
})

console.log('TX:', result.txHash)  // batched on-chain`}
              />
            </div>
          </>
        }
        rail={
          <>
            <KeyValue
              label="Source & limits"
              rows={[
                { label: 'Gateway', value: 'Circle Gateway' },
                { label: 'Call price', value: '0.001 USDC', mono: true },
                { label: 'Asset', value: 'USDC · 6 decimals', mono: true },
                { label: 'Provider', value: `#${nanoPId} · session nano_provider`, mono: true },
                { label: 'Multicall cap', value: '3 provider IDs', mono: true },
                { label: 'API gate', value: 'Server-side NANO_API_KEY' },
                { label: 'Wallet prompt', value: 'None' },
              ]}
            />
            <StatusNotice tone="info" title="Gasless by design">
              The facilitator signs EIP-3009 off-chain. Payments batch into a single on-chain transaction.
            </StatusNotice>
          </>
        }
      />
    </PanelShell>
  )
}
