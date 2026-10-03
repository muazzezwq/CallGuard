import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits, keccak256, stringToBytes, encodeFunctionData } from "viem";
import { arcTestnet, CONFIG } from "../../lib/config";
import { useAppStore } from "../../store/useAppStore";

const REGISTRY_ABI = [
  { name: "getProvider", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "owner", type: "address" }, { name: "signer", type: "address" },
      { name: "stake", type: "uint256" }, { name: "pricePerCall", type: "uint256" },
      { name: "maxResponseTime", type: "uint32" }, { name: "slashBps", type: "uint32" },
      { name: "active", type: "bool" }, { name: "metadataUri", type: "string" },
      { name: "completedCalls", type: "uint256" }, { name: "slashedCalls", type: "uint256" },
    ]}]
  },
] as const;

const PPC_ABI = [
  { name: "callService", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "providerId", type: "uint256" }, { name: "requestHash", type: "bytes32" }],
    outputs: [{ name: "callId", type: "bytes32" }]
  },
  { name: "claimTimeout", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "callId", type: "bytes32" }], outputs: []
  },
] as const;

type Chain = "arc" | "sepolia" | "base" | "amoy";

const CHAINS: { value: Chain; label: string; txCount: number; hint: string }[] = [
  { value: "arc", label: "Arc Testnet (direct)", txCount: 1, hint: "Paying from Arc Testnet directly. No bridging required." },
  { value: "sepolia", label: "Ethereum Sepolia (via CCTP)", txCount: 2, hint: "USDC will be bridged via CCTP from Ethereum Sepolia." },
  { value: "base", label: "Base Sepolia (via CCTP)", txCount: 2, hint: "USDC will be bridged via CCTP from Base Sepolia." },
  { value: "amoy", label: "Polygon Amoy (via CCTP)", txCount: 2, hint: "USDC will be bridged via CCTP from Polygon Amoy." },
];

function RiskBadge({ honorRate, stake, price }: { honorRate: number; stake: bigint; price: bigint }) {
  const underfunded = stake < price;
  if (honorRate < 10) return (
    <div className="rounded-lg border border-danger bg-danger-bg p-3 text-sm mb-4">
      <div className="font-semibold text-danger mb-1">⚠ High Risk Provider</div>
      <div className="text-text-dim text-xs">This provider has a {honorRate}% honor rate. There is a high chance of timeout. Proceed with caution.</div>
    </div>
  );
  if (honorRate < 30) return (
    <div className="rounded-lg border border-warn bg-warn-bg p-3 text-sm mb-4">
      <div className="font-semibold text-warn mb-1">⚠ Low Honor Rate: {honorRate}%</div>
      <div className="text-text-dim text-xs">This provider has missed most recent calls. Consider a different provider.</div>
    </div>
  );
  if (underfunded) return (
    <div className="rounded-lg border border-warn bg-warn-bg p-3 text-sm mb-4">
      <div className="font-semibold text-warn mb-1">⚠ Underfunded Provider</div>
      <div className="text-text-dim text-xs">Provider stake ({formatUnits(stake, 6)} USDC) is less than price ({formatUnits(price, 6)} USDC). Slash bonus may be partial.</div>
    </div>
  );
  return null;
}

export default function CallBuilder() {
  const { address, isConnected } = useAccount();
  const { setPanel } = useAppStore();

  const [chain, setChain] = useState<Chain>("arc");
  const [providerId, setProviderId] = useState("1");
  const [payload, setPayload] = useState("ping");
  const [callIdInput, setCallIdInput] = useState("");
  const [responsePayload, setResponsePayload] = useState("pong");
  const [lastCallId, setLastCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [batchCount, setBatchCount] = useState(3);

  const chainInfo = CHAINS.find(c => c.value === chain)!;
  const providerIdNum = parseInt(providerId) || 0;

  const { data: providerData } = useReadContract({
    address: CONFIG.registry as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "getProvider",
    args: [BigInt(providerIdNum || 1)],
    chainId: arcTestnet.id,
    query: { enabled: providerIdNum > 0, refetchInterval: 30_000 },
  });

  const provider = providerData as any;
  const price = provider?.pricePerCall ?? BigInt(0);
  const slaWindow = provider?.maxResponseTime ?? 0;
  const slashBps = provider?.slashBps ?? 0;
  const active = provider?.active ?? false;
  const stake = provider?.stake ?? BigInt(0);
  const honorRate = provider
    ? Math.round((Number(provider.completedCalls) / Math.max(Number(provider.completedCalls) + Number(provider.slashedCalls), 1)) * 100)
    : 100;

  const { writeContract, data: txHash } = useWriteContract();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (txConfirmed && txHash) {
      setStatus(`✅ Transaction confirmed: ${txHash.slice(0, 10)}...`);
      setIsLoading(false);
    }
  }, [txConfirmed, txHash]);

  const handleCall = useCallback(async () => {
    if (!isConnected || !address) return setStatus("Connect your wallet first.");
    if (!active) return setStatus("This provider is not active.");
    const reqHash = keccak256(stringToBytes(payload)) as `0x${string}`;
    setIsLoading(true);
    setStatus("Sending transaction...");
    try {
      writeContract({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: PPC_ABI,
        functionName: "callService",
        args: [BigInt(providerIdNum), reqHash],
        chainId: arcTestnet.id,
      });
      setStatus("⏳ Waiting for confirmation...");
    } catch (e: any) {
      setStatus(`❌ ${e.shortMessage || e.message}`);
      setIsLoading(false);
    }
  }, [isConnected, address, active, payload, providerIdNum, writeContract]);

  const handleClaimTimeout = useCallback(async () => {
    const id = callIdInput || lastCallId;
    if (!id) return setStatus("Enter a call ID first.");
    setIsLoading(true);
    try {
      writeContract({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: PPC_ABI,
        functionName: "claimTimeout",
        args: [id as `0x${string}`],
        chainId: arcTestnet.id,
      });
      setStatus("⏳ Claiming timeout...");
    } catch (e: any) {
      setStatus(`❌ ${e.shortMessage || e.message}`);
      setIsLoading(false);
    }
  }, [callIdInput, lastCallId, writeContract]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent mb-1">Call Builder</div>
          <h1 className="text-3xl font-bold font-display text-text">Execute a Service Call</h1>
          <p className="text-text-dim text-sm mt-1">Configure and execute an API call with on-chain SLA enforcement.</p>
        </div>
        <span className="flex items-center gap-2 text-xs bg-accent-bg text-accent border border-accent/20 rounded-full px-3 py-1.5 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Gas-free · EIP-3009
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: form */}
        <div className="bg-bg-1 border border-border rounded-xl p-6 space-y-5">
          {/* Gas-free info */}
          <div className="bg-accent-bg border border-accent/20 rounded-lg p-3 text-xs text-text-dim leading-relaxed">
            <strong className="text-accent">No gas required.</strong> Sign an EIP-3009 authorization off-chain. The facilitator pays gas and settles on Arc in a single transaction.
          </div>

          {/* Chain select */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-text-faint mb-2">Pay from chain</label>
            <select
              value={chain}
              onChange={e => setChain(e.target.value as Chain)}
              className="w-full bg-bg-2 border border-border rounded-lg px-3 py-2.5 text-text text-sm focus:outline-none focus:border-accent"
            >
              {CHAINS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="text-xs text-text-dim mt-1.5">{chainInfo.hint}</p>
            <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs">
              <span className={`px-2 py-0.5 rounded-full font-medium ${chainInfo.txCount === 1 ? "bg-accent-bg text-accent" : "bg-info-bg text-info"}`}>
                {chainInfo.txCount === 1 ? "1 TX — EIP-3009 gasless" : "2 TXs — CCTP bridge"}
              </span>
            </div>
          </div>

          {/* Provider + Payload */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-text-faint mb-2">Provider ID</label>
              <input
                type="number"
                min="1"
                value={providerId}
                onChange={e => setProviderId(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-lg px-3 py-2.5 text-text text-sm focus:outline-none focus:border-accent font-mono"
                placeholder="1"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-text-faint mb-2">Request payload</label>
              <input
                type="text"
                value={payload}
                onChange={e => setPayload(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-lg px-3 py-2.5 text-text text-sm focus:outline-none focus:border-accent"
                placeholder="ping"
              />
            </div>
          </div>

          {/* Risk badge */}
          {provider && <RiskBadge honorRate={honorRate} stake={stake} price={price} />}

          {/* Call ID */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-text-faint mb-2">Call ID (for receipt / timeout)</label>
            <input
              type="text"
              value={callIdInput}
              onChange={e => setCallIdInput(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-lg px-3 py-2.5 text-text text-sm focus:outline-none focus:border-accent font-mono"
              placeholder="Auto-filled after call"
            />
          </div>

          {/* CTA buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCall}
              disabled={isLoading || !isConnected}
              className="bg-bg-2 border border-border rounded-lg px-4 py-3 text-sm font-semibold text-text hover:border-text-dim transition-colors disabled:opacity-40"
            >
              Standard call
              <span className="block text-xs font-normal text-text-dim mt-0.5">MetaMask approval</span>
            </button>
            <button
              onClick={handleCall}
              disabled={isLoading || !isConnected}
              className="bg-accent text-white rounded-lg px-4 py-3 text-sm font-semibold hover:bg-accent-dim transition-colors disabled:opacity-40 shadow-[0_0_16px_rgba(16,185,129,0.3)]"
            >
              ⚡ Gas-free call
              <span className="block text-xs font-normal opacity-75 mt-0.5">Recommended</span>
            </button>
          </div>

          {/* Provider actions */}
          <div className="border-t border-border pt-5">
            <div className="text-xs uppercase tracking-widest text-text-faint mb-3">Provider actions</div>
            <div className="mb-3">
              <label className="block text-xs uppercase tracking-widest text-text-faint mb-2">Response payload</label>
              <input
                type="text"
                value={responsePayload}
                onChange={e => setResponsePayload(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-lg px-3 py-2.5 text-text text-sm focus:outline-none focus:border-accent"
                placeholder="pong"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button className="bg-bg-2 border border-border rounded-lg px-4 py-2.5 text-sm font-medium text-text hover:border-accent transition-colors">
                Submit receipt
              </button>
              <button
                onClick={handleClaimTimeout}
                disabled={isLoading}
                className="bg-bg-2 border border-danger/30 rounded-lg px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger-bg transition-colors disabled:opacity-40"
              >
                Claim timeout
              </button>
            </div>
          </div>

          {/* Status */}
          {status && (
            <div className={`rounded-lg p-3 text-xs font-mono ${status.startsWith("✅") ? "bg-accent-bg text-accent" : status.startsWith("❌") ? "bg-danger-bg text-danger" : "bg-bg-2 text-text-dim"}`}>
              {status}
            </div>
          )}
        </div>

        {/* Right: summary */}
        <div className="space-y-4">
          <div className="bg-bg-1 border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-text mb-4 uppercase tracking-widest">Execution Summary</h3>
            {[
              { label: "Provider", value: providerIdNum ? `#${providerIdNum}` : "—" },
              { label: "Price", value: price ? `${formatUnits(price, 6)} USDC` : "—" },
              { label: "SLA window", value: slaWindow ? `${slaWindow}s` : "—" },
              { label: "Slash %", value: slashBps ? `${slashBps / 100}%` : "—" },
              { label: "Network", value: "Arc Testnet" },
              { label: "Settlement", value: "On-chain" },
              { label: "Payment type", value: "EIP-3009" },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                <span className="text-xs text-text-dim">{row.label}</span>
                <span className="text-xs font-mono text-text">{row.value}</span>
              </div>
            ))}
            <button
              onClick={handleCall}
              disabled={isLoading || !isConnected}
              className="w-full mt-4 bg-accent text-white rounded-lg py-3 text-sm font-semibold hover:bg-accent-dim transition-colors disabled:opacity-40 shadow-[0_0_16px_rgba(16,185,129,0.25)]"
            >
              {isLoading ? "Processing..." : "Review & Execute →"}
            </button>
            {lastCallId && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-xs uppercase tracking-widest text-text-faint mb-1">Last Call ID</div>
                <div className="text-xs font-mono text-text-dim break-all">{lastCallId}</div>
              </div>
            )}
          </div>

          {/* Batch call */}
          <div className="bg-bg-1 border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-text mb-3 uppercase tracking-widest">Quick Batch</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs text-text-dim">Number of calls</label>
                <span className="text-sm font-bold text-accent font-mono">{batchCount} call{batchCount > 1 ? "s" : ""}</span>
              </div>
              <input
                type="range" min="1" max="20" value={batchCount}
                onChange={e => setBatchCount(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="bg-bg-2 border border-border rounded-lg px-3 py-2 text-xs">
                Estimated cost:{" "}
                <span className="text-accent font-bold">
                  {(batchCount * Number(formatUnits(price || BigInt(1000000), 6))).toFixed(2)} USDC
                </span>
              </div>
              <button
                disabled={isLoading || !isConnected}
                className="w-full bg-accent text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-accent-dim transition-colors disabled:opacity-40"
              >
                Run batch →
              </button>
            </div>
          </div>

          {/* Quick nav */}
          <div className="bg-bg-1 border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-widest text-text-faint mb-3">Quick navigation</div>
            <div className="space-y-1.5">
              {[
                { label: "Browse providers", panel: "marketplace" as const },
                { label: "View my receipts", panel: "receipts" as const },
                { label: "Claim a timeout", panel: "disputes" as const },
              ].map(item => (
                <button
                  key={item.panel}
                  onClick={() => setPanel(item.panel)}
                  className="w-full text-left text-xs text-text-dim hover:text-accent transition-colors py-1"
                >
                  {item.label} →
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
