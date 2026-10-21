/* One fail-closed decision before any payment-starting write, plus the durable
   `cg_pending_tx` marker that outlives a single handler.

   Two failure modes motivated this module:

   1. `setPendingTx` can fail after a transaction has already been submitted.
      The hash then exists only in React state, so a second handler that reads
      only storage would see "nothing pending" and pay again. The module keeps
      the hash in memory, marks the marker as untrusted, and blocks every later
      payment attempt in this tab, including programmatic ones.
   2. A transaction can be submitted while another flow (a receipt wait, a
      facilitator request, a batch item) is still running. A module-scoped
      operation lock refuses a second start.

   Limits: `sessionStorage` and this module are per tab. A reload loses the
   in-memory hash; another tab, another browser, cleared storage or a direct
   contract call does not see either marker. No server-side idempotency store
   exists in this build. */

import {
  checkFacilitatorGuard,
  type FacilitatorGuard,
  type GuardFailure,
  type GuardStorage,
} from "./facilitatorGuard";
import { readCctpOperation } from "./cctpOperation";

export const PENDING_TX_KEY = "cg_pending_tx";

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export type PendingReason = "storage-unavailable" | "marker-corrupt";

export type PendingRead =
  | { ok: true; hash: string | null }
  | { ok: false; reason: PendingReason };

/** Accessing `sessionStorage` itself can throw in restricted browser modes. */
function ambientStorage(): GuardStorage | null {
  try {
    return (globalThis as { sessionStorage?: GuardStorage }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Reads the durable marker. An unreadable or malformed value is a failure,
    never "nothing pending". */
export function readPending(storage: GuardStorage | null = ambientStorage()): PendingRead {
  if (!storage) return { ok: false, reason: "storage-unavailable" };
  let raw: string | null;
  try {
    raw = storage.getItem(PENDING_TX_KEY);
  } catch {
    return { ok: false, reason: "storage-unavailable" };
  }
  if (raw === null) return { ok: true, hash: null };
  if (!HASH_RE.test(raw)) return { ok: false, reason: "marker-corrupt" };
  return { ok: true, hash: raw };
}

/** Returns true only when the hash can be read back after writing. */
export function writePending(hash: string, storage: GuardStorage | null = ambientStorage()): boolean {
  if (!storage || !HASH_RE.test(hash)) return false;
  try {
    storage.setItem(PENDING_TX_KEY, hash);
    return storage.getItem(PENDING_TX_KEY) === hash;
  } catch {
    return false;
  }
}

/** Returns true only when the marker is verifiably gone. */
export function clearPending(storage: GuardStorage | null = ambientStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(PENDING_TX_KEY);
    return storage.getItem(PENDING_TX_KEY) === null;
  } catch {
    return false;
  }
}

/* ── in-memory state (same tab, same module instance) ───────────────────── */

type PendingMemory = { hash: string; persisted: boolean };

let pendingState: PendingMemory | null = null;
/* Sticky for the session: a failed marker write means a submitted hash may be
   untracked, so the absence of a stored marker proves nothing. */
let markerUntrusted = false;
let activeOperation: string | null = null;

export type PendingMemoryView =
  | { kind: "none" }
  | { kind: "untracked"; hash: string }
  | { kind: "tracked"; hash: string };

export function pendingMemory(): PendingMemoryView {
  if (markerUntrusted && !pendingState) return { kind: "untracked", hash: "" };
  if (!pendingState) return { kind: "none" };
  return { kind: pendingState.persisted ? "tracked" : "untracked", hash: pendingState.hash };
}

export function markerIsUntrusted(): boolean {
  return markerUntrusted;
}

export function activeOperationLabel(): string | null {
  return activeOperation;
}

/** Reserves the single operation slot. The same label may re-enter, so a nested
    step of the running flow is allowed while any other flow is refused. */
export function beginOperation(label: string): boolean {
  if (activeOperation && activeOperation !== label) return false;
  activeOperation = label;
  return true;
}

export function endOperation(label?: string): void {
  if (label && activeOperation !== label) return;
  activeOperation = null;
}

/** Records a submitted hash in memory first, then tries the durable marker.
    A failed or unverifiable write leaves the attempt blocked. */
export function recordSubmittedTx(
  hash: string,
  storage: GuardStorage | null = ambientStorage(),
): { hash: string; persisted: boolean } {
  const persisted = writePending(hash, storage);
  if (HASH_RE.test(hash)) pendingState = { hash, persisted };
  if (!persisted) markerUntrusted = true;
  return { hash, persisted: persisted && pendingState?.persisted === true };
}

/** Clears both the durable and the in-memory marker. Storage must prove the
    removal; otherwise the attempt stays blocked. */
export function resolvePendingTx(
  storage: GuardStorage | null = ambientStorage(),
): { cleared: boolean } {
  const cleared = clearPending(storage);
  if (cleared) {
    pendingState = null;
    markerUntrusted = false;
  }
  return { cleared };
}

/** Test-only reset of the module-scoped state. */
export function resetPaymentGateState(): void {
  pendingState = null;
  markerUntrusted = false;
  activeOperation = null;
}

/* ── the shared payment-start gate ─────────────────────────────────────── */

export type PaymentBlockCode =
  | "storage-unavailable"
  | "marker-corrupt"
  | "pending-transaction"
  | "pending-marker-untrusted"
  | "operation-in-flight"
  | "cctp-operation-active"
  | "cctp-marker-untrusted"
  | "guard-active"
  | "guard-untrusted";

export type PaymentStartDecision =
  | { ok: true }
  | { ok: false; code: PaymentBlockCode; message: string; guard?: FacilitatorGuard };

const GUARD_FAILURE_CODE: Record<GuardFailure, PaymentBlockCode> = {
  "storage-unavailable": "guard-untrusted",
  "guard-corrupt": "guard-untrusted",
  "write-failed": "guard-untrusted",
  "readback-failed": "guard-untrusted",
  "downgrade-refused": "guard-untrusted",
};

/** The single decision every payment-starting handler makes immediately before
    its first write, and every repeated step of a multi-write flow re-checked. */
export function checkPaymentStart(args: {
  storage: GuardStorage | null;
  /** Omit when the flow has no provider/request identity (claim, receipt). The
      facilitator guard is scoped to that identity and is then not checked. */
  attempt?: { providerId: number; requestHash: string };
  operation: string;
}): PaymentStartDecision {
  if (activeOperation !== null && activeOperation !== args.operation) {
    return {
      ok: false,
      code: "operation-in-flight",
      message: `No payment was started: the "${activeOperation}" payment flow is still running in this tab. Wait for it to finish.`,
    };
  }

  const memory = pendingMemory();
  if (memory.kind === "tracked" || memory.kind === "untracked") {
    return {
      ok: false,
      code: memory.kind === "untracked" ? "pending-marker-untrusted" : "pending-transaction",
      message: memory.kind === "untracked"
        ? `A transaction (${memory.hash || "hash unavailable"}) was submitted but its pending marker could not be saved. It stays blocked in this tab; check the explorer before doing anything else, and expect to lose this warning on reload.`
        : `A transaction (${memory.hash}) is still unresolved in this tab. Check its receipt before sending another.`,
    };
  }

  if (markerUntrusted) {
    return {
      ok: false,
      code: "pending-marker-untrusted",
      message: "An earlier transaction marker could not be saved, so the absence of a marker does not prove that nothing is pending. Check the explorer and clear the local state before another payment.",
    };
  }

  const pending = readPending(args.storage);
  if (!pending.ok) {
    return {
      ok: false,
      code: pending.reason,
      message: pending.reason === "marker-corrupt"
        ? "The saved pending-transaction marker is unreadable, so a duplicate write cannot be ruled out. Clear this site's session storage for the tab after checking the explorer, then re-check."
        : "Session storage is unavailable, so a pending transaction cannot be ruled out. Nothing was started.",
    };
  }
  if (pending.hash) {
    return {
      ok: false,
      code: "pending-transaction",
      message: `A stored transaction (${pending.hash}) has no proven receipt. Check it before sending another.`,
    };
  }

  const cctp = readCctpOperation(args.storage);
  if (!cctp.ok) {
    return {
      ok: false,
      code: "cctp-marker-untrusted",
      message: "The saved cross-chain operation marker is unreadable, so a repeated burn or mint cannot be ruled out. Check the explorer and clear this site's session storage for the tab, then re-check.",
    };
  }
  if (cctp.operation) {
    return {
      ok: false,
      code: "cctp-operation-active",
      message: `A cross-chain operation is unresolved (stage: ${cctp.operation.stage}). It must be resolved before any new payment starts.`,
    };
  }

  if (!args.attempt) return { ok: true };
  if (!args.storage) {
    return {
      ok: false,
      code: "storage-unavailable",
      message: "Session storage is unavailable, so the payment safety marker cannot be read. Nothing was started.",
    };
  }

  const gate = checkFacilitatorGuard(args.storage, args.attempt);
  if (!gate.ok) {
    if (gate.reason === "guard-active") {
      return {
        ok: false,
        code: "guard-active",
        message: "An earlier x402 attempt for this provider and request is unresolved, so payment may already have occurred. Check transaction history and the registry, then explicitly acknowledge the warning before starting another payment.",
        guard: gate.guard,
      };
    }
    return {
      ok: false,
      code: GUARD_FAILURE_CODE[gate.reason],
      message: `The payment safety marker cannot be trusted (${gate.reason}). No payment was started.`,
    };
  }

  return { ok: true };
}
