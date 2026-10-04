import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { CONFIG, AGENT_WALLET_ABI, USDC_ABI } from '../../lib/config'

const S = {
  wrap: { padding: '24px', maxWidth: '680px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  label: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-faint)', textTransform: 'uppercase' as const, marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' as const },
  btn: (color = 'var(--accent)') => ({ padding: '10px 20px', background: color, color: color === 'var(--accent)' ? '#000' : '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }),
  badge: (color: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: color + '20', color }),
  statRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' },
}

export default function Agent() {
  const { address } = useAccount()
  const [tab, setTab] = useState<'wallet' | 'deploy' | 'mcp'>('wallet')
  const [agentAddr, setAgentAddr] = useState(sessionStorage.getItem('cg_agent_wallet') || '')
  const [dailyLimit, setDailyLimit] = useState('5')
  const [initialFund, setInitialFund] = useState('10')
  const [deploying, setDeploying] = useState(false)
  const [deployStep, setDeployStep] = useState(0)
  const { writeContractAsync } = useWriteContract()

  const { data: balance } = useReadContract(agentAddr ? {
    address: agentAddr as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [agentAddr as `0x${string}`],
  } : undefined as any)

  const { data: owner } = useReadContract(agentAddr ? {
    address: agentAddr as `0x${string}`,
    abi: AGENT_WALLET_ABI,
    functionName: 'owner',
  } : undefined as any)

  const { data: dailySpent } = useReadContract(agentAddr ? {
    address: agentAddr as `0x${string}`,
    abi: AGENT_WALLET_ABI,
    functionName: 'dailySpent',
  } : undefined as any)

  const { data: maxDaily } = useReadContract(agentAddr ? {
    address: agentAddr as `0x${string}`,
    abi: AGENT_WALLET_ABI,
    functionName: 'dailyLimit',
  } : undefined as any)

  async function deployWallet() {
    if (!address) return
    setDeploying(true)
    setDeployStep(1)
    try {
      // Step 1: Deploy AgentWallet
      const { writeContractAsync: wca } = { writeContractAsync }
      // Use existing AgentWallet factory
      setDeployStep(2)
      const hash = await writeContractAsync({
        address: CONFIG.agentWalletAddress as `0x${string}`,
        abi: AGENT_WALLET_ABI,
        functionName: 'initialize',
        args: [address, parseUnits(dailyLimit, 6)],
      })
      setDeployStep(3)
      sessionStorage.setItem('cg_agent_wallet', CONFIG.agentWalletAddress)
      setAgentAddr(CONFIG.agentWalletAddress)
    } catch (e: any) {
      alert(e.shortMessage || e.message)
    }
    setDeploying(false)
    setDeployStep(0)
  }

  const fmt = (v: bigint | undefined) => v ? Number(formatUnits(v, 6)).toFixed(2) : '—'

  const tabs = [
    { id: 'wallet', label: '💳 Agent Wallet' },
    { id: 'deploy', label: '🚀 Deploy' },
    { id: 'mcp', label: '🤖 MCP Config' },
  ]

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Autonomous Agent Loop</div>
      <div style={S.sub}>ERC-4337 smart wallet with daily spend limit. Any AI (Claude, GPT, Llama) can call services with zero human approval.</div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-2)', borderRadius: '10px', padding: '4px', marginBottom: '20px', width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: tab === t.id ? 'var(--accent)' : 'transparent', color: tab === t.id ? '#000' : 'var(--text-dim)' }}>{t.label}</button>
        ))}
      </div>

      {/* Agent Wallet Status */}
      {tab === 'wallet' && (
        <div>
          <div style={S.card}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Agent Wallet</span>
              <span style={S.badge(agentAddr ? '#10b981' : '#f59e0b')}>{agentAddr ? 'CONFIGURED' : 'NOT SET'}</span>
            </div>
            <div style={S.label}>Agent Wallet Address</div>
            <input style={{ ...S.input, marginBottom: '12px', fontFamily: 'monospace', fontSize: '12px' }} value={agentAddr} onChange={e => { setAgentAddr(e.target.value); sessionStorage.setItem('cg_agent_wallet', e.target.value) }} placeholder="0x... paste your agent wallet address" />

            {agentAddr && (
              <>
                <div style={S.statRow}><span style={{ color: 'var(--text-dim)' }}>USDC Balance</span><span style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmt(balance as bigint)} USDC</span></div>
                <div style={S.statRow}><span style={{ color: 'var(--text-dim)' }}>Daily Limit</span><span style={{ fontWeight: 600 }}>{fmt(maxDaily as bigint)} USDC</span></div>
                <div style={S.statRow}><span style={{ color: 'var(--text-dim)' }}>Spent Today</span><span style={{ fontWeight: 600, color: '#f59e0b' }}>{fmt(dailySpent as bigint)} USDC</span></div>
                <div style={{ ...S.statRow, borderBottom: 'none' }}><span style={{ color: 'var(--text-dim)' }}>Owner</span><span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{owner ? `${(owner as string).slice(0, 10)}...` : '—'}</span></div>
              </>
            )}
          </div>

          <div style={{ ...S.card, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', marginBottom: '8px' }}>How it works</div>
            <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
              1. Deploy an AgentWallet smart contract<br />
              2. Set a daily USDC spend limit (e.g. 10 USDC/day)<br />
              3. Give the wallet address to your AI agent<br />
              4. Agent calls services autonomously — no human approval needed<br />
              5. Daily limit resets every 24h on-chain
            </div>
          </div>
        </div>
      )}

      {/* Deploy */}
      {tab === 'deploy' && (
        <div style={S.card}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px' }}>Deploy Agent Wallet</div>

          {deployStep > 0 && (
            <div style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
              {['Preparing...', 'Deploying contract...', 'Funding wallet...'].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '13px', color: deployStep > i ? '#10b981' : deployStep === i + 1 ? 'var(--text)' : 'var(--text-faint)' }}>
                  <span>{deployStep > i ? '✓' : deployStep === i + 1 ? '⏳' : '○'}</span><span>{s}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div><div style={S.label}>Daily Limit (USDC)</div><input style={S.input} type="number" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} /></div>
            <div><div style={S.label}>Initial Fund (USDC)</div><input style={S.input} type="number" value={initialFund} onChange={e => setInitialFund(e.target.value)} /></div>
          </div>

          <div style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: 'var(--text-dim)' }}>
            Owner: <span style={{ color: 'var(--text)', fontFamily: 'monospace', fontSize: '12px' }}>{address ? `${address.slice(0, 16)}...` : 'Connect wallet'}</span>
          </div>

          <button style={{ ...S.btn(), width: '100%', opacity: !address || deploying ? 0.6 : 1 }} onClick={deployWallet} disabled={!address || deploying}>
            {deploying ? 'Deploying...' : 'Deploy Agent Wallet →'}
          </button>
        </div>
      )}

      {/* MCP Config */}
      {tab === 'mcp' && (
        <div>
          <div style={S.card}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>MCP Server Configuration</div>
            <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>Add CallGuard to Claude Desktop, Cursor, or any MCP-compatible AI agent.</div>

            <div style={S.label}>claude_desktop_config.json</div>
            <pre style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '16px', fontSize: '12px', color: '#10b981', overflowX: 'auto', margin: '8px 0 16px' }}>{`{
  "mcpServers": {
    "callguard": {
      "command": "node",
      "args": ["/path/to/callguard-mcp.js"],
      "env": {
        "CALLGUARD_URL": "https://arcsla.vercel.app",
        "AGENT_WALLET": "${agentAddr || '0x...your-agent-wallet'}",
        "CHAIN": "arc-testnet"
      }
    }
  }
}`}</pre>

            <div style={S.label}>Available MCP Tools</div>
            {[
              { name: 'list_providers', desc: 'Get all providers with SLA terms' },
              { name: 'call_service', desc: 'Make an SLA-guaranteed API call' },
              { name: 'check_receipt', desc: 'Verify a call receipt on-chain' },
              { name: 'claim_timeout', desc: 'Claim refund for missed deadline' },
              { name: 'get_balance', desc: 'Check agent wallet USDC balance' },
            ].map(t => (
              <div key={t.name} style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                <code style={{ color: 'var(--accent)', fontFamily: 'monospace', width: '140px', flexShrink: 0 }}>{t.name}</code>
                <span style={{ color: 'var(--text-dim)' }}>{t.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
