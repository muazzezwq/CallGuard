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
import { PageHeader, SectionCard, StatCard, Button, EmptyState, Skeleton } from "../ui";
import { RefreshCw } from "lucide-react";

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

  return (
    <div className="ov-page">
      <PageHeader
        title="Unified Balance"
        subtitle="USDC across all chains — one balance."
        actions={
          <Button variant="secondary" size="sm" onClick={fetchBalance} disabled={loading || !isConnected}>
            <RefreshCw size={14} /> {loading ? "Loading…" : "Fetch"}
          </Button>
        }
      />

      {!isConnected && (
        <SectionCard>
          <EmptyState
            title="Connect your wallet"
            description="Connect your wallet to see your unified Gateway balance."
          />
        </SectionCard>
      )}

      {isConnected && error && (
        <SectionCard>
          <div className="ub-error">{error}</div>
        </SectionCard>
      )}

      {isConnected && loading && !data && (
        <div className="ov-grid4">
          <StatCard label="Total Unified Balance" value="—" loading />
        </div>
      )}

      {isConnected && data && (
        <>
          <div className="ov-grid4">
            <StatCard
              label="Total Unified Balance"
              value={data.total ? `${parseFloat(data.total).toFixed(2)} USDC` : "—"}
              unavailable={!data.total}
            />
          </div>

          {data.chains && data.chains.length > 0 && (
            <SectionCard title="Chain Breakdown" bodyClass="ui-section__body--flush">
              <ul className="ov-health">
                {data.chains.map((c, i) => (
                  <li key={i} className="ov-health__row">
                    <span className="ov-health__name">{c.chain?.name ?? `Chain ${c.chain?.id ?? i}`}</span>
                    <span className="mono ub-amount">
                      {c.balance ? `${parseFloat(c.balance).toFixed(6)} USDC` : "0 USDC"}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </>
      )}

      {isConnected && !data && !loading && !error && (
        <SectionCard>
          <EmptyState
            title="No balance loaded"
            description={'Press "Fetch" to see your balance across chains.'}
          />
        </SectionCard>
      )}

      <SectionCard>
        <p className="ub-note">Circle Gateway — combined cross-chain USDC balance. No Kit Key required.</p>
      </SectionCard>
    </div>
  );
}
