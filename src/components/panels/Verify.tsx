import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, usePublicClient, useWalletClient, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { keccak256, toBytes } from "viem";
import { decodeEvidence, EVIDENCE_MODES, EVIDENCE_KINDS, EVIDENCE_KIND_NAMES, type EvidenceRecord } from "../../lib/verification/evidenceRecord";
import { arcTestnet, CONFIG, ACTIVE_PPC_ADDRESS, V8_ENABLED, PPC_ABI, PPC_ABI_V8, PPC_ABI_V8_ACTIVE, SLA_PROVENANCE_ADDRESS, SLA_PROVENANCE_ENABLED, SLA_PROVENANCE_ABI, SLA_EVIDENCE_ADDRESS, SLA_EVIDENCE_ENABLED, SLA_EVIDENCE_ABI, SLA_EVIDENCE_V2_ADDRESS, SLA_EVIDENCE_V2_ENABLED, SLA_EVIDENCE_ABI_V2 } from "../../lib/config";
import { formatUsdc } from "../../lib/callCosts";
import { classifyReceipt, classifyVerdict } from "../../lib/txLifecycle";
import { friendlyError } from "../../lib/utils";
import { parseCallIdInput } from "../../lib/deepLink";
import { buildPayloadEvidence, checkPayloadAgainstCommitment, type PayloadCheck } from "../../lib/responseProof";
import { checkPaymentStart, recordSubmittedTx, resolvePendingTx, beginOperation, endOperation } from "../../lib/paymentGate";
import { ExternalLink, CheckCircle, XCircle, Search, Share2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import zkExecutionFixture from "../../lib/verification/fixtures/zk-execution.json";



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

/** A decoded registry row plus the panel's presentation fields. */
type RegistryRow = EvidenceRecord & { label: string; mode: number };

/** What `/api/evidence` answered for one (callId, kind): the envelope's words
 *  and the hash comparison, mirrored — never a truth verdict. A third value,
 *  `"mirror-unreachable"`, marks a fetch that threw: not an answer, and not the
 *  same as an envelope the endpoint chose not to bundle. */
interface StatementCheck {
  statement: string;
  assumptions: string[];
  match: boolean | null;
  note: string | null;
}

/** Field names in positional order for each `Evidence` layout: a viem decode can
 *  hand back named fields or numeric positions, and both must work. */
const EVIDENCE_FIELD_NAMES = [
  ["kind", "claimHash", "responseHash", "verifier", "anchoredAt"],
  ["kind", "claimHash", "responseHash", "statementHash", "assumptionHash", "verifier", "anchoredAt"],
] as const;

function structWords(rec: Record<string | number, unknown>, width: 5 | 7): string[] {
  const names = EVIDENCE_FIELD_NAMES[width === 5 ? 0 : 1];
  return Array.from({ length: width }, (_, i) =>
    String(rec[names[i]] ?? rec?.[i] ?? "0x0"));
}

/** The dedupe/lookup key for one claim: (callId, kind, claimHash), with kind
 *  carried by the row's unique label. The endpoint mirror is keyed the same way. */
function registryKey(row: Pick<RegistryRow, "label" | "claimHash">): string {
  return `${row.label}|${row.claimHash.toLowerCase()}`;
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
  // One request per call id at a time. React StrictMode runs an effect twice in
  // development, and a shareable link must not become two attestation requests.
  const verifyInFlight = useRef<string | null>(null);

  // B3a — response binding. The receipt commits to `responseHash`, but nothing
  // checked that the body the caller received hashes to it. The caller can now
  // do that locally, and a mismatch becomes objective dispute evidence.
  const [payloadInput, setPayloadInput] = useState("");
  const [payloadCheck, setPayloadCheck] = useState<PayloadCheck | null>(null);
  const [committedHash, setCommittedHash] = useState<string | null>(null);

  // B3b — attested provenance. The local hash check proves the body was not
  // swapped after delivery; a record here proves an allowlisted key saw those
  // bytes and signed the observation. Still not a proof that the answer is
  // correct, and the card says so.
  const [provenance, setProvenance] = useState<{
    payloadHash: string; attestor: string; originHash: string; observedAt: number; recordedAt: number;
  } | null>(null);
  const [provenanceOnChain, setProvenanceOnChain] = useState<boolean | null>(null);

  // B3c — anchored evidence registry row state. Statement checks for v2 rows
  // are keyed the same way rows are deduped: `(label, claimHash)`. The anchored
  // hash is never taken from the mirror — the registry row is the trust root.
  const [evidence, setEvidence] = useState<RegistryRow[] | null>(null);
  const [statementChecks, setStatementChecks] = useState<Record<string, StatementCheck | "mirror-unreachable" | null>>({});
  useEffect(() => {
    setEvidence(null);
    setStatementChecks({});
    if ((!SLA_EVIDENCE_ENABLED && !SLA_EVIDENCE_V2_ENABLED) || result?.kind !== "call" || !result.callId || !publicClient) return;
    const callId = result.callId as `0x${string}`;
    let alive = true;
    (async () => {
      // Width matters: v1's Evidence is five static words, v2's seven. The
      // positional layout is the only discriminator a decoder can use.
      const sources = [
        ...(SLA_EVIDENCE_ENABLED
          ? [{ source: "v1" as const, address: SLA_EVIDENCE_ADDRESS, abi: SLA_EVIDENCE_ABI, width: 5 as const }]
          : []),
        ...(SLA_EVIDENCE_V2_ENABLED
          ? [{ source: "v2" as const, address: SLA_EVIDENCE_V2_ADDRESS, abi: SLA_EVIDENCE_ABI_V2, width: 7 as const }]
          : []),
      ].sort((a, b) => (a.source === "v2" ? -1 : b.source === "v2" ? 1 : 0));
      const found: RegistryRow[] = [];
      const seen = new Set<string>();
      for (const cfg of sources) {
        const hits = await Promise.all(EVIDENCE_KINDS.map(async ({ label, kind }) => {
          try {
            const rec = (await publicClient.readContract({
              address: cfg.address,
              abi: cfg.abi,
              functionName: "getEvidence",
              args: [callId, kind],
            })) as unknown as Record<string | number, unknown>;
            const decoded = decodeEvidence(structWords(rec, cfg.width));
            // anchoredAt == 0 (or a zero claimHash) means the registry holds no
            // claim of this kind, not an error.
            if (!decoded || decoded.anchoredAt === 0 || /^0x0{64}$/.test(decoded.claimHash)) return null;
            const mode = Number(
              (await publicClient.readContract({
                address: cfg.address,
                abi: cfg.abi,
                functionName: "modeOf",
                args: [kind],
              })) as unknown as number,
            );
            return { label, ...decoded, mode };
          } catch { /* unreadable kind: say nothing rather than guess */ return null; }
        }));
        for (const hit of hits) {
          if (!hit) continue;
          const key = registryKey(hit);
          // Same (callId, kind, claimHash) from both registries: keep the v2
          // row, which carries statement/assumption digests too.
          if (!seen.has(key)) { seen.add(key); found.push(hit); }
        }
      }
      if (alive) setEvidence(found.sort((a, b) => a.anchoredAt - b.anchoredAt));
    })();
    return () => { alive = false; };
  }, [result, publicClient]);

  // Statement text. `/api/evidence` mirrors the envelope for kinds it bundles and
  // compares the four hashes against what v2 anchored; the card renders that
  // copy verbatim and a MATCH/MISMATCH computed from it. The registry row, read
  // above, stays the source of the anchored claim hash shown next to it.
  useEffect(() => {
    if (!evidence || evidence.length === 0 || !result?.callId) return;
    const callId = result.callId as `0x${string}`;
    let alive = true;
    (async () => {
      await Promise.all(evidence.filter(r => r.source === "v2").map(async row => {
        const kindName = EVIDENCE_KIND_NAMES.get(row.label) ?? row.label;
        try {
          const r = await fetch(`/api/evidence?callId=${encodeURIComponent(callId)}&kind=${encodeURIComponent(kindName)}`);
          const text = await r.text();
          let d: {
            envelope?: { claim?: { statement?: string; assumptions?: string[] } } | null;
            match?: boolean; note?: string | null;
          } | null = null;
          try { d = JSON.parse(text); } catch { d = null; }
          // The endpoint returns JSON payload next to 404 when it has nothing to
          // show; the payloads are data either way.
          if (!alive) return;
          const statement = d?.envelope?.claim?.statement;
          setStatementChecks(prev => ({
            ...prev,
            [registryKey(row)]: statement !== undefined
              ? { statement, assumptions: d?.envelope?.claim?.assumptions ?? [], match: !!d?.match, note: d?.note ?? null }
              : null,
          }));
        } catch {
          if (alive) {
            // The mirror is unreachable: not the same thing as nothing anchored,
            // and not an answer the endpoint gave. Its own sentence below.
            setStatementChecks(prev => ({ ...prev, [registryKey(row)]: "mirror-unreachable" }));
          }
        }
      }));
    })();
    return () => { alive = false; };
  }, [evidence, result?.callId]);

  useEffect(() => {
    setPayloadCheck(null);
    setCommittedHash(result?.responseHash ?? null);
    if (!result || result.kind !== "call" || !result.callId || result.responseHash || !publicClient) return;
    let alive = true;
    (async () => {
      try {
        const data = await publicClient.readContract({
          address: ACTIVE_PPC_ADDRESS,
          abi: PPC_ABI_V8_ACTIVE,
          functionName: "getCall",
          args: [result.callId as `0x${string}`],
        }) as unknown as Record<string | number, unknown>;
        // v8 keeps responseHash at index 9 (after completedAt/termsVersion/termsHash);
        // the v7 layout keeps it at 6.
        const hash = data?.responseHash ?? data?.[V8_ENABLED ? 9 : 6];
        if (alive && typeof hash === "string") setCommittedHash(hash);
      } catch { /* leave the commitment unknown; the card says so */ }
    })();
    return () => { alive = false; };
  }, [result, publicClient]);

  useEffect(() => {
    setProvenance(null);
    setProvenanceOnChain(null);
    if (!SLA_PROVENANCE_ENABLED || result?.kind !== "call" || !result.callId || !publicClient) return;
    const callId = result.callId as `0x${string}`;
    let alive = true;
    (async () => {
      try {
        const rec = await publicClient.readContract({
          address: SLA_PROVENANCE_ADDRESS,
          abi: SLA_PROVENANCE_ABI,
          functionName: "getProvenance",
          args: [callId],
        }) as unknown as Record<string | number, unknown>;
        const payloadHash = (rec?.payloadHash ?? rec?.[0]) as string | undefined;
        const attestor = (rec?.attestor ?? rec?.[1]) as string | undefined;
        const originHash = (rec?.originHash ?? rec?.[2]) as string | undefined;
        const observedAt = Number(rec?.observedAt ?? rec?.[3] ?? 0);
        const recordedAt = Number(rec?.recordedAt ?? rec?.[4] ?? 0);
        // recordedAt == 0 means the registry has no record for this call.
        if (!alive || !payloadHash || !attestor || recordedAt === 0) return;
        setProvenance({ payloadHash, attestor, originHash: originHash ?? "", observedAt, recordedAt });
      } catch { /* registry unreachable; the card states that instead of guessing */ }
    })();
    return () => { alive = false; };
  }, [result, publicClient]);

  // The meaningful question is not "did an attestor sign something" but "did an
  // attestor sign the payload the provider committed to", so ask the contract
  // with the committed hash rather than with the recorded one.
  useEffect(() => {
    if (!provenance || !committedHash || !publicClient || !SLA_PROVENANCE_ENABLED) return;
    if (!/^0x[0-9a-fA-F]{64}$/.test(committedHash)) return;
    if (!result?.callId) return;
    const callId = result.callId as `0x${string}`;
    let alive = true;
    (async () => {
      try {
        const ok = await publicClient.readContract({
          address: SLA_PROVENANCE_ADDRESS,
          abi: SLA_PROVENANCE_ABI,
          functionName: "verifyProvenance",
          args: [callId, committedHash as `0x${string}`],
        }) as boolean;
        if (alive) setProvenanceOnChain(ok);
      } catch { /* leave unknown; the card does not claim a match */ }
    })();
    return () => { alive = false; };
  }, [provenance, committedHash, publicClient, result]);

  // Read pendingVerify from store (set by Receipts panel "Verify ↗" button)
  const pendingVerify = useAppStore(s => s.pendingVerify);
  const clearPendingVerify = useAppStore(s => s.clearPendingVerify);
  const openDispute = useAppStore(s => s.openDispute);

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

  // Auto-verify from the store: the Receipts "Verify ↗" button and the shell's
  // `?verify=` deep link both arrive here. Single ownership on purpose — a second
  // URL reader in this panel fired one attestation request per reader, so the shell
  // (AppShell.tsx) is the only thing that parses the link.
  useEffect(() => {
    // `""` is a real intent (/?verify= with nothing after it) and must be answered,
    // so only an absent value is ignored.
    if (pendingVerify === null) return;
    const intent = parseCallIdInput(pendingVerify);
    setInput(intent.input);
    setResult(null);
    setShareLink("");
    clearPendingVerify();
    if (!intent.callId) {
      // A malformed link is answered here, before any request leaves the browser.
      setResult({ ok: false, error: intent.error ?? "That is not a call ID." });
      return;
    }
    void handleVerify(intent.callId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingVerify]);

  async function handleVerify(overrideInput?: string) {
    const val = (overrideInput || input).trim();
    if (!val) return;
    if (verifyInFlight.current === val) return;
    verifyInFlight.current = val;
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
            address: ACTIVE_PPC_ADDRESS,
            abi: PPC_ABI_V8_ACTIVE,
            functionName: "getCall",
            args: [val as `0x${string}`],
          }) as unknown as Record<string | number, unknown>;
          if (seq !== verifySeq.current) return;
          const provId = data?.providerId ?? data?.[0];
          const amt    = data?.amount     ?? data?.[2];
          // v8 appends completedAt/termsVersion/termsHash before status, so the
          // positional index moved from 7 to 10. Reading 7 returned a terms hash
          // and the call looked UNKNOWN.
          const st     = data?.status     ?? data?.[V8_ENABLED ? 10 : 7];

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
      if (verifyInFlight.current === val) verifyInFlight.current = null;
      if (seq === verifySeq.current) setLoading(false);
    }
  }

  const checkDeliveredPayload = useCallback(() => {
    setPayloadCheck(checkPayloadAgainstCommitment(payloadInput, committedHash));
  }, [payloadInput, committedHash]);

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

            {/* A verified receipt is the moment a caller learns whether the
                provider actually answered. If the answer is wrong, the next
                step is a dispute, so offer it here instead of making the user
                find the call id again in another panel. */}
            {result.ok && result.kind === "call" && result.callId && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={s.btnSecondary}
                  onClick={() => openDispute(result.callId!, result.providerId ? String(result.providerId) : undefined)}
                >
                  Response wrong? Open a dispute →
                </button>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Disputes need a Completed call and a 2 USDC bond, refunded if the arbiter upholds the claim.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* B3a — is the body the caller received the body the provider committed
          to? keccak256 over the exact bytes answers that; a mismatch is evidence
          an arbiter can check without trusting either party. */}
      {result?.kind === "call" && result.callId && (
        <div style={s.card}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text)", fontWeight: 600, marginBottom: 8 }}>
            Response binding — does the payload match the commitment?
          </div>
          <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 12 }}>
            Paste the body the provider returned. It is hashed locally and compared with the
            on-chain <code>responseHash</code>. Nothing leaves this tab.
          </div>
          <div style={{ ...s.row, borderBottom: "none", paddingTop: 0 }}>
            <span style={s.rowLabel}>Committed hash</span>
            <span style={{ ...s.rowVal, fontSize: 11 }}>
              {committedHash && /^0x[0-9a-fA-F]{64}$/.test(committedHash) && !/^0x0{64}$/i.test(committedHash)
                ? `${committedHash.slice(0, 12)}…${committedHash.slice(-8)}`
                : "not committed yet"}
            </span>
          </div>
          <label style={s.label} htmlFor="vf-payload">Delivered payload</label>
          <textarea
            id="vf-payload"
            rows={4}
            style={{ ...s.input, marginBottom: 10, resize: "vertical" as const }}
            placeholder='{"tempC":21.4,"city":"Istanbul"}'
            value={payloadInput}
            onChange={e => { setPayloadInput(e.target.value); setPayloadCheck(null); }}
          />
          <button
            type="button"
            style={{ ...s.btn, width: "100%", justifyContent: "center", opacity: !payloadInput.trim() || !committedHash ? 0.6 : 1 }}
            onClick={checkDeliveredPayload}
            disabled={!payloadInput.trim() || !committedHash}
          >
            Check payload →
          </button>

          {payloadCheck && (
            <div
              role="status"
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                fontSize: 12,
                background: payloadCheck.status === "match" ? "rgba(25,209,134,.08)" : "rgba(238,69,57,.08)",
                border: `1px solid ${payloadCheck.status === "match" ? "rgba(25,209,134,.25)" : "rgba(238,69,57,.25)"}`,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {payloadCheck.status === "match" && "MATCH — the payload is what the provider committed to"}
                {payloadCheck.status === "mismatch" && "MISMATCH — the delivered body is not the committed response"}
                {payloadCheck.status === "uncommitted" && "NOT COMMITTED — this call has no response hash yet"}
                {payloadCheck.status === "invalid" && "INVALID — the stored response hash is not a 32-byte value"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, wordBreak: "break-all" as const }}>
                computed&nbsp;&nbsp;{payloadCheck.computed}
              </div>
              {payloadCheck.committed && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, wordBreak: "break-all" as const, marginTop: 4 }}>
                  committed&nbsp;{payloadCheck.committed}
                </div>
              )}
              {payloadCheck.status === "mismatch" && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    style={s.btnSecondary}
                    onClick={() => openDispute(
                      result.callId!,
                      result.providerId ? String(result.providerId) : undefined,
                      buildPayloadEvidence({
                        callId: result.callId!,
                        committed: payloadCheck.committed ?? "",
                        payload: payloadInput,
                      }),
                    )}
                  >
                    Open a dispute with this payload →
                  </button>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
                    The evidence URI carries the payload and the committed hash, so the arbiter
                    can recompute the hash instead of trusting either side.
                  </p>
                </div>
              )}
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
                A match proves the body was not swapped after delivery. It does not prove the
                body is a correct answer — that needs attested execution, which CallGuard does not claim.
              </p>
            </div>
          )}
        </div>
      )}

      {/* B3b — provenance. An allowlisted attestor signed an observation of the
          payload. The contract verifies who signed, not that the answer is right;
          the footnote says so rather than letting the badge overclaim. */}
      {SLA_PROVENANCE_ENABLED && result?.kind === "call" && result.callId && (
        <div style={s.card}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text)", fontWeight: 600, marginBottom: 8 }}>
            Attested provenance — who else saw this payload?
          </div>

          {provenance ? (
            <>
              <div style={{ display: "grid", gap: 4 }}>
                {[
                  ["Attestor", `${provenance.attestor.slice(0, 10)}…${provenance.attestor.slice(-6)}`],
                  ["Origin hash", `${provenance.originHash.slice(0, 12)}…${provenance.originHash.slice(-8)}`],
                  ["Observed at", new Date(provenance.observedAt * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC"],
                  ["Recorded at", new Date(provenance.recordedAt * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC"],
                  ["Attested hash", `${provenance.payloadHash.slice(0, 12)}…${provenance.payloadHash.slice(-8)}`],
                ].map(([k, v]) => (
                  <div key={k} style={s.row}>
                    <span style={s.rowLabel}>{k}</span>
                    <span style={s.rowVal}>{v}</span>
                  </div>
                ))}
              </div>
              <a
                href={`https://explorer.testnet.arc.io/address/${provenance.attestor}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8 }}
              >
                Attestor on ArcScan <ExternalLink size={11} />
              </a>
              <div
                role="status"
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 10,
                  fontSize: 12,
                  background: provenanceOnChain === true ? "rgba(25,209,134,.08)" : provenanceOnChain === false ? "rgba(238,69,57,.08)" : "rgba(148,163,184,.08)",
                  border: `1px solid ${provenanceOnChain === true ? "rgba(25,209,134,.25)" : provenanceOnChain === false ? "rgba(238,69,57,.25)" : "rgba(148,163,184,.25)"}`,
                }}
              >
                {provenanceOnChain === true && "MATCH — the attested payload is the committed response"}
                {provenanceOnChain === false && "DIFFERENT — the attested payload is not the committed response"}
                {provenanceOnChain === null && "Comparing the attested hash with the committed one…"}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text)" }}>
              No attestation recorded for this call yet. An allowlisted attestor records one with
              <code> recordProvenance(callId, payloadHash, origin, observedAt, signature)</code>.
            </div>
          )}

          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "10px 0 0" }}>
            The registry checks <em>who</em> signed the observation, not that the payload is a correct
            answer. A single allowlisted key means that key must be trusted — CallGuard does not claim
            attested execution.
          </p>
        </div>
      )}

      {/* B3c — anchored evidence. Each row is a claim of a named kind, plus the address
          that vouched for it. The card never prints "verified" on its own: the tier and
          the mode are what a reader has to weigh. */}
      {(SLA_EVIDENCE_ENABLED || SLA_EVIDENCE_V2_ENABLED) && result?.kind === "call" && result.callId && (
        <div style={s.card}>
          <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text)", fontWeight: 600, marginBottom: 8 }}>
            Anchored evidence — what was proven about this call
          </div>

          {evidence === null && (
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Reading the evidence registry…</div>
          )}

          {evidence !== null && evidence.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text)" }}>
              {SLA_EVIDENCE_ENABLED && SLA_EVIDENCE_V2_ENABLED
                ? "No claim anchored for this call in either evidence registry."
                : SLA_EVIDENCE_V2_ENABLED
                  ? "No claim anchored for this call in the v2 evidence registry."
                  : "No claim anchored for this call in the v1 evidence registry."}
              {" "}A provider or attestor anchors one with
              <code>{SLA_EVIDENCE_V2_ENABLED
                ? " anchor(callId, kind, claimHash, responseHash, statementHash, assumptionHash, proof)"
                : " anchor(callId, kind, claimHash, responseHash, proof)"}</code>; the receipt alone
              proves commitment, not execution.
            </div>
          )}

          {evidence !== null && evidence.map(record => {
            const matches = !!committedHash && record.responseHash.toLowerCase() === committedHash.toLowerCase();
            return (
              <div key={record.claimHash + record.label} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{record.label}</span>
                  <span style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 999, letterSpacing: "0.04em",
                    textTransform: "uppercase" as const,
                    background: record.mode === 2 ? "rgba(25,209,134,.12)" : "rgba(148,163,184,.12)",
                    border: `1px solid ${record.mode === 2 ? "rgba(25,209,134,.3)" : "rgba(148,163,184,.3)"}`,
                  }}>
                    {EVIDENCE_MODES[record.mode] ?? "unknown verifier"}
                  </span>
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  {[
                    ["Claim digest", `${record.claimHash.slice(0, 12)}…${record.claimHash.slice(-8)}`],
                    ["Committed response", `${record.responseHash.slice(0, 12)}…${record.responseHash.slice(-8)}`],
                    // In proof mode the contract checked the proof, so nothing "vouched";
                    // in signature mode a key did, and the label has to say which.
                    [record.mode === 2 ? "Checked by contract" : "Vouched by key",
                      `${record.verifier.slice(0, 10)}…${record.verifier.slice(-6)}`],
                    ["Anchored at", new Date(record.anchoredAt * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC"],
                  ].map(([k, v]) => (
                    <div key={k} style={s.row}>
                      <span style={s.rowLabel}>{k}</span>
                      <span style={s.rowVal}>{v}</span>
                    </div>
                  ))}
                 </div>
                {/* B3e — the claim's words. The endpoint mirror reads v2 and compares
                    the rendered envelope's hashes against the anchored ones, so the
                    badge answers a narrow question: are these the words the chain
                    anchored? It never says the statement is true. */}
                {record.source === "v1" ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                    This row comes from the v1 evidence registry, which predates statement
                    hashing; the anchored record has no digest of what this claim states.
                  </div>
                ) : (() => {
                  const check = statementChecks[registryKey(record)];
                  if (statementChecks[registryKey(record)] === undefined) {
                    return <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Reading the mirrored statement…</div>;
                  }
                  if (check === "mirror-unreachable") {
                    return (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                        The evidence mirror is unreachable, so the statement text cannot be shown
                        here; the digests the chain anchored are what the rows above show.
                      </div>
                    );
                  }
                  // No bundled envelope: the chain holds the digests, the mirror holds no copy.
                  if (!check) {
                    return (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                        This claim is anchored with its statement and assumption digests, but the
                        evidence mirror has no copy of the words, so the statement text cannot be
                        shown or checked here.
                      </div>
                    );
                  }
                  const note = check.note === "rpc-error"
                    ? "the evidence endpoint could not reach the chain, so this copy is unconfirmed"
                    : check.note === "no-registry"
                      ? "no v2 evidence registry is configured for this deployment, so the statement text cannot be checked against the chain"
                      : null;
                  return (
                    <div
                      role="status"
                      style={{
                        marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)",
                        padding: 10, borderRadius: 10, fontSize: 12,
                        background: check.match ? "rgba(25,209,134,.08)" : "rgba(238,69,57,.12)",
                        border: `1px solid ${check.match ? "rgba(25,209,134,.25)" : "rgba(238,69,57,.3)"}`,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        {check.match
                          ? "MATCH — the words you are reading hash to the anchored claim hash"
                          : "MISMATCH — the words you are reading do not hash to the anchored claim hash"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5, marginBottom: 6 }}>
                        {check.statement}
                      </div>
                      {check.assumptions.length > 0 && (
                        <ul style={{ margin: "0 0 6px 16px", padding: 0, fontSize: 11, color: "var(--text)", lineHeight: 1.5 }}>
                          {check.assumptions.map(a => <li key={a}>{a}</li>)}
                        </ul>
                      )}
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, wordBreak: "break-all" as const }}>
                        anchored&nbsp;claim&nbsp;{record.claimHash}
                      </div>
                      {note && (
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>{note}</p>
                      )}
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
                        MATCH means the rendered words hash to the anchor the registry holds — it
                        does not mean the statement is true. With MISMATCH the anchor hash is still
                        shown above: the chain keeps the original digest even when this copy drifted.
                      </p>
                    </div>
                  );
                })()}

                {record.label === "ZK execution proof" && (() => {
                  // The anchor says a verifier accepted a proof; the panel can only say
                  // *which* proof. It prints the committed artifact when the anchor is about
                  // that artifact, and says so plainly when it is not — an anchor is real
                  // whether or not this repository holds the receipt it was made from.
                  const published =
                    record.claimHash.toLowerCase() === zkExecutionFixture.claimHash.toLowerCase() &&
                    record.responseHash.toLowerCase() === zkExecutionFixture.responseHash.toLowerCase();
                  return published ? (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        {[
                          ["Guest image id", `${zkExecutionFixture.imageId.slice(0, 18)}…${zkExecutionFixture.imageId.slice(-8)}`],
                          ["Journal callId", `${zkExecutionFixture.callId.slice(0, 18)}…${zkExecutionFixture.callId.slice(-8)}`],
                          ["Journal requestHash", `${zkExecutionFixture.journal.slice(2 + 64, 2 + 128).slice(0, 16)}…`],
                          ["Journal responseHash", `${zkExecutionFixture.responseHash.slice(0, 18)}…${zkExecutionFixture.responseHash.slice(-8)}`],
                          ["Journal handlerId", `${zkExecutionFixture.handlerId.slice(0, 18)}…${zkExecutionFixture.handlerId.slice(-8)}`],
                          ["Seal", `${zkExecutionFixture.sealBytes} bytes, journal digest ${zkExecutionFixture.journalDigest.slice(0, 12)}…`],
                        ].map(([k, v]) => (
                          <div key={k} style={s.row}>
                            <span style={s.rowLabel}>{k}</span>
                            <span style={s.rowVal}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                        {zkExecutionFixture.statement}. Not a claim that the response is a correct answer —
                        that is what the assumptions name: {zkExecutionFixture.assumptions.join("; ")}.
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
                      This row is a zk-execution claim, but it is not the proof published in this
                      repository; the anchor is real, the artifact is elsewhere.
                    </div>
                  );
                })()}
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: matches ? "rgb(25,209,134)" : "rgb(238,69,57)" }}>
                    {!committedHash
                      ? "Committed response hash unavailable, so the claim cannot be matched"
                      : matches
                        ? "MATCH — the claim is about the committed response"
                        : "DIFFERENT — the claim is about another response"}
                  </span>
                  <a
                    href={`https://explorer.testnet.arc.io/address/${record.verifier}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    Verifier <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            );
          })}

          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "10px 0 0" }}>
            The registry stores a digest, not a verdict. A zk row means a verifier contract accepted a
            proof of a stated output constraint; a TEE row means an allowlisted key vouched for an
            attestation it checked off chain. Neither says the answer is correct.
          </p>
        </div>
      )}

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
