import { CONFIG } from "./config";

export interface Provider {
  id: number;
  owner: string;
  signer: string;
  stake: string;
  pricePerCall: string;
  maxResponseTime: number;
  slashBps: number;
  active: boolean;
  completedCalls: number;
  slashedCalls: number;
  reputation: number;
  endpoint: string;
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

async function gql(query: string) {
  const res = await fetch(CONFIG.subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Subgraph error: ${res.status}`);
  const { data } = await res.json();
  return data;
}

export async function fetchProviders(): Promise<Provider[]> {
  const data = await gql(`{
    providers(first: 100, orderBy: completedCalls, orderDirection: desc) {
      id owner signer stake pricePerCall maxResponseTime slashBps
      active completedCalls slashedCalls endpoint
    }
  }`);
  return (data.providers ?? []).map((p: Record<string, string>) => {
    const completed = Number(p.completedCalls ?? 0);
    const slashed = Number(p.slashedCalls ?? 0);
    const total = completed + slashed;
    const reputation = total > 0
      ? Math.round((completed + 2) / (total + 3) * 100)
      : 66;
    return { ...p, id: Number(p.id), completedCalls: completed, slashedCalls: slashed,
      maxResponseTime: Number(p.maxResponseTime), slashBps: Number(p.slashBps), reputation };
  });
}

export async function fetchNetworkStats(): Promise<NetworkStats> {
  const data = await gql(`{
    providers(first: 1000) { id completedCalls slashedCalls pricePerCall }
  }`);
  const ps = data.providers ?? [];
  const totalCalls = ps.reduce((s: number, p: Record<string, string>) => s + Number(p.completedCalls ?? 0) + Number(p.slashedCalls ?? 0), 0);
  const totalSlashes = ps.reduce((s: number, p: Record<string, string>) => s + Number(p.slashedCalls ?? 0), 0);
  const honorRate = totalCalls > 0 ? Math.round((totalCalls - totalSlashes) / totalCalls * 100) : 100;
  const prices = ps.filter((p: Record<string, string>) => Number(p.pricePerCall) > 0).map((p: Record<string, string>) => Number(p.pricePerCall));
  const avgPrice = prices.length > 0
    ? (prices.reduce((a: number, b: number) => a + b, 0) / prices.length / 1e6).toFixed(2)
    : "0.00";
  return { providerCount: ps.length, totalCalls, totalSlashes, honorRate, avgPrice };
}

export async function fetchRecentActivity(limit = 20): Promise<CallEvent[]> {
  const data = await gql(`{
    callStarteds(first: ${limit}, orderBy: blockTimestamp, orderDirection: desc) {
      id callId providerId caller amount blockTimestamp transactionHash
    }
  }`);
  return (data.callStarteds ?? []).map((e: Record<string, string>) => ({
    id: e.id,
    type: "CallStarted" as const,
    callId: e.callId,
    providerId: Number(e.providerId),
    caller: e.caller,
    amount: e.amount,
    timestamp: Number(e.blockTimestamp),
    txHash: e.transactionHash,
  }));
}
