import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { Info } from "lucide-react";
import type { PublicClient } from "viem";
import { arcTestnet } from "../lib/config";

type Props = {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  enabled?: boolean;
};

type EstimateArgs = Parameters<PublicClient["estimateContractGas"]>[0];

// Arc's native gas token is USDC (18-decimal wei). MetaMask cannot render a
// human-readable fee for it, so it shows "Network fee: Unavailable" on every
// tx (circlefin/arc-node#188). We surface an accurate USDC estimate in-app so
// the wallet warning is not alarming and the user can confirm with confidence.
function fmtUsdc(wei: bigint): string {
  const usd = Number(wei) / 1e18;
  if (usd === 0) return "0";
  if (usd < 0.000001) return usd.toExponential(2);
  return usd.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export default function ArcFeeNotice({ address, abi, functionName, args, enabled = true }: Props) {
  const { address: account } = useAccount();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const [feeUsd, setFeeUsd] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const argsKey = args
    .map(a => (typeof a === "bigint" ? a.toString() : Array.isArray(a) ? a.join(",") : String(a)))
    .join("|");

  useEffect(() => {
    if (!enabled || !publicClient || !account) { setFeeUsd(null); setErr(false); return; }
    let alive = true;
    Promise.all([
      publicClient.estimateContractGas({ address, abi, functionName, args, account } as unknown as EstimateArgs),
      publicClient.getGasPrice(),
    ])
      .then(([gas, price]) => {
        if (!alive) return;
        setFeeUsd(fmtUsdc(gas * price));
        setErr(false);
      })
      .catch(() => { if (alive) { setFeeUsd(null); setErr(true); } });
    return () => { alive = false; };
    // argsKey is a stable hash of `args`; depending on `args`/`abi` directly would
    // re-run the estimate on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, publicClient, account, address, functionName, argsKey]);

  if (!enabled) return null;

  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10,
      background: "rgba(31,119,239,0.08)", border: "1px solid rgba(31,119,239,0.2)",
      borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "var(--info)",
    }}>
      <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>
        {err
          ? "Network fee estimate unavailable for this transaction."
          : feeUsd
            ? <>Estimated network fee: <b>~{feeUsd} USDC</b>. </>
            : <>Estimating network fee… </>}
        Arc pays gas in <b>USDC</b>, so MetaMask shows “Network fee: Unavailable” — that is expected and your transaction still goes through.
      </span>
    </div>
  );
}
