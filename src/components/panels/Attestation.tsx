import { useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { CONFIG } from '../../lib/config'

const BRIDGE_ADDR = CONFIG.slaAttestationBridge as `0x${string}`

const ATTESTATION_ABI = [
  { name: 'attestCall', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'callId', type: 'bytes32' }, { name: 'receiptHash', type: 'bytes32' }], outputs: [] },
  { name: 'attestProviderScore', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'providerId', type: 'uint256' }, { name: 'score', type: 'uint256' }], outputs: [] },
  { name: 'getAttestation', type: 'function', stateMutability: 'view', inputs: [{ name: 'id', type: 'bytes32' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'attType', type: 'uint8' }, { name: 'subject', type: 'bytes32' }, { name: 'value', type: 'uint256' }, { name: 'timestamp', type: 'uint256' }, { name: 'attester', type: 'address' }] }] },
] as const

const S = {
  wrap: { padding: '24px', maxWidth: '720px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  label: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-faint)', textTransform: 'uppercase' as const, marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' as const },
  btn: { padding: '10px 20px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  row: { display: 'flex', gap: '12px', marginBottom: '16px' },
  col: { flex: 1 },
}

export default function Attestation() {
  const { address } = useAccount()
  const [tab, setTab] = useState<'peek' | 'issue' | 'lookup'>('peek')
  const [peekType, setPeekType] = useState<'call' | 'score'>('score')
  const [providerId, setProviderId] = useState('1')
  const [callId, setCallId] = useState('')
  const [lookupId, setLookupId] = useState('')
  const [peekResult, setPeekResult] = useState<any>(null)
  const [peekLoading, setPeekLoading] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  async function peek() {
    setPeekLoading(true)
    setPeekResult(null)
    try {
      const params = peekType === 'score'
        ? `?providerId=${providerId}&type=score`
        : `?callId=${callId}`
      const res = await fetch(`/api/attestation${params}`)
      const data = await res.json()
      setPeekResult(data)
    } catch (e) {
      setPeekResult({ error: 'Request failed' })
    } finally {
      setPeekLoading(false)
    }
  }

  async function issueAttestation() {
    try {
      const hash = await writeContractAsync({
        address: BRIDGE_ADDR,
        abi: ATTESTATION_ABI,
        functionName: 'attestProviderScore',
        args: [BigInt(providerId), BigInt(50)],
      })
      setTxHash(hash)
    } catch (e: unknown) { alert((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e))) }
  }

  const tabs = [{ id: 'peek', label: 'Peek (Free)' }, { id: 'issue', label: 'Issue On-chain' }, { id: 'lookup', label: 'Lookup' }]

  return (
    <div style={S.wrap}>
      <div style={S.h1}>SLA Attestation Bridge</div>
      <div style={S.sub}>Cross-protocol SLA oracle. Any protocol can query CallGuard for provider attestations.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Type', value: 'On-chain', sub: 'Immutable records' },
          { label: 'Cross-chain', value: 'CCIP-ready', sub: 'Chainlink broadcast' },
          { label: 'Access', value: 'Permissionless', sub: 'No auth required' },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)', margin: '4px 0' }}>{item.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-2)', borderRadius: '10px', padding: '4px', marginBottom: '24px', width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? '#000' : 'var(--text-dim)' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'peek' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Free Query — No Wallet Needed</div>
          <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>Read SLA attestation data directly from the REST API.</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button onClick={() => setPeekType('score')} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', background: peekType === 'score' ? 'var(--accent)' : 'var(--bg-3)', color: peekType === 'score' ? '#000' : 'var(--text)', fontWeight: 600, fontSize: '13px' }}>Provider Score</button>
            <button onClick={() => setPeekType('call')} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', background: peekType === 'call' ? 'var(--accent)' : 'var(--bg-3)', color: peekType === 'call' ? '#000' : 'var(--text)', fontWeight: 600, fontSize: '13px' }}>Call Verdict</button>
          </div>
          {peekType === 'score' ? (
            <div style={{ marginBottom: '16px' }}><div style={S.label}>Provider ID</div><input style={S.input} value={providerId} onChange={e => setProviderId(e.target.value)} placeholder="1" /></div>
          ) : (
            <div style={{ marginBottom: '16px' }}><div style={S.label}>Call ID (bytes32)</div><input style={S.input} value={callId} onChange={e => setCallId(e.target.value)} placeholder="0x..." /></div>
          )}
          <button style={S.btn} onClick={peek} disabled={peekLoading}>
            {peekLoading ? 'Querying...' : 'Query →'}
          </button>
          {peekResult && (
            <div style={{ marginTop: '16px', background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(peekResult, null, 2)}
            </div>
          )}
          <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-faint)' }}>
            API endpoint: <code style={{ color: 'var(--accent)' }}>GET /api/attestation?providerId=1&type=score</code>
          </div>
        </div>
      )}

      {tab === 'issue' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Issue On-chain Attestation</div>
          <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>Write a permanent attestation to the bridge contract. Other protocols can read it.</div>
          <div style={{ marginBottom: '16px' }}><div style={S.label}>Provider ID</div><input style={S.input} value={providerId} onChange={e => setProviderId(e.target.value)} placeholder="1" /></div>
          <button style={S.btn} onClick={issueAttestation} disabled={isPending || isConfirming || !address}>
            {isPending ? 'Confirming...' : isConfirming ? 'Writing...' : 'Issue Attestation'}
          </button>
          {isSuccess && <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--accent)' }}>✓ Attestation issued on-chain</div>}
        </div>
      )}

      {tab === 'lookup' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Lookup Attestation by ID</div>
          <div style={{ marginBottom: '16px' }}><div style={S.label}>Attestation ID (bytes32)</div><input style={S.input} value={lookupId} onChange={e => setLookupId(e.target.value)} placeholder="0x..." /></div>
          <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Use the attestation ID returned after issuing an on-chain attestation to retrieve its full record.</div>
        </div>
      )}

      <div style={{ ...S.card, marginTop: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>Integration Example</div>
        <pre style={{ fontSize: '11px', color: 'var(--text-dim)', overflow: 'auto', margin: 0 }}>{`// Any protocol can query CallGuard attestations:
GET /api/attestation?providerId=1&type=score
→ { ok: true, score: 92, completedCalls: 150, ... }

// Or read on-chain:
SLAAttestationBridge.getAttestation(id)`}</pre>
      </div>
    </div>
  )
}
