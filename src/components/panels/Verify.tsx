import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, usePublicClient, useWalletClient, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { keccak256, toBytes } from "viem";
import { arcTestnet, CONFIG, ACTIVE_PPC_ADDRESS, V8_ENABLED, PPC_ABI, PPC_ABI_V8 } from "../../lib/config";
import { formatUsdc } from "../../lib/callCosts";
import { classifyReceipt, classifyVerdict } from "../../lib/txLifecycle";
import { friendlyError } from "../../lib/utils";
import { checkPaymentStart, recordSubmittedTx, resolvePendingTx, beginOperation, endOperation } from "../../lib/paymentGate";
import { ExternalLink, CheckCircle, XCircle, Search, Share2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";



/** Accessing `sessionStorage` itself can throw in restricted browser modes. */
function browserStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 16px", maxWidth: 720, margin: "0 auto" },
  h1: { fontSize: 20, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  card: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius:14, padding: 16, marginBottom: 12 },
  label: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text)", fontWeight: 600, marginBottom: 6, display: "block" },
  input: { width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius:10, padding: "10px 12px", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" as const },
  btn: { background: "var(--accent)", color: "#000", border: "none", borderRadius:999, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
  btnSecondary: { background: "var(--bg-3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius:999, padding: "8px 14px", fontWeight: 600, fontSize: 12, cursor: "pointer" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border)" },
  rowLabel: { fontSize: 12, color: "var(--text)" },
  rowVal: { fontSize: 12, color: "var(--text)", fontWeight: 500, fontFamily: "var(--font-mono)" },
  success: { padding: 16, background: "rgba(25,209,134,.08)", border: "1px solid rgba(25,209,134,.25)", borderRadius: 10 },
  error: { padding: 16, background: "rgba(238,69,57,.08)", border: "1px solid rgba(238,69,57,.25)", borderRadius: 10 },
};

interface VerifyResult {
  ok: boolean;
  kind?: "call" | "transaction";
  status?: string;
  providerId?: number;
  callId?: string;
  responseHash?: string;
  amount?: string;
  timestamp?: number;
  error?: string;
}

function formatAmount(value: unknown): string | undefined {
  if (value == null) return undefined;
  try { return formatUsdc(BigInt(String(value))); } catch { return undefined; }
}

export default function Verify() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { data: walletClient } = useWalletClient();
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [shareLink, setShareLink] = useState("");
  const verifySeq = useRef(0);

  // Read pendingVerify from store (set by Receipts panel "Verify ↗" button)
  const pendingVerify = useAppStore(s => s.pendingVerify);
  const clearPendingVerify = useAppStore(s => s.clearPendingVerify);

  // EIP-712 Receipt Submit (Provider side)
  const [rcpCallId, setRcpCallId] = useState("");
  const [rcpPayload, setRcpPayload] = useState("pong");
  const [rcpStatus, setRcpStatus] = useState<string | null>(null);
  const [rcpTxHash, setRcpTxHash] = useState<`0x${string}` | undefined>();
  const [rcpPendingPersisted, setRcpPendingPersisted] = useState(true);
  const { writeContract: writeReceipt, isPending: rcpPending } = useWriteContract();
  const { data: rcpReceipt, isError: rcpReceiptError } = useWaitForTransactionReceipt({ hash: rcpTxHash, chainId: arcTestnet.id });

  const handleSubmitReceipt = useCallback(async () => {
    const callId = rcpCallId.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(callId)) {
      setRcpStatus("❌ Enter a valid 32-byte call ID (0x + 64 hex chars)");
      return;
    }
    if (!address || !walletClient) {
      setRcpStatus("❌ Connect wallet first");
      return;
    }
    if (rcpPending || (rcpTxHash && !rcpReceipt)) {
      setRcpStatus("❌ A receipt transaction is still unresolved. Check it before submitting another.");
      return;
    }
    try {
      if (walletChainId !== arcTestnet.id) {
        setRcpStatus("⏳ Switching the wallet to Arc Testnet…");
        await switchChainAsync({ chainId: arcTestnet.id });
      }
      setRcpStatus("⏳ Signing EIP-712 receipt...");
      const responseHash = keccak256(toBytes(rcpPayload)) as `0x${string}`;

      if (!publicClient) {
        setRcpStatus("❌ Arc RPC is unavailable. Nothing was submitted.");
        return;
      }
      // v8 receipts are bound to the call's terms version and use domain
      // ArcSLA/2. v7 keeps ArcSLA/1 and the 4-argument submit.
      let termsVersion = 1;
      if (V8_ENABLED) {
        const call = await publicClient.readContract({
          address: ACTIVE_PPC_ADDRESS,
          abi: PPC_ABI_V8,
          functionName: "getCall",
          args: [callId as `0x${string}`],
        });
        termsVersion = Number((call as readonly unknown[])[6] ?? 1);
      }

      const respondedAt = BigInt(Math.floor(Date.now() / 1000));
      let signature: `0x${string}`;
      if (V8_ENABLED) {
        signature = await walletClient.signTypedData({
          domain: { name: "ArcSLA", version: "2", chainId: arcTestnet.id, verifyingContract: ACTIVE_PPC_ADDRESS },
          types: { Receipt: [
            { name: "callId",       type: "bytes32" },
            { name: "responseHash", type: "bytes32" },
            { name: "respondedAt",  type: "uint64"  },
            { name: "termsVersion", type: "uint32"  },
          ] },
          primaryType: "Receipt",
          message: { callId: callId as `0x${string}`, responseHash, respondedAt, termsVersion },
        });
      } else {
        signature = await walletClient.signTypedData({
          domain: { name: "ArcSLA", version: "1", chainId: arcTestnet.id, verifyingContract: ACTIVE_PPC_ADDRESS },
          types: { Receipt: [
            { name: "callId",       type: "bytes32" },
            { name: "responseHash", type: "bytes32" },
            { name: "respondedAt",  type: "uint64"  },
          ] },
          primaryType: "Receipt",
          message: { callId: callId as `0x${string}`, responseHash, respondedAt },
        });
      }

      // Preflight the exact write. A successful simulation is not proof the
      // transaction will succeed, nor that the receipt will be verified.
      setRcpStatus("⏳ Checking whether the receipt can be submitted...");
      try {
        if (V8_ENABLED) {
          await publicClient.simulateContract({
            address: ACTIVE_PPC_ADDRESS,
            abi: PPC_ABI_V8,
            functionName: "submitReceipt",
            args: [callId as `0x${string}`, responseHash, respondedAt, termsVersion, signature],
            account: address as `0x${string}`,
          });
        } else {
          await publicClient.simulateContract({
            address: ACTIVE_PPC_ADDRESS,
            abi: PPC_ABI,
            functionName: "submitReceipt",
            args: [callId as `0x${string}`, responseHash, respondedAt, signature],
            account: address as `0x${string}`,
          });
        }
      } catch (error) {
        setRcpStatus(`❌ The receipt would revert, so nothing was submitted and no gas was spent: ${friendlyError(error)}`);
        return;
      }

      const gate = checkPaymentStart({ storage: browserStorage(), operation: "verify-receipt" });
      if (!gate.ok) {
        setRcpStatus(`❌ No transaction was submitted. ${gate.message}`);
        return;
      }
      if (!beginOperation("verify-receipt")) {
        setRcpStatus("❌ Another payment flow is still running in this tab. Wait for it to finish.");
        return;
      }

      setRcpStatus("⏳ Submitting receipt on-chain...");

      const receiptRequest = V8_ENABLED
        ? {
            address: ACTIVE_PPC_ADDRESS,
            abi: PPC_ABI_V8,
            functionName: "submitReceipt" as const,
            args: [callId as `0x${string}`, responseHash, respondedAt, termsVersion, signature] as const,
            chainId: arcTestnet.id,
          }
        : {
            address: ACTIVE_PPC_ADDRESS,
            abi: PPC_ABI,
            functionName: "submitReceipt" as const,
            args: [callId as `0x${string}`, responseHash, respondedAt, signature] as const,
            chainId: arcTestnet.id,
          };
      writeReceipt(receiptRequest as Parameters<typeof writeReceipt>[0], {
        onSuccess: (h) => {
          const persisted = recordSubmittedTx(h, browserStorage()).persisted;
          setRcpTxHash(h);
          setRcpPendingPersisted(persisted);
          setRcpStatus(persisted
            ? "⏳ Receipt submitted; waiting for confirmation..."
            : "⚠️ Receipt submitted, but the pending marker could not be saved. The hash is shown below; this tab stays blocked and a reload will not remember it. Check the explorer before retrying.");
        },
        onError: (e: unknown) => {
          endOperation("verify-receipt");
          setRcpStatus(`❌ ${friendlyError(e)}`);
        },
      });
    } catch (_err: unknown) {
      endOperation("verify-receipt");
      setRcpStatus(`❌ ${friendlyError(_err)}`);
    }
  }, [rcpCallId, rcpPayload, address, walletClient, walletChainId, switchChainAsync, publicClient, writeReceipt, rcpPending, rcpTxHash, rcpReceipt]);

  useEffect(() => {
    if (!rcpReceipt) return;
    const outcome = classifyReceipt(rcpReceipt.status);
    const cleared = resolvePendingTx(browserStorage()).cleared;
    endOperation("verify-receipt");
    const clearNote = cleared
      ? ""
      : " ⚠️ The local pending marker could not be cleared; fix site storage before another submission.";
    if (outcome === "confirmed") {
      setRcpStatus(`✅ Transaction confirmed. The contract made the escrow claimable by the provider; the receipt does not transfer USDC by itself.${clearNote}`);
      void queryClient.invalidateQueries({ queryKey: ["subgraph"] });
      void queryClient.invalidateQueries({ queryKey: ["recentActivity"] });
      void queryClient.invalidateQueries({ queryKey: ["networkStats"] });
    } else if (outcome === "reverted") {
      setRcpStatus(`❌ The receipt transaction reverted. No state change was applied; check the call status before retrying.${clearNote}`);
    } else {
      setRcpStatus(`⚠️ The receipt has an unrecognised status. Do not resubmit until the explorer shows a result.${clearNote}`);
    }
  }, [rcpReceipt, queryClient]);

  useEffect(() => {
    if (rcpReceiptError) {
      setRcpStatus("⚠️ The transaction was submitted but its receipt could not be read. Check the explorer before retrying; the transaction may still confirm.");
    }
  }, [rcpReceiptError]);

  // Auto-verify from store (set by Receipts "Verify ↗" button — SPA navigation, no page reload)
  useEffect(() => {
    if (pendingVerify) {
      setInput(pendingVerify);
      setResult(null);
      clearPendingVerify();
      setTimeout(() => handleVerify(pendingVerify), 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingVerify]);

  // Auto-verify from URL param (fallback for direct links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("verify");
    if (v) {
      setInput(v);
      setTimeout(() => handleVerify(v), 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerify(overrideInput?: string) {
    const val = (overrideInput || input).trim();
    if (!val) return;
    const seq = ++verifySeq.current;
    setLoading(true);
    setResult(null);
    setShareLink("");

    let apiError: string | undefined;
    try {
      // Try API attestation endpoint first. The endpoint can answer with
      // non-JSON (for example an HTML 404 page) when it is not deployed, so
      // read the body as text and parse it defensively.
      try {
        const r = await fetch(`/api/attestation?callId=${encodeURIComponent(val)}`);
        const text = await r.text();
        let d: { ok?: boolean; verdict?: string; status?: string; providerId?: number; amount?: number; error?: string } | null = null;
        try { d = JSON.parse(text); } catch { d = null; }
        if (seq !== verifySeq.current) return;

        if (d) {
          apiError = d.error;
          if (d.ok) {
            const verdict = classifyVerdict(d.verdict || d.status);
            // The API also answers for a transaction hash, with UNKNOWN. Let the
            // transaction-receipt fallback below inspect that case instead.
            if (verdict.status !== "UNKNOWN") {
              setResult({
                ok: verdict.ok,
                kind: "call",
                status: verdict.status,
                providerId: d.providerId,
                callId: val,
                amount: formatAmount(d.amount),
                error: verdict.message,
              });
              if (verdict.ok) setShareLink(`${window.location.origin}/app?verify=${encodeURIComponent(val)}`);
              return;
            }
          }
        }
      } catch {
        // API unreachable or returned an unreadable body; fall back to on-chain reads.
      }

      // Fallback: try onchain RPC read
      if (publicClient && val.startsWith("0x") && val.length === 66) {
        try {
          const data = await publicClient.readContract({
            address: CONFIG.ppcAddress as `0x${string}`,
            abi: PPC_ABI,
            functionName: "getCall",
            args: [val as `0x${string}`],
          }) as unknown as Record<string | number, unknown>;
          if (seq !== verifySeq.current) return;
          const provId = data?.providerId ?? data?.[0];
          const amt    = data?.amount     ?? data?.[2];
          const st     = data?.status     ?? data?.[7];

          if (provId !== undefined && Number(provId) > 0) {
            // getCall() returns [providerId, caller, amount, startedAt, deadline, requestHash, responseHash, status]
            // CallStatus: 0=None, 1=Pending, 2=Completed, 3=Slashed (see PayPerCall.sol)
            const status = ["NONE","PENDING","COMPLETED","SLASHED"][Number(st)] || "UNKNOWN";
            if (status !== "NONE" && status !== "UNKNOWN") {
              const verdict = classifyVerdict(status);
              setResult({
                ok: verdict.ok,
                kind: "call",
                status: verdict.status,
                providerId: Number(provId),
                callId: val,
                amount: formatAmount(amt),
                error: verdict.message,
              });
              if (verdict.ok) setShareLink(`${window.location.origin}/app?verify=${encodeURIComponent(val)}`);
              return;
            }
          }
        } catch { /* not a call id */ }
      }

      // Fallback: TX hash lookup. A successful transaction is not a receipt verdict.
      if (publicClient && val.startsWith("0x") && val.length === 66) {
        try {
          const receipt = await publicClient.getTransactionReceipt({ hash: val as `0x${string}` });
          if (seq !== verifySeq.current) return;
          if (receipt) {
            const ok = receipt.status === "success";
            setResult({
              ok,
              kind: "transaction",
              status: ok ? "TX_SUCCESS" : "TX_FAILED",
              callId: val,
              error: ok ? undefined : "The transaction reverted on-chain. No state change was applied.",
            });
            return;
          }
        } catch { /* transaction receipt lookup failed */ }
      }

      setResult({ ok: false, error: apiError || "No verified receipt was found on-chain for that call ID or transaction hash." });
    } catch (_err: unknown) {
      if (seq === verifySeq.current) {
        setResult({ ok: false, error: (_err instanceof Error ? _err.message : String(_err)) });
      }
    } finally {
      if (seq === verifySeq.current) setLoading(false);
    }
  }

  function copyShareLink() {
    if (shareLink) navigator.clipboard?.writeText(shareLink).catch(() => {});
  }

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 16 }}>
        <div style={s.h1}>Verify Receipt</div>
        <div style={s.sub}>Enter a call ID or TX hash to verify on-chain. No wallet required.</div>
      </div>

      <div style={s.card}>
        <label style={s.label} htmlFor="vf-input">Call ID or Transaction Hash</label>
        <div style={{ display: "flex", gap: 8, marginBottom: result ? 16 : 0 }}>
          <input
            id="vf-input"
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
          <div role={result.ok ? "status" : "alert"} aria-live="polite" style={result.ok ? s.success : s.error}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {result.ok ? <CheckCircle size={18} color="var(--accent)" /> : <XCircle size={18} color="var(--danger)" />}
              <span style={{ fontWeight: 700, fontSize: 14, color: result.ok ? "var(--accent-ink)" : "var(--danger)" }}>
                {result.kind === "transaction"
                  ? (result.ok ? "Transaction Confirmed" : "Transaction Failed")
                  : (result.ok ? "Receipt Verified" : "Verification Failed")}
              </span>
            </div>

            {result.ok ? (
              <div style={{ display: "grid", gap: 4 }}>
                {[
                  [result.kind === "transaction" ? "Transaction" : "Call ID", result.callId ? result.callId.slice(0, 22) + "..." : "—"],
                  ["Status", result.status || "unknown"],
                  ...(result.kind === "transaction" ? [] : [["Provider", result.providerId ? `#${result.providerId}` : "—"]]),
                  ...(result.amount ? [["Amount", `${result.amount} USDC`]] : []),
                  ["Chain", "Arc Testnet"],
                ].map(([k, v]) => (
                  <div key={k} style={s.row}>
                    <span style={s.rowLabel}>{k}</span>
                    <span style={{ ...s.rowVal, color: k === "Status" ? "var(--accent-ink)" : "var(--text)" }}>{v}</span>
                  </div>
                ))}
                {result.kind === "transaction" && (
                  <p style={{ fontSize: 12, color: "var(--text)", margin: "8px 0 0" }}>
                    This confirms the transaction only. It does not prove a provider receipt or a completed call.
                  </p>
                )}
              </div>
            ) : (
              <div role="alert" style={{ fontSize: 13, color: "var(--text)" }}>{result.error}</div>
            )}

            {(shareLink || (result.kind === "transaction" && result.callId)) && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                {shareLink && (
                  <>
                    <input
                      readOnly
                      value={shareLink}
                      aria-label="Share link"
                      style={{ ...s.input, flex: 1, fontSize: 11 }}
                    />
                    <button type="button" style={s.btnSecondary} onClick={copyShareLink} aria-label="Copy share link">
                      <Share2 size={12} />
                    </button>
                  </>
                )}
                {result.kind === "transaction" && result.callId && (
                  <a href={CONFIG.explorerTx(result.callId as `0x${string}`)} target="_blank" rel="noopener noreferrer" style={s.btnSecondary} aria-label="View transaction on explorer">
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* EIP-712 Provider Receipt Submit */}
      <div style={s.card}>
        <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text)", fontWeight: 600, marginBottom: 12 }}>
          Submit Receipt (Provider) — EIP-712
        </div>
        <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 12 }}>
          Providers use this to sign and submit a receipt on-chain. A confirmed receipt makes escrow claimable; it does not transfer USDC by itself.
        </div>
        <label style={s.label} htmlFor="vf-rcp-callid">Call ID</label>
        <input
          id="vf-rcp-callid"
          style={{ ...s.input, marginBottom: 10 }}
          value={rcpCallId}
          onChange={e => setRcpCallId(e.target.value)}
          placeholder="0x... (32-byte call ID)"
        />
        <label style={s.label} htmlFor="vf-rcp-payload">Response payload</label>
        <input
          id="vf-rcp-payload"
          style={{ ...s.input, marginBottom: 12 }}
          value={rcpPayload}
          onChange={e => setRcpPayload(e.target.value)}
          placeholder='pong or {"status":"ok"}'
        />
        <button
          type="button"
          style={{ ...s.btn, width: "100%", justifyContent: "center", opacity: rcpPending || !address || (!!rcpTxHash && !rcpReceipt) ? 0.6 : 1 }}
          onClick={handleSubmitReceipt}
          disabled={rcpPending || !address || (!!rcpTxHash && !rcpReceipt)}
        >
          {rcpPending ? "Processing…" : "Sign & Submit Receipt →"}
        </button>
        {rcpStatus && (
          <div
            role={rcpStatus.startsWith("❌") || rcpStatus.startsWith("⚠️") ? "alert" : "status"}
            aria-live="polite"
            style={{
              marginTop: 10, fontSize: 12, fontFamily: "var(--font-mono)",
              color: rcpStatus.startsWith("✅") ? "var(--accent-ink)" : rcpStatus.startsWith("❌") ? "var(--danger)" : "var(--text)",
              padding: "7px 10px", background: "var(--bg-3)", borderRadius: 10,
            }}
          >
            {rcpStatus}
            {rcpTxHash && (
              <>
                {" "}<code style={{ userSelect: "all", overflowWrap: "anywhere" }}>{rcpTxHash}</code>
                <a href={CONFIG.explorerTx(rcpTxHash)} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)", marginLeft: 8 }}>View tx ↗</a>
              </>
            )}
            {rcpTxHash && !rcpPendingPersisted && (
              <p role="alert" style={{ margin: "6px 0 0", color: "var(--danger)" }}>
                The hash is shown from memory: the pending marker could not be saved, so a reload will not remember it.
                Check the explorer before retrying.
              </p>
            )}
          </div>
        )}
      </div>

      {/* How to get a call ID */}
      <div style={s.card}>
        <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text)", fontWeight: 600, marginBottom: 12 }}>
          How to get a call ID
        </div>
        {[
          ["From History panel", "Open History → copy any Call ID from the table"],
          ["From TX hash", "Paste a TX hash to see whether that transaction succeeded; it does not prove a receipt"],
          ["From URL param", `Add ?verify=0x... to an app URL — auto-verifies on load`],
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
        <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text)", fontWeight: 600, marginBottom: 8 }}>
          Batch Verify (API)
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
          Verify multiple call IDs programmatically via the REST API:
        </div>
        <pre style={{ background: "var(--bg-3)", borderRadius:10, padding: "10px 12px", fontSize: 11, color: "var(--accent-ink)", overflowX: "auto" as const, margin: 0 }}>
{`curl https://arcsla.vercel.app/api/attestation\\
  ?callId=0x1234...&type=call`}
        </pre>
      </div>
    </div>
  );
}
