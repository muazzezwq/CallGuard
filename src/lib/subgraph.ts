import { CONFIG } from "./config";

// ── Real Goldsky schema types ────────────────────────────────
export interface Provider {
  id: string;           // BigInt as string (provider numeric id)
  owner: string;        // Bytes (address)
  signer: string;       // Bytes (address)
  stake: string;        // BigInt as string (wei, 6 decimals USDC)
  pricePerCall: string; // BigInt as string
  active: boolean;
  completedCalls: number;
  slashedCalls: number;
  totalSlashed: string;
  createdAt: string;
  updatedAt: string;
  // Computed client-side
  reputation: number;
  // Legacy fields (onchain contract returns these; not in subgraph)
  maxResponseTime?: number;
  slashBps?: number;
  endpoint?: string;
}

export interface SubgraphCall {
  id: string;           // bytes32 callId
  providerId: string;
  caller: string;
  amount: string;
  requestHash: string;
  responseHash: string;
  status: "STARTED" | "COMPLETED" | "SLASHED" | "TIMEOUT" | string;
  refunded: string;
  slashed: string;
  createdAt: string;
  completedAt: string;
}

export interface CallEvent {
  id: string;
  type: "CallStarted" | "ReceiptSubmitted" | "CallSlashed";
  callId: string;
  providerId: number;
  caller: string;
  amount: string;
  timestamp: number;
  txHash: string;
}

export interface NetworkStats {
  providerCount: number;
  totalCalls: number;
  totalSlashes: number;
  honorRate: number;
  avgPrice: string;
}

// ── GraphQL helper ───────────────────────────────────────────
async function gql(query: string) {
  const res = await fetch(CONFIG.subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Subgraph HTTP error: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) console.warn("[subgraph]", json.errors[0]?.message);
  return json.data ?? {};
}

// ── Providers ────────────────────────────────────────────────
export async function fetchProviders(): Promise<Provider[]> {
  const data = await gql(`{
    providers(first:100, orderBy:completedCalls, orderDirection:desc) {
      id owner signer stake pricePerCall active
      completedCalls slashedCalls totalSlashed
      createdAt updatedAt
    }
  }`);
  return (data.providers ?? []).map((p: Record<string, unknown>) => {
    const completed = Number(p.completedCalls ?? 0);
    const slashed   = Number(p.slashedCalls ?? 0);
    const total     = completed + slashed;
    // MEDIUM-05: clean formula — 100% for new providers, completed/total otherwise
    const reputation = total > 0
      ? Math.round(completed / total * 100) : 100;
    return {
      id:           String(p.id),
      owner:        String(p.owner ?? ""),
      signer:       String(p.signer ?? ""),
      stake:        String(p.stake ?? "0"),
      pricePerCall: String(p.pricePerCall ?? "0"),
      active:       Boolean(p.active),
      completedCalls: completed,
      slashedCalls:   slashed,
      totalSlashed: String(p.totalSlashed ?? "0"),
      createdAt:    String(p.createdAt ?? "0"),
      updatedAt:    String(p.updatedAt ?? "0"),
      reputation,
    };
  });
}

// ── Network stats (derived from providers + calls) ───────────
export async function fetchNetworkStats(): Promise<NetworkStats> {
  const data = await gql(`{
    providers(first:1000) {
      id completedCalls slashedCalls pricePerCall active
    }
  }`);
  const ps: Record<string, unknown>[] = data.providers ?? [];
  const totalCompleted = ps.reduce((s, p) => s + Number(p.completedCalls ?? 0), 0);
  const totalSlashes   = ps.reduce((s, p) => s + Number(p.slashedCalls  ?? 0), 0);
  const totalCalls     = totalCompleted + totalSlashes;
  const honorRate      = totalCalls > 0
    ? Math.round(totalCompleted / totalCalls * 100) : 100;
  const prices = ps
    .filter(p => Number(p.pricePerCall) > 0)
    .map(p => Number(p.pricePerCall));
  const avgPrice = prices.length > 0
    ? (prices.reduce((a, b) => a + b, 0) / prices.length / 1e6).toFixed(4)
    : "0.0000";
  return {
    providerCount: ps.length,
    totalCalls,
    totalSlashes,
    honorRate,
    avgPrice,
  };
}

// ── Recent activity (from calls entity) ─────────────────────
export async function fetchRecentActivity(limit = 20): Promise<CallEvent[]> {
  const data = await gql(`{
    calls(first:${limit}, orderBy:createdAt, orderDirection:desc) {
      id providerId caller amount status createdAt
    }
  }`);
  return (data.calls ?? []).map((c: Record<string, unknown>) => ({
    id:         String(c.id),
    type:       c.status === "SLASHED" ? "CallSlashed" as const
              : c.status === "COMPLETED" ? "ReceiptSubmitted" as const
              : "CallStarted" as const,
    callId:     String(c.id),
    providerId: Number(c.providerId ?? 0),
    caller:     String(c.caller ?? ""),
    amount:     String(c.amount ?? "0"),
    timestamp:  Number(c.createdAt ?? 0),
    txHash:     "",
  }));
}
