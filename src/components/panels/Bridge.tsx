import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient, useWriteContract } from "wagmi";
import { createPublicClient, http, parseUnits } from "viem";
import { CONFIG, arcTestnet } from "../../lib/config";
import {
  checkPaymentStart, recordSubmittedTx, resolvePendingTx, beginOperation, endOperation,
} from "../../lib/paymentGate";
import {
  readCctpOperation, startCctpOperation, updateCctpOperation, clearCctpOperation, cctpStageDecision,
} from "../../lib/cctpOperation";
import {
  CCTP_CONFIG, MESSAGE_TRANSMITTER_ABI, switchToChain, validateCctpMintMessage, waitForAttestation,
} from "../../lib/cctp";
import { BRIDGE_SOURCE_CHAINS } from "../../lib/bridgeChains";

const SOURCE_CHAINS = BRIDGE_SOURCE_CHAINS;

// CRITICAL-05 fix: Arc Testnet CCTP domain is 26, not 9 (matches cctp.ts)
const ARC_DOMAIN = CCTP_CONFIG.domains.arc;

const USDC_ABI = [
  { name: "approve", type: "function" as const, stateMutability: "nonpayable" as const, inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function" as const, stateMutability: "view" as const, inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// HIGH-05 fix: CCTP v2 TokenMessenger depositForBurn has 7 params
const TOKEN_MESSENGER_ABI = [
  {
    name: "depositForBurn",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "amount",                type: "uint256" },
      { name: "destinationDomain",     type: "uint32"  },
      { name: "mintRecipient",         type: "bytes32" },
      { name: "burnToken",             type: "address" },
      { name: "destinationCaller",     type: "bytes32" },
      { name: "maxFee",                type: "uint256" },
      { name: "minFinalityThreshold",  type: "uint32"  },
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
  },
] as const;

type Step = "idle" | "approving" | "burning" | "attesting" | "minting" | "done" | "error";

const s = {
  page: { padding: "20px 16px", maxWidth: 560, margin: "0 auto" },
  h1: { fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  card: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius:14, padding: "20px" },
  label: { fontSize: 11, color: "var(--text-dim)", fontWeight: 600, marginBottom: 6, display: "block" },
  input: { width: "100%", padding: "9px 12px", borderRadius:10, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" as const },
  select: { width: "100%", padding: "9px 12px", borderRadius:10, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text)", fontSize: 13, cursor: "pointer", boxSizing: "border-box" as const },
  btn: (disabled = false) => ({
    width: "100%", padding: "11px 16px", borderRadius:999, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13, fontWeight: 600, background: disabled ? "var(--bg-3)" : "linear-gradient(135deg,#19D186,#0E9F6E)",
    color: disabled ? "var(--text-faint)" : "var(--on-accent)", opacity: disabled ? 0.6 : 1, marginTop: 8,
  }),
  step: (active: boolean, done: boolean) => ({
    display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
    color: done ? "var(--accent-ink)" : active ? "var(--text)" : "var(--text-faint)",
    fontSize: 12, fontWeight: active || done ? 600 : 400,
  }),
  dot: (active: boolean, done: boolean) => ({
    width: 18, height: 18, borderRadius: "50%", border: `2px solid ${done ? "var(--accent)" : active ? "var(--text)" : "var(--border)"}`,
    background: done ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 9, fontWeight: 700, color: done ? "#fff" : active ? "var(--text)" : "var(--text-faint)", flexShrink: 0,
  }),
  status: { marginTop: 12, padding: "10px 14px", borderRadius:10, background: "var(--bg-3)", fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)", wordBreak: "break-all" as const, whiteSpace: "pre-wrap" as const },
};

function addressToBytes32(addr: string): `0x${string}` {
  return `0x${addr.slice(2).toLowerCase().padStart(64, "0")}` as `0x${string}`;
}

/** Accessing `sessionStorage` itself can throw in restricted browser modes. */
function bridgeStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export default function Bridge() {
  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [srcIdx, setSrcIdx] = useState(0);
  const [amount, setAmount] = useState("1.0");
  const [recipient, setRecipient] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [burnHash, setBurnHash] = useState<string | null>(null);
  const [, setAttestation] = useState<string | null>(null);

  const src = SOURCE_CHAINS[srcIdx];

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

  const handleBridge = useCallback(async () => {
    if (!address || !walletClient || !isConnected) return;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      addLog("❌ Invalid amount"); return;
    }
    const dest = recipient.trim() || address;
    if (!/^0x[0-9a-fA-F]{40}$/.test(dest) || /^0x0{40}$/i.test(dest)) {
      addLog("❌ Invalid recipient address"); return;
    }

    // Check source chain
    if (chain?.id !== src.id) {
      addLog(`❌ Please switch wallet to ${src.name} (chain ${src.id}) first`);
      return;
    }

    const storage = bridgeStorage();
    const gate = checkPaymentStart({ storage, operation: "bridge" });
    if (!gate.ok) {
      setStep("error");
      addLog(`❌ No transaction was started. ${gate.message}`);
      return;
    }
    const existing = readCctpOperation(storage);
    if (!existing.ok || existing.operation) {
      setStep("error");
      addLog(existing.ok
        ? `❌ A previous bridge operation is unresolved (stage: ${existing.operation?.stage}). Check the explorer and clear this tab's site storage before another bridge.`
        : "❌ The bridge operation marker cannot be read, so a repeated burn cannot be ruled out. Nothing was sent.");
      return;
    }
    if (!beginOperation("bridge")) {
      setStep("error");
      addLog("❌ Another payment flow is still running in this tab. Wait for it to finish.");
      return;
    }

    setStep("approving");
    setLog([`🌉 Bridging ${amount} USDC from ${src.name} → Arc Testnet`]);
    setBurnHash(null);
    setAttestation(null);

    /* True once any transaction was submitted. Before that an error means
       nothing reached a chain; afterwards the marker is never cleared here. */
    let anySubmitted = false;

    /* A marker-write failure before a write leaves a stage that provably did
       nothing. Clear it so a retry is possible, but stay blocked if the clear
       itself cannot be verified. */
    const abortBeforeWrite = (message: string) => {
      const cleared = clearCctpOperation(storage);
      const resolved = resolvePendingTx(storage);
      setStep("error");
      addLog(cleared.ok && resolved.cleared ? message : `${message} The safety marker could not be cleared; check storage before retrying.`);
    };

    try {
      const parsedAmount = parseUnits(amount, 6);

      const started = startCctpOperation(storage, { chain: String(src.id), amount: parsedAmount.toString() });
      if (!started.ok) {
        setStep("error");
        addLog("❌ The bridge operation marker could not be saved and verified, so no approval or burn was sent.");
        return;
      }

      // Step 1: Approve TokenMessenger to spend USDC
      addLog("Step 1/4 — Approving USDC…");
      if (!updateCctpOperation(storage, { stage: "approval-pending" }).ok) {
        abortBeforeWrite("❌ The approval marker could not be saved, so no approval was sent.");
        return;
      }
      const approveTx = await walletClient.writeContract({
        address: src.usdcAddr,
        abi: USDC_ABI,
        functionName: "approve",
        args: [src.tokenMessenger, parsedAmount],
        chain: undefined,
        account: address,
      });
      anySubmitted = true;
      recordSubmittedTx(approveTx, storage);
      if (!updateCctpOperation(storage, { stage: "approval-pending", approvalHash: approveTx }).ok) {
        setStep("error");
        addLog(`❌ Approval ${approveTx} was submitted, but the marker could not record its hash. Check the explorer; do not continue.`);
        return;
      }
      addLog(`✅ Approved — TX: ${approveTx}`);

      let approveReceipt = null;
      try {
        approveReceipt = await publicClient!.waitForTransactionReceipt({ hash: approveTx, timeout: 60_000 });
      } catch { approveReceipt = null; }
      const approveDecision = cctpStageDecision(
        "approval-pending",
        !approveReceipt ? "unknown" : approveReceipt.status === "success" ? "confirmed" : "reverted",
      );
      if (approveDecision.action === "stop") {
        setStep("error");
        addLog(`⚠ ${approveDecision.message} Do not retry; check the explorer first.`);
        return;
      }
      if (approveDecision.action === "fail") {
        clearCctpOperation(storage);
        resolvePendingTx(storage);
        setStep("error");
        addLog(`❌ ${approveDecision.message}`);
        return;
      }
      if (!updateCctpOperation(storage, { stage: "approval-confirmed" }).ok) {
        setStep("error");
        addLog("❌ The approval confirmed, but the marker could not record that stage. Check the explorer; do not continue.");
        return;
      }
      resolvePendingTx(storage);

      // Step 2: depositForBurn
      setStep("burning");
      addLog("Step 2/4 — Burning USDC on source chain…");
      if (!updateCctpOperation(storage, { stage: "burn-pending" }).ok) {
        abortBeforeWrite("❌ The burn marker could not be saved, so no burn was sent.");
        return;
      }
      const mintRecipient = addressToBytes32(dest);
      const burnTx = await walletClient.writeContract({
        address: src.tokenMessenger,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurn",
        // HIGH-05 fix: CCTP v2 requires 7 args — destinationCaller=0x0, maxFee=0, minFinalityThreshold=1000
        args: [parsedAmount, ARC_DOMAIN, mintRecipient, src.usdcAddr, `0x${"0".repeat(64)}` as `0x${string}`, BigInt(0), 1000],
        chain: undefined,
        account: address,
      });
      setBurnHash(burnTx);
      recordSubmittedTx(burnTx, storage);
      if (!updateCctpOperation(storage, { stage: "burn-pending", burnHash: burnTx }).ok) {
        setStep("error");
        addLog(`❌ Burn ${burnTx} was submitted, but the marker could not record its hash. Check the explorer; do not continue.`);
        return;
      }
      addLog(`✅ Burned — TX: ${burnTx}`);

      let burnReceipt = null;
      try {
        burnReceipt = await publicClient!.waitForTransactionReceipt({ hash: burnTx, timeout: 120_000 });
      } catch { burnReceipt = null; }
      const burnDecision = cctpStageDecision(
        "burn-pending",
        !burnReceipt ? "unknown" : burnReceipt.status === "success" ? "confirmed" : "reverted",
      );
      if (burnDecision.action === "stop") {
        setStep("error");
        addLog(`⚠ ${burnDecision.message} Do not burn again; check the explorer first.`);
        return;
      }
      if (burnDecision.action === "fail") {
        clearCctpOperation(storage);
        resolvePendingTx(storage);
        setStep("error");
        addLog(`❌ ${burnDecision.message}`);
        return;
      }
      if (!updateCctpOperation(storage, { stage: "burn-confirmed" }).ok) {
        setStep("error");
        addLog("❌ The burn confirmed, but the marker could not record that stage. Check the explorer; do not continue.");
        return;
      }
      resolvePendingTx(storage);

      // Step 3: Poll Circle IRIS for the message and attestation
      setStep("attesting");
      addLog("Step 3/4 — Waiting for Circle attestation (up to 5 min)…");
      let attested: Awaited<ReturnType<typeof waitForAttestation>>;
      try {
        attested = await waitForAttestation(src.domain, burnTx);
      } catch {
        setStep("error");
        addLog("❌ Attestation timed out. The burn is confirmed and stays recorded, so no second burn will start. Check https://iris-api-sandbox.circle.com/v2/messages/" + src.domain + "/" + burnTx + " and complete the mint manually.");
        return;
      }
      setAttestation(attested.attestation);

      /* An attestation only proves Circle signed this message. Check that the
         message is the burn this operation just made before minting it. */
      const validation = validateCctpMintMessage(attested.decoded, {
        sourceDomain: src.domain,
        destinationDomain: ARC_DOMAIN,
        mintRecipient: dest,
        burnToken: src.usdcAddr,
        amount: parsedAmount,
        destinationCaller: "0x0000000000000000000000000000000000000000",
        recipient: CCTP_CONFIG.contracts.TokenMessengerV2,
        sender: src.tokenMessenger,
        messageSender: address,
        maxFee: 0n,
        hookData: "0x",
      });
      if (!validation.ok) {
        setStep("error");
        addLog(`⚠ Refusing to mint: ${validation.reason}`);
        addLog("The burn is confirmed. The operation stays recorded; do not burn again.");
        addLog(`  Attestation: ${attested.attestation}`);
        addLog(`  Message: ${attested.message}`);
        return;
      }

      // Step 4: receiveMessage on Arc Testnet from the connected wallet
      setStep("minting");
      addLog("Step 4/4 — Minting on Arc Testnet…");
      try {
        await switchToChain("arc");
      } catch (e: unknown) {
        setStep("error");
        addLog(`⚠ Could not switch wallet to Arc Testnet: ${(e as { shortMessage?: string }).shortMessage ?? (e instanceof Error ? e.message : String(e))}. The burn is confirmed; do not burn again.`);
        return;
      }

      const arcClient = createPublicClient({ chain: arcTestnet, transport: http(CONFIG.rpcUrl) });
      let balanceBefore: bigint;
      try {
        balanceBefore = await arcClient.readContract({
          address: CONFIG.usdcAddress,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [dest as `0x${string}`],
        });
      } catch {
        setStep("error");
        addLog("❌ Could not read the Arc USDC balance before minting. No mint was sent; the burn stays recorded. Do not burn again.");
        return;
      }

      if (!updateCctpOperation(storage, { stage: "mint-pending" }).ok) {
        setStep("error");
        addLog("❌ The burn is confirmed, but the mint marker could not be saved. No mint was requested; keep the attestation and complete it manually.");
        return;
      }

      let mintHash: `0x${string}`;
      try {
        mintHash = await writeContractAsync({
          address: CCTP_CONFIG.contracts.MessageTransmitterV2 as `0x${string}`,
          abi: MESSAGE_TRANSMITTER_ABI,
          functionName: "receiveMessage",
          args: [attested.message, attested.attestation],
          chainId: arcTestnet.id,
        });
      } catch (e: unknown) {
        setStep("error");
        addLog(`⚠ Mint was not submitted: ${(e as { shortMessage?: string }).shortMessage ?? (e instanceof Error ? e.message : String(e))}. The burn is confirmed; the operation stays recorded. Do not burn again.`);
        return;
      }

      recordSubmittedTx(mintHash, storage);
      if (!updateCctpOperation(storage, { stage: "mint-pending", mintHash }).ok) {
        setStep("error");
        addLog(`❌ Mint ${mintHash} was submitted, but the marker could not record it. Check the explorer; do not mint again.`);
        return;
      }

      let mintReceipt = null;
      try {
        mintReceipt = await arcClient.waitForTransactionReceipt({ hash: mintHash, timeout: 120_000 });
      } catch { mintReceipt = null; }
      const mintDecision = cctpStageDecision(
        "mint-pending",
        !mintReceipt ? "unknown" : mintReceipt.status === "success" ? "confirmed" : "reverted",
      );
      if (mintDecision.action !== "advance") {
        setStep("error");
        addLog(`⚠ ${mintDecision.message} Do not mint again; check the explorer first.`);
        return;
      }

      let balanceAfter: bigint;
      try {
        balanceAfter = await arcClient.readContract({
          address: CONFIG.usdcAddress,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [dest as `0x${string}`],
        });
      } catch {
        setStep("error");
        addLog(`⚠ Mint ${mintHash} confirmed, but the Arc USDC balance could not be read back. The operation stays recorded; do not burn again.`);
        return;
      }
      if (balanceAfter < balanceBefore + parsedAmount) {
        setStep("error");
        addLog(`⚠ Mint ${mintHash} confirmed, but the recipient balance did not increase by ${amount} USDC. The operation stays recorded; do not burn again.`);
        return;
      }

      const cleared = clearCctpOperation(storage);
      const resolved = resolvePendingTx(storage);
      if (!cleared.ok || !resolved.cleared) {
        setStep("error");
        addLog(`⚠ Mint ${mintHash} confirmed and balanced, but the local operation marker could not be cleared. It stays recorded; check the explorer before another bridge.`);
        return;
      }
      setStep("done");
      addLog(`✅ Mint confirmed on Arc — TX: ${mintHash}`);
      addLog(`🎉 Bridge complete! ${amount} USDC arrived at ${dest.slice(0,8)}…`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!anySubmitted) {
        clearCctpOperation(storage);
        addLog(`❌ Error: ${(e as { shortMessage?: string }).shortMessage ?? msg}. Nothing was sent.`);
      } else {
        addLog(`❌ Error: ${(e as { shortMessage?: string }).shortMessage ?? msg}. The operation stays recorded; check the explorer before retrying.`);
      }
      setStep("error");
    } finally {
      endOperation("bridge");
    }
  }, [address, walletClient, isConnected, chain, src, amount, recipient, publicClient, writeContractAsync]);


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
          <label style={s.label} htmlFor="br-source">Source Chain</label>
          <select
            id="br-source"
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
        <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 14, background: "var(--bg-3)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 2 }}>Destination</div>
          <div style={{ fontSize: 13, color: "var(--accent-ink)", fontWeight: 600 }}>Arc Testnet (chain 5042002)</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{CONFIG.usdc.slice(0, 10)}…</div>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 14 }}>
          <label style={s.label} htmlFor="br-amount">Amount (USDC)</label>
          <input
            id="br-amount"
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
          <label style={s.label} htmlFor="br-recipient">Recipient on Arc (leave blank to use your address)</label>
          <input
            id="br-recipient"
            style={s.input}
            placeholder={address ?? "0x…"}
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            disabled={step !== "idle" && step !== "done" && step !== "error"}
          />
        </div>

        {/* Progress steps */}
        {step !== "idle" && (
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius:14, background: "var(--bg-1)", border: "1px solid var(--border)" }}>
            {steps.map(([label, activeSteps], i) => {
              const active = activeSteps.includes(step) || (step === "done" && i === steps.length - 1);
              const isDone = (step === "done" && i < 4) || (currentIdx > i && step !== "error");
              return (
                <div key={label} style={s.step(active, isDone)}>
                  <div style={s.dot(active, isDone)}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span>{label}</span>
                  {active && step !== "done" && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--accent-ink)" }}>⏳</span>}
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
            style={{ width: "100%", padding: "8px", borderRadius:999, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontSize: 12, marginTop: 6 }}
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
            <a href={`https://sepolia.etherscan.io/tx/${burnHash}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)", fontFamily: "var(--font-mono)" }}>
              {burnHash.slice(0, 18)}…
            </a>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ marginTop: 16, padding: "12px 14px", borderRadius:14, background: "var(--bg-2)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
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
