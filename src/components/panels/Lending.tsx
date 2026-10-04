import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { arcTestnet, CONFIG, USDC_ABI } from "../../lib/config";
import { TrendingUp, DollarSign, RefreshCw, AlertTriangle } from "lucide-react";

const RL_ADDR = "0xE656dF6512e9d10e555518b7342fd8c81c42B8c0" as `0x${string}`;

const RL_ABI = [
  { name: "deposit",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "withdraw",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "shares", type: "uint256" }], outputs: [] },
  { name: "borrow",    type: "function", stateMutability: "nonpayable", inputs: [{ name: "providerId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "repay",     type: "function", stateMutability: "nonpayable", inputs: [{ name: "loanId", type: "uint256" }], outputs: [] },
  { name: "loanCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "loans",     type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "borrower", type: "address" }, { name: "providerId", type: "uint256" }, { name: "principal", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "duration", type: "uint256" }, { name: "active", type: "bool" }] }] },
  { name: "poolBalance", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "totalShares", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "balanceOf",   type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "interestRate", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

const s = {
  page: { padding: "20px 16px", maxWidth: 860, margin: "0 auto" },
  h1: { fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  tabs: { display: "flex", gap: 4, marginBottom: 16, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 },
  tab: (a: boolean) => ({ flex: 1, padding: "8px 4px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: a ? "var(--accent)" : "transparent", color: a ? "#fff" : "var(--text-dim)", transition: "all .15s" }) as React.CSSProperties,
  section: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 },
  sectionTitle: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 12 },
  label: { fontSize: 11, color: "var(--text-dim)", fontWeight: 600, display: "block", marginBottom: 6 },
  input: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" as const },
  btn: (v = "default", d = false) => ({ padding: "9px 16px", borderRadius: 8, border: "none", cursor: d ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, background: v === "primary" ? "linear-gradient(135deg,#10b981,#059669)" : v === "danger" ? "rgba(239,68,68,0.1)" : "var(--bg-3)", color: v === "primary" ? "#fff" : v === "danger" ? "#ef4444" : "var(--text)", opacity: d ? 0.5 : 1 }) as React.CSSProperties,
  stat: { background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", textAlign: "center" as const },
  statVal: { fontSize: 18, fontWeight: 700, color: "var(--accent)" },
  statLbl: { fontSize: 10, textTransform: "uppercase" as const, color: "var(--text-faint)", letterSpacing: "0.06em", marginTop: 2 },
};

type Tab = "pool" | "borrow" | "loans";

export default function Lending() {
  const { address, isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("pool");
  const [depositAmt, setDepositAmt] = useState("10");
  const [withdrawShares, setWithdrawShares] = useState("0");
  const [borrowPid, setBorrowPid] = useState("1");
  const [borrowAmt, setBorrowAmt] = useState("5");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loans, setLoans] = useState<any[]>([]);
  const [loansLoading, setLoansLoading] = useState(false);

  const { writeContractAsync } = useWriteContract();

  const { data: poolBalance, refetch: refetchPool } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "poolBalance", chainId: arcTestnet.id, query: { refetchInterval: 20_000 } });
  const { data: totalShares, refetch: refetchShares } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "totalShares", chainId: arcTestnet.id, query: { refetchInterval: 20_000 } });
  const { data: myShares, refetch: refetchMyShares } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "balanceOf", args: address ? [address] : undefined, chainId: arcTestnet.id, query: { enabled: !!address, refetchInterval: 20_000 } });
  const { data: loanCount } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "loanCount", chainId: arcTestnet.id, query: { refetchInterval: 20_000 } });
  const { data: interestRate } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "interestRate", chainId: arcTestnet.id });

  const refetchAll = useCallback(() => { refetchPool(); refetchShares(); refetchMyShares(); }, [refetchPool, refetchShares, refetchMyShares]);

  const handleDeposit = useCallback(async () => {
    if (!isConnected || !address) { setStatus("❌ Connect wallet"); return; }
    const amtWei = parseUnits(depositAmt || "0", 6);
    setLoading(true);
    setStatus("⏳ Approving USDC…");
    try {
      await writeContractAsync({ address: CONFIG.usdcAddress as `0x${string}`, abi: USDC_ABI, functionName: "approve", args: [RL_ADDR, amtWei], chainId: arcTestnet.id });
      setStatus("⏳ Depositing to pool…");
      await writeContractAsync({ address: RL_ADDR, abi: RL_ABI, functionName: "deposit", args: [amtWei], chainId: arcTestnet.id });
      setStatus(`✅ Deposited ${depositAmt} USDC to lending pool`);
      refetchAll();
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, address, depositAmt, writeContractAsync, refetchAll]);

  const handleWithdraw = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    const shares = BigInt(withdrawShares || "0");
    setLoading(true);
    setStatus("⏳ Withdrawing…");
    try {
      await writeContractAsync({ address: RL_ADDR, abi: RL_ABI, functionName: "withdraw", args: [shares], chainId: arcTestnet.id });
      setStatus("✅ Shares redeemed for USDC");
      refetchAll();
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, withdrawShares, writeContractAsync, refetchAll]);

  const handleBorrow = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    const amtWei = parseUnits(borrowAmt || "0", 6);
    setLoading(true);
    setStatus("⏳ Opening loan…");
    try {
      await writeContractAsync({ address: RL_ADDR, abi: RL_ABI, functionName: "borrow", args: [BigInt(borrowPid), amtWei], chainId: arcTestnet.id });
      setStatus(`✅ Loan opened — ${borrowAmt} USDC sent. Stake it via Register panel.`);
      refetchAll();
      setTab("loans");
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, borrowPid, borrowAmt, writeContractAsync, refetchAll]);

  const handleRepay = useCallback(async (loanId: number, totalWei: bigint) => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    setStatus(`⏳ Approving repayment of loan #${loanId}…`);
    try {
      await writeContractAsync({ address: CONFIG.usdcAddress as `0x${string}`, abi: USDC_ABI, functionName: "approve", args: [RL_ADDR, totalWei], chainId: arcTestnet.id });
      setStatus(`⏳ Repaying loan #${loanId}…`);
      await writeContractAsync({ address: RL_ADDR, abi: RL_ABI, functionName: "repay", args: [BigInt(loanId)], chainId: arcTestnet.id });
      setStatus(`✅ Loan #${loanId} repaid`);
      refetchAll();
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, writeContractAsync, refetchAll]);

  const pool = poolBalance ? Number(formatUnits(poolBalance as bigint, 6)).toFixed(2) : "—";
  const shares = totalShares ? String(totalShares) : "—";
  const mine = myShares ? String(myShares) : "0";
  const apr = interestRate ? (Number(interestRate) / 100).toFixed(1) : "—";

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Reputation-Backed Lending</h1>
      <p style={s.sub}>Providers borrow USDC against their on-chain reputation to boost stake. Lenders earn yield from interest.</p>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        {[["Pool Balance", `${pool} USDC`], ["APR", `${apr}%`], ["My Shares", mine]].map(([l, v]) => (
          <div key={l} style={s.stat}><div style={s.statVal}>{v}</div><div style={s.statLbl}>{l}</div></div>
        ))}
      </div>

      {status && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: status.startsWith("✅") ? "rgba(16,185,129,0.08)" : status.startsWith("❌") ? "rgba(239,68,68,0.08)" : "var(--bg-2)", border: `1px solid ${status.startsWith("✅") ? "rgba(16,185,129,0.2)" : status.startsWith("❌") ? "rgba(239,68,68,0.2)" : "var(--border)"}`, fontSize: 12, color: status.startsWith("✅") ? "var(--accent)" : status.startsWith("❌") ? "#ef4444" : "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          {status}
        </div>
      )}

      <div style={s.tabs}>
        {(["pool", "borrow", "loans"] as Tab[]).map(t => (
          <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
            {t === "pool" ? "💧 Lend" : t === "borrow" ? "💵 Borrow" : "📋 My Loans"}
          </button>
        ))}
      </div>

      {/* Pool tab */}
      {tab === "pool" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>LEND TO POOL — EARN YIELD</div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>Deposit USDC into the reputation loan pool. Earn interest when providers borrow to increase stake.</p>
          <label style={s.label}>Deposit amount (USDC)</label>
          <input style={s.input} type="number" min="1" step="1" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} />
          <button style={{ ...s.btn("primary", loading || !isConnected), marginTop: 10 }} onClick={handleDeposit} disabled={loading || !isConnected}>
            {loading ? "⏳" : "Deposit to pool"}
          </button>
          <div style={{ ...s.sectionTitle, marginTop: 20, marginBottom: 10 }}>WITHDRAW SHARES</div>
          <label style={s.label}>Shares to redeem (1 share ≈ 1 USDC + interest)</label>
          <input style={s.input} type="number" min="0" value={withdrawShares} onChange={e => setWithdrawShares(e.target.value)} />
          <button style={{ ...s.btn("default", loading || !isConnected), marginTop: 10 }} onClick={handleWithdraw} disabled={loading || !isConnected}>
            {loading ? "⏳" : "Withdraw shares"}
          </button>
        </div>
      )}

      {/* Borrow tab */}
      {tab === "borrow" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>BORROW AGAINST REPUTATION</div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            As a provider, borrow USDC to boost your stake. Collateral = your on-chain reputation score.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Your Provider ID</label>
              <input style={s.input} type="number" min="1" value={borrowPid} onChange={e => setBorrowPid(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Borrow amount (USDC)</label>
              <input style={s.input} type="number" min="1" step="1" value={borrowAmt} onChange={e => setBorrowAmt(e.target.value)} />
            </div>
          </div>
          <button style={{ ...s.btn("primary", loading || !isConnected), width: "100%" }} onClick={handleBorrow} disabled={loading || !isConnected}>
            {loading ? "⏳" : `💵 Borrow ${borrowAmt} USDC`}
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-faint)" }}>
            Interest rate: {apr}% APR · Loan duration set by contract
          </div>
        </div>
      )}

      {/* Loans tab */}
      {tab === "loans" && (
        <div style={s.section}>
          <div style={s.sectionTitle}>MY ACTIVE LOANS</div>
          {!isConnected ? (
            <div style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center", padding: "20px 0" }}>Connect wallet to view loans</div>
          ) : loanCount !== undefined ? (
            Number(loanCount) === 0 ? (
              <div style={{ textAlign: "center", padding: "24px", color: "var(--text-faint)", fontSize: 12 }}>No loans yet</div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                {Array.from({ length: Number(loanCount) }, (_, i) => i + 1).map(i => (
                  <LoanRow key={i} loanId={i} addr={address!} onRepay={handleRepay} loading={loading} />
                ))}
              </div>
            )
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading loans…</div>
          )}
        </div>
      )}
    </div>
  );
}

function LoanRow({ loanId, addr, onRepay, loading }: { loanId: number; addr: string; onRepay: (id: number, total: bigint) => void; loading: boolean }) {
  const { data } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "loans", args: [BigInt(loanId)], chainId: arcTestnet.id, query: { refetchInterval: 30_000 } });
  const loan = data as any;
  if (!loan || loan.borrower?.toLowerCase() !== addr?.toLowerCase()) return null;
  const principal = BigInt(loan.principal ?? 0);
  const deadline = loan.startTime && loan.duration ? new Date((Number(loan.startTime) + Number(loan.duration)) * 1000).toLocaleDateString() : "—";
  return (
    <div style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Loan #{loanId} — Provider #{String(loan.providerId)}</span>
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: loan.active ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)", color: loan.active ? "#f59e0b" : "#10b981" }}>
          {loan.active ? "Active" : "Repaid"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, fontSize: 12, marginBottom: loan.active ? 10 : 0 }}>
        <div>Principal: <strong>{(Number(principal) / 1e6).toFixed(2)} USDC</strong></div>
        <div>Due: <strong>{deadline}</strong></div>
      </div>
      {loan.active && (
        <button
          style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}
          onClick={() => onRepay(loanId, principal)}
          disabled={loading}
        >
          💵 Repay {(Number(principal) / 1e6).toFixed(4)} USDC
        </button>
      )}
    </div>
  );
}
