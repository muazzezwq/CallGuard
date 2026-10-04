import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useBalance } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { CONFIG, REPUTATION_LOAN_ABI } from '../../lib/config'

const ADDR = CONFIG.reputationLoanAddress as `0x${string}`

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

export default function Lending() {
  const { address } = useAccount()
  const [tab, setTab] = useState<'borrow' | 'lend' | 'repay'>('borrow')
  const [amount, setAmount] = useState('50')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: totalShares } = useReadContract({ address: ADDR, abi: REPUTATION_LOAN_ABI, functionName: 'totalShares' })
  const { data: poolBalance } = useReadContract({ address: ADDR, abi: REPUTATION_LOAN_ABI, functionName: 'poolBalance' })

  const poolUSDC = poolBalance ? formatUnits(poolBalance as bigint, 6) : '0'
  const shares = totalShares ? formatUnits(totalShares as bigint, 6) : '0'

  async function deposit() {
    try {
      const hash = await writeContractAsync({
        address: ADDR,
        abi: REPUTATION_LOAN_ABI,
        functionName: 'deposit',
        args: [parseUnits(amount, 6)],
      })
      setTxHash(hash)
    } catch (e: any) { alert(e.shortMessage || e.message) }
  }

  async function borrow() {
    try {
      const hash = await writeContractAsync({
        address: ADDR,
        abi: REPUTATION_LOAN_ABI,
        functionName: 'borrow',
        args: [parseUnits(amount, 6)],
      })
      setTxHash(hash)
    } catch (e: any) { alert(e.shortMessage || e.message) }
  }

  async function repay() {
    try {
      const hash = await writeContractAsync({
        address: ADDR,
        abi: REPUTATION_LOAN_ABI,
        functionName: 'repay',
        args: [parseUnits(amount, 6)],
      })
      setTxHash(hash)
    } catch (e: any) { alert(e.shortMessage || e.message) }
  }

  const tabs = [{ id: 'borrow', label: 'Borrow Stake' }, { id: 'lend', label: 'Provide Liquidity' }, { id: 'repay', label: 'Repay' }]

  return (
    <div style={S.wrap}>
      <div style={S.h1}>RepFi Lending</div>
      <div style={S.sub}>Reputation-backed USDC loans. High honor rate? Borrow your stake from the pool.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <div style={S.stat}><div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Pool Size</div><div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)' }}>{parseFloat(poolUSDC).toFixed(2)}</div><div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>USDC</div></div>
        <div style={S.stat}><div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Total Shares</div><div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>{parseFloat(shares).toFixed(2)}</div><div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>LP tokens</div></div>
        <div style={S.stat}><div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Min. Honor Rate</div><div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>90%</div><div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>to borrow</div></div>
      </div>

      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-2)', borderRadius: '10px', padding: '4px', marginBottom: '24px', width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? '#000' : 'var(--text-dim)' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'borrow' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Borrow Stake from Pool</div>
          <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>Providers with honor rate &gt; 90% can borrow USDC stake. If slashed, debt is deducted first.</div>
          <div style={{ background: '#10b98115', border: '1px solid #10b98140', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>Requirements</div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>Honor rate &gt; 90% · At least 10 completed calls · No outstanding loans</div>
          </div>
          <div style={{ marginBottom: '16px' }}><div style={S.label}>Amount (USDC)</div><input style={S.input} type="number" value={amount} onChange={e => setAmount(e.target.value)} min="1" /></div>
          <button style={S.btn} onClick={borrow} disabled={isPending || isConfirming || !address}>
            {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : 'Borrow Stake'}
          </button>
          {isSuccess && <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--accent)' }}>✓ Stake borrowed successfully</div>}
        </div>
      )}

      {tab === 'lend' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Provide Liquidity</div>
          <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>Deposit USDC to the reputation pool. Earn interest from loan fees and slash redistribution.</div>
          {parseFloat(poolUSDC) === 0 && (
            <div style={{ background: 'var(--accent)15', border: '1px solid var(--accent)40', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '13px' }}>Pool is empty — be the first liquidity provider</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>First depositors get the highest share ratio.</div>
            </div>
          )}
          <div style={{ marginBottom: '16px' }}><div style={S.label}>Deposit Amount (USDC)</div><input style={S.input} type="number" value={amount} onChange={e => setAmount(e.target.value)} min="1" /></div>
          <button style={S.btn} onClick={deposit} disabled={isPending || isConfirming || !address}>
            {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : 'Deposit'}
          </button>
          {isSuccess && <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--accent)' }}>✓ Deposited successfully</div>}
        </div>
      )}

      {tab === 'repay' && (
        <div style={S.card}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Repay Loan</div>
          <div style={{ marginBottom: '16px' }}><div style={S.label}>Amount (USDC)</div><input style={S.input} type="number" value={amount} onChange={e => setAmount(e.target.value)} min="1" /></div>
          <button style={S.btn} onClick={repay} disabled={isPending || isConfirming || !address}>
            {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : 'Repay'}
          </button>
          {isSuccess && <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--accent)' }}>✓ Repaid successfully</div>}
        </div>
      )}
    </div>
  )
}
