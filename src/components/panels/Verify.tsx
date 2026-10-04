import { useState } from 'react'
import { useReadContract } from 'wagmi'
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

type VerifyResult = { valid: boolean; callId?: string; status?: string; error?: string }

export default function Verify() {
  const [callId, setCallId] = useState('')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function verifyReceipt() {
    if (!callId) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/attestation?callId=${callId}`)
      const data = await res.json()
      if (data.ok) {
        setResult({ valid: true, callId, status: data.status || 'VERIFIED', ...data })
      } else {
        setResult({ valid: false, error: data.error || 'Not found on-chain' })
      }
    } catch {
      setResult({ valid: false, error: 'Request failed' })
    } finally {
      setLoading(false)
    }
  }

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?verify=${callId}` : ''

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Receipt Verification</div>
      <div style={S.sub}>Verify any CallGuard receipt on-chain. Share the link as proof — no wallet required.</div>

      <div style={S.card}>
        <div style={{ marginBottom: '16px' }}>
          <div style={S.label}>Call ID or TX Hash</div>
          <input style={S.input} value={callId} onChange={e => setCallId(e.target.value)} placeholder="0x... or numeric call ID" />
        </div>
        <button style={S.btn} onClick={verifyReceipt} disabled={loading || !callId}>
          {loading ? 'Verifying...' : 'Verify On-chain →'}
        </button>
      </div>

      {result && (
        <div style={{ ...S.card, border: `1px solid ${result.valid ? '#10b981' : '#ef4444'}40` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: result.valid ? '#10b98120' : '#ef444420', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
              {result.valid ? '✓' : '✗'}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: result.valid ? '#10b981' : '#ef4444', fontSize: '16px' }}>{result.valid ? 'Receipt Verified' : 'Verification Failed'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{result.valid ? 'On-chain record found' : result.error}</div>
            </div>
          </div>
          {result.valid && (
            <div style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
              <pre style={{ margin: 0, color: 'var(--text)', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
          {result.valid && callId && (
            <div style={{ marginTop: '12px' }}>
              <div style={S.label}>Shareable Link</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input style={{ ...S.input, flex: 1, fontSize: '12px', fontFamily: 'monospace' }} value={shareUrl} readOnly />
                <button style={{ ...S.btn, padding: '10px 14px', flexShrink: 0 }} onClick={() => navigator.clipboard?.writeText(shareUrl)}>Copy</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ ...S.card, background: 'transparent', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>How verification works</div>
        <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.6' }}>
          Every CallGuard receipt is an EIP-712 typed signature from the provider, stored on Arc Testnet. 
          Verification reads the on-chain state — no trust in any server required.
        </div>
      </div>
    </div>
  )
}
