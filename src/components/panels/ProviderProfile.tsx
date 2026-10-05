import { useState, useEffect, useCallback } from 'react'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { CONFIG, REGISTRY_ABI } from '../../lib/config'
import { useAppStore } from '../../store/useAppStore'

const REGISTRY = CONFIG.registryAddress as `0x${string}`

const S = {
  wrap: { padding: '24px', maxWidth: '640px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  label: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-faint)', textTransform: 'uppercase' as const, marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' as const },
  btn: { padding: '10px 20px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  stat: { background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', textAlign: 'center' as const },
}

export default function ProviderProfile() {
  const [providerId, setProviderId] = useState('1')
  const [queried, setQueried] = useState('1')
  const [copied, setCopied] = useState(false)
  const { setPanel } = useAppStore()

  // deep-link: read ?provider=X from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pId = params.get('provider')
    if (pId && /^\d+$/.test(pId)) { setProviderId(pId); setQueried(pId) }
  }, [])

  const handleCallProvider = useCallback(() => {
    // Navigate to CallBuilder with provider pre-filled via sessionStorage
    sessionStorage.setItem('callbuilder_provider', queried)
    setPanel('callbuilder')
  }, [queried, setPanel])

  const handleNanoPay = useCallback(() => {
    sessionStorage.setItem('nano_provider', queried)
    setPanel('nano')
  }, [queried, setPanel])

  const { data: provider, isLoading, error } = useReadContract({
    address: REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'getProvider',
    args: [BigInt(queried)],
  })

  const p = provider as any
  const stake = p?.stake ? formatUnits(p.stake, 6) : '0'
  const price = p?.pricePerCall ? formatUnits(p.pricePerCall, 6) : '0'
  const slaWindow = p?.maxResponseTime ? Number(p.maxResponseTime) : 0
  const completed = p?.completedCalls ? Number(p.completedCalls) : 0
  const slashed = p?.slashedCalls ? Number(p.slashedCalls) : 0
  const total = completed + slashed
  const honorRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const isActive = p?.active

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?provider=${queried}` : ''
  const handleCopy = () => {
    navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Provider Profile</div>
      <div style={S.sub}>View any provider's on-chain stats. Share the link — no wallet required.</div>

      <div style={S.card}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '0' }}>
          <input style={{ ...S.input, flex: 1 }} value={providerId} onChange={e => setProviderId(e.target.value)} placeholder="Provider ID (e.g. 1)" />
          <button style={S.btn} onClick={() => setQueried(providerId)}>Load</button>
        </div>
      </div>

      {isLoading && (
        <div style={{ ...S.card, textAlign: 'center', color: 'var(--text-dim)', padding: '40px' }}>Loading provider #{queried}...</div>
      )}

      {error && (
        <div style={{ ...S.card, border: '1px solid #ef444440' }}>
          <div style={{ color: '#ef4444', fontSize: '14px' }}>Provider #{queried} not found or inactive.</div>
        </div>
      )}

      {p && !isLoading && (
        <>
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent)20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>#{queried}</div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Provider #{queried}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>{p.signer?.slice(0, 10)}...{p.signer?.slice(-6)}</div>
              </div>
              <div style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: '12px', background: isActive ? '#10b98120' : '#6b728020', color: isActive ? '#10b981' : '#9ca3af', fontSize: '12px', fontWeight: 600 }}>{isActive ? 'Active' : 'Inactive'}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
              <div style={S.stat}><div style={S.label}>Honor Rate</div><div style={{ fontSize: '24px', fontWeight: 700, color: honorRate > 80 ? '#10b981' : honorRate > 50 ? '#f59e0b' : '#ef4444' }}>{honorRate}%</div></div>
              <div style={S.stat}><div style={S.label}>Completed Calls</div><div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>{completed}</div></div>
              <div style={S.stat}><div style={S.label}>Stake</div><div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>{parseFloat(stake).toFixed(2)} USDC</div></div>
              <div style={S.stat}><div style={S.label}>Price / Call</div><div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>{parseFloat(price).toFixed(3)} USDC</div></div>
              <div style={S.stat}><div style={S.label}>SLA Window</div><div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>{slaWindow}s</div></div>
              <div style={S.stat}><div style={S.label}>Slashes</div><div style={{ fontSize: '18px', fontWeight: 700, color: slashed > 0 ? '#ef4444' : 'var(--text)' }}>{slashed}</div></div>
            </div>

            <a href={`https://explorer.testnet.arc.io/address/${p.signer}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '12px', display: 'block', marginBottom: '12px' }}>View on ArcScan →</a>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <button
              onClick={handleCallProvider}
              disabled={!isActive}
              style={{ flex: 1, padding: '12px', background: isActive ? 'var(--accent)' : 'var(--bg-3)', color: isActive ? '#000' : 'var(--text-faint)', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: isActive ? 'pointer' : 'not-allowed', boxShadow: isActive ? '0 0 16px rgba(16,185,129,0.25)' : 'none' }}
            >
              ⚡ Call this Provider
            </button>
            <button
              onClick={handleNanoPay}
              disabled={!isActive}
              style={{ flex: 1, padding: '12px', background: 'var(--bg-2)', color: isActive ? 'var(--text)' : 'var(--text-faint)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: isActive ? 'pointer' : 'not-allowed' }}
            >
              💸 Nano Pay
            </button>
          </div>

          <div style={S.card}>
            <div style={S.label}>Shareable Link</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input style={{ ...S.input, flex: 1, fontSize: '12px', fontFamily: 'monospace' }} value={shareUrl} readOnly />
              <button
                style={{ ...S.btn, padding: '10px 14px', flexShrink: 0, background: copied ? '#059669' : 'var(--accent)' }}
                onClick={handleCopy}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
