/**
 * UnifiedBalance
 *
 * Circle Gateway Unified Balance panel.
 * Shows the connected wallet's USDC balance across all chains in a single view.
 *
 * @circle-fin/unified-balance-kit (no Kit Key required)
 */

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { RefreshCw } from "lucide-react";
import { Button, EmptyState, PageHeader, Stat } from "../ui";
import {
  KeyValue, Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit,
  SignalRow, StatusNotice,
} from "./panel/PanelUi";

interface ChainBalance {
  chain?: { id?: number; name?: string };
  balance?: string;
}

interface UnifiedBalanceData {
  total?: string;
  chains?: ChainBalance[];
}

export default function UnifiedBalance() {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<UnifiedBalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/unified-balance?address=${address}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Unknown error");
      setData(json.balances);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [address]);

  const sourceState = !isConnected ? "idle" : error ? "unavailable" : data ? "live" : "idle";
  const sourceValue = !isConnected
    ? "wallet not connected"
    : error
      ? "request failed"
      : data
        ? "balance loaded"
        : loading
          ? "fetching"
          : "not fetched";

  return (
    <PanelShell>
      <PageHeader
        title="Unified Balance"
        subtitle="USDC across all chains — one balance."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchBalance}
            disabled={loading || !isConnected}
            loading={loading}
            leftIcon={<RefreshCw size={14} />}
          >
            {loading ? "Loading…" : "Fetch"}
          </Button>
        }
      />

      <PanelSource
        label="Circle Gateway"
        value={sourceValue}
        hint="No Kit Key required"
        state={sourceState}
      />

      {!isConnected && (
        <EmptyState
          title="Connect your wallet"
          description="Connect your wallet to see your unified Gateway balance."
        />
      )}

      {isConnected && error && (
        <StatusNotice tone="danger" title="Couldn't load unified balance">
          {error}
        </StatusNotice>
      )}

      {isConnected && loading && !data && (
        <SignalRow label="Unified balance">
          <Stat label="Total Unified Balance" value="—" hint="Loading…" />
        </SignalRow>
      )}

      {isConnected && data && (
        <>
          <SignalRow label="Unified balance">
            <Stat
              label="Total Unified Balance"
              value={data.total ? `${parseFloat(data.total).toFixed(2)} USDC` : "—"}
              hint={data.total ? "Across all supported chains" : "Unavailable"}
            />
          </SignalRow>

          {data.chains && data.chains.length > 0 && (
            <PanelSplit
              main={
                <Ledger label="Chain Breakdown">
                  {data.chains.map((c, i) => (
                    <LedgerRow
                      key={i}
                      lead={c.chain?.name ?? `Chain ${c.chain?.id ?? i}`}
                      meta={c.chain?.id != null ? `Chain ID ${c.chain.id}` : undefined}
                      trailing={
                        <span className="pg-mono">
                          {c.balance ? `${parseFloat(c.balance).toFixed(6)} USDC` : "0 USDC"}
                        </span>
                      }
                    />
                  ))}
                </Ledger>
              }
              rail={
                <KeyValue
                  label="Source"
                  rows={[
                    { label: "Provider", value: "Circle Gateway" },
                    { label: "Endpoint", value: "/api/unified-balance", mono: true },
                    { label: "Total precision", value: "2 decimals", mono: true },
                    { label: "Chain precision", value: "6 decimals", mono: true },
                    { label: "Kit Key", value: "Not required" },
                  ]}
                />
              }
            />
          )}
        </>
      )}

      {isConnected && !data && !loading && !error && (
        <EmptyState
          title="No balance loaded"
          description={'Press "Fetch" to see your balance across chains.'}
        />
      )}

      <p className="pg-footnote">Circle Gateway — combined cross-chain USDC balance. No Kit Key required.</p>
    </PanelShell>
  );
}
