import { useState, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { arcTestnet, CONFIG, USDC_ABI, REPUTATION_LOAN_ABI } from "../../lib/config";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Stat, Tabs } from "../../ui";
import {
  KeyValue, Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit,
  SignalRow, StatusNotice,
} from "../panel/PanelUi";

// CRITICAL-01 fix: use v2 address from CONFIG, not hardcoded v1 address
const RL_ADDR = CONFIG.reputationLoanAddress;

// CRITICAL-02 fix: use canonical REPUTATION_LOAN_ABI from config
// repay(loanId, amount) — 2 arguments, not 1
const RL_ABI = REPUTATION_LOAN_ABI;

type Loan = {
  borrower?: string;
  principal?: bigint | number;
  startTime?: bigint | number;
  duration?: bigint | number;
  providerId?: bigint | number;
  active?: boolean;
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

  const { writeContractAsync } = useWriteContract();

  // CRITICAL-02: REPUTATION_LOAN_ABI uses totalAssets, not poolBalance
  const { data: poolBalance, refetch: refetchPool } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "totalAssets", chainId: arcTestnet.id, query: { refetchInterval: 20_000 } });
  const { refetch: refetchShares } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "totalShares", chainId: arcTestnet.id, query: { refetchInterval: 20_000 } });
  // CRITICAL-02: lpPositions(address) returns {shares, depositTime} — no balanceOf
  const { data: lpPos, refetch: refetchMyShares } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "lpPositions", args: address ? [address] : undefined, chainId: arcTestnet.id, query: { enabled: !!address, refetchInterval: 20_000 } });
  const myShares = (lpPos as { shares?: bigint } | undefined)?.shares;
  const { data: loanCount } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "loanCount", chainId: arcTestnet.id, query: { refetchInterval: 20_000 } });
  // interestRate not in REPUTATION_LOAN_ABI v2 — use fixed display value
  const interestRate = undefined;

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
      // CRITICAL-02 fix: repay(loanId, amount) — 2 args
      await writeContractAsync({ address: RL_ADDR, abi: RL_ABI, functionName: "repay", args: [BigInt(loanId), totalWei], chainId: arcTestnet.id });
      setStatus(`✅ Loan #${loanId} repaid`);
      refetchAll();
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, writeContractAsync, refetchAll]);

  const pool = poolBalance ? Number(formatUnits(poolBalance as bigint, 6)).toFixed(2) : "—";
  const mine = myShares ? String(myShares) : "0";
  const apr = interestRate ? (Number(interestRate) / 100).toFixed(1) : "—";
  const statusTone = status?.startsWith("✅") ? "success" : status?.startsWith("❌") ? "danger" : "info";

  const positionRail = (
    <>
      <KeyValue
        label="Loan position"
        rows={[
          { label: "Pool assets", value: `${pool} USDC`, mono: true },
          { label: "My shares", value: mine, mono: true },
          { label: "Open loans", value: loanCount !== undefined ? String(loanCount) : "—", mono: true },
          { label: "Interest rate", value: `${apr}% APR` },
          { label: "USDC precision", value: "6 decimals", mono: true },
        ]}
      />
      <KeyValue
        label="Contract"
        rows={[
          { label: "Network", value: "Arc Testnet" },
          { label: "ReputationLoan v3", value: RL_ADDR, mono: true },
        ]}
      />
    </>
  );

  return (
    <PanelShell>
      <PageHeader
        title="Reputation-Backed Lending"
        subtitle="Providers borrow USDC against their on-chain reputation to boost stake. Lenders earn yield from interest."
      />

      <PanelSource
        label="ReputationLoan v3"
        value={poolBalance !== undefined ? "pool state loaded" : "reading totalAssets"}
        hint="20 s refresh · Arc Testnet"
        state={poolBalance !== undefined ? "live" : "idle"}
      />

      {status && (
        <StatusNotice tone={statusTone} title={status} />
      )}

      <SignalRow label="Lending signals">
        <Stat label="Pool Balance" value={`${pool} USDC`} hint="totalAssets read" />
        <Stat label="APR" value={`${apr}%`} hint="interestRate not exposed by v2 ABI" />
        <Stat label="My Shares" value={mine} hint="lpPositions for connected wallet" />
      </SignalRow>

      <div className="pg-tabbar">
        <Tabs
          tabs={[
            { id: "pool", label: "💧 Lend" },
            { id: "borrow", label: "💵 Borrow" },
            { id: "loans", label: "📋 My Loans" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "pool" && (
        <PanelSplit
          main={
            <section className="ui-section">
              <div className="ui-section__head">
                <h2 className="ui-section__title">LEND TO POOL — EARN YIELD</h2>
              </div>
              <div className="ui-section__body">
                <p className="pg-copy">Deposit USDC into the reputation loan pool. Earn interest when providers borrow to increase stake.</p>
                <div className="pg-form">
                  <Field label="Deposit amount (USDC)" htmlFor="ln-deposit">
                    <Input id="ln-deposit" type="number" min="1" step="1" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} />
                  </Field>
                  <div className="pg-form__actions">
                    <Button variant="primary" onClick={handleDeposit} disabled={loading || !isConnected}>
                      {loading ? "⏳" : "Deposit to pool"}
                    </Button>
                  </div>
                </div>

                <div className="pg-subhead">WITHDRAW SHARES</div>
                <div className="pg-form">
                  <Field label="Shares to redeem (1 share ≈ 1 USDC + interest)" htmlFor="ln-withdraw">
                    <Input id="ln-withdraw" type="number" min="0" value={withdrawShares} onChange={e => setWithdrawShares(e.target.value)} />
                  </Field>
                  <div className="pg-form__actions">
                    <Button variant="secondary" onClick={handleWithdraw} disabled={loading || !isConnected}>
                      {loading ? "⏳" : "Withdraw shares"}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          }
          rail={positionRail}
        />
      )}

      {tab === "borrow" && (
        <PanelSplit
          main={
            <section className="ui-section">
              <div className="ui-section__head">
                <h2 className="ui-section__title">BORROW AGAINST REPUTATION</h2>
              </div>
              <div className="ui-section__body">
                <p className="pg-copy">As a provider, borrow USDC to boost your stake. Collateral = your on-chain reputation score.</p>
                <div className="pg-form pg-form--2">
                  <Field label="Your Provider ID" htmlFor="ln-borrow-pid">
                    <Input id="ln-borrow-pid" type="number" min="1" value={borrowPid} onChange={e => setBorrowPid(e.target.value)} />
                  </Field>
                  <Field label="Borrow amount (USDC)" htmlFor="ln-borrow-amt">
                    <Input id="ln-borrow-amt" type="number" min="1" step="1" value={borrowAmt} onChange={e => setBorrowAmt(e.target.value)} />
                  </Field>
                </div>
                <div className="pg-form__actions pg-form__actions--spaced">
                  <Button variant="primary" block onClick={handleBorrow} disabled={loading || !isConnected}>
                    {loading ? "⏳" : `💵 Borrow ${borrowAmt} USDC`}
                  </Button>
                </div>
                <p className="pg-note">Interest rate: {apr}% APR · Loan duration set by contract</p>
              </div>
            </section>
          }
          rail={positionRail}
        />
      )}

      {tab === "loans" && (
        <PanelSplit
          main={
            !isConnected ? (
              <EmptyState title="Connect wallet to view loans" />
            ) : loanCount !== undefined ? (
              Number(loanCount) === 0 ? (
                <EmptyState title="No loans yet" />
              ) : (
                <Ledger label="MY ACTIVE LOANS">
                  {Array.from({ length: Number(loanCount) }, (_, i) => i + 1).map(i => (
                    <LoanRow key={i} loanId={i} addr={address!} onRepay={handleRepay} loading={loading} />
                  ))}
                </Ledger>
              )
            ) : (
              <p className="pg-loading">Loading loans…</p>
            )
          }
          rail={positionRail}
        />
      )}
    </PanelShell>
  );
}

function LoanRow({ loanId, addr, onRepay, loading }: { loanId: number; addr: string; onRepay: (id: number, total: bigint) => void; loading: boolean }) {
  const { data } = useReadContract({ address: RL_ADDR, abi: RL_ABI, functionName: "loans", args: [BigInt(loanId)], chainId: arcTestnet.id, query: { refetchInterval: 30_000 } });
  const loan = data as Loan | undefined;
  if (!loan || loan.borrower?.toLowerCase() !== addr?.toLowerCase()) return null;
  const principal = BigInt(loan.principal ?? 0);
  const deadline = loan.startTime && loan.duration ? new Date((Number(loan.startTime) + Number(loan.duration)) * 1000).toLocaleDateString() : "—";
  return (
    <LedgerRow
      tone={loan.active ? "warn" : "guard"}
      lead={`Loan #${loanId} — Provider #${String(loan.providerId)}`}
      meta={<>Principal: <strong>{(Number(principal) / 1e6).toFixed(2)} USDC</strong> · Due: <strong>{deadline}</strong></>}
      trailing={
        <span className="pg-loan-actions">
          <Badge tone={loan.active ? "pending" : "guard"}>{loan.active ? "Active" : "Repaid"}</Badge>
          {loan.active && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onRepay(loanId, principal)}
              disabled={loading}
            >
              💵 Repay {(Number(principal) / 1e6).toFixed(4)} USDC
            </Button>
          )}
        </span>
      }
    />
  );
}
