import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { CONFIG, DISPUTE_QUALITY_ABI } from '../../lib/config'

const ADDR = CONFIG.disputeQualityAddress as `0x${string}`

const S = {
  wrap: { padding: '24px', maxWidth: '720px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  label: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-faint)', textTransform: 'uppercase' as const, marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' as const },
  btn: { padding: '10px 20px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  btnDanger: { padding: '10px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  badge: (c: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: c === 'OPEN' ? '#10b98120' : c === 'RESOLVED' ? '#3b82f620' : '#6b728020', color: c === 'OPEN' ? '#10b981' : c === 'RESOLVED' ? '#3b82f6' : '#9ca3af' }),
  row: { display: 'flex', gap: '12px', marginBottom: '16px' },
  col: { flex: 1 },
}

export default function Quality() {
  const { address } = useAccount()
  const [tab, setTab] = useState<'open' | 'vote' | 'stake'>('open')
  const [callId, setCallId] = useState('')
  const [evidence, setEvidence] = useState('')
  const [disputeId, setDisputeId] = useState('')
  const [voteSupport, setVoteSupport] = useState(true)
  const [stakeAmount, setStakeAmount] = useState('10')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  async function openDispute() {
    if (!callId || !evidence) return
    try {
      const hash = await writeContractAsync({
        address: ADDR,
        abi: DISPUTE_QUALITY_ABI,
        functionName: 'openDispute',
        args: [BigInt(callId), evidence],
      })
      setTxHash(hash)
    } catch (e: unknown) { alert((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e))) }
  }

  async function voteOnDispute() {
    if (!disputeId) return
    try {
      const hash = await writeContractAsync({
        address: ADDR,
        abi: DISPUTE_QUALITY_ABI,
        functionName: 'vote',
        args: [BigInt(disputeId), voteSupport],
      })
      setTxHash(hash)
    } catch (e: unknown) { alert((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e))) }
  }

  async function stakeAsArbiter() {
    try {
      const hash = await writeContractAsync({
        address: ADDR,
        abi: DISPUTE_QUALITY_ABI,
        functionName: 'stakeArbiter',
        value: BigInt(Math.floor(parseFloat(stakeAmount) * 1e6)),
      })
      setTxHash(hash)
    } catch (e: unknown) { alert((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e))) }
  }

  const tabs = [{ id: 'open', label: 'Open Dispute' }, { id: 'vote', label: 'Vote' }, { id: 'stake', label: 'Become Arbiter' }]

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Quality Disputes</div>
      <div style={S.sub}>Challenge provider response quality. Community arbiters vote stake-weighted.</div>

      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-2)', borderRadius: '10px', padding: '4px', marginBottom: '24px', width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? '#000' : 'var(--text-dim)' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'open' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Open a Quality Dispute</div>
          <div style={{ background: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#f59e0b' }}>
            Disputes are for quality issues — wrong, incomplete, or off-topic responses. Timeout disputes use Claim Timeout in Call Builder.
          </div>
          <div style={S.row}>
            <div style={S.col}>
              <div style={S.label}>Call ID</div>
              <input style={S.input} value={callId} onChange={e => setCallId(e.target.value)} placeholder="e.g. 42" />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <div style={S.label}>Evidence (IPFS hash or description)</div>
            <textarea style={{ ...S.input, minHeight: '80px', resize: 'vertical' }} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Describe the quality issue or provide IPFS hash of evidence..." />
          </div>
          <button style={S.btnDanger} onClick={openDispute} disabled={isPending || isConfirming || !address}>
            {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : 'Open Dispute'}
          </button>
          {isSuccess && <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--accent)' }}>✓ Dispute opened successfully</div>}
        </div>
      )}

      {tab === 'vote' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Vote on a Dispute</div>
          <div style={{ background: '#3b82f615', border: '1px solid #3b82f640', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#3b82f6' }}>
            Your voting power = your staked USDC. Majority stake wins. Losing side's stake is redistributed.
          </div>
          <div style={{ ...S.row, marginBottom: '16px' }}>
            <div style={S.col}>
              <div style={S.label}>Dispute ID</div>
              <input style={S.input} value={disputeId} onChange={e => setDisputeId(e.target.value)} placeholder="e.g. 1" />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <div style={S.label}>Your Vote</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setVoteSupport(true)} style={{ ...S.btn, background: voteSupport ? '#10b981' : 'var(--bg-3)', color: voteSupport ? '#000' : 'var(--text)', border: '1px solid var(--border)', flex: 1 }}>
                ✓ Support Caller
              </button>
              <button onClick={() => setVoteSupport(false)} style={{ ...S.btn, background: !voteSupport ? '#ef4444' : 'var(--bg-3)', color: !voteSupport ? '#fff' : 'var(--text)', border: '1px solid var(--border)', flex: 1 }}>
                ✗ Support Provider
              </button>
            </div>
          </div>
          <button style={S.btn} onClick={voteOnDispute} disabled={isPending || isConfirming || !address || !disputeId}>
            {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : `Vote: ${voteSupport ? 'Support Caller' : 'Support Provider'}`}
          </button>
          {isSuccess && <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--accent)' }}>✓ Vote cast successfully</div>}
        </div>
      )}

      {tab === 'stake' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Become a Community Arbiter</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[{ label: 'Earn', value: 'Dispute fees', sub: 'per resolved case' }, { label: 'Require', value: '>10 USDC', sub: 'minimum stake' }, { label: 'Voting power', value: 'Stake-weighted', sub: 'Bayesian majority' }].map(item => (
              <div key={item.label} style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent)', margin: '4px 0' }}>{item.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{item.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: '16px' }}>
            <div style={S.label}>Stake Amount (USDC)</div>
            <input style={S.input} type="number" value={stakeAmount} onChange={e => setStakeAmount(e.target.value)} min="10" step="1" />
          </div>
          <button style={S.btn} onClick={stakeAsArbiter} disabled={isPending || isConfirming || !address}>
            {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : 'Stake & Become Arbiter'}
          </button>
        </div>
      )}

      <div style={{ ...S.card, marginTop: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>Contract Info</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-dim)' }}>
          <span>DisputeQuality</span>
          <a href={`https://explorer.testnet.arc.io/address/${ADDR}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{ADDR.slice(0, 10)}...{ADDR.slice(-6)}</a>
        </div>
      </div>
    </div>
  )
}
