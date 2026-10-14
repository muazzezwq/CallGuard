import { useState } from "react";
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

  if (isMining && txState !== "mining") setTxState("mining");
  if (isSuccess && txState === "mining") {
    setTxState("success");
    toast.success("Pipeline hook guncellendi");
    refetch();
  }

  const isZero = !currentHook || currentHook === "0x0000000000000000000000000000000000000000";

  function handleSet() {
    if (!hookInput || !/^0x[0-9a-fA-F]{40}$/.test(hookInput)) {
      toast.error("Gecerli bir adres girin");
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
            AgenticCommerce job pipeline'ina SLA lifecycle event'leri bildiren hook kontrati.
            Her <code>callService</code> oncesinde <code>beforeCall</code>, kapanisinda <code>afterCall</code> tetiklenir.
          </p>
        </div>
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: isZero ? "rgba(239,68,68,.15)" : "rgba(16,185,129,.15)",
            color: isZero ? "#ef4444" : "#10b981",
            border: `1px solid ${isZero ? "rgba(239,68,68,.3)" : "rgba(16,185,129,.3)"}`,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: isZero ? "#ef4444" : "#10b981", display: "inline-block" }} />
          {isZero ? "Devre disi" : "Aktif"}
        </span>
      </div>

      {/* Current hook address */}
      <div style={{ background: "var(--surface-2, #131c2e)", border: "1px solid var(--border, #1f2d42)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#8899b4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Mevcut Hook Adresi</div>
        <div style={{ fontFamily: "JetBrains Mono, Menlo, monospace", fontSize: 13, color: isZero ? "#8899b4" : "#e8edf5", wordBreak: "break-all" }}>
          {isZero ? "Ayarlanmadi (0x000...000)" : currentHook}
        </div>
        {!isZero && (
          <a
            href={`https://explorer.testnet.arc.io/address/${currentHook}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "#3b82f6", marginTop: 6, display: "inline-block" }}
          >
            ArcScan'da Goruntule ↗
          </a>
        )}
      </div>

      {/* How it works */}
      <div style={{ background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd", marginBottom: 10 }}>Nasil Calisir</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { step: "1", label: "callService() cagrilir", desc: "PayPerCall hook kontratina beforeCall(jobId, providerId, caller, amount) gonderir" },
            { step: "2", label: "SLA suresi isler", desc: "Provider response saglar veya deadline gecer" },
            { step: "3", label: "Cagri kapanir", desc: "submitReceipt veya claimTimeout → afterCall(jobId, success) tetiklenir" },
          ].map(({ step, label, desc }) => (
            <div key={step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(59,130,246,.2)", color: "#93c5fd", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                {step}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e8edf5" }}>{label}</div>
                <div style={{ fontSize: 11, color: "#8899b4", marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Set hook form */}
      <div style={{ background: "var(--surface-2, #131c2e)", border: "1px solid var(--border, #1f2d42)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e8edf5", marginBottom: 12 }}>Hook Adresini Ayarla</div>
        {!isConnected ? (
          <div style={{ fontSize: 13, color: "#8899b4" }}>Bu islemi yapmak icin cuzdaninizi baglayin.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={hookInput}
                onChange={e => setHookInput(e.target.value)}
                placeholder="0x... (IERC8183Hook arayuzunu implement eden kontrat)"
                style={{
                  flex: 1, background: "rgba(255,255,255,.04)", border: "1px solid #1f2d42",
                  borderRadius: 8, padding: "9px 12px", color: "#e8edf5", fontSize: 12,
                  fontFamily: "JetBrains Mono, monospace", outline: "none",
                }}
              />
              <button
                onClick={handleSet}
                disabled={txState === "pending" || txState === "mining"}
                style={{
                  padding: "9px 18px", borderRadius: 8, fontWeight: 600, fontSize: 12,
                  background: "#10b981", color: "#fff", border: "none", cursor: "pointer",
                  opacity: (txState === "pending" || txState === "mining") ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {txState === "pending" ? "Bekliyor..." : txState === "mining" ? "Yaziliyor..." : "Ayarla"}
              </button>
            </div>
            {!isZero && (
              <button
                onClick={handleDisable}
                disabled={txState === "pending" || txState === "mining"}
                style={{
                  padding: "8px 16px", borderRadius: 8, fontWeight: 600, fontSize: 12,
                  background: "rgba(239,68,68,.15)", color: "#ef4444",
                  border: "1px solid rgba(239,68,68,.3)", cursor: "pointer",
                }}
              >
                Hook'u Devre Disi Birak
              </button>
            )}
            {txState === "success" && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#10b981" }}>
                Hook basariyla guncellendi.{" "}
                {txHash && (
                  <a href={`https://explorer.testnet.arc.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6" }}>
                    Tx ↗
                  </a>
                )}
              </div>
            )}
            {txState === "error" && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#ef4444" }}>Islem basarisiz oldu. Lutfen tekrar deneyin.</div>
            )}
          </>
        )}
      </div>

      {/* Interface spec */}
      <div style={{ background: "var(--surface-2, #131c2e)", border: "1px solid var(--border, #1f2d42)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e8edf5", marginBottom: 10 }}>IERC8183Hook Arayuzu</div>
        <pre style={{ fontFamily: "JetBrains Mono, Menlo, monospace", fontSize: 11, color: "#93c5fd", margin: 0, overflowX: "auto", lineHeight: 1.6 }}>
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
        <div style={{ marginTop: 10, fontSize: 11, color: "#8899b4" }}>
          Her iki hook da <strong>best-effort</strong> cagrilir — hook kontrati revert etse bile PayPerCall islemi devam eder.
          <br />PayPerCall v7.1: <span style={{ fontFamily: "monospace", color: "#e8edf5" }}>{CONFIG.ppcAddress}</span>
        </div>
      </div>
    </div>
  );
}
