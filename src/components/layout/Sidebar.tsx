import { useAppStore, PanelId, AppMode } from "../../store/useAppStore";
import {
  Home, Zap, Store, List, Server, FileText, CreditCard, Shield, ShieldCheck,
  Cpu, TrendingUp, Package, Link2, RefreshCw, Terminal, Bell, BarChart2,
  History, BookOpen, CheckSquare, User, Settings, ChevronDown, ChevronRight,
} from "lucide-react";
import clsx from "clsx";

type NavItem = { id: PanelId; label: string; icon: React.ReactNode; modes: AppMode[] };

const CORE: NavItem[] = [
  { id: "overview",    label: "Overview",        icon: <Home size={16} />,        modes: ["simple","pro"] },
  { id: "calls",       label: "Call Builder",    icon: <Terminal size={16} />,    modes: ["simple","pro"] },
  { id: "marketplace", label: "Browse Services", icon: <Store size={16} />,       modes: ["simple","pro"] },
  { id: "requests",    label: "My Requests",     icon: <List size={16} />,        modes: ["simple","pro"] },
  { id: "providers",   label: "Providers",       icon: <Server size={16} />,      modes: ["simple","pro"] },
  { id: "receipts",    label: "Receipts",        icon: <FileText size={16} />,    modes: ["simple","pro"] },
];

const SETTLEMENT: NavItem[] = [
  { id: "payments",  label: "Payments",  icon: <CreditCard size={16} />, modes: ["simple","pro"] },
  { id: "disputes",  label: "Disputes",  icon: <Shield size={16} />,     modes: ["simple","pro"] },
  { id: "history",   label: "History",   icon: <History size={16} />,    modes: ["simple","pro"] },
  { id: "nano",      label: "Nanopayment", icon: <Zap size={16} />,      modes: ["simple","pro"] },
];

const ADVANCED: NavItem[] = [
  { id: "quality",     label: "Quality Disputes",   icon: <ShieldCheck size={16} />, modes: ["pro"] },
  { id: "agent",       label: "Agent Loop",         icon: <Cpu size={16} />,         modes: ["pro"] },
  { id: "lending",     label: "RepFi Lending",      icon: <TrendingUp size={16} />,  modes: ["pro"] },
  { id: "futures",     label: "SLA Futures",        icon: <Package size={16} />,     modes: ["pro"] },
  { id: "attestation", label: "SLA Bridge",         icon: <Link2 size={16} />,       modes: ["pro"] },
  { id: "subscriptions",label:"Subscriptions",      icon: <RefreshCw size={16} />,   modes: ["pro"] },
  { id: "mcp",         label: "API / MCP",          icon: <Terminal size={16} />,    modes: ["pro"] },
  { id: "webhooks",    label: "Webhooks",           icon: <Zap size={16} />,         modes: ["pro"] },
  { id: "leaderboard", label: "Leaderboard",        icon: <BarChart2 size={16} />,   modes: ["pro"] },
  { id: "apidocs",     label: "API Docs",           icon: <BookOpen size={16} />,    modes: ["pro"] },
];

const SYSTEM: NavItem[] = [
  { id: "notifications", label: "Notifications", icon: <Bell size={16} />,        modes: ["simple","pro"] },
  { id: "privacy",       label: "Privacy",       icon: <Shield size={16} />,      modes: ["simple","pro"] },
  { id: "settings",      label: "Settings",      icon: <Settings size={16} />,    modes: ["simple","pro"] },
];

export default function Sidebar({ onNav }: { onNav?: () => void }) {
  const { activePanel, setPanel, mode, advancedOpen, toggleAdvanced } = useAppStore();

  const Item = ({ item }: { item: NavItem }) => {
    if (!item.modes.includes(mode)) return null;
    const active = activePanel === item.id;
    return (
      <button
        onClick={() => { setPanel(item.id); onNav?.(); }}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "7px 12px", borderRadius: 8, border: "none",
          background: active ? "rgba(16,185,129,0.1)" : "transparent",
          color: active ? "var(--accent)" : "var(--text-dim)",
          fontWeight: active ? 500 : 400,
          fontSize: 13, cursor: "pointer", textAlign: "left",
          borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
          transition: "all 0.15s",
        }}
      >
        <span style={{ opacity: 0.8, display: "flex" }}>{item.icon}</span>
        <span>{item.label}</span>
      </button>
    );
  };

  const SectionLabel = ({ label }: { label: string }) => (
    <div style={{ padding: "8px 12px 4px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-faint)", fontWeight: 600 }}>
      {label}
    </div>
  );

  return (
    <aside style={{ display: "flex", flexDirection: "column", gap: 1, padding: "12px 8px", overflowY: "auto", height: "100%", width: "100%" }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px 12px" }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#10b981,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>CG</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>CallGuard</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Arc Testnet</div>
        </div>
      </div>

      <SectionLabel label="Workspace" />
      {CORE.map(i => <Item key={i.id} item={i} />)}

      <SectionLabel label="Settlement" />
      {SETTLEMENT.map(i => <Item key={i.id} item={i} />)}

      {mode === "pro" && (
        <>
          <button onClick={toggleAdvanced} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 12px 4px", border: "none", background: "transparent", cursor: "pointer", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-faint)", fontWeight: 600 }}>
            <span>Advanced</span>
            {advancedOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
          {advancedOpen && ADVANCED.map(i => <Item key={i.id} item={i} />)}
        </>
      )}

      <SectionLabel label="System" />
      {SYSTEM.map(i => <Item key={i.id} item={i} />)}
    </aside>
  );
}
