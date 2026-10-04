import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseUnits } from 'viem'
import { CONFIG, SLA_FUTURES_ABI } from '../../lib/config'

const ADDR = CONFIG.slaFuturesAddress as `0x${string}`
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
  stat: { background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', textAlign: 'center' as const },
}

export default function Futures() {
  const { address } = useAccount()
  const [tab, setTab] = useState<'mint' | 'redeem' | 'market'>('mint')
  const [providerId, setProviderId] = useState('1')
  const [amount, setAmount] = useState('10')
  const [price, setPrice] = useState('1')
  const [deadline, setDeadline] = useState('7')
  const [batchId, setBatchId] = useState('')
  const [redeemBatchId, setRedeemBatchId] = useState('')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: nextBatchId } = useReadContract({ address: ADDR, abi: SLA_FUTURES_ABI, functionName: 'nextBatchId' })

  const totalBatches = nextBatchId ? Number(nextBatchId) - 1 : 0

  async function mintBatch() {
    try {
      const deadlineTs = BigInt(Math.floor(Date.now() / 1000) + parseInt(deadline) * 86400)
      const hash = await writeContractAsync({
        address: ADDR,
        abi: SLA_FUTURES_ABI,
        functionName: 'mintCapacityBatch',
        args: [BigInt(providerId), BigInt(amount), parseUnits(price, 6), deadlineTs],
      })
      setTxHash(hash)
    } catch (e: any) { alert(e.shortMessage || e.message) }
  }

  async function redeemToken() {
    if (!redeemBatchId) return
    try {
      const hash = await writeContractAsync({
        address: ADDR,
        abi: SLA_FUTURES_ABI,
        functionName: 'redeem',
        args: [BigInt(redeemBatchId)],
      })
      setTxHash(hash)
    } catch (e: any) { alert(e.shortMessage || e.message) }
  }

  const tabs = [{ id: 'mint', label: 'Mint Capacity' }, { id: 'redeem', label: 'Redeem' }, { id: 'market', label: 'Market' }]

  return (
    <div style={S.wrap}>
      <div style={S.h1}>SLA Futures</div>
      <div style={S.sub}>Providers tokenize future capacity as ERC-1155 NFTs. Callers reserve priority slots.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <div style={S.stat}><div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Total Batches</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{totalBatches || '0'}</div></div>
        <div style={S.stat}><div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Standard</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>ERC-1155</div></div>
        <div style={S.stat}><div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Network</div><div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>Arc Testnet</div></div>
      </div>

      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-2)', borderRadius: '10px', padding: '4px', marginBottom: '24px', width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? '#000' : 'var(--text-dim)' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'mint' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Mint Capacity Batch</div>
          <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>As a provider, tokenize your future call capacity as ERC-1155 NFTs that callers can purchase.</div>

          {totalBatches === 0 && (
            <div style={{ background: 'var(--accent)15', border: '1px solid var(--accent)40', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>Be the first to mint capacity tokens</div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>SLA Futures market is empty. Mint the first batch to attract callers who want guaranteed priority slots.</div>
            </div>
          )}

          <div style={S.row}>
            <div style={S.col}><div style={S.label}>Your Provider ID</div><input style={S.input} value={providerId} onChange={e => setProviderId(e.target.value)} placeholder="1" /></div>
            <div style={S.col}><div style={S.label}>Capacity (calls)</div><input style={S.input} type="number" value={amount} onChange={e => setAmount(e.target.value)} min="1" /></div>
          </div>
          <div style={S.row}>
            <div style={S.col}><div style={S.label}>Price per call (USDC)</div><input style={S.input} type="number" value={price} onChange={e => setPrice(e.target.value)} step="0.01" /></div>
            <div style={S.col}><div style={S.label}>Deadline (days)</div><input style={S.input} type="number" value={deadline} onChange={e => setDeadline(e.target.value)} min="1" max="365" /></div>
          </div>
          <div style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: 'var(--text-dim)' }}>Total capacity</span><span style={{ color: 'var(--text)' }}>{amount} calls</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: 'var(--text-dim)' }}>Price per token</span><span style={{ color: 'var(--text)' }}>{price} USDC</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-dim)' }}>Max revenue</span><span style={{ color: 'var(--accent)', fontWeight: 600 }}>{(parseFloat(amount || '0') * parseFloat(price || '0')).toFixed(2)} USDC</span></div>
          </div>
          <button style={S.btn} onClick={mintBatch} disabled={isPending || isConfirming || !address}>
            {isPending ? 'Confirming...' : isConfirming ? 'Minting...' : 'Mint Capacity Batch'}
          </button>
          {isSuccess && <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--accent)' }}>✓ Batch minted successfully</div>}
        </div>
      )}

      {tab === 'redeem' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Redeem Capacity Token</div>
          <div style={{ marginBottom: '16px' }}><div style={S.label}>Batch ID</div><input style={S.input} value={redeemBatchId} onChange={e => setRedeemBatchId(e.target.value)} placeholder="e.g. 1" /></div>
          <button style={S.btn} onClick={redeemToken} disabled={isPending || isConfirming || !address || !redeemBatchId}>
            {isPending ? 'Confirming...' : isConfirming ? 'Redeeming...' : 'Redeem Token'}
          </button>
        </div>
      )}

      {tab === 'market' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Secondary Market</div>
          {totalBatches === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)', fontSize: '14px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
              No capacity batches minted yet. Switch to "Mint Capacity" to create the first batch.
            </div>
          ) : (
            <div style={{ fontSize: '14px', color: 'var(--text-dim)' }}>
              {totalBatches} batch(es) active. Browse on secondary NFT marketplaces using contract: <a href={`https://explorer.testnet.arc.io/address/${ADDR}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{ADDR.slice(0, 10)}...</a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
