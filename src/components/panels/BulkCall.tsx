import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, stringToBytes, keccak256 } from 'viem'
import { CONFIG, PPC_ABI } from '../../lib/config'

const ADDR = CONFIG.ppcAddress as `0x${string}`
const S = {
  wrap: { padding: '24px', maxWidth: '640px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  label: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-faint)', textTransform: 'uppercase' as const, marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' as const },
  btn: { padding: '10px 20px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
}

export default function BulkCall() {
  const { address } = useAccount()
  const [providerId, setProviderId] = useState('1')
  const [payload, setPayload] = useState('ping')
  const [count, setCount] = useState(3)
  const [results, setResults] = useState<{ i: number; hash?: string; error?: string }[]>([])
  const [running, setRunning] = useState(false)
  const { writeContractAsync } = useWriteContract()

  const estimatedCost = count * 1

  async function runBatch() {
    if (!address || running) return
    setRunning(true)
    setResults([])
    for (let i = 0; i < count; i++) {
      try {
        const requestHash = keccak256(stringToBytes(`${payload}-${i}-${Date.now()}`))
        const hash = await writeContractAsync({
          address: ADDR,
          abi: PPC_ABI,
          functionName: 'callService',
          args: [BigInt(providerId), requestHash],
        })
        setResults(r => [...r, { i: i + 1, hash }])
      } catch (e: any) {
        setResults(r => [...r, { i: i + 1, error: e.shortMessage || e.message }])
      }
      await new Promise(res => setTimeout(res, 1000))
    }
    setRunning(false)
  }

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Bulk Call</div>
      <div style={S.sub}>Send multiple calls to a provider in sequence. Useful for testing and benchmarking.</div>

      <div style={S.card}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}><div style={S.label}>Provider ID</div><input style={S.input} value={providerId} onChange={e => setProviderId(e.target.value)} /></div>
          <div style={{ flex: 1 }}><div style={S.label}>Payload</div><input style={S.input} value={payload} onChange={e => setPayload(e.target.value)} /></div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={S.label}>Number of Calls</div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>{count}</span>
          </div>
          <input type="range" min="1" max="20" value={count} onChange={e => setCount(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}><span>1</span><span>20</span></div>
        </div>

        <div style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-dim)' }}>Estimated cost</span>
          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>~{estimatedCost} USDC</span>
        </div>

        <button style={{ ...S.btn, width: '100%', opacity: running || !address ? 0.6 : 1 }} onClick={runBatch} disabled={running || !address}>
          {running ? `Running... (${results.length}/${count})` : `Send ${count} Calls →`}
        </button>
      </div>

      {results.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>Results ({results.length}/{count})</div>
          {results.map(r => (
            <div key={r.i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-faint)', width: '20px' }}>#{r.i}</span>
              {r.hash ? (
                <a href={`https://explorer.testnet.arc.io/tx/${r.hash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: '12px' }}>{r.hash.slice(0, 20)}...</a>
              ) : (
                <span style={{ color: '#ef4444', fontSize: '12px' }}>{r.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
