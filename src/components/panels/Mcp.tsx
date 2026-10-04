import { useState } from 'react'
import { useSubgraph } from '../../hooks/useSubgraph'

const QUERY = `{ providers(first: 5, orderBy: completedCalls, orderDirection: desc) { id, pricePerCall, maxResponseTime, completedCalls, slashedCalls } }`
const S = {
  wrap: { padding: '24px', maxWidth: '680px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  label: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-faint)', textTransform: 'uppercase' as const, marginBottom: '6px' },
  btn: (c = 'var(--accent)') => ({ padding: '10px 20px', background: c, color: c === 'var(--accent)' ? '#000' : '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }),
  code: { background: 'var(--bg-3)', borderRadius: '8px', padding: '16px', fontSize: '12px', fontFamily: 'monospace', overflowX: 'auto' as const },
}

export default function Mcp() {
  const [tab, setTab] = useState<'tools' | 'test' | 'config'>('tools')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const { data } = useSubgraph(QUERY)
  const providers = (data as any)?.providers || []

  async function runTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`https://arcsla.vercel.app/api/attestation?providerId=1&type=score`)
      const json = await res.json()
      setTestResult(JSON.stringify(json, null, 2))
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`)
    }
    setTesting(false)
  }

  const tools = [
    { name: 'list_providers', desc: 'List all active CallGuard providers with SLA terms, price, and reputation score', params: '{}' },
    { name: 'call_service', desc: 'Make a pay-per-call service request with SLA guarantee', params: '{ providerId: number, payload: string }' },
    { name: 'check_receipt', desc: 'Verify an on-chain call receipt by transaction hash', params: '{ txHash: string }' },
    { name: 'claim_timeout', desc: 'Claim refund + slash bonus if provider missed SLA deadline', params: '{ callId: string }' },
    { name: 'get_balance', desc: 'Get USDC balance of agent wallet', params: '{ address: string }' },
    { name: 'get_attestation', desc: 'Get SLA attestation for a provider or call ID', params: '{ providerId?: number, callId?: string }' },
  ]

  return (
    <div style={S.wrap}>
      <div style={S.h1}>MCP / API</div>
      <div style={S.sub}>Model Context Protocol server for AI agents. Connect Claude, GPT, or any LLM to CallGuard services.</div>

      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-2)', borderRadius: '10px', padding: '4px', marginBottom: '20px', width: 'fit-content' }}>
        {[{ id: 'tools', label: 'Tools' }, { id: 'test', label: 'Test' }, { id: 'config', label: 'Config' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? '#000' : 'var(--text-dim)' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'tools' && (
        <div style={S.card}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Available Tools</div>
          {tools.map(t => (
            <div key={t.name} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <code style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace' }}>{t.name}</code>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '4px' }}>{t.desc}</div>
              <code style={{ fontSize: '11px', color: 'var(--text-faint)' }}>params: {t.params}</code>
            </div>
          ))}
        </div>
      )}

      {tab === 'test' && (
        <div>
          <div style={S.card}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>Live Providers (from subgraph)</div>
            {providers.length === 0
              ? <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '16px' }}>Loading...</div>
              : providers.map((p: any) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text)' }}>Provider #{p.id}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{p.completedCalls} calls · {p.slashedCalls} slashes</span>
                </div>
              ))
            }
          </div>

          <div style={S.card}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>Test: get_attestation (Provider #1)</div>
            <button style={{ ...S.btn(), marginBottom: '12px', opacity: testing ? 0.6 : 1 }} onClick={runTest} disabled={testing}>
              {testing ? 'Running...' : 'Run Test →'}
            </button>
            {testResult && <pre style={{ ...S.code, color: testResult.startsWith('Error') ? '#ef4444' : '#10b981' }}>{testResult}</pre>}
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div style={S.card}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>MCP Server Setup</div>

          <div style={S.label}>Install</div>
          <pre style={{ ...S.code, color: '#10b981', marginBottom: '16px' }}>npm install @callguard/mcp-server</pre>

          <div style={S.label}>Claude Desktop Config</div>
          <pre style={{ ...S.code, color: '#e5e7eb', marginBottom: '16px' }}>{`{
  "mcpServers": {
    "callguard": {
      "command": "npx",
      "args": ["@callguard/mcp-server"],
      "env": {
        "CALLGUARD_URL": "https://arcsla.vercel.app",
        "CHAIN_ID": "5042002"
      }
    }
  }
}`}</pre>

          <div style={S.label}>REST Base URL</div>
          <pre style={{ ...S.code, color: '#10b981', marginBottom: '16px' }}>https://arcsla.vercel.app/api</pre>

          <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '12px', fontSize: '13px', color: 'var(--text-dim)' }}>
            MCP server is compatible with Claude Desktop, Cursor, Cline, Continue.dev, and any tool supporting MCP v1.0+
          </div>
        </div>
      )}
    </div>
  )
}
