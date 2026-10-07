import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchProviders, fetchNetworkStats, fetchRecentActivity } from "../lib/subgraph";
import { CONFIG } from "../lib/config";

interface SubgraphOptions {
  pollInterval?: number;   // ms — alias for refetchInterval
  enabled?: boolean;
}

// Generic-typed hook that returns { data, loading, isLoading, refetch, error }
// data is already json.data (unwrapped), typed as T
export function useSubgraph<T = Record<string, unknown>>(
  query: string,
  options?: SubgraphOptions
) {
  const qc = useQueryClient();
  const refetchInterval = options?.pollInterval ?? 15_000;
  const enabled = options?.enabled !== false && !!query;

  const result = useQuery<T>({
    queryKey: ["subgraph", query],
    queryFn: async () => {
      const res = await fetch(CONFIG.subgraphUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (json.errors?.length) {
        console.warn("[subgraph] query errors:", json.errors);
      }
      return (json.data ?? {}) as T;
    },
    refetchInterval,
    staleTime: Math.max(refetchInterval - 5_000, 5_000),
    enabled,
  });

  return {
    ...result,
    // alias isLoading → loading for backward-compat
    loading: result.isLoading,
    // wrap refetch so callers can do refetch() or refetch(e) without TS errors
    refetch: () => result.refetch(),
  };
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
