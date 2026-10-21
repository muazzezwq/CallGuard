import { callStatusLabel, usdcAmount } from "../../lib/activity";

const DAY = 86400;

export type StatusTone = "guard" | "slash" | "pending" | "info" | "neutral";

const STATUS_TONE: Record<string, StatusTone> = {
  COMPLETED: "guard",
  SLASHED: "slash",
  REFUNDED: "pending",
  STARTED: "info",
  OPEN: "info",
  PENDING: "pending",
};

export function statusMeta(status?: string): { label: string; tone: StatusTone } {
  const key = String(status ?? "").trim().toUpperCase();
  return {
    label: callStatusLabel(key),
    tone: STATUS_TONE[key] ?? "neutral",
  };
}

export function relTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (!Number.isFinite(diff) || diff < 0) return "—";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

export function shortId(id: string, head = 10, tail = 6): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}

const COUNT_FMT = new Intl.NumberFormat("en-US");

export function formatCount(value: number | bigint): string {
  return COUNT_FMT.format(value);
}

/** Format a 6-decimal USDC integer without losing precision. Keeps at least
 *  two fractional digits and trims only trailing zeros beyond that. */
export function formatUsdc(raw: unknown): string | null {
  const value = usdcAmount(raw);
  if (value === null) return null;
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  const digits = trimmed.length >= 2 ? trimmed : trimmed.padEnd(2, "0");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${digits}`;
}

/** An actual refresh time, never a fabricated "live" label. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAbsolute(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "Timestamp unavailable";
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}
