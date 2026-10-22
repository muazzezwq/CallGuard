import { useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import { CONFIG } from '../../lib/config'
import { Button, Field, Input, PageHeader, Stat, Tabs } from '../../ui'
import {
  CodeSurface, KeyValue, PanelShell, PanelSource, PanelSplit, SignalRow, StatusNotice,
} from '../panel/PanelUi'

const BRIDGE_ADDR = CONFIG.slaAttestationBridge as `0x${string}`

const ATTESTATION_ABI = [
  { name: 'attestCall', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'callId', type: 'bytes32' }, { name: 'receiptHash', type: 'bytes32' }], outputs: [] },
  { name: 'attestProviderScore', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'providerId', type: 'uint256' }, { name: 'score', type: 'uint256' }], outputs: [] },
  { name: 'getAttestation', type: 'function', stateMutability: 'view', inputs: [{ name: 'id', type: 'bytes32' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'attType', type: 'uint8' }, { name: 'subject', type: 'bytes32' }, { name: 'value', type: 'uint256' }, { name: 'timestamp', type: 'uint256' }, { name: 'attester', type: 'address' }] }] },
] as const

const INTEGRATION_EXAMPLE = `// Any protocol can query CallGuard attestations:
GET /api/attestation?providerId=1&type=score
→ { ok: true, score: 92, completedCalls: 150, ... }

// Or read on-chain:
SLAAttestationBridge.getAttestation(id)`

export default function Attestation() {
  const { address } = useAccount()
  const [tab, setTab] = useState<'peek' | 'issue' | 'lookup'>('peek')
  const [peekType, setPeekType] = useState<'call' | 'score'>('score')
  const [providerId, setProviderId] = useState('1')
  const [callId, setCallId] = useState('')
  const [lookupId, setLookupId] = useState('')
  const [peekResult, setPeekResult] = useState<unknown>(null)
  const [peekLoading, setPeekLoading] = useState(false)
  const [lookupResult, setLookupResult] = useState<unknown>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const publicClient = usePublicClient()

  async function peek() {
    setPeekLoading(true)
    setPeekResult(null)
    try {
      const params = peekType === 'score'
        ? `?providerId=${providerId}&type=score`
        : `?callId=${callId}`
      const res = await fetch(`/api/attestation${params}`)
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error || `Request failed (${res.status})`); setPeekResult({ error: data?.error || `HTTP ${res.status}` }); return }
      setPeekResult(data)
    } catch {
      toast.error("Attestation request failed")
      setPeekResult({ error: 'Request failed' })
    } finally {
      setPeekLoading(false)
    }
  }

  async function lookup() {
    if (!/^0x[0-9a-fA-F]{64}$/.test(lookupId)) { toast.error("Attestation ID must be 0x + 64 hex chars"); return }
    if (!publicClient) { toast.error("No RPC client available"); return }
    setLookupLoading(true)
    setLookupResult(null)
    try {
      const res = await publicClient.readContract({
        address: BRIDGE_ADDR,
        abi: ATTESTATION_ABI,
        functionName: 'getAttestation',
        args: [lookupId as `0x${string}`],
      })
      setLookupResult(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed")
    } finally {
      setLookupLoading(false)
    }
  }

  async function issueAttestation() {
    try {
      const hash = await writeContractAsync({
        address: BRIDGE_ADDR,
        abi: ATTESTATION_ABI,
        functionName: 'attestProviderScore',
        args: [BigInt(providerId), BigInt(50)],
      })
      setTxHash(hash)
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  const tabs: { id: 'peek' | 'issue' | 'lookup'; label: string }[] = [{ id: 'peek', label: 'Peek (Free)' }, { id: 'issue', label: 'Issue On-chain' }, { id: 'lookup', label: 'Lookup' }]

  return (
    <PanelShell>
      <PageHeader
        title="SLA Attestation Bridge"
        subtitle="Cross-protocol SLA oracle. Any protocol can query CallGuard for provider attestations."
      />
      <PanelSource
        label="SLA Attestation Bridge"
        value="REST + on-chain"
        hint="reads on demand"
        state="idle"
      />

      <SignalRow label="Attestation properties">
        <Stat label="Type" value="On-chain" hint="Immutable records" />
        <Stat label="Cross-chain" value="CCIP-ready" hint="Chainlink broadcast" />
        <Stat label="Access" value="Permissionless" hint="No auth required" />
      </SignalRow>

      <div className="pg-tabbar">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      <PanelSplit
        main={(
          <>
            {tab === 'peek' && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">Free Query — No Wallet Needed</h2>
                </div>
                <div className="ui-section__body">
                  <p className="pg-copy">Read SLA attestation data directly from the REST API.</p>
                  <div className="pg-form__actions">
                    <Button
                      variant={peekType === 'score' ? 'primary' : 'secondary'}
                      onClick={() => setPeekType('score')}
                    >
                      Provider Score
                    </Button>
                    <Button
                      variant={peekType === 'call' ? 'primary' : 'secondary'}
                      onClick={() => setPeekType('call')}
                    >
                      Call Verdict
                    </Button>
                  </div>
                  <div className="pg-form pg-section--spaced">
                    {peekType === 'score' ? (
                      <Field label="Provider ID" htmlFor="att-provider-peek">
                        <Input
                          id="att-provider-peek"
                          value={providerId}
                          onChange={e => setProviderId(e.target.value)}
                          placeholder="1"
                        />
                      </Field>
                    ) : (
                      <Field label="Call ID (bytes32)" htmlFor="att-call">
                        <Input
                          id="att-call"
                          mono
                          value={callId}
                          onChange={e => setCallId(e.target.value)}
                          placeholder="0x..."
                        />
                      </Field>
                    )}
                  </div>
                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button variant="primary" onClick={peek} disabled={peekLoading}>
                      {peekLoading ? 'Querying...' : 'Query →'}
                    </Button>
                  </div>
                  {peekResult != null && (
                    <pre className="pg-output pg-output--pre" aria-live="polite">
                      {JSON.stringify(peekResult, null, 2)}
                    </pre>
                  )}
                  <p className="pg-note">
                    API endpoint: <code className="pg-endpoint">GET /api/attestation?providerId=1&type=score</code>
                  </p>
                </div>
              </section>
            )}

            {tab === 'issue' && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">Issue On-chain Attestation</h2>
                </div>
                <div className="ui-section__body">
                  <p className="pg-copy">Write a permanent attestation to the bridge contract. Other protocols can read it.</p>
                  <div className="pg-form">
                    <Field label="Provider ID" htmlFor="att-provider-issue">
                      <Input
                        id="att-provider-issue"
                        value={providerId}
                        onChange={e => setProviderId(e.target.value)}
                        placeholder="1"
                      />
                    </Field>
                  </div>
                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button
                      variant="primary"
                      onClick={issueAttestation}
                      disabled={isPending || isConfirming || !address}
                    >
                      {isPending ? 'Confirming...' : isConfirming ? 'Writing...' : 'Issue Attestation'}
                    </Button>
                  </div>
                  {isSuccess && (
                    <div className="pg-section--spaced">
                      <StatusNotice tone="success" title="Attestation issued on-chain" />
                    </div>
                  )}
                </div>
              </section>
            )}

            {tab === 'lookup' && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">Lookup Attestation by ID</h2>
                </div>
                <div className="ui-section__body">
                  <div className="pg-form">
                    <Field label="Attestation ID (bytes32)" htmlFor="att-lookup">
                      <Input
                        id="att-lookup"
                        mono
                        value={lookupId}
                        onChange={e => setLookupId(e.target.value)}
                        placeholder="0x..."
                      />
                    </Field>
                  </div>
                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button variant="primary" onClick={lookup} disabled={lookupLoading}>
                      {lookupLoading ? 'Looking up...' : 'Lookup →'}
                    </Button>
                  </div>
                  {lookupResult != null && (
                    <pre className="pg-output pg-output--pre" aria-live="polite">
                      {JSON.stringify(lookupResult, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2)}
                    </pre>
                  )}
                  <p className="pg-note">Use the attestation ID returned after issuing an on-chain attestation to retrieve its full record.</p>
                </div>
              </section>
            )}
          </>
        )}
        rail={(
          <>
            <KeyValue
              label="Bridge"
              rows={[
                { label: 'Network', value: 'Arc Testnet' },
                {
                  label: 'Contract',
                  value: (
                    <a
                      className="pg-rowlink pg-mono"
                      href={`https://explorer.testnet.arc.io/address/${BRIDGE_ADDR}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {BRIDGE_ADDR.slice(0, 10)}…{BRIDGE_ADDR.slice(-6)}
                    </a>
                  ),
                },
                { label: 'Read', value: 'GET /api/attestation', mono: true },
                { label: 'Write', value: 'attestProviderScore', mono: true },
              ]}
            />
            <CodeSurface
              label="Integration Example"
              language="http"
              code={INTEGRATION_EXAMPLE}
              wrap
            />
          </>
        )}
      />
    </PanelShell>
  )
}
