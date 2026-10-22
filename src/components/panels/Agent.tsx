import { useState, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits, formatUnits, keccak256, stringToBytes } from "viem";
import { arcTestnet, CONFIG, USDC_ABI } from "../../lib/config";
import { errText } from "../../lib/utils";
import { Badge, Button, Field, Input, PageHeader, Stat, Tabs } from "../../ui";
import {
  KeyValue, PanelShell, PanelSource, PanelSplit, SignalRow, StatusNotice,
} from "../panel/PanelUi";

const AGENT_WALLET_ABI = [
  { name: "deposit",          type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "withdraw",         type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "agentCall",        type: "function", stateMutability: "nonpayable", inputs: [{ name: "providerId", type: "uint256" }, { name: "requestHash", type: "bytes32" }, { name: "amount", type: "uint256" }, { name: "extraData", type: "bytes" }], outputs: [{ name: "", type: "bytes32" }] },
  { name: "setDailyLimit",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "limit", type: "uint256" }], outputs: [] },
  { name: "setMaxPerCall",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "max", type: "uint256" }], outputs: [] },
  { name: "addToWhitelist",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "providerId", type: "uint256" }], outputs: [] },
  { name: "removeFromWhitelist", type: "function", stateMutability: "nonpayable", inputs: [{ name: "providerId", type: "uint256" }], outputs: [] },
  { name: "pause",            type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "unpause",          type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "getStats",         type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "tuple", components: [{ name: "balance", type: "uint256" }, { name: "spentToday", type: "uint256" }, { name: "remainingToday", type: "uint256" }, { name: "totalSpent", type: "uint256" }, { name: "totalCalls", type: "uint256" }] }] },
  { name: "paused",           type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { name: "dailyLimit",       type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "maxPerCall",       type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "owner",            type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
] as const;

// Subgraph URL is read from CONFIG.subgraphUrl via useSubgraph hook

type Tab = "setup" | "autoroute" | "settings";

function statusTone(status: string): "success" | "danger" | "info" {
  if (status.startsWith("✅")) return "success";
  if (status.startsWith("❌")) return "danger";
  return "info";
}

function stripStatus(status: string): string {
  return status.replace(/^[✅❌⏳🔍]\s*/u, "");
}

export default function Agent() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [tab, setTab] = useState<Tab>("setup");
  const [agentAddr, setAgentAddr] = useState<string>(() => localStorage.getItem("cg_agent_wallet") || CONFIG.agentWallet);
  const [addrInput, setAddrInput] = useState(localStorage.getItem("cg_agent_wallet") || CONFIG.agentWallet);
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dailyLimit, setDailyLimit] = useState("10");
  const [maxPerCall, setMaxPerCall] = useState("1");
  const [whitelistId, setWhitelistId] = useState("");
  const [autoPayload, setAutoPayload] = useState("ping");
  const [autoMaxPrice, setAutoMaxPrice] = useState("1");
  const [autoResult, setAutoResult] = useState<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);

  const validAgent = !!agentAddr && agentAddr.startsWith("0x") && agentAddr.length === 42;

  // Read agent wallet stats
  const { data: stats, refetch: refetchStats } = useReadContract({
    address: agentAddr as `0x${string}`,
    abi: AGENT_WALLET_ABI,
    functionName: "getStats",
    chainId: arcTestnet.id,
    query: { enabled: validAgent, refetchInterval: 15_000 },
  });
  const { data: isPaused, refetch: refetchPaused } = useReadContract({
    address: agentAddr as `0x${string}`,
    abi: AGENT_WALLET_ABI,
    functionName: "paused",
    chainId: arcTestnet.id,
    query: { enabled: validAgent, refetchInterval: 15_000 },
  });
  const { data: currentDailyLimit } = useReadContract({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "dailyLimit", chainId: arcTestnet.id, query: { enabled: validAgent } });
  const { data: currentMaxPerCall } = useReadContract({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "maxPerCall", chainId: arcTestnet.id, query: { enabled: validAgent } });
  const { data: owner } = useReadContract({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "owner", chainId: arcTestnet.id, query: { enabled: validAgent } });

  const st = stats as { balance?: bigint; spentToday?: bigint; totalCalls?: bigint } | undefined;

  const sourceState = !validAgent ? "unavailable" : isPaused === undefined ? "idle" : isPaused ? "unavailable" : "live";
  const sourceValue = !validAgent ? "invalid address" : isPaused === undefined ? "reading" : isPaused ? "paused" : "active";
  const tabs: { id: Tab; label: string }[] = [
    { id: "setup", label: "Setup" },
    { id: "autoroute", label: "Auto-Route" },
    { id: "settings", label: "Settings" },
  ];

  const connectAddr = () => {
    if (!addrInput.startsWith("0x") || addrInput.length !== 42) { setStatus("❌ Invalid address"); return; }
    setAgentAddr(addrInput);
    localStorage.setItem("cg_agent_wallet", addrInput);
    setStatus("✅ Agent Wallet connected");
    refetchStats();
  };

  const handleDeposit = useCallback(async () => {
    if (!isConnected || !address) { setStatus("❌ Connect wallet"); return; }
    if (!agentAddr) { setStatus("❌ Set agent wallet address"); return; }
    const amtWei = parseUnits(amount || "0", 6);
    if (amtWei <= 0n) { setStatus("❌ Enter amount"); return; }
    setLoading(true);
    setStatus("⏳ Step 1/2: Approving USDC…");
    try {
      await writeContractAsync({
        address: CONFIG.usdcAddress as `0x${string}`, abi: USDC_ABI,
        functionName: "approve", args: [agentAddr as `0x${string}`, amtWei], chainId: arcTestnet.id,
      });
      setStatus("⏳ Step 2/2: Depositing…");
      await writeContractAsync({
        address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI,
        functionName: "deposit", args: [amtWei], chainId: arcTestnet.id,
      });
      setStatus(`✅ Deposited ${amount} USDC`);
      refetchStats();
    } catch (_err: unknown) { setStatus("❌ " + (_err instanceof Error ? _err.message : String(_err))); }
    setLoading(false);
  }, [isConnected, address, agentAddr, amount, writeContractAsync, refetchStats]);

  const handleWithdraw = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    const amtWei = parseUnits(amount || "0", 6);
    setLoading(true);
    setStatus("⏳ Withdrawing…");
    try {
      await writeContractAsync({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "withdraw", args: [amtWei], chainId: arcTestnet.id });
      setStatus(`✅ Withdrawn ${amount} USDC`);
      refetchStats();
    } catch (_err: unknown) { setStatus("❌ " + (_err instanceof Error ? _err.message : String(_err))); }
    setLoading(false);
  }, [isConnected, agentAddr, amount, writeContractAsync, refetchStats]);

  const handlePauseToggle = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    setStatus("⏳ Toggling pause…");
    try {
      await writeContractAsync({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: isPaused ? "unpause" : "pause", args: [], chainId: arcTestnet.id });
      setStatus(isPaused ? "✅ Unpaused" : "✅ Paused");
      refetchPaused(); refetchStats();
    } catch (_err: unknown) { setStatus("❌ " + (_err instanceof Error ? _err.message : String(_err))); }
    setLoading(false);
  }, [isConnected, agentAddr, isPaused, writeContractAsync, refetchPaused, refetchStats]);

  const handleSetDailyLimit = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    try {
      await writeContractAsync({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "setDailyLimit", args: [parseUnits(dailyLimit || "0", 6)], chainId: arcTestnet.id });
      setStatus(`✅ Daily limit set to ${dailyLimit} USDC/day`);
    } catch (_err: unknown) { setStatus("❌ " + (_err instanceof Error ? _err.message : String(_err))); }
    setLoading(false);
  }, [isConnected, agentAddr, dailyLimit, writeContractAsync]);

  const handleSetMaxPerCall = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    try {
      await writeContractAsync({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: "setMaxPerCall", args: [parseUnits(maxPerCall || "0", 6)], chainId: arcTestnet.id });
      setStatus(`✅ Max-per-call set to ${maxPerCall} USDC`);
    } catch (_err: unknown) { setStatus("❌ " + (_err instanceof Error ? _err.message : String(_err))); }
    setLoading(false);
  }, [isConnected, agentAddr, maxPerCall, writeContractAsync]);

  const handleWhitelist = useCallback(async (add: boolean) => {
    if (!isConnected || !whitelistId) { setStatus("❌ Connect wallet / enter provider ID"); return; }
    setLoading(true);
    try {
      await writeContractAsync({ address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI, functionName: add ? "addToWhitelist" : "removeFromWhitelist", args: [BigInt(whitelistId)], chainId: arcTestnet.id });
      setStatus(`✅ Provider #${whitelistId} ${add ? "added to" : "removed from"} whitelist`);
    } catch (_err: unknown) { setStatus("❌ " + (_err instanceof Error ? _err.message : String(_err))); }
    setLoading(false);
  }, [isConnected, agentAddr, whitelistId, writeContractAsync]);

  const handleAutoRoute = useCallback(async () => {
    if (!isConnected) { setAutoResult("❌ Connect wallet first"); return; }
    if (!agentAddr) { setAutoResult("❌ Set agent wallet address"); return; }
    setAutoRunning(true);
    setAutoResult("🔍 Querying subgraph for best providers…");
    try {
      const res = await fetch(CONFIG.subgraphUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: `{ providers(first:50,where:{active:true}){ id pricePerCall completedCalls slashedCalls stake } }` }) });
      const data = await res.json();
      const providers = (data.data?.providers ?? []) as Record<string, string>[];
      const maxPrice = parseFloat(autoMaxPrice);
      const scored = providers
        .filter(p => Number(p.pricePerCall) / 1e6 <= maxPrice)
        .map(p => {
          const c = Number(p.completedCalls || 0), sl = Number(p.slashedCalls || 0), t = c + sl;
          const honor = t > 0 ? c / t : 0.66;
          const price = Number(p.pricePerCall) / 1e6;
          const stake = Number(p.stake) / 1e6;
          return { ...p, score: honor * 0.5 + (1 / (price + 0.001)) * 0.2 + Math.min(stake / 1000, 1) * 0.3, price, honor };
        })
        .sort((a, b) => b.score - a.score);
      if (!scored.length) { setAutoResult("No providers found under " + maxPrice + " USDC/call"); setAutoRunning(false); return; }
      const best = scored[0] as unknown as { id: string; price: number; honor: number; score: number };
      setAutoResult(`✅ Best provider: #${best.id}\nPrice: ${best.price.toFixed(4)} USDC\nHonor rate: ${(best.honor * 100).toFixed(1)}%\nScore: ${best.score.toFixed(3)}\n\n⏳ Sending autonomous call via AgentWallet…`);
      const reqHash = keccak256(stringToBytes(autoPayload)) as `0x${string}`;
      const amount = BigInt(Math.round(best.price * 1e6));
      const txHash = await writeContractAsync({
        address: agentAddr as `0x${string}`, abi: AGENT_WALLET_ABI,
        functionName: "agentCall", args: [BigInt(best.id), reqHash, amount, "0x"], chainId: arcTestnet.id,
      });
      setAutoResult(`✅ Autonomous call complete!\nProvider: #${best.id} (score: ${best.score.toFixed(2)})\nPaid: ${best.price.toFixed(4)} USDC\nHonor: ${(best.honor * 100).toFixed(1)}%\nTX: ${txHash}`);
      refetchStats();
    } catch (_err: unknown) { setAutoResult("❌ " + (errText(_err) || "Unknown error")); }
    setAutoRunning(false);
  }, [isConnected, agentAddr, autoPayload, autoMaxPrice, writeContractAsync, refetchStats]);

  const ownerShort = owner ? `${owner.slice(0, 10)}…${owner.slice(-6)}` : "—";

  return (
    <PanelShell>
      <PageHeader
        title="Agent Wallet"
        subtitle="Autonomous USDC spending wallet with daily limits, per-call caps, and whitelist enforcement."
      />
      <PanelSource
        label="AgentWallet v2"
        value={sourceValue}
        hint="15s stats refresh"
        state={sourceState}
      />

      <SignalRow label="Agent wallet position and limits" className="pg-signals--pair">
        <Stat label="Balance" value={st ? `${formatUnits(BigInt(st.balance ?? 0), 6)} USDC` : "—"} hint={st ? "USDC" : "Stats unavailable"} />
        <Stat label="Spent Today" value={st ? `${formatUnits(BigInt(st.spentToday ?? 0), 6)} USDC` : "—"} hint={st ? "USDC" : "Stats unavailable"} />
        <Stat label="Total Calls" value={st ? String(st.totalCalls ?? 0) : "—"} hint={st ? "Lifetime" : "Stats unavailable"} />
        <Stat label="Daily Limit" value={currentDailyLimit != null ? `${formatUnits(currentDailyLimit, 6)} USDC` : "—"} hint="On-chain policy" />
        <Stat label="Max Per Call" value={currentMaxPerCall != null ? `${formatUnits(currentMaxPerCall, 6)} USDC` : "—"} hint="On-chain policy" />
      </SignalRow>

      {status && (
        <StatusNotice tone={statusTone(status)} title={stripStatus(status)} />
      )}

      <div className="pg-tabbar">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      <PanelSplit
        main={(
          <>
            {tab === "setup" && (
              <>
                <section className="ui-section">
                  <div className="ui-section__head">
                    <h2 className="ui-section__title">Agent Wallet Address</h2>
                  </div>
                  <div className="ui-section__body">
                    <div className="pg-inline-form">
                      <Field className="pg-inline-form__field" label="Agent Wallet Contract" htmlFor="ag-wallet">
                        <Input
                          id="ag-wallet"
                          mono
                          value={addrInput}
                          onChange={e => setAddrInput(e.target.value)}
                          placeholder="0x…"
                        />
                      </Field>
                      <Button variant="primary" onClick={connectAddr}>Connect</Button>
                    </div>
                    {agentAddr && (
                      <p className="pg-note">
                        Connected: <span className="pg-mono">{agentAddr.slice(0, 12)}…{agentAddr.slice(-6)}</span>
                        {isPaused !== undefined && (
                          <Badge tone={isPaused ? "slash" : "guard"} className="pg-badge-gap">
                            {isPaused ? "PAUSED" : "ACTIVE"}
                          </Badge>
                        )}
                      </p>
                    )}
                  </div>
                </section>

                <section className="ui-section pg-section--spaced">
                  <div className="ui-section__head">
                    <h2 className="ui-section__title">Deposit / Withdraw</h2>
                  </div>
                  <div className="ui-section__body">
                    <Field label="Amount (USDC)" htmlFor="ag-amount">
                      <Input
                        id="ag-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="1.0"
                      />
                    </Field>
                    <div className="pg-form__actions pg-form__actions--spaced">
                      <Button variant="primary" onClick={handleDeposit} disabled={loading || !isConnected} loading={loading}>
                        Deposit
                      </Button>
                      <Button variant="secondary" onClick={handleWithdraw} disabled={loading || !isConnected} loading={loading}>
                        Withdraw
                      </Button>
                      <Button variant="danger" onClick={handlePauseToggle} disabled={loading || !isConnected} loading={loading}>
                        {isPaused ? "Unpause" : "Pause"}
                      </Button>
                    </div>
                  </div>
                </section>
              </>
            )}

            {tab === "autoroute" && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">Autonomous Call — Auto-Router</h2>
                </div>
                <div className="ui-section__body">
                  <p className="pg-copy">
                    Agent scores providers by honor rate, price, and stake. Picks the best and calls autonomously.
                  </p>
                  <div className="pg-form">
                    <Field label="Request payload" htmlFor="ag-auto-payload">
                      <Input
                        id="ag-auto-payload"
                        value={autoPayload}
                        onChange={e => setAutoPayload(e.target.value)}
                        placeholder="ping"
                      />
                    </Field>
                    <Field label="Max price per call (USDC)" htmlFor="ag-auto-maxprice">
                      <Input
                        id="ag-auto-maxprice"
                        type="number"
                        min="0.001"
                        step="0.01"
                        value={autoMaxPrice}
                        onChange={e => setAutoMaxPrice(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button
                      variant="primary"
                      onClick={handleAutoRoute}
                      disabled={autoRunning || !isConnected}
                      loading={autoRunning}
                      block
                    >
                      {autoRunning ? "Routing…" : "Auto-route & call"}
                    </Button>
                  </div>
                  {autoResult && (
                    <pre className="pg-output pg-output--pre" aria-live="polite">
                      {autoResult}
                    </pre>
                  )}
                </div>
              </section>
            )}

            {tab === "settings" && (
              <>
                <section className="ui-section">
                  <div className="ui-section__head">
                    <h2 className="ui-section__title">Spending Limits</h2>
                  </div>
                  <div className="ui-section__body">
                    <div className="pg-form pg-form--2">
                      <div className="pg-stack">
                        <Field
                          label={<>Daily limit (USDC){currentDailyLimit != null ? ` · current: ${formatUnits(currentDailyLimit, 6)}` : ""}</>}
                          htmlFor="ag-daily"
                        >
                          <Input
                            id="ag-daily"
                            type="number"
                            min="0"
                            step="1"
                            value={dailyLimit}
                            onChange={e => setDailyLimit(e.target.value)}
                          />
                        </Field>
                        <Button
                          variant="primary"
                          className="pg-self-start pg-justify-start"
                          onClick={handleSetDailyLimit}
                          disabled={loading || !isConnected}
                          loading={loading}
                        >
                          Set
                        </Button>
                      </div>
                      <div className="pg-stack">
                        <Field
                          label={<>Max per call (USDC){currentMaxPerCall != null ? ` · current: ${formatUnits(currentMaxPerCall, 6)}` : ""}</>}
                          htmlFor="ag-maxpercall"
                        >
                          <Input
                            id="ag-maxpercall"
                            type="number"
                            min="0"
                            step="0.1"
                            value={maxPerCall}
                            onChange={e => setMaxPerCall(e.target.value)}
                          />
                        </Field>
                        <Button
                          variant="primary"
                          className="pg-self-start pg-justify-start"
                          onClick={handleSetMaxPerCall}
                          disabled={loading || !isConnected}
                          loading={loading}
                        >
                          Set
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="ui-section pg-section--spaced">
                  <div className="ui-section__head">
                    <h2 className="ui-section__title">Provider Whitelist</h2>
                  </div>
                  <div className="ui-section__body">
                    <Field label="Provider ID" htmlFor="ag-whitelist">
                      <Input
                        id="ag-whitelist"
                        type="number"
                        min="1"
                        value={whitelistId}
                        onChange={e => setWhitelistId(e.target.value)}
                        placeholder="1"
                      />
                    </Field>
                    <div className="pg-form__actions pg-form__actions--spaced">
                      <Button
                        variant="primary"
                        onClick={() => handleWhitelist(true)}
                        disabled={loading || !isConnected}
                        loading={loading}
                      >
                        Add to whitelist
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => handleWhitelist(false)}
                        disabled={loading || !isConnected}
                        loading={loading}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
        rail={(
          <>
            <KeyValue
              label="Policy"
              rows={[
                {
                  label: "State",
                  value: (
                    <Badge tone={isPaused === undefined ? "neutral" : isPaused ? "slash" : "guard"} dot>
                      {isPaused === undefined ? "READING" : isPaused ? "PAUSED" : "ACTIVE"}
                    </Badge>
                  ),
                },
                { label: "Daily limit", value: currentDailyLimit != null ? `${formatUnits(currentDailyLimit, 6)} USDC` : "—", mono: true },
                { label: "Max per call", value: currentMaxPerCall != null ? `${formatUnits(currentMaxPerCall, 6)} USDC` : "—", mono: true },
                {
                  label: "Owner",
                  value: owner ? (
                    <a
                      className="pg-rowlink pg-mono"
                      href={`https://explorer.testnet.arc.io/address/${owner}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {ownerShort}
                    </a>
                  ) : "—",
                },
              ]}
            />
            <KeyValue
              label="Deployment"
              rows={[
                {
                  label: "Contract",
                  value: validAgent ? (
                    <a
                      className="pg-rowlink pg-mono"
                      href={`https://explorer.testnet.arc.io/address/${agentAddr}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {agentAddr.slice(0, 10)}…{agentAddr.slice(-6)}
                    </a>
                  ) : "Invalid address",
                },
                { label: "Storage", value: "cg_agent_wallet", mono: true },
                { label: "Network", value: "Arc Testnet" },
              ]}
            />
          </>
        )}
      />

      {!isConnected && (
        <StatusNotice
          tone="info"
          title="Connect wallet to interact"
          className="pg-section--spaced"
          live="off"
        />
      )}
    </PanelShell>
  );
}
