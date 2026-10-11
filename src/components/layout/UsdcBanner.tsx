import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { useAppStore } from "../../store/useAppStore";
import { CONFIG, USDC_ABI } from "../../lib/config";
import { useEffect } from "react";

export default function UsdcBanner() {
  const { address, isConnected } = useAccount();
  const { markStep } = useAppStore();

  const { data: bal } = useReadContract({
    address: CONFIG.usdcAddress as `0x${string}`,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15000 },
  });

  const usdc = bal ? Number(formatUnits(bal as bigint, 6)) : null;

  useEffect(() => {
    if (isConnected) markStep("wallet");
    if (usdc !== null && usdc >= 1) markStep("usdc");
  }, [isConnected, usdc]);

  if (!isConnected || usdc === null || usdc >= 1) return null;

  return (
    <div style={{
      margin: "0 16px 12px",
      background: "rgba(245,158,11,0.1)",
      border: "1px solid rgba(245,158,11,0.3)",
      borderRadius: 10,
      padding: "10px 14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap" as const,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#d97706" }}>
            You need USDC to use CallGuard
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            On Arc Testnet, USDC is also the gas token.
          </div>
        </div>
      </div>
      <a
        href="https://faucet.circle.com"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          padding: "6px 14px",
          background: "#d97706",
          color: "#fff",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap" as const,
        }}
      >
        Get test USDC →
      </a>
    </div>
  );
}
