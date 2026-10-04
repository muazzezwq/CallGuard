import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { CONFIG, PPC_ABI, USDC_ABI } from '../../lib/config'
const PPC_ADDRESS = CONFIG.ppcAddress as `0x${string}`
const USDC_ADDRESS = CONFIG.usdcAddress as `0x${string}`

const S = {
  wrap: { padding: '24px', maxWidth: '640px' },
  h1: { fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', marginBottom: '16px' },
  label: { fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '6px' },
  input: { width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '6px', padding: '9px 12px', color: 'var(--text)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' },
  btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },
  btnGreen: { background: 'var(--accent)', color: '#fff' },
  btnGhost: { background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)' },
  info: { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '12px', fontSize: '13px', color: 'var(--text)', marginBottom: '16px' },
  warn: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#ef4444', marginBottom: '16px' },
  tag: { display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: 'rgba(16,185,129,0.15)', color: '#10b981', marginLeft: '8px' },
}

export default function Register() {
  const { address, isConnected } = useAccount()
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const [form, setForm] = useState({
    stake: '50',
    price: '1',
    sla: '120',
    slashBps: '2000',
    signer: '',
  })
  const [step, setStep] = useState<'approve' | 'register'>('approve')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleApprove = () => {
    if (!address) return
    writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [PPC_ADDRESS, parseUnits(form.stake, 6)],
    })
    setStep('register')
  }

  const handleRegister = () => {
    if (!address) return
    writeContract({
      address: PPC_ADDRESS,
      abi: PPC_ABI,
      functionName: 'register',
      args: [
        (form.signer || address) as `0x${string}`,
        parseUnits(form.stake, 6),
        parseUnits(form.price, 6),
        Number(form.sla),
        Number(form.slashBps),
        '0x',
      ],
    })
  }

  const stakeUsdc = Number(form.stake)
  const priceUsdc = Number(form.price)
  const slashAmt = (stakeUsdc * Number(form.slashBps)) / 10000
  const isUnderfunded = slashAmt < priceUsdc

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Become a Provider <span style={S.tag}>Earn USDC</span></div>
      <div style={S.sub}>Stake USDC, set your SLA terms, earn per request. Miss the deadline — your stake is slashed.</div>

      {!isConnected && (
        <div style={S.warn}>Connect your wallet to register as a provider.</div>
      )}

      <div style={S.info}>
        <strong>How it works:</strong> You stake USDC as collateral. Every time a caller pays for your service and you respond within the SLA window, you receive the payment. Miss the window — the caller gets a refund + slash bonus from your stake.
      </div>

      <div style={S.card}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '16px' }}>Registration Parameters</div>

        <div style={S.row}>
          <div>
            <div style={S.label}>Stake Amount (USDC)</div>
            <input style={S.input} value={form.stake} onChange={set('stake')} type="number" min="1" />
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>Min recommended: 50 USDC</div>
          </div>
          <div>
            <div style={S.label}>Price per Call (USDC)</div>
            <input style={S.input} value={form.price} onChange={set('price')} type="number" min="0.001" step="0.001" />
          </div>
        </div>

        <div style={S.row}>
          <div>
            <div style={S.label}>SLA Window (seconds)</div>
            <input style={S.input} value={form.sla} onChange={set('sla')} type="number" min="10" />
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>Time to respond per call</div>
          </div>
          <div>
            <div style={S.label}>Slash % (bps)</div>
            <input style={S.input} value={form.slashBps} onChange={set('slashBps')} type="number" min="100" max="10000" />
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>2000 = 20% of stake</div>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={S.label}>Signer Address (optional)</div>
          <input style={S.input} value={form.signer} onChange={set('signer')} placeholder={address || '0x...'} />
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>Address that signs receipts. Defaults to your wallet.</div>
        </div>

        {isUnderfunded && (
          <div style={S.warn}>
            ⚠ Underfunded: slash amount ({slashAmt.toFixed(2)} USDC) is less than price per call ({priceUsdc} USDC). Callers may not receive full refund on timeout.
          </div>
        )}

        <div style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-dim)' }}>Stake locked</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{form.stake} USDC</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-dim)' }}>Per-call slash</span>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>{slashAmt.toFixed(2)} USDC</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Earning per call</span>
            <span style={{ color: '#10b981', fontWeight: 600 }}>{form.price} USDC</span>
          </div>
        </div>

        {isSuccess ? (
          <div style={{ ...S.info, marginBottom: 0 }}>✅ Successfully registered! Your provider profile is now live on Arc Testnet.</div>
        ) : (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              style={{ ...S.btn, ...S.btnGhost }}
              onClick={handleApprove}
              disabled={!isConnected || isPending || isConfirming}
            >
              {isPending && step === 'approve' ? 'Approving…' : '1. Approve USDC'}
            </button>
            <button
              style={{ ...S.btn, ...S.btnGreen }}
              onClick={handleRegister}
              disabled={!isConnected || isPending || isConfirming}
            >
              {isPending && step === 'register' ? 'Registering…' : isConfirming ? 'Confirming…' : '2. Register'}
            </button>
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>Provider Economics</div>
        <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.6' }}>
          <div>• Respond within {form.sla}s → earn {form.price} USDC per call</div>
          <div>• Miss deadline → lose {slashAmt.toFixed(2)} USDC from stake</div>
          <div>• Honor rate tracked onchain — Bayesian score improves over time</div>
          <div>• High honor rate (&gt;90%) unlocks RepFi borrowing</div>
        </div>
      </div>
    </div>
  )
}
