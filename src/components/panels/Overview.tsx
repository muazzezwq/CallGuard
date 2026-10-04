import { useAccount } from "wagmi";
import { useReadContract } from "wagmi";
import { CONFIG, REGISTRY_ABI, PPC_ABI } from "../../lib/config";
import { useSubgraph } from "../../hooks/useSubgraph";
import { ExternalLink } from "lucide-react";

const ARCSCAN = "https://explorer.testnet.arc.io";

const s = {
  page: { padding: "20px 16px", maxWidth: 800, margin: "0 auto" },
  badge: { display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "var(--accent)", fontSize: 11, fontWeight: 600, marginBottom: 12 },
  dot: { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite" },
  h1: { fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 },
  card: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" },
  cardLabel: { fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 4 },
  cardVal: { fontSize: 22, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-display)" },
  cardSub: { fontSize: 11, color: "var(--text-dim)", marginTop: 2 },
  section: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 },
  sectionTitle: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 12 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" },
  rowLabel: { fontSize: 12, color: "var(--text-dim)" },
  rowVal: { fontSize: 12, color: "var(--text)", fontWeight: 500, fontFamily: "var(--font-mono)" },
  actItem: { display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" },
  statusDot: (status: string) => ({ width: 8, height: 8, borderRadius: "50%", background: status === "STARTED" ? "var(--accent)" : status === "SLASHED" ? "var(--danger)" : "#3b82f6", marginTop: 4, flexShrink: 0 }),
  link: { color: "var(--accent)", textDecoration: "none", fontFamily: "var(--font-mono)", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 },
  contractGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  contractCard: { background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" },
  contractName: { fontSize: 11, color: "var(--text-dim)", fontWeight: 600, marginBottom: 3 },
};

function short(addr: string) {
  return addr ? `${addr.slice(0, 6)}..${addr.slice(-4)}` : "—";
}

export default function Overview() {
  const { address } = useAccount();

  const { data: nextId } = useReadContract({ address: CONFIG.registryAddress as `0x${string}`, abi: REGISTRY_ABI, functionName: "nextProviderId", chainId: CONFIG.chainId });
  const { data: callCount } = useReadContract({ address: CONFIG.ppcAddress as `0x${string}`, abi: PPC_ABI, functionName: "callCount", chainId: CONFIG.chainId });
  const { data: receiptCount } = useReadContract({ address: CONFIG.ppcAddress as `0x${string}`, abi: PPC_ABI, functionName: "receiptCount", chainId: CONFIG.chainId });
  const { data: slashCount } = useReadContract({ address: CONFIG.ppcAddress as `0x${string}`, abi: PPC_ABI, functionName: "slashCount", chainId: CONFIG.chainId });

  const providerCount = nextId ? Number(nextId) - 1 : null;
  const calls = callCount ? Number(callCount) : null;
  const receipts = receiptCount ? Number(receiptCount) : null;
  const slashes = slashCount ? Number(slashCount) : null;
  const honorRate = (calls && calls > 0) ? Math.round((receipts || 0) / calls * 100) : 0;

  const { data: actData } = useSubgraph(`{ calls(first:6, orderBy:createdAt, orderDirection:desc) { id providerId caller amount status createdAt } }`);
  const activities: { id: string; providerId: string; caller: string; amount: string; status: string; createdAt: string }[] = actData?.calls || [];

  const contracts = [
    { name: "ServiceRegistry", addr: CONFIG.registryAddress },
    { name: "PayPerCall", addr: CONFIG.ppcAddress },
    { name: "DisputeQuality", addr: CONFIG.disputeQualityAddress },
    { name: "SLAFutures", addr: CONFIG.slaFuturesAddress },
    { name: "ReputationLoan", addr: CONFIG.reputationLoanAddress },
    { name: "SLABridge", addr: CONFIG.slaBridgeAddress },
  ];

  return (
    <div style={s.page}>
      <div style={s.badge}>
        <span style={s.dot} />
        Arc Testnet · Live
      </div>
      <h1 style={s.h1}>Overview</h1>
      <p style={s.sub}>Monitor services, requests and settlements on Arc Testnet.</p>

      {/* Stats */}
      <div style={s.grid4}>
        <div style={s.card}>
          <div style={s.cardLabel}>Providers</div>
          <div style={s.cardVal}>{providerCount ?? "—"}</div>
          <div style={s.cardSub}>registered</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}>Total Calls</div>
          <div style={s.cardVal}>{calls ?? "—"}</div>
          <div style={s.cardSub}>all-time</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}>Receipts</div>
          <div style={s.cardVal}>{receipts ?? "—"}</div>
          <div style={s.cardSub}>SLA honored</div>
        </div>
        <div style={{ ...s.card, borderColor: honorRate > 50 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)" }}>
          <div style={s.cardLabel}>Honor Rate</div>
          <div style={{ ...s.cardVal, color: honorRate > 50 ? "var(--accent)" : "var(--danger)" }}>{honorRate}%</div>
          <div style={s.cardSub}>{slashes ?? "—"} slashes</div>
        </div>
      </div>

      {/* Live Activity */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Live Activity</div>
        {activities.length === 0 && <div style={{ color: "var(--text-faint)", fontSize: 12 }}>Loading activity...</div>}
        {activities.map((a, i) => (
          <div key={i} style={{ ...s.actItem, borderBottom: i < activities.length - 1 ? "1px solid var(--border)" : "none" }}>
            <span style={s.statusDot(a.status)} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
                <span style={{ color: a.status === "STARTED" ? "var(--accent)" : a.status === "SLASHED" ? "var(--danger)" : "#3b82f6", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 6, fontWeight: 700 }}>{a.status}</span>
                provider #{a.providerId}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                {a.caller ? `${a.caller.slice(0, 8)}...` : "—"} · {parseFloat(a.amount || "0") / 1e6} USDC
              </div>
            </div>
            <a href={`${ARCSCAN}/tx/${a.id}`} target="_blank" rel="noreferrer" style={s.link}>
              <ExternalLink size={10} />
            </a>
          </div>
        ))}
      </div>

      {/* Deployed Contracts */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Deployed Contracts</div>
        <div style={s.contractGrid}>
          {contracts.map((c) => (
            <div key={c.name} style={s.contractCard}>
              <div style={s.contractName}>{c.name}</div>
              <a href={`${ARCSCAN}/address/${c.addr}`} target="_blank" rel="noreferrer" style={s.link}>
                {short(c.addr)} <ExternalLink size={9} />
              </a>
            </div>
          ))}
        </div>
      </div>

      {address && (
        <div style={{ ...s.section, borderColor: "rgba(16,185,129,0.2)", background: "rgba(16,185,129,0.04)" }}>
          <div style={s.sectionTitle}>Your Wallet</div>
          <div style={s.row}>
            <span style={s.rowLabel}>Address</span>
            <a href={`${ARCSCAN}/address/${address}`} target="_blank" rel="noreferrer" style={s.link}>{short(address)} <ExternalLink size={10} /></a>
          </div>
          <div style={{ ...s.row, borderBottom: "none" }}>
            <span style={s.rowLabel}>Network</span>
            <span style={s.rowVal}>Arc Testnet (Chain {CONFIG.chainId})</span>
          </div>
        </div>
      )}
    </div>
  );
}
