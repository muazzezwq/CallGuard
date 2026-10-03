import { useQuery } from "@tanstack/react-query";
import { fetchProviders, fetchNetworkStats, fetchRecentActivity } from "../lib/subgraph";
import { CONFIG } from "../lib/config";

export function useSubgraph(query: string, variables?: Record<string, unknown>) {
  return useQuery({
    queryKey: ["subgraph", query, variables],
    queryFn: async () => {
      const res = await fetch(CONFIG.subgraphUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      const json = await res.json();
      return json.data ?? {};
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: fetchProviders,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useNetworkStats() {
  return useQuery({
    queryKey: ["networkStats"],
    queryFn: fetchNetworkStats,
    refetchInterval: 20_000,
    staleTime: 15_000,
  });
}

export function useRecentActivity(limit = 20) {
  return useQuery({
    queryKey: ["recentActivity", limit],
    queryFn: () => fetchRecentActivity(limit),
    refetchInterval: 8_000,
    staleTime: 5_000,
  });
}
