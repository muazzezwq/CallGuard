import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONFIG, REGISTRY_ABI } from "../../lib/config";
import { Badge, Button, Copy, Input, PageHeader, Stat } from "../../ui";
import {
  Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit, SignalRow, StatusNotice,
} from "../panel/PanelUi";

const REGISTRY_ADMIN_ABI = [
  { name: "owner",        type: "function", stateMutability: "view",        inputs: [],                              outputs: [{type:"address"}] },
  { name: "payPerCall",   type: "function", stateMutability: "view",        inputs: [],                              outputs: [{type:"address"}] },
  { name: "setPayPerCall", type: "function", stateMutability: "nonpayable", inputs: [{name:"_payPerCall",type:"address"}], outputs: [] },
  ...REGISTRY_ABI,
] as const;

type TxStatus = "idle" | "pending" | "mining" | "success" | "error";

function StatusBadge({ status, error }: { status: TxStatus; error?: string }) {
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <span className="pg-testline is-err" role="alert">
        {error ?? "Error"}
      </span>
    );
  }

  const tone = status === "pending" ? "pending" : status === "mining" ? "info" : "guard";
  const text = status === "pending"
    ? "Waiting..."
    : status === "mining"
      ? "Writing to chain..."
      : "Success!";

  return (
    <span role="status" aria-live="polite">
      <Badge tone={tone}>{text}</Badge>
    </span>
  );
}

function AdminAction({
  label, description, buttonLabel, buttonVariant = "primary",
  onAction, status, error, children,
}: {
  label: string;
  description: string;
  buttonLabel: string;
  buttonVariant?: "primary" | "secondary" | "outline";
  onAction: () => void;
  status: TxStatus;
  error?: string;
  children?: React.ReactNode;
}) {
  const busy = status === "pending" || status === "mining";
  return (
    <div className={`pg-action${children ? "" : " pg-action--tight"}`}>
      <div className="pg-action__info">
        <code className="pg-endpoint">{label}</code>
        <span className="pg-action__desc">{description}</span>
      </div>
      {children && <div className="pg-action__field">{children}</div>}
      <div className="pg-action__actions">
        <Button
          variant={buttonVariant}
          onClick={onAction}
          disabled={busy}
          loading={busy}
        >
          {buttonLabel}
        </Button>
        <StatusBadge status={status} error={error} />
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const { address, isConnected } = useAccount();

  // ── contract reads ──────────────────────────────────────────────────────────
  const { data: registryOwner } = useReadContract({
    address: CONFIG.registryAddress,
    abi: REGISTRY_ADMIN_ABI,
    functionName: "owner",
  });

  const { data: currentPPC, refetch: refetchPPC } = useReadContract({
    address: CONFIG.registryAddress,
    abi: REGISTRY_ADMIN_ABI,
    functionName: "payPerCall",
  });

  const { data: pendingPPC } = useReadContract({
    address: CONFIG.registryAddress,
    abi: REGISTRY_ADMIN_ABI,
    functionName: "pendingPayPerCall",
  });

  const { data: changeAt } = useReadContract({
    address: CONFIG.registryAddress,
    abi: REGISTRY_ADMIN_ABI,
    functionName: "payPerCallChangeAt",
  });

  // ── setPayPerCall ────────────────────────────────────────────────────────────
  const [setPPCStatus, setSetPPCStatus] = useState<TxStatus>("idle");
  const [setPPCError,  setSetPPCError]  = useState<string>();
  const [setPPCInput,  setSetPPCInput]  = useState(CONFIG.payPerCall);
  const { writeContract: writePPC, data: setPPCHash } = useWriteContract();

  useWaitForTransactionReceipt({
    hash: setPPCHash,
    query: {
      enabled: !!setPPCHash,
      select: (r) => {
        if (r.status === "success") { setSetPPCStatus("success"); refetchPPC(); }
        else setSetPPCStatus("error");
        return r;
      },
    },
  });

  function doSetPayPerCall() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(setPPCInput)) {
      setSetPPCError("Invalid address"); setSetPPCStatus("error"); return;
    }
    setSetPPCStatus("pending");
    setSetPPCError(undefined);
    writePPC({
      address: CONFIG.registryAddress,
      abi: REGISTRY_ADMIN_ABI,
      functionName: "setPayPerCall",
      args: [setPPCInput as `0x${string}`],
    }, {
      onSuccess: () => setSetPPCStatus("mining"),
      onError: (e) => { setSetPPCStatus("error"); setSetPPCError(e.message.slice(0, 80)); },
    });
  }

  // ── proposePayPerCall (timelock) ─────────────────────────────────────────────
  const [proposeStatus, setProposeStatus] = useState<TxStatus>("idle");
  const [proposeError,  setProposeError]  = useState<string>();
  const [proposeInput,  setProposeInput]  = useState(CONFIG.payPerCall);
  const { writeContract: writePropose, data: proposeHash } = useWriteContract();

  useWaitForTransactionReceipt({
    hash: proposeHash,
    query: { enabled: !!proposeHash },
  });

  function doPropose() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(proposeInput)) {
      setProposeError("Invalid address"); setProposeStatus("error"); return;
    }
    setProposeStatus("pending"); setProposeError(undefined);
    writePropose({
      address: CONFIG.registryAddress,
      abi: REGISTRY_ADMIN_ABI,
      functionName: "proposePayPerCall",
      args: [proposeInput as `0x${string}`],
    }, {
      onSuccess: () => setProposeStatus("mining"),
      onError: (e) => { setProposeStatus("error"); setProposeError(e.message.slice(0, 80)); },
    });
  }

  // ── executePayPerCall ────────────────────────────────────────────────────────
  const [execStatus, setExecStatus] = useState<TxStatus>("idle");
  const [execError,  setExecError]  = useState<string>();
  const { writeContract: writeExec, data: execHash } = useWriteContract();

  useWaitForTransactionReceipt({
    hash: execHash,
    query: { enabled: !!execHash, select: (r) => {
      if (r.status === "success") { setExecStatus("success"); refetchPPC(); }
      else setExecStatus("error");
      return r;
    }},
  });

  function doExecute() {
    setExecStatus("pending"); setExecError(undefined);
    writeExec({
      address: CONFIG.registryAddress,
      abi: REGISTRY_ADMIN_ABI,
      functionName: "executePayPerCall",
    }, {
      onSuccess: () => setExecStatus("mining"),
      onError: (e) => { setExecStatus("error"); setExecError(e.message.slice(0, 80)); },
    });
  }

  // ── guard ────────────────────────────────────────────────────────────────────
  const isOwner = address && registryOwner &&
    address.toLowerCase() === (registryOwner as string).toLowerCase();

  const changeAtNum = changeAt !== undefined ? Number(changeAt) : 0;
  const timelockReady = changeAtNum > 0 && Date.now() / 1000 >= changeAtNum;
  const timelockStr = changeAtNum > 0
    ? new Date(changeAtNum * 1000).toLocaleString()
    : "—";

  const currentCorrect = currentPPC !== undefined &&
    (currentPPC as string).toLowerCase() === CONFIG.payPerCall.toLowerCase();
  const sourceState = registryOwner === undefined ? "idle" : isOwner ? "live" : "unavailable";

  if (!isConnected) {
    return (
      <PanelShell>
        <PageHeader title="Admin Panel" subtitle="ServiceRegistry v7 admin operations" />
        <StatusNotice tone="info" title="Please connect your wallet." />
      </PanelShell>
    );
  }

  const addresses: [string, string][] = [
    ["ServiceRegistry v7", CONFIG.registry],
    ["PayPerCall v7.1",    CONFIG.payPerCall],
    ["DisputeQuality v2 (retired)", CONFIG.disputeQuality],
    ["SLAFutures v3",      CONFIG.slaFutures],
    ["ReputationLoan v3",  CONFIG.reputationLoan],
    ["CrossChainReceiver v2", CONFIG.crossChainReceiver],
  ];

  return (
    <PanelShell>
      <PageHeader title="Admin Panel" subtitle="ServiceRegistry v7 admin operations" />
      <PanelSource
        label="ServiceRegistry v7"
        value={CONFIG.registry.slice(0,10) + "…"}
        hint={registryOwner === undefined ? "reading owner" : isOwner ? "owner connected" : "read-only"}
        state={sourceState}
      />

      {/* Status cards */}
      <SignalRow label="ServiceRegistry state">
        <Stat
          label="Registry"
          value={<span className="pg-address">{CONFIG.registry.slice(0,10)}…</span>}
          hint="ServiceRegistry v7"
        />
        <Stat
          label="Current PayPerCall"
          value={(
            <span className="pg-address">
              {currentPPC ? (currentPPC as string).slice(0,10) + "…" : "—"}
            </span>
          )}
          hint={currentPPC === undefined ? "Reading…" : currentCorrect ? "Correct address" : "v7 address not set"}
          tone={currentPPC === undefined ? undefined : currentCorrect ? "guard" : "slash"}
        />
        <Stat
          label="Owner"
          value={(
            <span className="pg-address">
              {registryOwner ? (registryOwner as string).slice(0,10) + "…" : "—"}
            </span>
          )}
          hint={registryOwner === undefined ? "Reading…" : isOwner ? "Connected wallet is owner" : "Not owner"}
          tone={registryOwner === undefined ? undefined : isOwner ? "guard" : "slash"}
        />
      </SignalRow>

      {registryOwner !== undefined && !isOwner && (
        <StatusNotice tone="warn" title="Connect with the ServiceRegistry owner wallet to perform these operations.">
          Owner: <span className="pg-mono">{registryOwner as string}</span>
        </StatusNotice>
      )}

      <PanelSplit
        main={(
          <>
            <section className="ui-section">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Initial Setup — setPayPerCall</h2>
              </div>
              <div className="ui-section__body">
                <p className="pg-copy pg-copy--tight">
                  Wires the PayPerCall v7.1 address into the newly deployed ServiceRegistry v7, one time only.
                  Use this path if it has never been called before.
                </p>
                <AdminAction
                  label="setPayPerCall"
                  description="Only works when payPerCall = address(0)."
                  buttonLabel="Call"
                  onAction={doSetPayPerCall}
                  status={setPPCStatus}
                  error={setPPCError}
                >
                  <Input
                    value={setPPCInput}
                    onChange={e => setSetPPCInput(e.target.value)}
                    placeholder="0x..."
                    spellCheck={false}
                    aria-label="PayPerCall address for setPayPerCall"
                  />
                </AdminAction>
              </div>
            </section>

            <section className="ui-section pg-section--spaced">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Update via Timelock (2 days)</h2>
              </div>
              <div className="ui-section__body">
                <p className="pg-copy pg-copy--tight">
                  To change the PayPerCall address, propose first, then execute after 2 days.
                </p>
                <AdminAction
                  label="proposePayPerCall"
                  description="Propose the new address — starts the 2-day timelock."
                  buttonLabel="Propose"
                  buttonVariant="secondary"
                  onAction={doPropose}
                  status={proposeStatus}
                  error={proposeError}
                >
                  <Input
                    value={proposeInput}
                    onChange={e => setProposeInput(e.target.value)}
                    placeholder="0x..."
                    spellCheck={false}
                    aria-label="PayPerCall address for proposePayPerCall"
                  />
                </AdminAction>

                <dl className="pg-meta">
                  <div>
                    <dt>Pending address</dt>
                    <dd className="pg-address">{pendingPPC ? (pendingPPC as string) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Executable at</dt>
                    <dd className="pg-mono">{timelockStr}</dd>
                  </div>
                </dl>

                {timelockReady && (
                  <StatusNotice tone="success" title="Timelock elapsed — execute can be called." />
                )}

                <AdminAction
                  label="executePayPerCall"
                  description="Apply the change after the timelock period expires."
                  buttonLabel="Apply"
                  buttonVariant="outline"
                  onAction={doExecute}
                  status={execStatus}
                  error={execError}
                />
              </div>
            </section>
          </>
        )}
        rail={(
          <Ledger label="Correct Addresses">
            {addresses.map(([name, addr]) => (
              <LedgerRow
                key={addr}
                tone={name.includes("retired") ? "muted" : "neutral"}
                lead={name}
                meta={<span className="pg-address">{addr}</span>}
                trailing={<Copy value={addr} label={`Copy ${name} address`} />}
              />
            ))}
          </Ledger>
        )}
      />
    </PanelShell>
  );
}
