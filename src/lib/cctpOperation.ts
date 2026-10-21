/* Durable marker for a multi-write CCTP operation (approve → burn → attest → mint).

   A single `cg_pending_tx` hash cannot describe the whole operation: after the
   approval confirms, the pending marker is resolved while the burn has not
   started yet. This marker records the stage, so a retry after an unknown
   receipt is refused instead of re-approving, re-burning or re-minting.

   The marker is written and read back before every write. It is removed only
   for a proven outcome of the whole operation, or for a stage that provably did
   nothing (a reverted approval, a reverted burn, a reverted mint). An unknown
   receipt, a storage failure or an attestation error keeps it in place. */

import type { GuardStorage } from "./facilitatorGuard";

export const CCTP_OPERATION_KEY = "cg_cctp_operation";

export type CctpStage =
  | "started"
  | "approval-pending"
  | "approval-confirmed"
  | "burn-pending"
  | "burn-confirmed"
  | "mint-pending"
  | "mint-confirmed";

export type CctpOperation = {
  kind: "cctp";
  stage: CctpStage;
  at: number;
  chain: string;
  amount: string;
  approvalHash?: string;
  burnHash?: string;
  mintHash?: string;
};

export type CctpFailure = "storage-unavailable" | "marker-corrupt" | "write-failed" | "readback-failed";

export type CctpRead =
  | { ok: true; operation: CctpOperation | null }
  | { ok: false; reason: CctpFailure };

export type CctpWrite =
  | { ok: true; operation: CctpOperation }
  | { ok: false; reason: CctpFailure };

export type CctpClear =
  | { ok: true }
  | { ok: false; reason: CctpFailure };

const STAGES: readonly CctpStage[] = [
  "started",
  "approval-pending",
  "approval-confirmed",
  "burn-pending",
  "burn-confirmed",
  "mint-pending",
  "mint-confirmed",
];

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/* Every transition the builder may make. Anything else is refused, so a later
   write cannot move the operation backwards or skip a stage. */
const ALLOWED: Record<CctpStage, readonly CctpStage[]> = {
  "started": ["approval-pending", "burn-pending"],
  "approval-pending": ["approval-confirmed", "approval-pending"],
  "approval-confirmed": ["burn-pending"],
  "burn-pending": ["burn-confirmed", "burn-pending"],
  "burn-confirmed": ["mint-pending"],
  "mint-pending": ["mint-confirmed", "mint-pending"],
  "mint-confirmed": [],
};

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH_RE.test(value);
}

function normalize(value: unknown): CctpOperation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CctpOperation>;
  if (raw.kind !== "cctp") return null;
  if (typeof raw.stage !== "string" || !STAGES.includes(raw.stage as CctpStage)) return null;
  if (typeof raw.at !== "number" || !Number.isFinite(raw.at)) return null;
  if (typeof raw.chain !== "string" || raw.chain.length === 0) return null;
  if (typeof raw.amount !== "string" || !/^[0-9]+$/.test(raw.amount)) return null;
  for (const field of ["approvalHash", "burnHash", "mintHash"] as const) {
    if (raw[field] !== undefined && !isHash(raw[field])) return null;
  }
  return {
    kind: "cctp",
    stage: raw.stage as CctpStage,
    at: raw.at,
    chain: raw.chain,
    amount: raw.amount,
    ...(raw.approvalHash === undefined ? {} : { approvalHash: raw.approvalHash }),
    ...(raw.burnHash === undefined ? {} : { burnHash: raw.burnHash }),
    ...(raw.mintHash === undefined ? {} : { mintHash: raw.mintHash }),
  };
}

function persist(storage: GuardStorage, operation: CctpOperation | null): CctpFailure | null {
  try {
    if (operation === null) storage.removeItem(CCTP_OPERATION_KEY);
    else storage.setItem(CCTP_OPERATION_KEY, JSON.stringify(operation));
  } catch {
    return "write-failed";
  }
  let stored: string | null;
  try {
    stored = storage.getItem(CCTP_OPERATION_KEY);
  } catch {
    return "readback-failed";
  }
  if (operation === null) return stored === null ? null : "readback-failed";
  /* Byte equality, not just a parseable value: a store that silently rewrites
     the marker is not proof that the intended stage is durable. */
  if (stored !== JSON.stringify(operation)) return "readback-failed";
  return null;
}

/** Reads the operation marker. A malformed value is a failure, never "none". */
export function readCctpOperation(storage: GuardStorage | null): CctpRead {
  if (!storage) return { ok: false, reason: "storage-unavailable" };
  let raw: string | null;
  try {
    raw = storage.getItem(CCTP_OPERATION_KEY);
  } catch {
    return { ok: false, reason: "storage-unavailable" };
  }
  if (raw === null) return { ok: true, operation: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "marker-corrupt" };
  }
  const operation = normalize(parsed);
  if (!operation) return { ok: false, reason: "marker-corrupt" };
  return { ok: true, operation };
}

/** Starts the operation. Refuses when another operation is already recorded. */
export function startCctpOperation(
  storage: GuardStorage | null,
  meta: { chain: string; amount: string },
): CctpWrite {
  if (!storage) return { ok: false, reason: "storage-unavailable" };
  const existing = readCctpOperation(storage);
  if (!existing.ok) return { ok: false, reason: existing.reason };
  if (existing.operation) return { ok: false, reason: "write-failed" };

  const operation: CctpOperation = {
    kind: "cctp",
    stage: "started",
    at: Date.now(),
    chain: meta.chain,
    amount: meta.amount,
  };
  const failure = persist(storage, operation);
  return failure ? { ok: false, reason: failure } : { ok: true, operation };
}

/** Moves the operation forward. Existing hashes are never dropped, and a stage
    that is not reachable from the current one is refused. */
export function updateCctpOperation(
  storage: GuardStorage | null,
  patch: { stage: CctpStage; approvalHash?: string; burnHash?: string; mintHash?: string },
): CctpWrite {
  if (!storage) return { ok: false, reason: "storage-unavailable" };
  const existing = readCctpOperation(storage);
  if (!existing.ok) return { ok: false, reason: existing.reason };
  if (!existing.operation) return { ok: false, reason: "marker-corrupt" };

  const current = existing.operation;
  if (!ALLOWED[current.stage].includes(patch.stage)) return { ok: false, reason: "write-failed" };

  const next: CctpOperation = {
    ...current,
    stage: patch.stage,
    at: Date.now(),
    approvalHash: patch.approvalHash ?? current.approvalHash,
    burnHash: patch.burnHash ?? current.burnHash,
    mintHash: patch.mintHash ?? current.mintHash,
  };
  const failure = persist(storage, next);
  return failure ? { ok: false, reason: failure } : { ok: true, operation: next };
}

/** Removes the marker and proves the removal. */
export function clearCctpOperation(storage: GuardStorage | null): CctpClear {
  if (!storage) return { ok: false, reason: "storage-unavailable" };
  const failure = persist(storage, null);
  return failure ? { ok: false, reason: failure } : { ok: true };
}

/* ── stage outcome rules (pure) ────────────────────────────────────────── */

export type StageReceipt = "confirmed" | "reverted" | "unknown";

export type StageDecision =
  /** Proceed. `clearOperation` is true only when the whole operation is done or
      provably did nothing. */
  | { action: "advance"; next: CctpStage | null; clearOperation: boolean; message: string }
  /** Stop and keep the operation blocked. */
  | { action: "stop"; next: null; clearOperation: false; message: string }
  /** Provably did nothing at this stage; the operation may be cleared. */
  | { action: "fail"; next: null; clearOperation: true; message: string };

/** Decides what a receipt means for the stage that produced it. A hash is not a
    result: only `confirmed` advances, `reverted` closes the stage, and anything
    else keeps the operation blocked for manual recovery. */
export function cctpStageDecision(stage: CctpStage, receipt: StageReceipt): StageDecision {
  if (receipt === "unknown") {
    return {
      action: "stop",
      next: null,
      clearOperation: false,
      message: `The ${stage.replace("-pending", "")} transaction was submitted but its receipt could not be read. The cross-chain operation stays blocked; check the explorer for the hash before doing anything else.`,
    };
  }

  if (receipt === "reverted") {
    if (stage === "approval-pending") {
      return { action: "fail", next: null, clearOperation: true, message: "The USDC approval reverted on the source chain, so nothing was burned." };
    }
    if (stage === "burn-pending") {
      return { action: "fail", next: null, clearOperation: true, message: "The burn reverted on the source chain, so no USDC left the source chain." };
    }
    if (stage === "mint-pending") {
      /* The source burn is already confirmed. A reverted mint proves this mint
         transaction minted nothing, but the burned USDC is still in flight.
         Clearing the marker would allow a second burn, so keep it blocked for
         a manual mint retry. */
      return { action: "stop", next: null, clearOperation: false, message: "The mint reverted on Arc, so no USDC was minted by this transaction. The source burn is already confirmed, so the operation stays blocked; do not burn again." };
    }
    return {
      action: "stop", next: null, clearOperation: false,
      message: "A transaction reverted before the operation could advance. The marker stays; check the explorer.",
    };
  }

  switch (stage) {
    case "approval-pending":
      return { action: "advance", next: "approval-confirmed", clearOperation: false, message: "Approval confirmed on the source chain." };
    case "burn-pending":
      return { action: "advance", next: "burn-confirmed", clearOperation: false, message: "Burn confirmed on the source chain." };
    case "mint-pending":
      return { action: "advance", next: "mint-confirmed", clearOperation: true, message: "Mint confirmed on Arc." };
    default:
      return {
        action: "stop", next: null, clearOperation: false,
        message: `No transition is defined from stage ${stage}; the operation stays blocked.`,
      };
  }
}
