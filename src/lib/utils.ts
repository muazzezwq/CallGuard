import { createWalletClient, createPublicClient, http, keccak256, toHex, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONFIG, ACTIVE_PPC_ADDRESS, V8_ENABLED, PPC_ABI, PPC_ABI_V8 } from "./config";
import { arcTestnet } from "./config";
import {
  readPending,
  pendingMemory,
  markerIsUntrusted,
  type PendingRead as PendingReadResult,
} from "./paymentGate";

// ── friendlyError ─────────────────────────────────────────────────────────
const ERROR_SELECTORS: Record<string, string> = {
  "0x82b42900": "Not authorized.",
  "0x646cf558": "Provider not active.",
  "0x8baa579f": "Invalid signature.",
  "0x48f5c3ed": "Call already settled.",
  "0x1425ea42": "SLA deadline not reached yet.",
  "0x7939f424": "Insufficient stake.",
  "0xf4d678b8": "Insufficient USDC allowance.",
  "0x13be252b": "ERC20: insufficient allowance.",
};

export function friendlyError(e: unknown): string {
  if (!e) return "unknown error";
  const err = e as { code?: number | string; message?: string; reason?: string; shortMessage?: string; data?: string; error?: { data?: string } };
  if (err.code === "ACTION_REJECTED" || err.code === 4001)
    return "Transaction rejected by user.";
  if (err.code === -32002)
    return "MetaMask is already waiting for a response — check the extension.";
  if (err.code === -32603)
    return "RPC error — check your network connection and try again.";
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("insufficient funds") || msg.includes("insufficient balance"))
    return "Insufficient USDC balance. Get test USDC from the faucet.";
  if (msg.includes("gas required exceeds allowance"))
    return "Not enough USDC for gas. Leave a small buffer above the call cost.";
  if (msg.includes("nonce too low"))
    return "Nonce mismatch — reset MetaMask account or wait and retry.";
  const data = err.data ?? err.error?.data;
  if (typeof data === "string" && data.length >= 10) {
    const sel = data.slice(0, 10).toLowerCase();
    if (ERROR_SELECTORS[sel]) return ERROR_SELECTORS[sel];
  }
  if (err.reason) return err.reason;
  if (err.shortMessage) return err.shortMessage.slice(0, 200);
  return (err.message || "transaction reverted").slice(0, 200);
}

// ── errText ───────────────────────────────────────────────────────────────
// viem errors surface a `shortMessage`; fall back to `message`, then stringify.
// Returns "" for null/undefined so callers can append their own fallback.
export function errText(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { shortMessage?: unknown; message?: unknown };
    if (typeof o.shortMessage === "string" && o.shortMessage) return o.shortMessage;
    if (typeof o.message === "string" && o.message) return o.message;
  }
  if (e instanceof Error) return e.message;
  return e == null ? "" : String(e);
}

// ── waitWithFinality ───────────────────────────────────────────────────────
export async function waitWithFinality(
  waitFn: () => Promise<unknown>
): Promise<{ finalityMs: number }> {
  const t0 = Date.now();
  await waitFn();
  return { finalityMs: Date.now() - t0 };
}

// ── short address ──────────────────────────────────────────────────────────
export function shortAddr(addr: string, n = 6): string {
  if (!addr) return "";
  return `${addr.slice(0, n)}…${addr.slice(-4)}`;
}

// ── explorer tx link ──────────────────────────────────────────────────────
export function txLink(hash: string, explorerBase = "https://explorer.testnet.arc.io"): string {
  return `${explorerBase}/tx/${hash}`;
}

// ── format USDC (6 decimals) ──────────────────────────────────────────────
export function formatUsdc(raw: bigint, decimals = 6): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = (raw % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// ── tab title unseen counter ──────────────────────────────────────────────
const TITLE_BASE = "CallGuard · Arc Testnet";
let _unseenCount = 0;

export function bumpUnseen(): void {
  if (!document.hidden) return;
  _unseenCount++;
  document.title = `(${_unseenCount}) ${TITLE_BASE} · New activity`;
}

export function resetUnseen(): void {
  _unseenCount = 0;
  document.title = TITLE_BASE;
}

export function initTabTitleCounter(): () => void {
  const handler = () => { if (!document.hidden) resetUnseen(); };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

// ── auto-receipt (client-side, provider key from sessionStorage) ──────────
// After a successful callService TX, call this to auto-sign + submit the receipt.
// sessionStorage key: cg_ar_key_<providerId>  (private key of provider signer)
export async function tryClientAutoReceipt(
  callId: `0x${string}`,
  providerId: number,
  payload: string,
  toastFn: (opts: { kind: string; title: string; detail?: string }) => void
): Promise<void> {
  const key = sessionStorage.getItem(`cg_ar_key_${providerId}`);
  if (!key) return;
  const autoPayload = payload || sessionStorage.getItem(`cg_ar_payload_${providerId}`) || '{"status":"ok","auto":true}';
  try {
    const account = privateKeyToAccount(key as `0x${string}`);
    const wc = createWalletClient({ account, chain: arcTestnet, transport: http(CONFIG.rpcUrl) });
    const pc = createPublicClient({ chain: arcTestnet, transport: http(CONFIG.rpcUrl) });
    const responseHash = keccak256(toHex(toBytes(autoPayload)));
    let termsVersion = 1;
    if (V8_ENABLED) {
      const call = await pc.readContract({
        address: ACTIVE_PPC_ADDRESS,
        abi: PPC_ABI_V8,
        functionName: "getCall",
        args: [callId],
      });
      termsVersion = Number((call as readonly unknown[])[6] ?? 1);
    }
    const respondedAt = BigInt(Math.floor(Date.now() / 1000));
    toastFn({ kind: "info", title: "⚡ Auto-submitting receipt…" });
    const hash = V8_ENABLED
      ? await wc.writeContract({
          address: ACTIVE_PPC_ADDRESS,
          abi: PPC_ABI_V8,
          functionName: "submitReceipt",
          args: [callId, responseHash as `0x${string}`, respondedAt, termsVersion, await wc.signTypedData({
            account,
            domain: { name: "ArcSLA", version: "2", chainId: CONFIG.chainId, verifyingContract: ACTIVE_PPC_ADDRESS },
            types: { Receipt: [
              { name: "callId",       type: "bytes32" },
              { name: "responseHash", type: "bytes32" },
              { name: "respondedAt",  type: "uint64"  },
              { name: "termsVersion", type: "uint32"  },
            ]},
            primaryType: "Receipt",
            message: { callId, responseHash, respondedAt, termsVersion },
          })],
        })
      : await wc.writeContract({
          address: ACTIVE_PPC_ADDRESS,
          abi: PPC_ABI,
          functionName: "submitReceipt",
          args: [callId, responseHash as `0x${string}`, respondedAt, await wc.signTypedData({
            account,
            domain: { name: "ArcSLA", version: "1", chainId: CONFIG.chainId, verifyingContract: ACTIVE_PPC_ADDRESS },
            types: { Receipt: [
              { name: "callId",       type: "bytes32" },
              { name: "responseHash", type: "bytes32" },
              { name: "respondedAt",  type: "uint64"  },
            ]},
            primaryType: "Receipt",
            message: { callId, responseHash, respondedAt },
          })],
        });
    await pc.waitForTransactionReceipt({ hash });
    toastFn({ kind: "ok", title: "⚡ Receipt auto-submitted", detail: `call ${callId.slice(0, 10)}… · escrow released` });
  } catch (e) {
    const err = e as { reason?: string; message?: string };
    toastFn({ kind: "err", title: "Auto-receipt failed", detail: err.reason ?? err.message?.slice(0, 80) });
  }
}

// ── pending transaction marker ────────────────────────────────────────────
// The marker prevents a duplicate write after a submitted transaction. The
// rules live in `paymentGate.ts`; these wrappers keep the historical names for
// the panels and the tests, and always read the same `cg_pending_tx` key.
export {
  PENDING_TX_KEY,
  readPending as readPendingTx,
  writePending as setPendingTx,
  clearPending as clearPendingTx,
  type PendingRead,
} from "./paymentGate";

export function checkNoPendingTx(
  toastFn: (opts: { kind: string; title: string; detail?: string }) => void
): boolean {
  const memory = pendingMemory();
  if (memory.kind !== "none" || markerIsUntrusted()) {
    toastFn({
      kind: "warn",
      title: "Transaction pending",
      detail: memory.kind === "untracked"
        ? `A submitted transaction (${memory.hash || "hash unavailable"}) could not be saved. Check the explorer before sending another.`
        : "An earlier transaction is still unresolved. Check its receipt before sending another.",
    });
    return false;
  }
  const pending: PendingReadResult = readPending();
  if (!pending.ok) {
    toastFn({
      kind: "error",
      title: "Cannot verify pending transactions",
      detail: "Session storage is unavailable or its marker is unreadable, so a duplicate transaction cannot be ruled out. Nothing was sent.",
    });
    return false;
  }
  if (pending.hash) {
    toastFn({
      kind: "warn",
      title: "Transaction pending",
      detail: `Wait for ${pending.hash.slice(0, 10)}… to confirm before sending another.`,
    });
    return false;
  }
  return true;
}

// ── count-up animation (React-friendly hook version) ─────────────────────
export function countUp(
  el: HTMLElement,
  target: number,
  dur = 800
): void {
  let start = 0;
  const step = target / (dur / 16);
  const t = setInterval(() => {
    start = Math.min(start + step, target);
    el.textContent = Number.isInteger(target)
      ? String(Math.round(start))
      : start.toFixed(1);
    if (start >= target) clearInterval(t);
  }, 16);
}
