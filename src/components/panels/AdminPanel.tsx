import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONFIG, REGISTRY_ABI } from "../../lib/config";

const REGISTRY_ADMIN_ABI = [
  { name: "owner",        type: "function", stateMutability: "view",        inputs: [],                              outputs: [{type:"address"}] },
  { name: "payPerCall",   type: "function", stateMutability: "view",        inputs: [],                              outputs: [{type:"address"}] },
  { name: "setPayPerCall", type: "function", stateMutability: "nonpayable", inputs: [{name:"_payPerCall",type:"address"}], outputs: [] },
  ...REGISTRY_ABI,
] as const;

type TxStatus = "idle" | "pending" | "mining" | "success" | "error";

function StatusBadge({ status, error }: { status: TxStatus; error?: string }) {
  if (status === "idle")    return null;
  if (status === "pending") return <span className="admin-badge pending">Waiting...</span>;
  if (status === "mining")  return <span className="admin-badge mining">Writing to chain...</span>;
  if (status === "success") return <span className="admin-badge success">Success!</span>;
  return <span className="admin-badge error">{error ?? "Error"}</span>;
}

function AdminRow({
  label, description, buttonLabel, buttonColor = "blue",
  onAction, status, error, children,
}: {
  label: string;
  description: string;
  buttonLabel: string;
  buttonColor?: "blue" | "orange" | "red" | "green";
  onAction: () => void;
  status: TxStatus;
  error?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="admin-row">
      <div className="admin-row-info">
        <span className="admin-row-label">{label}</span>
        <span className="admin-row-desc">{description}</span>
      </div>
      {children && <div className="admin-row-input">{children}</div>}
      <div className="admin-row-actions">
        <button
          className={`admin-btn admin-btn-${buttonColor}`}
          onClick={onAction}
          disabled={status === "pending" || status === "mining"}
        >
          {buttonLabel}
        </button>
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

  if (!isConnected) {
    return (
      <div className="admin-panel">
        <div className="admin-empty">Please connect your wallet.</div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2 className="admin-title">Admin Panel</h2>
        <span className="admin-subtitle">ServiceRegistry v4 admin operations</span>
      </div>

      {/* Status cards */}
      <div className="admin-status-grid">
        <div className="admin-status-card">
          <span className="admin-status-label">Registry</span>
          <span className="admin-status-value mono">{CONFIG.registry.slice(0,10)}…</span>
        </div>
        <div className="admin-status-card">
          <span className="admin-status-label">Current PayPerCall</span>
          <span className={`admin-status-value mono ${currentPPC === CONFIG.payPerCall ? "text-green-400" : "text-yellow-400"}`}>
            {currentPPC ? (currentPPC as string).slice(0,10) + "…" : "—"}
          </span>
          {currentPPC === CONFIG.payPerCall
            ? <span className="admin-ok">Correct address</span>
            : <span className="admin-warn">v4 address not set</span>}
        </div>
        <div className="admin-status-card">
          <span className="admin-status-label">Owner</span>
          <span className={`admin-status-value mono ${isOwner ? "text-green-400" : "text-red-400"}`}>
            {registryOwner ? (registryOwner as string).slice(0,10) + "…" : "—"}
          </span>
          {isOwner ? <span className="admin-ok">Connected wallet is owner</span>
                   : <span className="admin-warn">Not owner</span>}
        </div>
      </div>

      {!isOwner && (
        <div className="admin-alert">
          Connect with the ServiceRegistry owner wallet to perform these operations.
          Owner: <span className="mono">{registryOwner as string}</span>
        </div>
      )}

      <div className="admin-section">
        <h3 className="admin-section-title">Initial Setup — setPayPerCall</h3>
        <p className="admin-section-desc">
          Wires the PayPerCall v4 address into the newly deployed ServiceRegistry v4, one time only.
          Use this path if it has never been called before.
        </p>
        <AdminRow
          label="setPayPerCall"
          description="Only works when payPerCall = address(0)."
          buttonLabel="Call"
          buttonColor="green"
          onAction={doSetPayPerCall}
          status={setPPCStatus}
          error={setPPCError}
        >
          <input
            className="admin-input"
            value={setPPCInput}
            onChange={e => setSetPPCInput(e.target.value)}
            placeholder="0x..."
            spellCheck={false}
          />
        </AdminRow>
      </div>

      <div className="admin-section">
        <h3 className="admin-section-title">Update via Timelock (2 days)</h3>
        <p className="admin-section-desc">
          To change the PayPerCall address, propose first, then execute after 2 days.
        </p>
        <AdminRow
          label="proposePayPerCall"
          description="Propose the new address — starts the 2-day timelock."
          buttonLabel="Propose"
          buttonColor="orange"
          onAction={doPropose}
          status={proposeStatus}
          error={proposeError}
        >
          <input
            className="admin-input"
            value={proposeInput}
            onChange={e => setProposeInput(e.target.value)}
            placeholder="0x..."
            spellCheck={false}
          />
        </AdminRow>

        <div className="admin-timelock-info">
          <span>Pending address: <span className="mono">{pendingPPC ? (pendingPPC as string) : "—"}</span></span>
          <span>Executable at: <span className="mono">{timelockStr}</span></span>
          {timelockReady && <span className="admin-ok">Timelock elapsed — execute can be called.</span>}
        </div>

        <AdminRow
          label="executePayPerCall"
          description="Apply the change after the timelock period expires."
          buttonLabel="Apply"
          buttonColor="blue"
          onAction={doExecute}
          status={execStatus}
          error={execError}
        >
          <></>
        </AdminRow>
      </div>

      <div className="admin-section">
        <h3 className="admin-section-title">Correct Addresses</h3>
        <div className="admin-addr-list">
          {[
            ["ServiceRegistry v7", CONFIG.registry],
            ["PayPerCall v7.1",    CONFIG.payPerCall],
            ["DisputeQuality v2 (retired)", CONFIG.disputeQuality],
            ["SLAFutures v3",      CONFIG.slaFutures],
            ["ReputationLoan v3",  CONFIG.reputationLoan],
            ["CrossChainReceiver v2", CONFIG.crossChainReceiver],
          ].map(([name, addr]) => (
            <div key={addr} className="admin-addr-row">
              <span className="admin-addr-name">{name}</span>
              <span className="admin-addr-val mono">{addr}</span>
              <button
                className="admin-copy-btn"
                onClick={() => navigator.clipboard.writeText(addr)}
                 title="Copy"
              >⎘</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
