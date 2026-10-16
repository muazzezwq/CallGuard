import { useState } from "react";
import {
  LayoutDashboard, Store, SquareTerminal, ArrowLeftRight, ReceiptText, Server,
  Star, Wrench, BarChart3, ScrollText, Settings, ChevronDown,
  Boxes, FileText, Webhook, Workflow, Coins, Wallet, Bot, KeyRound,
  Landmark, TrendingUp, Link2, Repeat, Briefcase, ListChecks, Scale,
  BadgeCheck, UserPlus, ShieldAlert, EyeOff, ShieldCheck, Layers, Gauge,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAccount } from "wagmi";
import { useAppStore, PanelId } from "../../store/useAppStore";
import { Mark } from "../../ui";
import ProgressTracker from "./ProgressTracker";

type NavItem = {
  id: PanelId;
  simple: string;
  pro: string;
  icon: LucideIcon;
};

/* ── Reference nav (exact order) ─────────────────────────── */
const PRIMARY: NavItem[] = [
  { id: "overview",    simple: "Overview",     pro: "Overview",     icon: LayoutDashboard },
  { id: "marketplace", simple: "Marketplace",  pro: "Marketplace",  icon: Store },
  { id: "calls",       simple: "Call Builder", pro: "Call Builder", icon: SquareTerminal },
  { id: "history",     simple: "Transactions", pro: "Transactions", icon: ArrowLeftRight },
  { id: "receipts",    simple: "Receipts",     pro: "Receipts",     icon: ReceiptText },
  { id: "providers",   simple: "Providers",    pro: "Providers",    icon: Server },
];

const OPERATIONS: NavItem[] = [
  { id: "analytics",     simple: "Analytics", pro: "Analytics", icon: BarChart3 },
  { id: "notifications", simple: "Logs",      pro: "Logs",      icon: ScrollText },
  { id: "settings",      simple: "Settings",  pro: "Settings",  icon: Settings },
];

/* ── Reputation group (rankings + provider details) ──────── */
const REPUTATION: NavItem[] = [
  { id: "leaderboard",  simple: "Rankings",         pro: "Rankings",         icon: Star },
  { id: "provprofile",  simple: "Provider details", pro: "Provider details", icon: BadgeCheck },
];

/* ── Developer Tools group (all advanced panels) ─────────── */
const DEV_DEVELOPER: NavItem[] = [
  { id: "mcp",          simple: "API / MCP",     pro: "API / MCP",     icon: Boxes },
  { id: "apidocs",      simple: "API Docs",      pro: "API Docs",      icon: FileText },
  { id: "webhooks",     simple: "Webhooks",      pro: "Webhooks",      icon: Webhook },
  { id: "pipelinehook", simple: "Pipeline Hook", pro: "Pipeline Hook", icon: Workflow },
];

const DEV_RAILS: NavItem[] = [
  { id: "nano",    simple: "Nanopayments",   pro: "Nanopayments",    icon: Coins },
  { id: "bridge",  simple: "Bridge",         pro: "Bridge",          icon: Link2 },
  { id: "balance", simple: "Unified Balance", pro: "Unified Balance", icon: Wallet },
  { id: "agent",   simple: "Agent Wallet",   pro: "Agent Wallet",    icon: Bot },
  { id: "passkey", simple: "Passkey Wallet", pro: "Passkey Wallet",  icon: KeyRound },
];

const DEV_ADVANCED: NavItem[] = [
  { id: "requests",      simple: "My Requests",  pro: "My Requests",     icon: ListChecks },
  { id: "payments",      simple: "Payments",     pro: "Payments",        icon: Gauge },
  { id: "disputes",      simple: "Disputes",     pro: "Disputes",        icon: Scale },
  { id: "quality",       simple: "Quality",      pro: "Quality Disputes", icon: ShieldAlert },
  { id: "lending",       simple: "RepFi Lending", pro: "RepFi Lending",  icon: Landmark },
  { id: "futures",       simple: "SLA Futures",  pro: "SLA Futures",     icon: TrendingUp },
  { id: "attestation",   simple: "SLA Bridge",   pro: "SLA Bridge",      icon: ShieldCheck },
  { id: "subscriptions", simple: "Subscriptions", pro: "Subscriptions",  icon: Repeat },
  { id: "jobs",          simple: "Jobs",         pro: "Jobs",            icon: Briefcase },
  { id: "bulkcall",      simple: "Bulk Call",    pro: "Bulk Call",       icon: Layers },
  { id: "verify",        simple: "Verify",       pro: "Verify Receipt",  icon: ShieldCheck },
  { id: "register",      simple: "Become a Provider", pro: "Register",   icon: UserPlus },
  { id: "privacy",       simple: "Privacy",      pro: "Privacy",         icon: EyeOff },
  { id: "admin",         simple: "Admin",        pro: "Admin Panel",     icon: ShieldCheck },
];

export function SidebarBrand() {
  return (
    <div className="sb-logo">
      <div className="sb-dot"><Mark size={24} /></div>
      <div className="sb-brand-text">
        <div className="sb-name">CallGuard</div>
        <div className="sb-net">Arc Testnet</div>
      </div>
    </div>
  );
}

function NavButton({ item, active, label, onClick }: { item: NavItem; active: boolean; label: string; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`sb-item${active ? " on" : ""}`}
      data-nav={item.id}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span className="sb-icon"><Icon size={16} strokeWidth={1.8} /></span>
      <span className="sb-label">{label}</span>
    </button>
  );
}

export default function Sidebar({ onNav }: { onNav?: () => void }) {
  const { activePanel, setPanel, mode } = useAppStore();
  const { address, isConnected } = useAccount();
  const [devOpen, setDevOpen] = useState(false);
  const [repOpen, setRepOpen] = useState(false);

  const label = (i: NavItem) => (mode === "simple" ? i.simple : i.pro);
  const go = (id: PanelId) => { setPanel(id); onNav?.(); };
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  const groupActive = (items: NavItem[]) => items.some((i) => i.id === activePanel);

  return (
    <nav className="app-sidebar" id="appSidebar" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SidebarBrand />

      <div className="sb-scroll">
        {/* Primary — reference order */}
        {PRIMARY.map((i) => (
          <NavButton key={i.id} item={i} active={activePanel === i.id} label={label(i)} onClick={() => go(i.id)} />
        ))}

        {/* Reputation group */}
        <button
          type="button"
          className={`sb-item sb-group${groupActive(REPUTATION) ? " has-active" : ""}`}
          aria-expanded={repOpen}
          onClick={() => setRepOpen((o) => !o)}
        >
          <span className="sb-icon"><Star size={16} strokeWidth={1.8} /></span>
          <span className="sb-label">Reputation</span>
          <ChevronDown size={14} className={`sb-chev${repOpen ? " open" : ""}`} />
        </button>
        {repOpen && (
          <div className="sb-sub">
            {REPUTATION.map((i) => (
              <NavButton key={i.id} item={i} active={activePanel === i.id} label={label(i)} onClick={() => go(i.id)} />
            ))}
          </div>
        )}

        {/* Developer Tools group */}
        <button
          type="button"
          className={`sb-item sb-group${groupActive([...DEV_DEVELOPER, ...DEV_RAILS, ...DEV_ADVANCED]) ? " has-active" : ""}`}
          aria-expanded={devOpen}
          onClick={() => setDevOpen((o) => !o)}
        >
          <span className="sb-icon"><Wrench size={16} strokeWidth={1.8} /></span>
          <span className="sb-label">Developer Tools</span>
          <ChevronDown size={14} className={`sb-chev${devOpen ? " open" : ""}`} />
        </button>
        {devOpen && (
          <div className="sb-sub">
            <div className="sb-grouplabel">Developer</div>
            {DEV_DEVELOPER.map((i) => (
              <NavButton key={i.id} item={i} active={activePanel === i.id} label={label(i)} onClick={() => go(i.id)} />
            ))}
            <div className="sb-grouplabel">Payment rails</div>
            {DEV_RAILS.map((i) => (
              <NavButton key={i.id} item={i} active={activePanel === i.id} label={label(i)} onClick={() => go(i.id)} />
            ))}
            <div className="sb-grouplabel">Advanced</div>
            {DEV_ADVANCED.map((i) => (
              <NavButton key={i.id} item={i} active={activePanel === i.id} label={label(i)} onClick={() => go(i.id)} />
            ))}
          </div>
        )}

        {/* Operations — reference order */}
        <div className="sb-section">Operations</div>
        {OPERATIONS.map((i) => (
          <NavButton key={i.id} item={i} active={activePanel === i.id} label={label(i)} onClick={() => go(i.id)} />
        ))}

        <div className="sb-progress"><ProgressTracker /></div>
      </div>

      {/* Wallet chip — reference footer */}
      <div className="sb-foot">
        <span className={`sb-foot-dot${isConnected ? " ok" : ""}`} />
        <div className="sb-foot-text">
          <span className="sb-foot-addr">{isConnected ? short : "Not connected"}</span>
          <span className="sb-foot-state">{isConnected ? "Connected • Arc Testnet" : "Connect a wallet"}</span>
        </div>
      </div>
    </nav>
  );
}
