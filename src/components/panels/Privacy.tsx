import { useState, useEffect } from 'react'

const S = {
  wrap: { padding: '24px', maxWidth: '680px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' },
  label: { fontSize: '14px', fontWeight: 600, color: 'var(--text)' },
  desc: { fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' },
  toggle: { width: '42px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', position: 'relative' as const, transition: 'background 0.2s' },
  btn: { padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
}

const STORAGE_KEYS = [
  'cg_mode', 'cg_theme', 'cg_adv_open', 'cg_agent_wallet',
  'cg_onboarding_step1', 'cg_onboarding_step2', 'cg_onboarding_step3',
  'cg_new_seen_quality', 'cg_new_seen_agent', 'cg_new_seen_lending',
  'cg_new_seen_futures', 'cg_new_seen_attestation', 'cg_budget',
]

const SETTINGS = [
  { key: 'analytics', label: 'Anonymous analytics', desc: 'Help improve CallGuard by sharing usage data (no wallet data sent)' },
  { key: 'subgraph_cache', label: 'Subgraph cache', desc: 'Cache subgraph responses locally for faster loading' },
  { key: 'rpc_fallback', label: 'Public RPC fallback', desc: 'Fall back to public RPC when custom RPC is unavailable' },
  { key: 'activity_history', label: 'Activity history', desc: 'Store recent calls and receipts in localStorage for quick access' },
]

export default function Privacy() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    analytics: false,
    subgraph_cache: true,
    rpc_fallback: true,
    activity_history: true,
  })
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('cg_privacy_prefs')
    if (saved) { try { setPrefs(JSON.parse(saved)) } catch {} }
  }, [])

  function toggle(key: string) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    localStorage.setItem('cg_privacy_prefs', JSON.stringify(next))
  }

  function clearData() {
    STORAGE_KEYS.forEach(k => localStorage.removeItem(k))
    sessionStorage.clear()
    setCleared(true)
    setTimeout(() => setCleared(false), 3000)
  }

  const storageSize = STORAGE_KEYS.reduce((acc, k) => {
    const v = localStorage.getItem(k)
    return acc + (v ? v.length : 0)
  }, 0)

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Privacy</div>
      <div style={S.sub}>Control what data CallGuard stores locally. No server-side user data is collected.</div>

      {/* Data stored */}
      <div style={S.card}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>Local Storage</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          <div style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: '4px' }}>Stored Keys</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>
              {STORAGE_KEYS.filter(k => localStorage.getItem(k) !== null).length}
            </div>
          </div>
          <div style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: '4px' }}>Data Size</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>~{Math.round(storageSize / 1024 * 10) / 10}KB</div>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '12px' }}>
          CallGuard stores only UI preferences and cached blockchain data in your browser.
          No wallet keys, private data, or personal information is stored.
        </div>

        <button style={S.btn} onClick={clearData}>
          {cleared ? '✅ Cleared!' : '🗑 Clear all local data'}
        </button>
      </div>

      {/* Settings */}
      <div style={S.card}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Preferences</div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px' }}>These settings are stored locally and never sent to any server.</div>
        {SETTINGS.map((s, i) => (
          <div key={s.key} style={{ ...S.row, borderBottom: i < SETTINGS.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div>
              <div style={S.label}>{s.label}</div>
              <div style={S.desc}>{s.desc}</div>
            </div>
            <button
              onClick={() => toggle(s.key)}
              style={{ ...S.toggle, background: prefs[s.key] ? 'var(--accent)' : 'var(--bg-3)', minWidth: '42px' }}
              title={prefs[s.key] ? 'Enabled' : 'Disabled'}
            >
              <div style={{ position: 'absolute', top: '3px', left: prefs[s.key] ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </button>
          </div>
        ))}
      </div>

      {/* Data policy */}
      <div style={S.card}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>Data Policy</div>
        {[
          { icon: '🔒', title: 'No server-side tracking', desc: 'CallGuard is a fully client-side app. No user data is sent to our servers.' },
          { icon: '🔑', title: 'Keys stay in your wallet', desc: 'Private keys never leave MetaMask or your connected wallet.' },
          { icon: '⛓', title: 'On-chain data is public', desc: 'All contract interactions are public on Arc Testnet by design.' },
          { icon: '🗑', title: 'Right to erasure', desc: 'Clear all local data at any time using the button above.' },
        ].map(item => (
          <div key={item.title} style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '20px', minWidth: '24px' }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{item.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
