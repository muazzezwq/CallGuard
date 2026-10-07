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
  if (status === "pending") return <span className="admin-badge pending">Bekliyor...</span>;
  if (status === "mining")  return <span className="admin-badge mining">Zincire yazılıyor...</span>;
  if (status === "success") return <span className="admin-badge success">Başarılı!</span>;
  return <span className="admin-badge error">{error ?? "Hata"}</span>;
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
      setSetPPCError("Geçersiz adres"); setSetPPCStatus("error"); return;
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
      setProposeError("Geçersiz adres"); setProposeStatus("error"); return;
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
        <div className="admin-empty">Lütfen cüzdanını bağla.</div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2 className="admin-title">Admin Panel</h2>
        <span className="admin-subtitle">ServiceRegistry v4 yönetim işlemleri</span>
      </div>

      {/* Status cards */}
      <div className="admin-status-grid">
        <div className="admin-status-card">
          <span className="admin-status-label">Registry</span>
          <span className="admin-status-value mono">{CONFIG.registry.slice(0,10)}…</span>
        </div>
        <div className="admin-status-card">
          <span className="admin-status-label">Mevcut PayPerCall</span>
          <span className={`admin-status-value mono ${currentPPC === CONFIG.payPerCall ? "text-green-400" : "text-yellow-400"}`}>
            {currentPPC ? (currentPPC as string).slice(0,10) + "…" : "—"}
          </span>
          {currentPPC === CONFIG.payPerCall
            ? <span className="admin-ok">Doğru adres</span>
            : <span className="admin-warn">v4 adresi ayarlanmadı</span>}
        </div>
        <div className="admin-status-card">
          <span className="admin-status-label">Owner</span>
          <span className={`admin-status-value mono ${isOwner ? "text-green-400" : "text-red-400"}`}>
            {registryOwner ? (registryOwner as string).slice(0,10) + "…" : "—"}
          </span>
          {isOwner ? <span className="admin-ok">Bağlı cüzdan owner</span>
                   : <span className="admin-warn">Owner değilsin</span>}
        </div>
      </div>

      {!isOwner && (
        <div className="admin-alert">
          Bu işlemleri yapmak için ServiceRegistry owner cüzdanıyla bağlanman gerekiyor.
          Owner: <span className="mono">{registryOwner as string}</span>
        </div>
      )}

      <div className="admin-section">
        <h3 className="admin-section-title">İlk Kurulum — setPayPerCall</h3>
        <p className="admin-section-desc">
          Yeni deploy edilen ServiceRegistry v4'e PayPerCall v4 adresini bir kez bağlar.
          Daha önce hiç çağrılmadıysa bu yolu kullan.
        </p>
        <AdminRow
          label="setPayPerCall"
          description="Yalnızca payPerCall = address(0) olduğunda çalışır."
          buttonLabel="Çağır"
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
        <h3 className="admin-section-title">Timelock ile Güncelleme (2 gün)</h3>
        <p className="admin-section-desc">
          PayPerCall adresini değiştirmek için önce öner, 2 gün sonra uygula.
        </p>
        <AdminRow
          label="proposePayPerCall"
          description="Yeni adresi öner — 2 günlük timelock başlar."
          buttonLabel="Öner"
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
          <span>Bekleyen adres: <span className="mono">{pendingPPC ? (pendingPPC as string) : "—"}</span></span>
          <span>Uygulanabilir: <span className="mono">{timelockStr}</span></span>
          {timelockReady && <span className="admin-ok">Timelock geçti — execute çağrılabilir.</span>}
        </div>

        <AdminRow
          label="executePayPerCall"
          description="Timelock süresi dolduktan sonra değişikliği uygula."
          buttonLabel="Uygula"
          buttonColor="blue"
          onAction={doExecute}
          status={execStatus}
          error={execError}
        >
          <></>
        </AdminRow>
      </div>

      <div className="admin-section">
        <h3 className="admin-section-title">Doğru Adresler</h3>
        <div className="admin-addr-list">
          {[
            ["ServiceRegistry v4", CONFIG.registry],
            ["PayPerCall v4",      CONFIG.payPerCall],
            ["DisputeQuality v2",  CONFIG.disputeQuality],
            ["SLAFutures v2",      CONFIG.slaFutures],
            ["ReputationLoan v2",  CONFIG.reputationLoan],
            ["CrossChainReceiver v2", CONFIG.crossChainReceiver],
          ].map(([name, addr]) => (
            <div key={addr} className="admin-addr-row">
              <span className="admin-addr-name">{name}</span>
              <span className="admin-addr-val mono">{addr}</span>
              <button
                className="admin-copy-btn"
                onClick={() => navigator.clipboard.writeText(addr)}
                title="Kopyala"
              >⎘</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
