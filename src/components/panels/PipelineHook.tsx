import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONFIG } from "../../lib/config";
import { toast } from "sonner";

const PPC_HOOK_ABI = [
  { name: "pipelineHook", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "setPipelineHook", type: "function", stateMutability: "nonpayable", inputs: [{ name: "hook", type: "address" }], outputs: [] },
] as const;

type TxState = "idle" | "pending" | "mining" | "success" | "error";

export default function PipelineHook() {
  const { address, isConnected } = useAccount();
  const [hookInput, setHookInput] = useState("");
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { data: currentHook, refetch } = useReadContract({
    address: CONFIG.ppcAddress,
    abi: PPC_HOOK_ABI,
    functionName: "pipelineHook",
  });

  const { writeContract } = useWriteContract();

  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isMining) setTxState((s) => (s === "mining" ? s : "mining"));
  }, [isMining]);

  useEffect(() => {
    if (isSuccess) {
      setTxState("success");
      toast.success("Pipeline hook updated");
      void refetch();
    }
  }, [isSuccess, refetch]);

  const isZero = !currentHook || currentHook === "0x0000000000000000000000000000000000000000";

  function handleSet() {
    if (!hookInput || !/^0x[0-9a-fA-F]{40}$/.test(hookInput)) {
      toast.error("Enter a valid address");
      return;
    }
    setTxState("pending");
    writeContract(
      {
        address: CONFIG.ppcAddress,
        abi: PPC_HOOK_ABI,
        functionName: "setPipelineHook",
        args: [hookInput as `0x${string}`],
      },
      {
        onSuccess: (hash) => { setTxHash(hash); setTxState("mining"); },
        onError: (e) => { setTxState("error"); toast.error(e.message.slice(0, 80)); },
      }
    );
  }

  function handleDisable() {
    setTxState("pending");
    writeContract(
      {
        address: CONFIG.ppcAddress,
        abi: PPC_HOOK_ABI,
        functionName: "setPipelineHook",
        args: ["0x0000000000000000000000000000000000000000"],
      },
      {
        onSuccess: (hash) => { setTxHash(hash); setTxState("mining"); },
        onError: (e) => { setTxState("error"); toast.error(e.message.slice(0, 80)); },
      }
    );
  }

  return (
    <div className="panel-content">
      {/* Header */}
      <div className="panel-header">
        <div>
          <h2 className="panel-title">ERC-8183 Pipeline Hook</h2>
          <p className="panel-subtitle">
            Hook contract that reports SLA lifecycle events to the AgenticCommerce job pipeline.
            <code>beforeCall</code> fires before every <code>callService</code>, <code>afterCall</code> fires on close.
          </p>
        </div>
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
            background: isZero ? "rgba(238,69,57,.15)" : "rgba(25,209,134,.15)",
            color: isZero ? "var(--danger)" : "var(--accent)",
            border: `1px solid ${isZero ? "rgba(238,69,57,.3)" : "rgba(25,209,134,.3)"}`,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: isZero ? "var(--danger)" : "var(--accent)", display: "inline-block" }} />
          {isZero ? "Disabled" : "Active"}
        </span>
      </div>

      {/* Current hook address */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Current Hook Address</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: isZero ? "var(--text-dim)" : "var(--text)", wordBreak: "break-all" }}>
          {isZero ? "Not set (0x000...000)" : currentHook}
        </div>
        {!isZero && (
          <a
            href={`https://explorer.testnet.arc.io/address/${currentHook}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--info)", marginTop: 6, display: "inline-block" }}
          >
            View on ArcScan ↗
          </a>
        )}
      </div>

      {/* How it works */}
      <div style={{ background: "rgba(31,119,239,.08)", border: "1px solid rgba(31,119,239,.2)", borderRadius: 14, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--info)", marginBottom: 10 }}>How It Works</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { step: "1", label: "callService() is called", desc: "PayPerCall sends beforeCall(jobId, providerId, caller, amount) to the hook contract" },
            { step: "2", label: "SLA window elapses", desc: "Provider delivers a response or the deadline passes" },
            { step: "3", label: "Call closes", desc: "submitReceipt or claimTimeout → afterCall(jobId, success) fires" },
          ].map(({ step, label, desc }) => (
            <div key={step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(31,119,239,.2)", color: "var(--info)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                {step}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{label}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Set hook form */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>Set Hook Address</div>
        {!isConnected ? (
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Connect your wallet to perform this action.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={hookInput}
                onChange={e => setHookInput(e.target.value)}
                placeholder="0x... (contract implementing the IERC8183Hook interface)"
                style={{
                  flex: 1, background: "var(--bg-3)", border: "1px solid var(--border)",
                  borderRadius: 10, padding: "9px 12px", color: "var(--text)", fontSize: 12,
                  fontFamily: "var(--font-mono)", outline: "none",
                }}
              />
              <button
                onClick={handleSet}
                disabled={txState === "pending" || txState === "mining"}
                style={{
                  padding: "9px 18px", borderRadius: 999, fontWeight: 600, fontSize: 12,
                  background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer",
                  opacity: (txState === "pending" || txState === "mining") ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {txState === "pending" ? "Waiting..." : txState === "mining" ? "Writing..." : "Set"}
              </button>
            </div>
            {!isZero && (
              <button
                onClick={handleDisable}
                disabled={txState === "pending" || txState === "mining"}
                style={{
                  padding: "8px 16px", borderRadius: 999, fontWeight: 600, fontSize: 12,
                  background: "rgba(238,69,57,.15)", color: "var(--danger)",
                  border: "1px solid rgba(238,69,57,.3)", cursor: "pointer",
                }}
              >
                Disable Hook
              </button>
            )}
            {txState === "success" && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--accent)" }}>
                Hook updated successfully.{" "}
                {txHash && (
                  <a href={`https://explorer.testnet.arc.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--info)" }}>
                    Tx ↗
                  </a>
                )}
              </div>
            )}
            {txState === "error" && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--danger)" }}>Transaction failed. Please try again.</div>
            )}
          </>
        )}
      </div>

      {/* Interface spec */}
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>IERC8183Hook Interface</div>
        <pre style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--info)", margin: 0, overflowX: "auto", lineHeight: 1.6 }}>
{`interface IERC8183Hook {
  function beforeCall(
    bytes32 jobId,
    uint256 providerId,
    address caller,
    uint256 amount
  ) external;

  function afterCall(
    bytes32 jobId,
    bool    success
  ) external;
}`}
        </pre>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-dim)" }}>
          Both hooks are called <strong>best-effort</strong> — the PayPerCall transaction continues even if the hook contract reverts.
          <br />PayPerCall v7.1: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{CONFIG.ppcAddress}</span>
        </div>
      </div>
    </div>
  );
}
