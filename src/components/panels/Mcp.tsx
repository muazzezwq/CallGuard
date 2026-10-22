import { useState } from 'react'
import { useSubgraph } from '../../hooks/useSubgraph'
import { useAccount, useWalletClient } from 'wagmi'
import { parseUnits } from 'viem'
import { Play, Zap } from 'lucide-react'
import { CONFIG } from '../../lib/config'
import { Button, Field, Input, PageHeader, Tabs, Textarea } from '../../ui'
import {
  CodeSurface, KeyValue, Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit, StatusNotice,
} from '../panel/PanelUi'

const QUERY = `{ providers(first:5 orderBy:completedCalls orderDirection:desc) { id pricePerCall completedCalls slashedCalls } }`

const INSTALL_CMD = 'npm install @callguard/mcp-server'
const CLAUDE_CONFIG = `{
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
}`
const CLAUDE_CONFIG_COMPACT = `{"mcpServers":{"callguard":{"command":"npx","args":["@callguard/mcp-server"],"env":{"CALLGUARD_URL":"https://arcsla.vercel.app","CHAIN_ID":"5042002"}}}}`
const REST_BASE = 'https://arcsla.vercel.app/api'
const SSE_ENDPOINT = 'https://arcsla.vercel.app/api/mcp-server'

type Tab = 'tools'|'x402'|'test'|'config'
type StatusTone = 'success' | 'danger' | 'info'

const STATUS_PREFIXES = ['❌', '✅', 'ℹ️', '⏳']

function statusTone(status: string): StatusTone {
  if (status.startsWith('❌')) return 'danger'
  if (status.startsWith('✅')) return 'success'
  return 'info'
}

function statusTitle(status: string) {
  const first = status.split('\n')[0]
  const prefix = STATUS_PREFIXES.find(p => first.startsWith(p))
  return (prefix ? first.slice(prefix.length) : first).trimStart()
}

function statusBody(status: string) {
  return status.split('\n').slice(1).join('\n')
}

export default function Mcp() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [tab, setTab]                   = useState<Tab>('tools')
  const [testResult, setTestResult]     = useState<string|null>(null)
  const [testing, setTesting]           = useState(false)

  // x402 live tester state
  const [x402Url, setX402Url]           = useState('https://arcsla.vercel.app/api/call-service')
  const [x402Payload, setX402Payload]   = useState('{"providerId":1,"payload":"hello"}')
  const [x402Status, setX402Status]     = useState<string|null>(null)
  const [x402Loading, setX402Loading]   = useState(false)

  const { data, loading } = useSubgraph(QUERY)
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
    <PanelShell>
      <PageHeader
        title="MCP / API"
        subtitle="Model Context Protocol server for AI agents"
      />
      <PanelSource
        label="MCP server"
        value="REST + remote SSE"
        hint="Reference surface; requests run only from the test tabs"
        state="idle"
      />

      <div className="pg-tabbar">
        <Tabs tabs={TABS.map(t => ({ id: t.id, label: t.label }))} value={tab} onChange={setTab} />
      </div>

      <PanelSplit
        main={(
          <>
            {/* TOOLS */}
            {tab === 'tools' && (
              <Ledger
                label="Available MCP Tools"
                action={<span className="pg-mono">{tools.length} tools</span>}
              >
                {tools.map(t => (
                  <LedgerRow
                    key={t.name}
                    lead={<code className="pg-endpoint">{t.name}</code>}
                    meta={(
                      <span className="pg-row-stack pg-row-stack--start">
                        <span>{t.desc}</span>
                        <span className="pg-mono">params: {t.params}</span>
                      </span>
                    )}
                  />
                ))}
              </Ledger>
            )}

            {/* X402 LIVE TESTER */}
            {tab === 'x402' && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">x402 / EIP-3009 Live Tester</h2>
                </div>
                <div className="ui-section__body">
                  <p className="pg-copy">
                    Probes an endpoint for HTTP 402, signs transferWithAuthorization, submits payment header.
                  </p>

                  <div className="pg-form">
                    <Field label="Endpoint URL" htmlFor="mcp-x402-url">
                      <Input
                        id="mcp-x402-url"
                        value={x402Url}
                        onChange={e=>setX402Url(e.target.value)}
                        placeholder="https://…/api/call-service"
                      />
                    </Field>
                    <Field label="Request Payload (JSON)" htmlFor="mcp-x402-payload">
                      <Textarea
                        id="mcp-x402-payload"
                        value={x402Payload}
                        onChange={e=>setX402Payload(e.target.value)}
                        rows={3}
                        mono
                      />
                    </Field>
                  </div>

                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button
                      variant="primary"
                      onClick={runX402Test}
                      disabled={x402Loading || !address}
                      loading={x402Loading}
                      leftIcon={<Zap size={13} />}
                    >
                      Run x402 Test
                    </Button>
                  </div>
                  {!address && <p className="pg-note">Connect wallet to sign EIP-3009</p>}

                  {x402Status && (
                    <StatusNotice
                      tone={statusTone(x402Status)}
                      title={statusTitle(x402Status)}
                      className="pg-section--spaced"
                    >
                      {statusBody(x402Status) && (
                        <pre className="pg-output pg-output--pre">{statusBody(x402Status)}</pre>
                      )}
                    </StatusNotice>
                  )}
                </div>
              </section>
            )}

            {/* LIVE TEST */}
            {tab === 'test' && (
              <>
                <Ledger
                  label="Live Providers (Goldsky)"
                  empty={<span>{loading ? 'Loading…' : 'No providers indexed yet.'}</span>}
                >
                  {providers.length > 0 && providers.map(p => (
                    <LedgerRow
                      key={String(p.id)}
                      lead={`Provider #${String(p.id)}`}
                      trailing={(
                        <span className="pg-mono">
                          {String(p.completedCalls)} calls · {String(p.slashedCalls)} slashes
                        </span>
                      )}
                    />
                  ))}
                </Ledger>

                <section className="ui-section pg-section--spaced">
                  <div className="ui-section__head">
                    <h2 className="ui-section__title">Test: get_attestation (Provider #1)</h2>
                  </div>
                  <div className="ui-section__body">
                    <div className="pg-form__actions">
                      <Button
                        variant="primary"
                        onClick={runMcpTest}
                        disabled={testing}
                        loading={testing}
                        leftIcon={<Play size={12} />}
                      >
                        Run Test
                      </Button>
                    </div>
                    {testResult && (
                      <pre
                        className={`pg-output pg-output--pre${testResult.startsWith('Error') ? ' is-err' : ''}`}
                        aria-live="polite"
                      >
                        {testResult}
                      </pre>
                    )}
                  </div>
                </section>
              </>
            )}

            {/* CONFIG */}
            {tab === 'config' && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">MCP Server Setup</h2>
                </div>
                <div className="ui-section__body">
                  <CodeSurface label="Install" language="bash" code={INSTALL_CMD} />
                  <CodeSurface
                    label="Claude Desktop Config"
                    language="json"
                    code={CLAUDE_CONFIG}
                    copyValue={CLAUDE_CONFIG_COMPACT}
                    className="pg-section--spaced"
                  />
                  <CodeSurface label="REST Base URL" code={REST_BASE} className="pg-section--spaced" />
                  <CodeSurface label="Remote SSE Endpoint" code={SSE_ENDPOINT} className="pg-section--spaced" />

                  <StatusNotice
                    tone="success"
                    title="Compatible with Claude Desktop, Cursor, Cline, Continue.dev, and any MCP v1.0+ client."
                    className="pg-section--spaced"
                  />
                </div>
              </section>
            )}
          </>
        )}
        rail={(
          <>
            <KeyValue
              label="Server"
              rows={[
                { label: 'Remote SSE', value: SSE_ENDPOINT, mono: true },
                { label: 'REST base', value: REST_BASE, mono: true },
                { label: 'Chain ID', value: '5042002', mono: true },
                { label: 'Protocol', value: 'MCP v1.0+' },
              ]}
            />

            {tab === 'x402' && (
              <StatusNotice tone="info" title="How it works">
                1. POST to endpoint → expect HTTP 402 with payment terms<br/>
                2. Sign EIP-3009 <code>transferWithAuthorization</code> with your wallet<br/>
                3. Resubmit with <code>X-PAYMENT</code> header → service executes
              </StatusNotice>
            )}

            {tab === 'test' && (
              <StatusNotice tone="info" title="Live read">
                Providers come from the Goldsky subgraph. The test calls the public attestation endpoint.
              </StatusNotice>
            )}

            {tab === 'config' && (
              <StatusNotice tone="info" title="Copy only">
                These code surfaces copy configuration strings. They do not run a command or send a request.
              </StatusNotice>
            )}
          </>
        )}
      />
    </PanelShell>
  )
}
