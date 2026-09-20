import { useQuery } from "@tanstack/react-query";
import { fetchProviders, fetchNetworkStats, fetchRecentActivity } from "../lib/subgraph";

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
