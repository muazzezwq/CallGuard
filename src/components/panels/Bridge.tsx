import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, createPublicClient, http, defineChain } from "viem";
import { CONFIG } from "../../lib/config";

// CCTP supported source chains → Arc Testnet
const SOURCE_CHAINS = [
  { id: 11155111, name: "Ethereum Sepolia", symbol: "ETH", usdcAddr: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`, domain: 0, tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5" as `0x${string}` },
  { id: 84532,    name: "Base Sepolia",     symbol: "ETH", usdcAddr: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`, domain: 6, tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5" as `0x${string}` },
  { id: 80002,    name: "Polygon Amoy",     symbol: "MATIC", usdcAddr: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582" as `0x${string}`, domain: 7, tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5" as `0x${string}` },
] as const;

const ARC_DOMAIN = 9; // Arc Testnet CCTP domain
const ARC_TOKEN_MESSENGER = "0x28a683A5fAB9B5DC2608089e86d733aB1f116e5c" as `0x${string}`; // crossChainReceiver

const USDC_ABI = [
  { name: "approve", type: "function" as const, stateMutability: "nonpayable" as const, inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function" as const, stateMutability: "view" as const, inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const TOKEN_MESSENGER_ABI = [
  {
    name: "depositForBurn",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
  },
] as const;

type Step = "idle" | "approving" | "burning" | "attesting" | "minting" | "done" | "error";

const s = {
  page: { padding: "20px 16px", maxWidth: 560, margin: "0 auto" },
  h1: { fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  card: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px" },
  label: { fontSize: 11, color: "var(--text-dim)", fontWeight: 600, marginBottom: 6, display: "block" },
  input: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" as const },
  select: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text)", fontSize: 13, cursor: "pointer", boxSizing: "border-box" as const },
  btn: (disabled = false) => ({
    width: "100%", padding: "11px 16px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13, fontWeight: 600, background: disabled ? "var(--bg-3)" : "linear-gradient(135deg,#10b981,#059669)",
    color: disabled ? "var(--text-faint)" : "#fff", opacity: disabled ? 0.6 : 1, marginTop: 8,
  }),
  step: (active: boolean, done: boolean) => ({
    display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
    color: done ? "var(--accent)" : active ? "var(--text)" : "var(--text-faint)",
    fontSize: 12, fontWeight: active || done ? 600 : 400,
  }),
  dot: (active: boolean, done: boolean) => ({
    width: 18, height: 18, borderRadius: "50%", border: `2px solid ${done ? "var(--accent)" : active ? "var(--text)" : "var(--border)"}`,
    background: done ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 9, fontWeight: 700, color: done ? "#fff" : active ? "var(--text)" : "var(--text-faint)", flexShrink: 0,
  }),
  status: { marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "var(--bg-3)", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)", wordBreak: "break-all" as const, whiteSpace: "pre-wrap" as const },
};

function addressToBytes32(addr: string): `0x${string}` {
  return `0x${addr.slice(2).toLowerCase().padStart(64, "0")}` as `0x${string}`;
}

export default function Bridge() {
  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [srcIdx, setSrcIdx] = useState(0);
  const [amount, setAmount] = useState("1.0");
  const [recipient, setRecipient] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [burnHash, setBurnHash] = useState<string | null>(null);
  const [attestation, setAttestation] = useState<string | null>(null);

  const src = SOURCE_CHAINS[srcIdx];

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

  const pollAttestation = useCallback(async (txHash: string): Promise<string | null> => {
    // Circle IRIS attestation API
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 8000));
      try {
        const res = await fetch(`https://iris-api-sandbox.circle.com/attestations/${txHash}`);
        const data = await res.json();
        if (data?.status === "complete" && data?.attestation) {
          return data.attestation;
        }
        addLog(`⏳ Attestation pending (attempt ${i + 1}/40)…`);
      } catch { addLog("⚠ Attestation poll error, retrying…"); }
    }
    return null;
  }, []);

  const handleBridge = useCallback(async () => {
    if (!address || !walletClient || !isConnected) return;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      addLog("❌ Invalid amount"); return;
    }
    const dest = recipient.trim() || address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) {
      addLog("❌ Invalid recipient address"); return;
    }

    // Check source chain
    if (chain?.id !== src.id) {
      addLog(`❌ Please switch wallet to ${src.name} (chain ${src.id}) first`);
      return;
    }

    setStep("approving");
    setLog([`🌉 Bridging ${amount} USDC from ${src.name} → Arc Testnet`]);
    setBurnHash(null);
    setAttestation(null);

    try {
      const parsedAmount = parseUnits(amount, 6);

      // Step 1: Approve TokenMessenger to spend USDC
      addLog("Step 1/4 — Approving USDC…");
      const approveTx = await walletClient.writeContract({
        address: src.usdcAddr,
        abi: USDC_ABI,
        functionName: "approve",
        args: [src.tokenMessenger, parsedAmount],
        chain: undefined,
        account: address,
      });
      addLog(`✅ Approved — TX: ${approveTx}`);
      await publicClient!.waitForTransactionReceipt({ hash: approveTx, timeout: 60_000 });

      // Step 2: depositForBurn
      setStep("burning");
      addLog("Step 2/4 — Burning USDC on source chain…");
      const mintRecipient = addressToBytes32(dest);
      const burnTx = await walletClient.writeContract({
        address: src.tokenMessenger,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurn",
        args: [parsedAmount, ARC_DOMAIN, mintRecipient, src.usdcAddr],
        chain: undefined,
        account: address,
      });
      setBurnHash(burnTx);
      addLog(`✅ Burned — TX: ${burnTx}`);
      await publicClient!.waitForTransactionReceipt({ hash: burnTx, timeout: 120_000 });

      // Step 3: Poll Circle IRIS for attestation
      setStep("attesting");
      addLog("Step 3/4 — Waiting for Circle attestation (up to 5 min)…");
      const att = await pollAttestation(burnTx);
      if (!att) {
        setStep("error");
        addLog("❌ Attestation timed out. Check https://iris-api-sandbox.circle.com/attestations/" + burnTx);
        return;
      }
      setAttestation(att);
      addLog("✅ Attestation received");

      // Step 4: receiveMessage on Arc Testnet
      setStep("minting");
      addLog("Step 4/4 — Arc Testnet: switch wallet to Arc and call receiveMessage via /api/call-service…");
      // Since we can't easily switch chains in-browser for the user,
      // relay through our backend which has Arc RPC access
      const relayRes = await fetch("/api/call-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cctp-receive", attestation: att, burnTx }),
      });
      const relayData = await relayRes.json();
      if (relayData.ok || relayData.txHash) {
        setStep("done");
        addLog(`✅ Minted on Arc Testnet — TX: ${relayData.txHash || "pending"}`);
        addLog(`🎉 Bridge complete! ${amount} USDC should arrive at ${dest.slice(0,8)}…`);
      } else {
        // Manual fallback instructions
        setStep("done");
        addLog(`⚠ Auto-relay not available. Manual step:`);
        addLog(`  1. Switch wallet to Arc Testnet (chain 5042002)`);
        addLog(`  2. Call receiveMessage on MessageTransmitter with attestation: ${att.slice(0, 40)}…`);
        addLog(`  3. Your USDC will arrive at: ${dest}`);
      }
    } catch (e: unknown) {
      setStep("error");
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`❌ Error: ${(e as { shortMessage?: string }).shortMessage ?? msg}`);
    }
  }, [address, walletClient, isConnected, chain, src, amount, recipient, publicClient, pollAttestation]);

  const steps: [string, Step[]][] = [
    ["Approve USDC", ["approving"]],
    ["Burn on source", ["burning"]],
    ["Get attestation", ["attesting"]],
    ["Mint on Arc", ["minting", "done"]],
  ];
  const stepOrder: Step[] = ["approving", "burning", "attesting", "minting", "done"];
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div style={s.page}>
      <h1 style={s.h1}>🌉 CCTP Bridge</h1>
      <p style={s.sub}>Bridge USDC to Arc Testnet using Circle's Cross-Chain Transfer Protocol.</p>

      <div style={s.card}>
        {/* Source chain selector */}
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>Source Chain</label>
          <select
            style={s.select}
            value={srcIdx}
            onChange={e => setSrcIdx(Number(e.target.value))}
            disabled={step !== "idle" && step !== "done" && step !== "error"}
          >
            {SOURCE_CHAINS.map((c, i) => (
              <option key={c.id} value={i}>{c.name} (chain {c.id})</option>
            ))}
          </select>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
            USDC on {src.name}: <span style={{ fontFamily: "var(--font-mono)" }}>{src.usdcAddr.slice(0, 10)}…</span>
            {chain?.id !== src.id && isConnected && (
              <span style={{ color: "var(--warn)", marginLeft: 6 }}>⚠ Switch wallet to {src.name}</span>
            )}
          </div>
        </div>

        {/* Destination (always Arc Testnet) */}
        <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 8, background: "var(--bg-3)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 2 }}>Destination</div>
          <div style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>Arc Testnet (chain 5042002)</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{CONFIG.usdc.slice(0, 10)}…</div>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>Amount (USDC)</label>
          <input
            style={s.input}
            type="number"
            min="0.000001"
            step="0.1"
            placeholder="1.0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={step !== "idle" && step !== "done" && step !== "error"}
          />
        </div>

        {/* Recipient */}
        <div style={{ marginBottom: 18 }}>
          <label style={s.label}>Recipient on Arc (leave blank to use your address)</label>
          <input
            style={s.input}
            placeholder={address ?? "0x…"}
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            disabled={step !== "idle" && step !== "done" && step !== "error"}
          />
        </div>

        {/* Progress steps */}
        {step !== "idle" && (
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: "var(--bg-1)", border: "1px solid var(--border)" }}>
            {steps.map(([label, activeSteps], i) => {
              const done = currentIdx > i + (step === "done" ? 0 : 0) && (step !== "error");
              const active = activeSteps.includes(step) || (step === "done" && i === steps.length - 1);
              const isDone = (step === "done" && i < 4) || (currentIdx > i && step !== "error");
              return (
                <div key={label} style={s.step(active, isDone)}>
                  <div style={s.dot(active, isDone)}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span>{label}</span>
                  {active && step !== "done" && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--accent)" }}>⏳</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Bridge button */}
        {(step === "idle" || step === "done" || step === "error") && (
          <button
            style={s.btn(!isConnected || !address)}
            onClick={handleBridge}
            disabled={!isConnected || !address}
          >
            {!isConnected ? "Connect wallet first" : `Bridge ${amount || "?"} USDC → Arc`}
          </button>
        )}

        {/* Reset */}
        {(step === "done" || step === "error") && (
          <button
            onClick={() => { setStep("idle"); setLog([]); setBurnHash(null); setAttestation(null); }}
            style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontSize: 12, marginTop: 6 }}
          >
            Start new bridge
          </button>
        )}

        {/* Log output */}
        {log.length > 0 && (
          <div style={s.status}>
            {log.join("\n")}
          </div>
        )}

        {/* Burn TX link */}
        {burnHash && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>
            Burn TX:{" "}
            <a href={`https://sepolia.etherscan.io/tx/${burnHash}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
              {burnHash.slice(0, 18)}…
            </a>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, background: "var(--bg-2)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
        <strong style={{ color: "var(--text)" }}>How it works:</strong><br />
        1. Approve USDC on the source chain<br />
        2. depositForBurn → Circle burns USDC and issues a signed attestation<br />
        3. Circle's IRIS API attests the burn (testnet: ~5 min)<br />
        4. receiveMessage on Arc Testnet → USDC minted to recipient<br />
        <br />
        <span style={{ color: "var(--text-faint)" }}>Powered by Circle CCTP v2 · Arc Testnet domain: {ARC_DOMAIN}</span>
      </div>
    </div>
  );
}
