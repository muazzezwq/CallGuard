import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { CONFIG, DISPUTE_QUALITY_ABI } from '../../lib/config'
import { Button, Field, Input, PageHeader, Stat, Tabs, Textarea } from '../../ui'
import { KeyValue, PanelShell, PanelSource, PanelSplit, SignalRow, StatusNotice } from '../panel/PanelUi'

const ADDR = CONFIG.disputeQualityAddress as `0x${string}`
// DisputeQuality v2 is retired (bound to the old Registry); block live transactions.
const ENABLED = CONFIG.disputeQualityEnabled

export default function Quality() {
  const { address } = useAccount()
  const [tab, setTab] = useState<'open' | 'vote' | 'stake'>('open')
  const [callId, setCallId] = useState('')
  const [evidence, setEvidence] = useState('')
  const [disputeId, setDisputeId] = useState('')
  const [voteSupport, setVoteSupport] = useState(true)
  const [stakeAmount, setStakeAmount] = useState('10')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // CRITICAL-04 fix: openDispute(bytes32, uint256, uint64, string)
  async function openDispute() {
    if (!ENABLED) { toast.error("Quality Disputes are disabled — the contract is retired."); return }
    if (!callId || !evidence) { toast.error("Enter a call ID and evidence."); return }
    if (!/^0x[0-9a-fA-F]{64}$/.test(callId)) {
      toast.error("Call ID must be a 0x-prefixed 32-byte hex (66 chars)"); return;
    }
    try {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const hash = await writeContractAsync({
        address: ADDR,
        abi: DISPUTE_QUALITY_ABI,
        functionName: 'openDispute',
        args: [callId as `0x${string}`, BigInt(1), now - 1n, evidence],
      })
      setTxHash(hash)
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  // CRITICAL-04 fix: vote(uint256, uint8) — 1=ForCaller, 2=ForProvider
  async function voteOnDispute() {
    if (!ENABLED) { toast.error("Quality Disputes are disabled — the contract is retired."); return }
    if (!disputeId) { toast.error("Enter a dispute ID."); return }
    try {
      const choice = voteSupport ? 1 : 2; // true = ForCaller
      const hash = await writeContractAsync({
        address: ADDR,
        abi: DISPUTE_QUALITY_ABI,
        functionName: 'vote',
        args: [BigInt(disputeId), choice],
      })
      setTxHash(hash)
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)) }
  }

  // stakeAsArbiter: not a contract function; show informational message only
  async function stakeAsArbiter() {
    toast.info("Becoming an arbiter requires holding USDC and participating in vote windows. Call the vote() function when a dispute is open.");
  }

  const tabs: { id: 'open' | 'vote' | 'stake'; label: string }[] = [{ id: 'open', label: 'Open Dispute' }, { id: 'vote', label: 'Vote' }, { id: 'stake', label: 'Become Arbiter' }]

  return (
    <PanelShell>
      <PageHeader
        title="Quality Disputes"
        subtitle="Challenge provider response quality. Community arbiters vote stake-weighted."
      />
      <PanelSource
        label="DisputeQuality v2"
        value={ENABLED ? 'enabled' : 'retired'}
        hint={ENABLED ? 'live contract writes' : 'on-chain actions disabled'}
        state={ENABLED ? 'live' : 'unavailable'}
      />

      {!ENABLED && (
        <StatusNotice tone="retired" title="Quality Disputes are temporarily disabled">
          The DisputeQuality contract was retired and has no active replacement, so on-chain actions
          are turned off.
        </StatusNotice>
      )}

      <SignalRow label="Arbiter terms">
        <Stat label="Earn" value="Dispute fees" hint="per resolved case" />
        <Stat label="Require" value=">1 USDC" hint="minVoterStake" />
        <Stat label="Voting power" value="Stake-weighted" hint="Bayesian majority" />
      </SignalRow>

      <div className="pg-tabbar">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      <PanelSplit
        main={(
          <>
            {tab === 'open' && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">Open a Quality Dispute</h2>
                </div>
                <div className="ui-section__body">
                  <StatusNotice
                    tone="warn"
                    title="Disputes are for quality issues — wrong, incomplete, or off-topic responses. Timeout disputes use Claim Timeout in Call Builder."
                  />
                  <div className="pg-form">
                    <Field label="Call ID" htmlFor="quality-call-id">
                      <Input
                        id="quality-call-id"
                        value={callId}
                        onChange={e => setCallId(e.target.value)}
                        placeholder="e.g. 42"
                      />
                    </Field>
                    <Field label="Evidence (IPFS hash or description)" htmlFor="quality-evidence">
                      <Textarea
                        id="quality-evidence"
                        rows={4}
                        value={evidence}
                        onChange={e => setEvidence(e.target.value)}
                        placeholder="Describe the quality issue or provide IPFS hash of evidence..."
                      />
                    </Field>
                  </div>
                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button
                      variant="danger"
                      onClick={openDispute}
                      disabled={!ENABLED || isPending || isConfirming || !address}
                    >
                      {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : 'Open Dispute'}
                    </Button>
                  </div>
                  {isSuccess && (
                    <div className="pg-section--spaced">
                      <StatusNotice tone="success" title="Dispute opened successfully" />
                    </div>
                  )}
                </div>
              </section>
            )}

            {tab === 'vote' && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">Vote on a Dispute</h2>
                </div>
                <div className="ui-section__body">
                  <StatusNotice
                    tone="info"
                    title="Your voting power = your staked USDC. Majority stake wins. Losing side's stake is redistributed."
                  />
                  <div className="pg-form">
                    <Field label="Dispute ID" htmlFor="quality-dispute-id">
                      <Input
                        id="quality-dispute-id"
                        value={disputeId}
                        onChange={e => setDisputeId(e.target.value)}
                        placeholder="e.g. 1"
                      />
                    </Field>
                    <Field label="Your Vote">
                      <div className="pg-vote-actions">
                        <Button
                          variant={voteSupport ? 'primary' : 'secondary'}
                          leftIcon={<Check size={15} />}
                          onClick={() => setVoteSupport(true)}
                        >
                          Support Caller
                        </Button>
                        <Button
                          variant={!voteSupport ? 'danger' : 'secondary'}
                          leftIcon={<X size={15} />}
                          onClick={() => setVoteSupport(false)}
                        >
                          Support Provider
                        </Button>
                      </div>
                    </Field>
                  </div>
                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button
                      variant="primary"
                      onClick={voteOnDispute}
                      disabled={!ENABLED || isPending || isConfirming || !address || !disputeId}
                    >
                      {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : `Vote: ${voteSupport ? 'Support Caller' : 'Support Provider'}`}
                    </Button>
                  </div>
                  {isSuccess && (
                    <div className="pg-section--spaced">
                      <StatusNotice tone="success" title="Vote cast successfully" />
                    </div>
                  )}
                </div>
              </section>
            )}

            {tab === 'stake' && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">Become a Community Arbiter</h2>
                </div>
                <div className="ui-section__body">
                  <div className="pg-form">
                    <Field label="Stake Amount (USDC)" htmlFor="quality-stake">
                      <Input
                        id="quality-stake"
                        type="number"
                        value={stakeAmount}
                        onChange={e => setStakeAmount(e.target.value)}
                        min="10"
                        step="1"
                      />
                    </Field>
                  </div>
                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button
                      variant="primary"
                      onClick={stakeAsArbiter}
                      disabled={isPending || isConfirming || !address}
                    >
                      {isPending ? 'Confirming...' : isConfirming ? 'Processing...' : 'Stake & Become Arbiter'}
                    </Button>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
        rail={(
          <KeyValue
            label="Contract Info"
            rows={[
              { label: 'Contract', value: 'DisputeQuality (retired)' },
              {
                label: 'Address',
                value: (
                  <a
                    className="pg-rowlink pg-mono"
                    href={`https://explorer.testnet.arc.io/address/${ADDR}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {ADDR.slice(0, 10)}…{ADDR.slice(-6)}
                  </a>
                ),
              },
            ]}
          />
        )}
      />
    </PanelShell>
  )
}
