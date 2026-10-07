import { useState, useEffect, useCallback } from "react";
import { useAccount, usePublicClient, useWalletClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toBytes } from "viem";
// MEDIUM-09: PPC_ABI from config already includes submitReceipt with correct respondedAt
import { CONFIG, PPC_ABI } from "../../lib/config";
import { ExternalLink, CheckCircle, XCircle, Search, Share2 } from "lucide-react";

// Alias for readability — same as PPC_ABI
const SUBMIT_RECEIPT_ABI = PPC_ABI;

const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 16px", maxWidth: 720, margin: "0 auto" },
  h1: { fontSize: 20, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  card: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 12 },
  label: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 6, display: "block" },
  input: { width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" as const },
  btn: { background: "var(--accent)", color: "#000", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
  btnSecondary: { background: "var(--bg-3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontWeight: 600, fontSize: 12, cursor: "pointer" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" },
  rowLabel: { fontSize: 12, color: "var(--text-dim)" },
  rowVal: { fontSize: 12, color: "var(--text)", fontWeight: 500, fontFamily: "var(--font-mono)" },
  success: { padding: 16, background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)", borderRadius: 10 },
  error: { padding: 16, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 10 },
};

interface VerifyResult {
  ok: boolean;
  status?: string;
  providerId?: number;
  callId?: string;
  responseHash?: string;
  amount?: string;
  timestamp?: number;
  error?: string;
}

export default function Verify() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [shareLink, setShareLink] = useState("");

  // EIP-712 Receipt Submit (Provider side)
  const [rcpCallId, setRcpCallId] = useState("");
  const [rcpPayload, setRcpPayload] = useState("pong");
  const [rcpStatus, setRcpStatus] = useState<string | null>(null);
  const [rcpTxHash, setRcpTxHash] = useState<`0x${string}` | undefined>();
  const { writeContract: writeReceipt, isPending: rcpPending } = useWriteContract();
  const { isSuccess: rcpSuccess } = useWaitForTransactionReceipt({ hash: rcpTxHash });

  const handleSubmitReceipt = useCallback(async () => {
    const callId = rcpCallId.trim();
    if (!callId || callId.length !== 66) {
      setRcpStatus("❌ Enter a valid 32-byte call ID (0x + 64 hex chars)");
      return;
    }
    if (!address || !walletClient) {
      setRcpStatus("❌ Connect wallet first");
      return;
    }
    try {
      setRcpStatus("⏳ Signing EIP-712 receipt...");
      const responseHash = keccak256(toBytes(rcpPayload)) as `0x${string}`;

      // EIP-712 structured signature — matches PayPerCall EIP712("ArcSLA","1")
      const respondedAt = BigInt(Math.floor(Date.now() / 1000));
      const domain = {
        name: "ArcSLA",
        version: "1",
        chainId: CONFIG.chainId,
        verifyingContract: CONFIG.payPerCall as `0x${string}`,
      } as const;
      const types = {
        Receipt: [
          { name: "callId",       type: "bytes32" },
          { name: "responseHash", type: "bytes32" },
          { name: "respondedAt",  type: "uint64"  },
        ],
      } as const;
      const value = { callId: callId as `0x${string}`, responseHash, respondedAt } as const;

      const signature = await walletClient.signTypedData({ domain, types, primaryType: "Receipt", message: value });
      setRcpStatus("⏳ Submitting receipt on-chain...");

      writeReceipt({
        address: CONFIG.payPerCall as `0x${string}`,
        abi: SUBMIT_RECEIPT_ABI,
        functionName: "submitReceipt",
        args: [callId as `0x${string}`, responseHash, respondedAt, signature],
      }, {
        onSuccess: (h) => { setRcpTxHash(h); setRcpStatus("⏳ Waiting for confirmation..."); },
        onError: (e: any) => setRcpStatus(`❌ ${e.shortMessage || (e instanceof Error ? e.message : String(e))}`),
      });
    } catch (_err: unknown) { const e = _err as any;
      setRcpStatus(`❌ ${e.shortMessage || (e instanceof Error ? e.message : String(e))}`);
    }
  }, [rcpCallId, rcpPayload, address, walletClient, writeReceipt]);

  useEffect(() => {
    if (rcpSuccess) setRcpStatus("✅ Receipt submitted — escrow released to provider");
  }, [rcpSuccess]);

  // Auto-verify from URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("verify");
    if (v) {
      setInput(v);
      setTimeout(() => handleVerify(v), 500);
    }
  }, []);

  async function handleVerify(overrideInput?: string) {
    const val = (overrideInput || input).trim();
    if (!val) return;
    setLoading(true);
    setResult(null);

    try {
      // Try API attestation endpoint first
      const r = await fetch(`/api/attestation?callId=${encodeURIComponent(val)}`);
      const d = await r.json();

      if (d.ok) {
        setResult({ ok: true, status: d.status || "VERIFIED", providerId: d.providerId, callId: val });
        setShareLink(`${window.location.origin}/?verify=${encodeURIComponent(val)}`);
        setLoading(false);
        return;
      }

      // Fallback: try onchain RPC read
      if (publicClient && val.startsWith("0x") && val.length === 66) {
        try {
          const data = await publicClient.readContract({
            address: CONFIG.ppcAddress as `0x${string}`,
            abi: PPC_ABI,
            functionName: "calls",
            args: [val as `0x${string}`],
          }) as unknown as any[];

          if (data && data[0]) {
            const status = ["NONE","OPEN","COMPLETED","REFUNDED","CANCELLED"][Number(data[3])] || "UNKNOWN";
            setResult({
              ok: status === "COMPLETED",
              status,
              providerId: Number(data[1]),
              callId: val,
              amount: (Number(data[2]) / 1e6).toFixed(4),
            });
            setShareLink(`${window.location.origin}/?verify=${encodeURIComponent(val)}`);
            setLoading(false);
            return;
          }
        } catch {}
      }

      // Fallback: TX hash lookup
      if (publicClient && val.startsWith("0x") && val.length === 66) {
        try {
          const receipt = await publicClient.getTransactionReceipt({ hash: val as `0x${string}` });
          if (receipt) {
            setResult({ ok: receipt.status === "success", status: receipt.status === "success" ? "TX_SUCCESS" : "TX_FAILED", callId: val });
            setLoading(false);
            return;
          }
        } catch {}
      }

      setResult({ ok: false, error: d.error || "Receipt not found on-chain." });
    } catch (_err: unknown) { const e = _err as any;
      setResult({ ok: false, error: (e instanceof Error ? e.message : String(e)) });
    }
    setLoading(false);
  }

  function copyShareLink() {
    if (shareLink) navigator.clipboard.writeText(shareLink);
  }

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 16 }}>
        <div style={s.h1}>Verify Receipt</div>
        <div style={s.sub}>Enter a call ID or TX hash to verify on-chain. No wallet required.</div>
      </div>

      <div style={s.card}>
        <label style={s.label}>Call ID or Transaction Hash</label>
        <div style={{ display: "flex", gap: 8, marginBottom: result ? 16 : 0 }}>
          <input
            style={{ ...s.input, flex: 1 }}
            placeholder="0x... (call ID, response hash, or TX hash)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleVerify()}
          />
          <button style={s.btn} onClick={() => handleVerify()} disabled={loading}>
            {loading ? (
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
            ) : (
              <Search size={14} />
            )}
            {loading ? "Verifying..." : "Verify →"}
          </button>
        </div>

        {result && (
          <div style={result.ok ? s.success : s.error}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {result.ok ? <CheckCircle size={18} color="var(--accent)" /> : <XCircle size={18} color="#ef4444" />}
              <span style={{ fontWeight: 700, fontSize: 14, color: result.ok ? "var(--accent)" : "#ef4444" }}>
                {result.ok ? "Receipt Verified" : "Verification Failed"}
              </span>
            </div>

            {result.ok ? (
              <div style={{ display: "grid", gap: 4 }}>
                {[
                  ["Call ID", result.callId ? result.callId.slice(0, 22) + "..." : "—"],
                  ["Status", result.status || "Confirmed"],
                  ["Provider", result.providerId ? `#${result.providerId}` : "—"],
                  ...(result.amount ? [["Amount", `${result.amount} USDC`]] : []),
                  ["Chain", "Arc Testnet"],
                ].map(([k, v]) => (
                  <div key={k} style={s.row}>
                    <span style={s.rowLabel}>{k}</span>
                    <span style={{ ...s.rowVal, color: k === "Status" ? "var(--accent)" : "var(--text)" }}>{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{result.error}</div>
            )}

            {shareLink && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  readOnly
                  value={shareLink}
                  style={{ ...s.input, flex: 1, fontSize: 11 }}
                />
                <button style={s.btnSecondary} onClick={copyShareLink}>
                  <Share2 size={12} />
                </button>
                <a href={`https://explorer.testnet.arc.io/tx/${input}`} target="_blank" rel="noopener noreferrer" style={s.btnSecondary}>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* EIP-712 Provider Receipt Submit */}
      <div style={s.card}>
        <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 12 }}>
          Submit Receipt (Provider) — EIP-712
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
          Providers use this to sign and submit a receipt on-chain, releasing escrow payment.
        </div>
        <label style={s.label}>Call ID</label>
        <input
          style={{ ...s.input, marginBottom: 10 }}
          value={rcpCallId}
          onChange={e => setRcpCallId(e.target.value)}
          placeholder="0x... (32-byte call ID)"
        />
        <label style={s.label}>Response payload</label>
        <input
          style={{ ...s.input, marginBottom: 12 }}
          value={rcpPayload}
          onChange={e => setRcpPayload(e.target.value)}
          placeholder='pong or {"status":"ok"}'
        />
        <button
          style={{ ...s.btn, width: "100%", justifyContent: "center", opacity: rcpPending || !address ? 0.6 : 1 }}
          onClick={handleSubmitReceipt}
          disabled={rcpPending || !address}
        >
          {rcpPending ? "Processing…" : "Sign & Submit Receipt →"}
        </button>
        {rcpStatus && (
          <div style={{
            marginTop: 10, fontSize: 12, fontFamily: "var(--font-mono)",
            color: rcpStatus.startsWith("✅") ? "var(--accent)" : rcpStatus.startsWith("❌") ? "#ef4444" : "var(--text-dim)",
            padding: "7px 10px", background: "var(--bg-3)", borderRadius: 6,
          }}>
            {rcpStatus}
            {rcpTxHash && (
              <a href={`https://explorer.testnet.arc.io/tx/${rcpTxHash}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", marginLeft: 8 }}>View tx ↗</a>
            )}
          </div>
        )}
      </div>

      {/* How to get a call ID */}
      <div style={s.card}>
        <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 12 }}>
          How to get a call ID
        </div>
        {[
          ["From History panel", "Open History → copy any Call ID from the table"],
          ["From TX hash", "Paste a TX hash directly — the call is looked up by event logs"],
          ["From URL param", `Add ?verify=0x... to any CallGuard URL — auto-verifies on load`],
          ["From API", "GET /api/attestation?callId=0x... returns full verification JSON"],
        ].map(([title, desc]) => (
          <div key={title} style={{ ...s.row, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>{title}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Batch verify */}
      <div style={s.card}>
        <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 8 }}>
          Batch Verify (API)
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
          Verify multiple call IDs programmatically via the REST API:
        </div>
        <pre style={{ background: "var(--bg-3)", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "var(--accent)", overflowX: "auto" as const, margin: 0 }}>
{`curl https://arcsla.vercel.app/api/attestation\\
  ?callId=0x1234...&type=call`}
        </pre>
      </div>
    </div>
  );
}
