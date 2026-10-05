import { useAppStore, PanelId } from "../../store/useAppStore";

/* ── Nav item definition ─────────────────────────────────── */
type NavItem = {
  id: PanelId;
  simple: string;
  pro: string;
  icon: string; // raw SVG path/content as JSX string key
  badge?: { text: string; color: string };
  badgeId?: string;
};

/* exact sidebar items from original HTML, in order */
const WORKSPACE: NavItem[] = [
  {
    id: "overview", simple: "Home", pro: "Overview",
    icon: "home",
  },
  {
    id: "calls", simple: "Make a Request", pro: "Call Builder",
    icon: "terminal",
  },
  {
    id: "marketplace", simple: "Browse Services", pro: "Services",
    icon: "store",
  },
];

const OPERATIONS: NavItem[] = [
  {
    id: "requests", simple: "My Requests", pro: "Requests",
    icon: "list",
  },
  {
    id: "providers", simple: "Providers", pro: "Providers",
    icon: "server",
  },
  {
    id: "receipts", simple: "Receipts", pro: "Receipts",
    icon: "file",
  },
];

const SETTLEMENT: NavItem[] = [
  {
    id: "payments", simple: "Payments", pro: "Payments",
    icon: "card",
  },
  {
    id: "disputes", simple: "Disputes", pro: "Disputes",
    icon: "shield-warn", badgeId: "disputeBadge",
  },
];

const ADVANCED: NavItem[] = [
  {
    id: "quality", simple: "Quality", pro: "Quality Disputes",
    icon: "shield-check",
    badge: { text: "NEW", color: "#10b981" },
  },
  {
    id: "agent", simple: "Agent Loop", pro: "Agent Loop",
    icon: "cpu",
    badge: { text: "NEW", color: "#f59e0b" },
  },
  {
    id: "lending", simple: "RepFi Lending", pro: "RepFi Lending",
    icon: "trending",
    badge: { text: "NEW", color: "#10b981" },
  },
  {
    id: "futures", simple: "SLA Futures", pro: "SLA Futures",
    icon: "inbox",
    badge: { text: "NEW", color: "#8b5cf6" },
  },
  {
    id: "attestation", simple: "SLA Bridge", pro: "SLA Bridge",
    icon: "shield-check2",
    badge: { text: "NEW", color: "#0ea5e9" },
  },
  {
    id: "subscriptions", simple: "Subscriptions", pro: "Subscriptions",
    icon: "refresh",
  },
  {
    id: "jobs", simple: "Claims", pro: "Claims",
    icon: "briefcase",
  },
];

const DEVELOPER: NavItem[] = [
  {
    id: "mcp", simple: "API", pro: "API / MCP",
    icon: "terminal",
  },
  {
    id: "webhooks", simple: "Webhooks", pro: "Webhooks",
    icon: "zap",
  },
  {
    id: "notifications", simple: "Notifications", pro: "Notifications",
    icon: "bell", badgeId: "notifBadge",
  },
  {
    id: "leaderboard", simple: "Leaderboard", pro: "Leaderboard",
    icon: "bar-chart",
  },
];

const SYSTEM: NavItem[] = [
  {
    id: "history", simple: "History", pro: "Tx History",
    icon: "clock",
  },
  {
    id: "apidocs", simple: "API Docs", pro: "API Docs",
    icon: "doc",
  },
  {
    id: "register", simple: "Become a Provider", pro: "Register",
    icon: "user-check",
  },
  {
    id: "verify", simple: "Verify", pro: "Verify Receipt",
    icon: "shield-verify",
  },
  {
    id: "settings", simple: "Settings", pro: "Settings",
    icon: "gear",
  },
];

/* ── SVG icons (from original HTML) ─────────────────────── */
function SbIcon({ name }: { name: string }) {
  const s = { width: 15, height: 15 };
  const sw = "1.6";
  switch (name) {
    case "home": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case "terminal": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
    case "store": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8L6 7h12l-2-4z"/><path d="M12 12v3"/><path d="M9.5 13.5l2.5-1.5 2.5 1.5"/></svg>;
    case "list": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/></svg>;
    case "server": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>;
    case "file": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/></svg>;
    case "card": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
    case "shield-warn": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case "shield-check": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>;
    case "shield-check2": return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>;
    case "cpu": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>;
    case "trending": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><line x1="1" y1="21" x2="23" y2="3"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="5" r="2"/></svg>;
    case "inbox": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 17.24 4H6.76a2 2 0 0 0-1.91 1.11z"/></svg>;
    case "refresh": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
    case "briefcase": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="12.01"/></svg>;
    case "zap": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
    case "bell": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
    case "bar-chart": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    case "clock": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case "doc": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
    case "user-check": return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>;
    case "shield-verify": return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>;
    case "gear": return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    default: return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}><circle cx="12" cy="12" r="10"/></svg>;
  }
}

export default function Sidebar({ onNav }: { onNav?: () => void }) {
  const { activePanel, setPanel, mode, advancedOpen, toggleAdvanced } = useAppStore();

  const Item = ({ item }: { item: NavItem }) => {
    const active = activePanel === item.id;
    const label = mode === "simple" ? item.simple : item.pro;
    return (
      <div
        className={`sb-item${active ? " on" : ""}`}
        data-nav={item.id}
        onClick={() => { setPanel(item.id); onNav?.(); }}
      >
        <span className="sb-icon"><SbIcon name={item.icon} /></span>
        <span>{label}</span>
        {item.badge && (
          <span style={{ marginLeft: "auto", background: item.badge.color, color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 99 }}>
            {item.badge.text}
          </span>
        )}
        {item.badgeId === "disputeBadge" && (
          <span id="disputeBadge" style={{ display: "none", marginLeft: "auto", background: "var(--danger)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, minWidth: 18, textAlign: "center" }}></span>
        )}
        {item.badgeId === "notifBadge" && (
          <span id="notifBadge" style={{ display: "none", marginLeft: "auto", background: "var(--danger)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, minWidth: 18, textAlign: "center" }}></span>
        )}
      </div>
    );
  };

  const Section = ({ label, id, onClick, chevronOpen }: { label: string; id?: string; onClick?: () => void; chevronOpen?: boolean }) => (
    <div
      className="sb-section"
      id={id}
      onClick={onClick}
      style={onClick ? { cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", justifyContent: "space-between" } : undefined}
    >
      <span>{label}</span>
      {onClick !== undefined && (
        <svg id="sbAdvancedChevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transition: "transform .2s", transform: chevronOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
    </div>
  );

  return (
    <nav className="app-sidebar" id="appSidebar" style={{ display: "flex", flexDirection: "column", overflowY: "auto", height: "100%" }}>
      {/* Logo */}
      <div className="sb-logo">
        <div className="sb-dot">⚡</div>
        <div>
          <div className="sb-name">CallGuard</div>
          <div className="sb-net">Arc Testnet</div>
        </div>
      </div>

      <Section label="Workspace" />
      {WORKSPACE.map(i => <Item key={i.id} item={i} />)}

      <Section label="Operations" />
      {OPERATIONS.map(i => <Item key={i.id} item={i} />)}

      <Section label="Settlement" />
      {SETTLEMENT.map(i => <Item key={i.id} item={i} />)}

      {/* Advanced — collapsible, visible in both modes */}
      <Section
        label="Advanced"
        id="sbAdvancedToggle"
        onClick={toggleAdvanced}
        chevronOpen={advancedOpen}
      />
      {advancedOpen && (
        <div id="sbAdvancedGroup">
          {ADVANCED.map(i => <Item key={i.id} item={i} />)}
          <Section label="Developer" />
          {DEVELOPER.map(i => <Item key={i.id} item={i} />)}
        </div>
      )}

      <Section label="System" />
      {SYSTEM.map(i => <Item key={i.id} item={i} />)}
    </nav>
  );
}
