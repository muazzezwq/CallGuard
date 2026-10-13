/**
 * UnifiedBalance
 *
 * Circle Gateway Unified Balance paneli.
 * Bağlı cüzdanın tüm zincirlerdeki USDC bakiyesini tek bir görünümde gösterir.
 *
 * @circle-fin/unified-balance-kit (Kit Key gerektirmez)
 */

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";

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

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-xs text-zinc-500 text-center">Cüzdan bağlayın — Unified Balance görmek için</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
            UB
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Gateway Unified Balance</h3>
            <p className="text-xs text-zinc-400">Tüm zincirlerde USDC — tek bakiye</p>
          </div>
        </div>
        <button
          onClick={fetchBalance}
          disabled={loading}
          className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-white transition-colors"
        >
          {loading ? "Yükleniyor..." : "Getir"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-3">
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4 flex items-center justify-between">
            <span className="text-sm text-zinc-300">Toplam Unified Balance</span>
            <span className="text-lg font-bold text-white">
              {data.total ? `${parseFloat(data.total).toFixed(2)} USDC` : "—"}
            </span>
          </div>

          {data.chains && data.chains.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 font-medium">Zincir Dağılımı</p>
              {data.chains.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-xs text-zinc-400">
                    {c.chain?.name ?? `Chain ${c.chain?.id ?? i}`}
                  </span>
                  <span className="text-xs text-white font-mono">
                    {c.balance ? `${parseFloat(c.balance).toFixed(6)} USDC` : "0 USDC"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!data && !loading && !error && (
        <p className="text-xs text-zinc-500 text-center py-2">
          "Getir" butonuna basarak bakiyenizi görün.
        </p>
      )}

      <div className="border-t border-white/5 pt-3">
        <p className="text-xs text-zinc-500">
          Circle Gateway — cross-chain USDC birleşik bakiye. Kit Key gerektirmez.
        </p>
      </div>
    </div>
  );
}
