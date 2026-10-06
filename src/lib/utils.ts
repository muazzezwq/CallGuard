/** Shared utilities — ported from original HTML */

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

// ── waitWithFinality ───────────────────────────────────────────────────────
// Returns how many ms Arc took to finalize the tx (sub-second on Arc Testnet)
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
export function txLink(hash: string, explorerBase = "https://testnet.arcscan.app"): string {
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

// ── count-up animation ────────────────────────────────────────────────────
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
