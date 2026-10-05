import { useState } from 'react'
import { useSubgraph } from '../../hooks/useSubgraph'
import { useAccount, useWalletClient } from 'wagmi'
import { parseUnits } from 'viem'
import { CONFIG } from '../../lib/config'

const QUERY = `{ providers(first:5 orderBy:completedCalls orderDirection:desc) { id pricePerCall maxResponseTime completedCalls slashedCalls } }`

const USDC_ABI = [
  { name:"transferWithAuthorization", type:"function", stateMutability:"nonpayable",
    inputs:[
      {name:"from",type:"address"},{name:"to",type:"address"},
      {name:"value",type:"uint256"},{name:"validAfter",type:"uint256"},
      {name:"validBefore",type:"uint256"},{name:"nonce",type:"bytes32"},
      {name:"v",type:"uint8"},{name:"r",type:"bytes32"},{name:"s",type:"bytes32"},
    ], outputs:[] },
] as const;

const S = {
  card: { background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:12, padding:20, marginBottom:16 },
  label: { fontSize:11, fontWeight:600 as const, letterSpacing:'0.08em', color:'var(--text-faint)', textTransform:'uppercase' as const, marginBottom:6, display:'block' as const },
  code: { background:'var(--bg-3)', borderRadius:8, padding:'12px 14px', fontSize:12, fontFamily:'var(--font-mono,monospace)', overflowX:'auto' as const, margin:'8px 0' },
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function Mcp() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [tab, setTab]                   = useState<'tools'|'x402'|'test'|'config'>('tools')
  const [testResult, setTestResult]     = useState<string|null>(null)
  const [testing, setTesting]           = useState(false)

  // x402 live tester state
  const [x402Url, setX402Url]           = useState('https://arcsla.vercel.app/api/call-service')
  const [x402Payload, setX402Payload]   = useState('{"providerId":1,"payload":"hello"}')
  const [x402Status, setX402Status]     = useState<string|null>(null)
  const [x402Loading, setX402Loading]   = useState(false)

  const { data } = useSubgraph(QUERY)
  const providers = (data as { providers?: Record<string,unknown>[] })?.providers ?? []

  async function runMcpTest() {
    setTesting(true); setTestResult(null)
    try {
      const res  = await fetch(`https://arcsla.vercel.app/api/attestation?providerId=1&type=score`)
      const json = await res.json()
      setTestResult(JSON.stringify(json, null, 2))
    } catch (e: unknown) {
      setTestResult(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
    setTesting(false)
  }

  async function runX402Test() {
    if (!address || !walletClient) { setX402Status('❌ Connect wallet first'); return }
    setX402Loading(true); setX402Status('⏳ Probing endpoint…')
    try {
      // 1. Probe for 402
      const probe = await fetch(x402Url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: x402Payload,
      })
      if (probe.status !== 402) {
        const txt = await probe.text()
        setX402Status(`ℹ️ Status ${probe.status} (not 402). Response: ${txt.slice(0,200)}`)
        setX402Loading(false); return
      }
      const terms = await probe.json()
      setX402Status(`✅ Got 402. amount=${terms.amount}, token=${String(terms.token ?? '').slice(0,10)}… Signing EIP-3009…`)

      // 2. Sign EIP-3009 transferWithAuthorization
      const amount    = parseUnits(String(terms.amount ?? '0.001'), 6)
      const validAfter  = BigInt(0)
      const validBefore = BigInt(Math.floor(Date.now()/1000) + 300)
      const nonce     = `0x${crypto.getRandomValues(new Uint8Array(32)).reduce((s,b)=>s+b.toString(16).padStart(2,'0'),'')}`
      const facilitator = terms.facilitator ?? terms.to ?? CONFIG.facilitatorUrl

      const domain = {
        name:'USD Coin', version:'2',
        chainId: CONFIG.chainId,
        verifyingContract: CONFIG.usdc as `0x${string}`,
      }
      const types = {
        TransferWithAuthorization: [
          {name:'from',type:'address'}, {name:'to',type:'address'},
          {name:'value',type:'uint256'}, {name:'validAfter',type:'uint256'},
          {name:'validBefore',type:'uint256'}, {name:'nonce',type:'bytes32'},
        ]
      }
      const message = { from:address, to:facilitator, value:amount, validAfter, validBefore, nonce }
      const sig = await walletClient.signTypedData({ account:address, domain, types, primaryType:'TransferWithAuthorization', message })
      const r = sig.slice(0,66) as `0x${string}`
      const s = `0x${sig.slice(66,130)}` as `0x${string}`
      const v = parseInt(sig.slice(130,132), 16)

      setX402Status('⏳ Submitting authorized request…')

      // 3. Submit with payment header
      const payHeader = JSON.stringify({ from:address, to:facilitator, value:amount.toString(), validAfter:'0', validBefore:validBefore.toString(), nonce, v, r, s })
      const finalRes = await fetch(x402Url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'X-PAYMENT':payHeader },
        body: x402Payload,
      })
      const finalJson = await finalRes.json()
      setX402Status(`✅ Success (${finalRes.status}):\n${JSON.stringify(finalJson, null, 2)}`)
    } catch (e: unknown) {
      setX402Status(`❌ ${e instanceof Error ? e.message : String(e)}`)
    }
    setX402Loading(false)
  }

  const tools = [
    { name:'list_providers',  desc:'List all active providers with SLA terms, price, reputation', params:'{}' },
    { name:'call_service',    desc:'Make a pay-per-call request with SLA guarantee',              params:'{ providerId, payload }' },
    { name:'check_receipt',   desc:'Verify an on-chain call receipt by TX hash',                  params:'{ txHash }' },
    { name:'claim_timeout',   desc:'Claim refund + slash bonus if provider missed SLA deadline',   params:'{ callId }' },
    { name:'get_balance',     desc:'Get USDC balance of any address',                             params:'{ address }' },
    { name:'get_attestation', desc:'Get SLA attestation for a provider or call',                  params:'{ providerId?, callId? }' },
  ]

  const TABS = [
    { id:'tools',  label:'Tools' },
    { id:'x402',   label:'x402 Tester' },
    { id:'test',   label:'Live Test' },
    { id:'config', label:'Config' },
  ] as const

  return (
    <div className="cg-panel">
      <div className="panel-head">
        <div>
          <h2>MCP / API</h2>
          <p className="text-dim">Model Context Protocol server for AI agents</p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, background:'var(--bg-2)', borderRadius:10, padding:4, marginBottom:20, width:'fit-content', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'7px 14px', borderRadius:7, border:'none', cursor:'pointer',
            fontSize:13, fontWeight:600,
            background: tab===t.id ? 'var(--accent)' : 'transparent',
            color:       tab===t.id ? '#000'           : 'var(--text-dim)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* TOOLS */}
      {tab === 'tools' && (
        <div style={S.card}>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>Available MCP Tools</div>
          {tools.map(t => (
            <div key={t.name} style={{ padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <code style={{ background:'rgba(16,185,129,0.1)', color:'var(--accent)', padding:'2px 8px', borderRadius:4, fontSize:12, fontFamily:'monospace' }}>{t.name}</code>
              </div>
              <div style={{ fontSize:13, color:'var(--text-dim)', marginBottom:4 }}>{t.desc}</div>
              <code style={{ fontSize:11, color:'var(--text-faint)' }}>params: {t.params}</code>
            </div>
          ))}
        </div>
      )}

      {/* X402 LIVE TESTER */}
      {tab === 'x402' && (
        <div>
          <div style={S.card}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>x402 / EIP-3009 Live Tester</div>
            <div style={{ fontSize:12, color:'var(--text-dim)', marginBottom:16 }}>
              Probes an endpoint for HTTP 402, signs transferWithAuthorization, submits payment header.
            </div>

            <label style={S.label}>Endpoint URL</label>
            <input className="cg-input" value={x402Url} onChange={e=>setX402Url(e.target.value)} placeholder="https://…/api/call-service" style={{ marginBottom:10 }}/>

            <label style={S.label}>Request Payload (JSON)</label>
            <textarea
              className="cg-input"
              value={x402Payload}
              onChange={e=>setX402Payload(e.target.value)}
              rows={3}
              style={{ fontFamily:'var(--font-mono)', fontSize:12, resize:'vertical', marginBottom:10 }}
            />

            <button
              className="btn btn-primary"
              onClick={runX402Test}
              disabled={x402Loading || !address}
              style={{ marginBottom:10 }}
            >
              {x402Loading ? '⏳ Running…' : '⚡ Run x402 Test'}
            </button>
            {!address && <div style={{ fontSize:11, color:'var(--warn,#f59e0b)' }}>Connect wallet to sign EIP-3009</div>}

            {x402Status && (
              <pre style={{
                ...S.code,
                color: x402Status.startsWith('❌') ? 'var(--danger,#ef4444)'
                     : x402Status.startsWith('✅') ? 'var(--accent)'
                     : 'var(--text-dim)',
                whiteSpace:'pre-wrap', wordBreak:'break-all',
              }}>{x402Status}</pre>
            )}
          </div>

          <div style={{ ...S.card, fontSize:12, color:'var(--text-dim)' }}>
            <strong style={{ color:'var(--text)', display:'block', marginBottom:8 }}>How it works</strong>
            1. POST to endpoint → expect HTTP 402 with payment terms<br/>
            2. Sign EIP-3009 <code style={{ color:'var(--accent)' }}>transferWithAuthorization</code> with your wallet<br/>
            3. Resubmit with <code style={{ color:'var(--accent)' }}>X-PAYMENT</code> header → service executes
          </div>
        </div>
      )}

      {/* LIVE TEST */}
      {tab === 'test' && (
        <div>
          <div style={S.card}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Live Providers (Goldsky)</div>
            {providers.length === 0
              ? <div style={{ color:'var(--text-dim)', textAlign:'center', padding:16 }}>Loading…</div>
              : providers.map(p => (
                <div key={String(p.id)} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                  <span>Provider #{String(p.id)}</span>
                  <span style={{ color:'var(--text-dim)' }}>{String(p.completedCalls)} calls · {String(p.slashedCalls)} slashes</span>
                </div>
              ))
            }
          </div>

          <div style={S.card}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Test: get_attestation (Provider #1)</div>
            <button
              className="btn btn-primary"
              style={{ marginBottom:12, opacity: testing ? 0.6 : 1 }}
              onClick={runMcpTest}
              disabled={testing}
            >
              {testing ? '⏳ Running…' : '▶ Run Test'}
            </button>
            {testResult && (
              <pre style={{ ...S.code, color: testResult.startsWith('Error') ? '#ef4444' : '#10b981', whiteSpace:'pre-wrap' }}>
                {testResult}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* CONFIG */}
      {tab === 'config' && (
        <div style={S.card}>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>MCP Server Setup</div>

          <label style={S.label}>Install</label>
          <div style={{ position:'relative' }}>
            <pre style={{ ...S.code, color:'#10b981' }}>npm install @callguard/mcp-server</pre>
            <button onClick={() => copyText('npm install @callguard/mcp-server')} style={{ position:'absolute', top:8, right:8, fontSize:10, background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-dim)', cursor:'pointer', padding:'2px 6px' }}>copy</button>
          </div>

          <label style={S.label}>Claude Desktop Config</label>
          <div style={{ position:'relative' }}>
            <pre style={{ ...S.code, color:'var(--text)' }}>{`{
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
            <button onClick={() => copyText(`{"mcpServers":{"callguard":{"command":"npx","args":["@callguard/mcp-server"],"env":{"CALLGUARD_URL":"https://arcsla.vercel.app","CHAIN_ID":"5042002"}}}}`)} style={{ position:'absolute', top:8, right:8, fontSize:10, background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-dim)', cursor:'pointer', padding:'2px 6px' }}>copy</button>
          </div>

          <label style={S.label}>REST Base URL</label>
          <div style={{ position:'relative' }}>
            <pre style={{ ...S.code, color:'#10b981' }}>https://arcsla.vercel.app/api</pre>
            <button onClick={() => copyText('https://arcsla.vercel.app/api')} style={{ position:'absolute', top:8, right:8, fontSize:10, background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-dim)', cursor:'pointer', padding:'2px 6px' }}>copy</button>
          </div>

          <label style={S.label}>Remote SSE Endpoint</label>
          <div style={{ position:'relative' }}>
            <pre style={{ ...S.code, color:'#10b981' }}>https://arcsla.vercel.app/api/mcp-server</pre>
            <button onClick={() => copyText('https://arcsla.vercel.app/api/mcp-server')} style={{ position:'absolute', top:8, right:8, fontSize:10, background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--text-dim)', cursor:'pointer', padding:'2px 6px' }}>copy</button>
          </div>

          <div style={{ background:'rgba(16,185,129,0.05)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:8, padding:12, fontSize:13, color:'var(--text-dim)', marginTop:8 }}>
            Compatible with Claude Desktop, Cursor, Cline, Continue.dev, and any MCP v1.0+ client.
          </div>
        </div>
      )}
    </div>
  )
}
