/* Transaction phases the Call Builder can actually prove.
   A wallet response gives a hash; a receipt gives a mined result; nothing here
   turns a hash into success. Copy keeps "submitted", "confirmed" and
   "provider executed" as separate statements. */

export type TxHash = `0x${string}`;

export type TxPhase =
  | { kind: "idle" }
  | { kind: "preparing"; label: string }
  | { kind: "awaiting-signature"; label: string }
  | { kind: "submitted"; hash: TxHash }
  | { kind: "confirmed"; hash: TxHash }
  | { kind: "reverted"; hash: TxHash }
  | { kind: "rejected" }
  | { kind: "failed"; message: string };

const REJECTED_CODES = new Set<number | string>([4001, "ACTION_REJECTED"]);

/** Wallet response -> phase. Rejection is its own state: nothing was submitted. */
export function classifyWalletError(error: unknown): { kind: "rejected" } | { kind: "failed"; message: string } {
  const err = error as { code?: number | string; message?: unknown; shortMessage?: unknown; reason?: unknown } | null;
  if (!err) return { kind: "failed", message: "The wallet did not return a response." };

  if (err.code != null && REJECTED_CODES.has(err.code)) return { kind: "rejected" };

  const text = [err.shortMessage, err.reason, err.message]
    .find((value): value is string => typeof value === "string" && value.length > 0) ?? "";
  if (/user (rejected|denied)|rejected the request|denied transaction/i.test(text)) {
    return { kind: "rejected" };
  }

  if (/insufficient funds|insufficient balance/i.test(text)) {
    return { kind: "failed", message: "Insufficient balance for this transaction. Nothing was charged." };
  }
  if (/nonce|replacement transaction|already known/i.test(text)) {
    return { kind: "failed", message: "The wallet reported a nonce or replacement conflict. Check the wallet activity list before retrying." };
  }
  if (/timeout|timed out|network|fetch failed|rpc/i.test(text)) {
    return { kind: "failed", message: `${text} — the request may not have reached the chain. Check the wallet activity list before retrying.` };
  }

  return { kind: "failed", message: text || "The wallet returned an unknown error." };
}

/** viem receipt status -> whether the transaction itself succeeded. */
export function classifyReceipt(status: "success" | "reverted" | `0x${string}` | unknown): "confirmed" | "reverted" | "unknown" {
  if (status === "success" || status === "0x1") return "confirmed";
  if (status === "reverted" || status === "0x0") return "reverted";
  return "unknown";
}

/** A call verdict is not a transaction status. Only an accepted receipt is honoured. */
export function classifyVerdict(value: unknown): { ok: boolean; status: string; message?: string } {
  const status = typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "UNKNOWN";
  if (status === "HONORED" || status === "COMPLETED") return { ok: true, status };
  if (status === "PENDING") return { ok: false, status, message: "The call is still pending; no receipt has been accepted." };
  if (status === "VIOLATED" || status === "SLASHED") {
    return { ok: false, status, message: `The call verdict is ${status}; no receipt was accepted.` };
  }
  return { ok: false, status, message: `The call verdict is ${status}; no receipt was accepted.` };
}

export type TxTone = "info" | "ok" | "error";

export type TxCopy = { tone: TxTone; text: string; short: string };

/** Status text for the visible region and the screen-reader announcement. */
export function txStatus(phase: TxPhase): TxCopy {
  switch (phase.kind) {
    case "idle":
      return { tone: "info", text: "No transaction has been submitted.", short: "Idle" };
    case "preparing":
      return { tone: "info", text: `${phase.label} — preparing the transaction.`, short: "Preparing" };
    case "awaiting-signature":
      return { tone: "info", text: `${phase.label} — awaiting wallet approval.`, short: "Awaiting wallet" };
    case "submitted":
      return {
        tone: "info",
        text: "Transaction submitted; waiting for confirmation. A hash is not a result yet.",
        short: "Submitted",
      };
    case "confirmed":
      return {
        tone: "ok",
        text: "Transaction confirmed on-chain. That confirms the transaction only, not the provider's response.",
        short: "Confirmed",
      };
    case "reverted":
      return {
        tone: "error",
        text: "Transaction reverted on-chain. The transfer and the state change were rolled back.",
        short: "Reverted",
      };
    case "rejected":
      return {
        tone: "error",
        text: "Wallet approval was rejected. Nothing was submitted.",
        short: "Rejected",
      };
    case "failed":
      return { tone: "error", text: phase.message, short: "Failed" };
  }
}

/** The one guard every write uses. */
export function canSubmit(input: { submitting: boolean; connected: boolean; blockers: readonly string[] }): boolean {
  return !input.submitting && input.connected && input.blockers.length === 0;
}
