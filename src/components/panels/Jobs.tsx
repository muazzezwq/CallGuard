import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { parseUnits, formatUnits, keccak256, stringToBytes } from 'viem'
import { CONFIG, PPC_ABI } from '../../lib/config'

const PPC = CONFIG.ppcAddress as `0x${string}`
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

interface Job { id: string; provider: string; payload: string; status: 'pending' | 'running' | 'done' | 'failed'; createdAt: number; txHash?: string }

export default function Jobs() {
  const { address } = useAccount()
  const [tab, setTab] = useState<'active' | 'create'>('active')
  const [providerId, setProviderId] = useState('1')
  const [payload, setPayload] = useState('{"task": "summarize", "url": "https://example.com"}')
  const [repeatEvery, setRepeatEvery] = useState('0')
  const [jobs, setJobs] = useState<Job[]>([])
  const [creating, setCreating] = useState(false)
  const { writeContractAsync } = useWriteContract()

  async function createJob() {
    if (!address) return
    setCreating(true)
    try {
      const requestHash = keccak256(stringToBytes(payload + Date.now()))
      const hash = await writeContractAsync({
        address: PPC,
        abi: PPC_ABI,
        functionName: 'callService',
        args: [BigInt(providerId), requestHash],
      })
      const job: Job = { id: requestHash.slice(0, 10), provider: providerId, payload, status: 'running', createdAt: Date.now(), txHash: hash }
      setJobs(j => [job, ...j])
      setTab('active')
    } catch (e: any) { alert(e.shortMessage || e.message) }
    setCreating(false)
  }

  const statusColor = { pending: '#f59e0b', running: '#3b82f6', done: '#10b981', failed: '#ef4444' }

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Jobs</div>
      <div style={S.sub}>ERC-1183 trustless job settlement — client locks USDC, provider delivers, evaluator approves, contract pays.</div>

      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-2)', borderRadius: '10px', padding: '4px', marginBottom: '20px', width: 'fit-content' }}>
        {[{ id: 'active', label: 'Active Jobs' }, { id: 'create', label: '+ Create Job' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? '#000' : 'var(--text-dim)' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'active' && (
        jobs.length === 0
          ? <div style={{ ...S.card, textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
              <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>No active jobs</div>
              <div style={{ fontSize: '13px' }}>Create a job to get started</div>
              <button style={{ ...S.btn, marginTop: '16px' }} onClick={() => setTab('create')}>Create Job →</button>
            </div>
          : <div style={S.card}>
              {jobs.map(job => (
                <div key={job.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <code style={{ fontSize: '12px', color: 'var(--accent)' }}>Job {job.id}</code>
                    <span style={S.badge(statusColor[job.status])}>{job.status.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Provider #{job.provider} · {new Date(job.createdAt).toLocaleTimeString()}</div>
                  {job.txHash && <a href={`https://explorer.testnet.arc.io/tx/${job.txHash}`} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--accent)' }}>View on ArcScan →</a>}
                </div>
              ))}
            </div>
      )}

      {tab === 'create' && (
        <div style={S.card}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Create New Job</div>

          <div style={{ marginBottom: '12px' }}><div style={S.label}>Provider ID</div><input style={S.input} value={providerId} onChange={e => setProviderId(e.target.value)} /></div>
          <div style={{ marginBottom: '12px' }}><div style={S.label}>Job Payload (JSON)</div><textarea style={{ ...S.input, height: '80px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }} value={payload} onChange={e => setPayload(e.target.value)} /></div>
          <div style={{ marginBottom: '16px' }}><div style={S.label}>Repeat Every (blocks, 0 = once)</div><input style={S.input} type="number" value={repeatEvery} onChange={e => setRepeatEvery(e.target.value)} /></div>

          <div style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Cost per job</span>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>~1 USDC</span>
          </div>

          <button style={{ ...S.btn, width: '100%', opacity: !address || creating ? 0.6 : 1 }} onClick={createJob} disabled={!address || creating}>
            {creating ? 'Creating...' : 'Submit Job →'}
          </button>
        </div>
      )}
    </div>
  )
}
