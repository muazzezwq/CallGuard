import { useState, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { arcTestnet, CONFIG } from "../../lib/config";
import { Package, Flame } from "lucide-react";
import { Badge, Button, Field, Input, PageHeader, Stat, Tabs } from "../../ui";
import {
  KeyValue, Ledger, PanelShell, PanelSource, PanelSplit, SignalRow, StatusNotice,
} from "../panel/PanelUi";

const FUTURES_ADDR = CONFIG.slaFuturesAddress;

const FUTURES_ABI = [
  { name: "mintCapacity",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "providerId", type: "uint256" }, { name: "pricePerCall", type: "uint256" }, { name: "totalSlots", type: "uint256" }, { name: "deadline", type: "uint64" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "buySlots",      type: "function", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "burnSlot",      type: "function", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint256" }], outputs: [] },
  { name: "cancelBatch",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint256" }], outputs: [] },
  { name: "claimRefund",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint256" }], outputs: [] },
  { name: "nextBatchId",   type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "batches",       type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "providerId", type: "uint256" }, { name: "pricePerCall", type: "uint256" }, { name: "totalSlots", type: "uint256" }, { name: "soldSlots", type: "uint256" }, { name: "usedSlots", type: "uint256" }, { name: "deadline", type: "uint64" }, { name: "active", type: "bool" }, { name: "provider", type: "address" }] }] },
  { name: "purchased",       type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint256" }, { name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  // HLB-02: provider pull settlement
  { name: "providerClaimable", type: "function", stateMutability: "view", inputs: [{ name: "batchId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "claimProceeds",     type: "function", stateMutability: "nonpayable", inputs: [{ name: "batchId", type: "uint256" }], outputs: [] },
] as const;

type Tab = "browse" | "myslots" | "mint";

export default function Futures() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("browse");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mint form
  const [mintPid, setMintPid] = useState("1");
  const [mintPrice, setMintPrice] = useState("0.5");
  const [mintSlots, setMintSlots] = useState("100");
  const [mintDeadline, setMintDeadline] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  // Buy form
  const [buyBatchId, setBuyBatchId] = useState("1");
  const [buyAmount, setBuyAmount] = useState("1");
  const [burnBatchId, setBurnBatchId] = useState("1");
  const [cancelBatchId, setCancelBatchId] = useState("1");
  // HIGH-09: claimProceeds
  const [claimBatchId, setClaimBatchId] = useState("1");

  const { writeContractAsync } = useWriteContract();
  const { data: nextBatchId, refetch: refetchCount } = useReadContract({ address: FUTURES_ADDR, abi: FUTURES_ABI, functionName: "nextBatchId", chainId: arcTestnet.id, query: { refetchInterval: 30_000 } });

  const handleMint = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    setStatus("⏳ Minting capacity batch…");
    try {
      const priceWei = parseUnits(mintPrice || "0", 6);
      const deadline = BigInt(Math.floor(new Date(mintDeadline).getTime() / 1000));
      const txHash = await writeContractAsync({
        address: FUTURES_ADDR, abi: FUTURES_ABI,
        functionName: "mintCapacity",
        args: [BigInt(mintPid), priceWei, BigInt(mintSlots), deadline],
        chainId: arcTestnet.id,
      });
      setStatus(`✅ Capacity batch minted! TX: ${txHash.slice(0, 14)}…`);
      refetchCount();
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, mintPid, mintPrice, mintSlots, mintDeadline, writeContractAsync, refetchCount]);

  const handleBuySlots = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    setStatus("⏳ Buying slots…");
    try {
      const txHash = await writeContractAsync({
        address: FUTURES_ADDR, abi: FUTURES_ABI,
        functionName: "buySlots",
        args: [BigInt(buyBatchId), BigInt(buyAmount)],
        chainId: arcTestnet.id,
      });
      setStatus(`✅ Bought ${buyAmount} slot(s) from batch #${buyBatchId}! TX: ${txHash.slice(0, 14)}…`);
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, buyBatchId, buyAmount, writeContractAsync]);

  const handleBurnSlot = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    setStatus("⏳ Burning slot to call provider…");
    try {
      const txHash = await writeContractAsync({ address: FUTURES_ADDR, abi: FUTURES_ABI, functionName: "burnSlot", args: [BigInt(burnBatchId)], chainId: arcTestnet.id });
      setStatus(`✅ Slot burned (provider called) — TX: ${txHash.slice(0, 14)}…`);
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, burnBatchId, writeContractAsync]);

  // HIGH-09: provider claims proceeds from sold slots (pull settlement)
  const handleClaimProceeds = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    try {
      const txHash = await writeContractAsync({ address: FUTURES_ADDR, abi: FUTURES_ABI, functionName: "claimProceeds", args: [BigInt(claimBatchId)], chainId: arcTestnet.id });
      setStatus(`✅ Proceeds claimed for batch #${claimBatchId}! TX: ${txHash.slice(0, 14)}…`);
    } catch (e: unknown) { setStatus("❌ " + (e instanceof Error ? e.message : String(e))); }
    setLoading(false);
  }, [isConnected, claimBatchId, writeContractAsync]);

  const handleCancel = useCallback(async () => {
    if (!isConnected) { setStatus("❌ Connect wallet"); return; }
    setLoading(true);
    try {
      const txHash = await writeContractAsync({ address: FUTURES_ADDR, abi: FUTURES_ABI, functionName: "cancelBatch", args: [BigInt(cancelBatchId)], chainId: arcTestnet.id });
      setStatus(`✅ Batch #${cancelBatchId} cancelled — TX: ${txHash.slice(0, 14)}…`);
      refetchCount();
    } catch (e: unknown) { setStatus("❌ " + ((e instanceof Error ? (e instanceof Error ? e.message : String(e)) : String(e)))); }
    setLoading(false);
  }, [isConnected, cancelBatchId, writeContractAsync, refetchCount]);

  // nextBatchId is the next id to be assigned; existing batches are 1..nextBatchId-1
  const count = nextBatchId ? Math.max(0, Number(nextBatchId) - 1) : 0;
  const statusTone = status?.startsWith("✅") ? "success" : status?.startsWith("❌") ? "danger" : "info";

  const rail = (
    <>
      <KeyValue
        label="Slot mechanics"
        rows={[
          { label: "Standard", value: "ERC-1155 capacity slots" },
          { label: "Batch IDs", value: "1 … nextBatchId − 1", mono: true },
          { label: "Browse cap", value: "First 10 batches", mono: true },
          { label: "Price precision", value: "6 decimals", mono: true },
          { label: "Settlement", value: "Provider pull via claimProceeds" },
          { label: "Provider side", value: "Mint · Claim · Cancel" },
        ]}
      />
      <KeyValue
        label="Contract"
        rows={[
          { label: "Network", value: "Arc Testnet" },
          { label: "SLAFutures v3", value: FUTURES_ADDR, mono: true },
        ]}
      />
    </>
  );

  return (
    <PanelShell>
      <PageHeader
        title="SLA Futures"
        subtitle="Providers tokenize future capacity as ERC-1155 slots. Callers reserve priority calls. Slots trade on secondary markets."
      />

      <PanelSource
        label="SLAFutures v3"
        value={nextBatchId !== undefined ? "batch counter loaded" : "reading nextBatchId"}
        hint="30 s refresh · batches read on demand"
        state={nextBatchId !== undefined ? "live" : "idle"}
      />

      {status && <StatusNotice tone={statusTone} title={status} />}

      <SignalRow label="Futures signals">
        <Stat label="Capacity Batches" value={nextBatchId !== undefined ? count : "—"} hint="Existing IDs 1 to nextBatchId − 1" />
        <Stat label="Next Batch ID" value={nextBatchId !== undefined ? String(nextBatchId) : "—"} hint="Assigned by the contract" />
        <Stat label="Visible Rows" value={nextBatchId !== undefined ? Math.min(count, 10) : "—"} hint="Browse cap: first 10 batches" />
      </SignalRow>

      <div className="pg-tabbar">
        <Tabs
          tabs={[
            { id: "browse", label: "📦 Browse" },
            { id: "myslots", label: "🎫 My Slots" },
            { id: "mint", label: "⚒ Mint" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "browse" && (
        <PanelSplit
          main={
            <>
              <Ledger
                label={`ACTIVE CAPACITY BATCHES (${count} total)`}
                empty={<div className="pg-empty"><strong>No batches yet — providers can mint capacity batches.</strong></div>}
              >
                {count > 0 ? Array.from({ length: Math.min(count, 10) }, (_, i) => i + 1).map(id => (
                  <BatchCard key={id} batchId={id} />
                )) : null}
              </Ledger>

              <section className="ui-section pg-section--spaced">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">BUY SLOTS</h2>
                </div>
                <div className="ui-section__body">
                  <div className="pg-form pg-form--2">
                    <Field label="Batch ID" htmlFor="fut-buy-batch">
                      <Input id="fut-buy-batch" type="number" min="1" value={buyBatchId} onChange={e => setBuyBatchId(e.target.value)} />
                    </Field>
                    <Field label="Amount" htmlFor="fut-buy-amount">
                      <Input id="fut-buy-amount" type="number" min="1" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} />
                    </Field>
                  </div>
                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button variant="primary" onClick={handleBuySlots} disabled={loading || !isConnected}>
                      🛒 Buy {buyAmount} slot(s)
                    </Button>
                  </div>
                </div>
              </section>
            </>
          }
          rail={rail}
        />
      )}

      {tab === "myslots" && (
        <PanelSplit
          main={
            <section className="ui-section">
              <div className="ui-section__head">
                <h2 className="ui-section__title">BURN SLOT — USE PRIORITY CALL</h2>
              </div>
              <div className="ui-section__body">
                <p className="pg-copy">Burn a slot to call the provider at the pre-agreed price, bypassing queue.</p>
                <div className="pg-form">
                  <Field label="Batch ID" htmlFor="fut-burn-batch">
                    <Input id="fut-burn-batch" type="number" min="1" value={burnBatchId} onChange={e => setBurnBatchId(e.target.value)} />
                  </Field>
                </div>
                <div className="pg-form__actions pg-form__actions--spaced">
                  <Button variant="primary" onClick={handleBurnSlot} disabled={loading || !isConnected} leftIcon={<Flame size={14} />}>
                    Burn slot &amp; call
                  </Button>
                </div>
              </div>
            </section>
          }
          rail={rail}
        />
      )}

      {tab === "mint" && (
        <PanelSplit
          main={
            <>
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">MINT CAPACITY BATCH (providers only)</h2>
                </div>
                <div className="ui-section__body">
                  <div className="pg-form pg-form--2">
                    <Field label="Your Provider ID" htmlFor="fut-mint-pid">
                      <Input id="fut-mint-pid" type="number" min="1" value={mintPid} onChange={e => setMintPid(e.target.value)} />
                    </Field>
                    <Field label="Price per call (USDC)" htmlFor="fut-mint-price">
                      <Input id="fut-mint-price" type="number" min="0.001" step="0.01" value={mintPrice} onChange={e => setMintPrice(e.target.value)} />
                    </Field>
                    <Field label="Total slots" htmlFor="fut-mint-slots">
                      <Input id="fut-mint-slots" type="number" min="1" value={mintSlots} onChange={e => setMintSlots(e.target.value)} />
                    </Field>
                    <Field label="Deadline" htmlFor="fut-mint-deadline">
                      <Input id="fut-mint-deadline" type="date" value={mintDeadline} onChange={e => setMintDeadline(e.target.value)} />
                    </Field>
                  </div>
                  <div className="pg-form__actions pg-form__actions--spaced">
                    <Button variant="primary" block onClick={handleMint} disabled={loading || !isConnected} leftIcon={<Package size={14} />}>
                      Mint capacity batch
                    </Button>
                  </div>
                </div>
              </section>

              <section className="ui-section pg-section--spaced">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">CLAIM PROCEEDS (provider)</h2>
                </div>
                <div className="ui-section__body">
                  <p className="pg-copy">Claim your USDC from sold slots. Funds are held in escrow until you claim.</p>
                  <div className="pg-inline-form">
                    <Field label="Batch ID" htmlFor="fut-claim-batch" className="pg-inline-form__field">
                      <Input id="fut-claim-batch" type="number" min="1" value={claimBatchId} onChange={e => setClaimBatchId(e.target.value)} />
                    </Field>
                    <Button variant="primary" onClick={handleClaimProceeds} disabled={loading || !isConnected}>Claim</Button>
                  </div>
                </div>
              </section>

              <section className="ui-section pg-section--spaced">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">CANCEL BATCH</h2>
                </div>
                <div className="ui-section__body">
                  <div className="pg-inline-form">
                    <Field label="Batch ID" htmlFor="fut-cancel-batch" className="pg-inline-form__field">
                      <Input id="fut-cancel-batch" type="number" min="1" value={cancelBatchId} onChange={e => setCancelBatchId(e.target.value)} />
                    </Field>
                    <Button variant="secondary" onClick={handleCancel} disabled={loading || !isConnected}>Cancel</Button>
                  </div>
                </div>
              </section>
            </>
          }
          rail={rail}
        />
      )}
    </PanelShell>
  );
}

function BatchCard({ batchId }: { batchId: number }) {
  const { data } = useReadContract({ address: FUTURES_ADDR, abi: FUTURES_ABI, functionName: "batches", args: [BigInt(batchId)], chainId: arcTestnet.id, query: { refetchInterval: 30_000 } });
  const b = data as { pricePerCall?: bigint; deadline?: bigint; totalSlots?: bigint; soldSlots?: bigint; providerId?: bigint | number; active?: boolean } | undefined;
  if (!b) return <li className="pg-batch is-loading"><span className="pg-batch__title">Loading batch #{batchId}…</span></li>;
  const price = (Number(b.pricePerCall) / 1e6).toFixed(4);
  const deadline = new Date(Number(b.deadline) * 1000).toLocaleDateString();
  const fill = Number(b.totalSlots ?? 0) > 0 ? Math.round((Number(b.soldSlots) / Number(b.totalSlots)) * 100) : 0;
  return (
    <li className="pg-batch">
      <div className="pg-batch__head">
        <span className="pg-batch__title">Batch #{batchId} · Provider #{String(b.providerId)}</span>
        <Badge tone={b.active ? "guard" : "neutral"}>{b.active ? "Active" : "Closed"}</Badge>
      </div>
      <div className="pg-batch__stats">
        <span>Price: <strong>{price} USDC</strong></span>
        <span>Slots: <strong>{String(b.soldSlots)}/{String(b.totalSlots)}</strong></span>
        <span>Deadline: <strong>{deadline}</strong></span>
      </div>
      <div className="pg-batch__track" aria-hidden="true">
        <span className="pg-batch__fill" style={{ width: `${fill}%`, background: fill > 80 ? "var(--danger)" : "var(--accent)" }} />
      </div>
    </li>
  );
}
