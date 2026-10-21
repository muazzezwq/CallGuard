import { formatUnits } from "viem";

/* Pure rules shared by the history, requests, receipts and notification
   surfaces. Keeping them here makes the honesty rules testable: a missing
   amount is null (never 0), a call is deduped by its id, and a CSV cell is
   quoted with inner quotes doubled. */

export const USDC_DECIMALS = 6;

/** Exact 6-decimal formatting, or null when the value is absent/unreadable.
 *  Never returns "0" for a missing value. */
export function usdcAmount(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  try {
    return formatUnits(BigInt(String(v)), USDC_DECIMALS);
  } catch {
    return null;
  }
}

/** The formatted amount only when it is strictly positive, else null. Uses a
 *  BigInt comparison so a 6-decimal amount never loses precision. */
export function positiveUsdc(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  try {
    if (BigInt(String(v)) <= 0n) return null;
  } catch {
    return null;
  }
  return usdcAmount(v);
}

type CallLike = { id?: unknown; createdAt?: unknown };

/** Dedupe by call id and order newest-first, ties broken by id.
 *
 *  The subgraph already returns one row per call, but a merge of a refreshed
 *  page with a cached page, or a future event-backed source, can repeat an id.
 *  Rows without an id are kept as-is: collapsing them would hide records.
 *  Sort is stable, so rows with an equal timestamp and no id keep their source
 *  order. */
export function normalizeCalls<T extends CallLike>(rows: T[]): T[] {
  const seen = new Set<string>();
  const kept: Array<{ row: T; index: number }> = [];
  rows.forEach((row, index) => {
    const id = row?.id === null || row?.id === undefined ? "" : String(row.id);
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    kept.push({ row, index });
  });

  const at = (row: T): number => {
    const n = Number(row?.createdAt);
    return Number.isFinite(n) && n > 0 ? n : -1;
  };

  kept.sort((a, b) => {
    const byTime = at(b.row) - at(a.row);
    if (byTime !== 0) return byTime;
    const idA = a.row?.id === undefined || a.row?.id === null ? "" : String(a.row.id);
    const idB = b.row?.id === undefined || b.row?.id === null ? "" : String(b.row.id);
    if (idA !== idB) return idA < idB ? -1 : 1;
    return a.index - b.index;
  });

  return kept.map(k => k.row);
}

/** Keep a page index inside the available pages (0-based). */
export function clampPage(page: number, totalPages: number): number {
  const max = Math.max(0, Math.trunc(totalPages) - 1);
  const n = Number.isFinite(page) ? Math.trunc(page) : 0;
  return Math.min(Math.max(0, n), max);
}

/** Human label for the raw indexer status. `SLASHED` is written by
 *  `CallSlashed`, which `claimTimeout` emits for any timeout claim — the
 *  provider's cut can be zero when `slashBps` is 0, so "Slashed" would overstate
 *  it. The raw enum remains available for exactness. */
export function callStatusLabel(status: unknown): string {
  const s = String(status ?? "").trim().toUpperCase();
  switch (s) {
    case "STARTED": return "Open";
    case "COMPLETED": return "Completed";
    case "SLASHED": return "Timeout claimed";
    case "REFUNDED": return "Refunded";
    default: return s || "Unknown";
  }
}

/** One CSV field: always quoted, inner quotes doubled. Absent values become an
 *  empty field rather than a fabricated number. */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/** `txHash:logIndex:eventType`, the identity that survives reconnects and
 *  repeated log delivery. Null when the log carries no hash. */
export function notificationKey(
  txHash: unknown,
  logIndex: unknown,
  type: string
): string | null {
  const hash = txHash === null || txHash === undefined ? "" : String(txHash).trim();
  if (!hash) return null;
  const idx = logIndex === null || logIndex === undefined ? "" : String(logIndex);
  return `${hash}:${idx}:${type}`;
}

/** Storage is scoped per account so one wallet's alerts are never shown under
 *  another. The legacy global key (`cg_notifs_v2`) is intentionally not
 *  migrated: its entries carry no account, so attributing them to whoever is
 *  connected now would mix wallets. */
export function notificationStoreKey(address?: string | null): string {
  const a = (address ?? "").trim().toLowerCase();
  return a ? `cg_notifs_v3:${a}` : "cg_notifs_v3:anon";
}

export type ActivityNotification = {
  id: string;
  type: "call" | "receipt" | "slash";
  msg: string;
  sub: string;
  ts: number;
  txHash?: string;
  callId?: string;
  caller?: string;
};

/** Validate persisted JSON without trusting it. Unknown types, missing text or
 *  malformed timestamps are dropped; duplicates keep the newest copy. */
export function sanitizeNotifications(raw: unknown): ActivityNotification[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, ActivityNotification>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    const type = n.type;
    if (type !== "call" && type !== "receipt" && type !== "slash") continue;
    const id = typeof n.id === "string" && n.id ? n.id : "";
    if (!id) continue;
    const msg = typeof n.msg === "string" ? n.msg : "";
    if (!msg) continue;
    const ts = Number(n.ts);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const entry: ActivityNotification = {
      id,
      type,
      msg,
      sub: typeof n.sub === "string" ? n.sub : "",
      ts,
    };
    if (typeof n.txHash === "string" && n.txHash) entry.txHash = n.txHash;
    if (typeof n.callId === "string" && n.callId) entry.callId = n.callId;
    if (typeof n.caller === "string" && n.caller) entry.caller = n.caller;
    const previous = byId.get(id);
    if (!previous || previous.ts < ts) byId.set(id, entry);
  }
  return [...byId.values()].sort((a, b) => (b.ts - a.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Newest-first, id-deduped, capped. */
export function mergeNotifications(
  prev: ActivityNotification[],
  incoming: ActivityNotification[],
  cap = 50
): ActivityNotification[] {
  const byId = new Map<string, ActivityNotification>();
  for (const n of [...incoming, ...prev]) {
    const current = byId.get(n.id);
    if (!current || current.ts < n.ts) byId.set(n.id, n);
  }
  return [...byId.values()]
    .sort((a, b) => (b.ts - a.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, cap);
}
