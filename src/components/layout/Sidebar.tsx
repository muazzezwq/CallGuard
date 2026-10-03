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
  { id: "settings",      label: "Settings",      icon: <Settings size={16} />,    modes: ["simple","pro"] },
];

export default function Sidebar() {
  const { activePanel, setPanel, mode, advancedOpen, toggleAdvanced } = useAppStore();

  const Item = ({ item }: { item: NavItem }) => {
    if (!item.modes.includes(mode)) return null;
    const active = activePanel === item.id;
    return (
      <button
        onClick={() => setPanel(item.id)}
        className={clsx(
          "sb-item w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
          active
            ? "bg-accent/10 text-accent font-medium border-l-2 border-accent"
            : "text-text-dim hover:text-text hover:bg-bg-3"
        )}
      >
        <span className="sb-icon opacity-70">{item.icon}</span>
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="app-sidebar flex flex-col gap-1 py-3 px-2 overflow-y-auto">
      {/* Brand */}
      <div className="flex items-center gap-2 px-3 py-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center text-white text-xs font-bold shadow-glow-green">CG</div>
        <div>
          <div className="text-sm font-semibold text-text font-display">CallGuard</div>
          <div className="text-xs text-text-faint">Arc Testnet</div>
        </div>
      </div>

      <div className="sb-section-label px-3 py-1 text-xs uppercase tracking-widest text-text-faint">Workspace</div>
      {CORE.map(i => <Item key={i.id} item={i} />)}

      <div className="sb-section-label px-3 py-1 mt-2 text-xs uppercase tracking-widest text-text-faint">Settlement</div>
      {SETTLEMENT.map(i => <Item key={i.id} item={i} />)}

      {mode === "pro" && (
        <>
          <button
            onClick={toggleAdvanced}
            className="flex items-center justify-between w-full px-3 py-1 mt-2 text-xs uppercase tracking-widest text-text-faint hover:text-text-dim transition-colors"
          >
            <span>Advanced</span>
            {advancedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {advancedOpen && ADVANCED.map(i => <Item key={i.id} item={i} />)}
        </>
      )}

      <div className="sb-section-label px-3 py-1 mt-2 text-xs uppercase tracking-widest text-text-faint">System</div>
      {SYSTEM.map(i => <Item key={i.id} item={i} />)}
    </aside>
  );
}
