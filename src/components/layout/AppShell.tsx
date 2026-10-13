import { lazy, Suspense, useState, useEffect } from "react";
import { useAppStore, PanelId } from "../../store/useAppStore";
import Sidebar from "./Sidebar";
import AppTopbar from "./AppTopbar";
import AppFooter from "./AppFooter";
import OnboardingWizard from "./OnboardingWizard";
import LiveBar from "./LiveBar";
import CommandPalette from "./CommandPalette";
import RoleModal from "./RoleModal";
import UsdcBanner from "./UsdcBanner";
import ContextualHint from "./ContextualHint";
import ProgressTracker from "./ProgressTracker";
import { initTabTitleCounter } from "../../lib/utils";

const panels = {
  overview:      lazy(() => import("../panels/Overview")),
  calls:         lazy(() => import("../panels/CallBuilder")),
  marketplace:   lazy(() => import("../panels/Marketplace")),
  requests:      lazy(() => import("../panels/Requests")),
  providers:     lazy(() => import("../panels/Providers")),
  receipts:      lazy(() => import("../panels/Receipts")),
  payments:      lazy(() => import("../panels/Payments")),
  disputes:      lazy(() => import("../panels/Disputes")),
  history:       lazy(() => import("../panels/History")),
  quality:       lazy(() => import("../panels/Quality")),
  agent:         lazy(() => import("../panels/Agent")),
  lending:       lazy(() => import("../panels/Lending")),
  futures:       lazy(() => import("../panels/Futures")),
  attestation:   lazy(() => import("../panels/Attestation")),
  subscriptions: lazy(() => import("../panels/Subscriptions")),
  admin:         lazy(() => import("../panels/AdminPanel")),
  mcp:           lazy(() => import("../panels/Mcp")),
  webhooks:      lazy(() => import("../panels/Webhooks")),
  leaderboard:   lazy(() => import("../panels/Leaderboard")),
  apidocs:       lazy(() => import("../panels/ApiDocs")),
  verify:        lazy(() => import("../panels/Verify")),
  provprofile:   lazy(() => import("../panels/ProviderProfile")),
  analytics:     lazy(() => import("../panels/Analytics")),
  notifications: lazy(() => import("../panels/Notifications")),
  settings:      lazy(() => import("../panels/SettingsPanel")),
  jobs:          lazy(() => import("../panels/Jobs")),
  bulkcall:      lazy(() => import("../panels/BulkCall")),
  register:      lazy(() => import("../panels/Register")),
  nano:          lazy(() => import("../panels/Nano")),
  privacy:       lazy(() => import("../panels/Privacy")),
  bridge:        lazy(() => import("../panels/Bridge")),
  passkey:       lazy(() => import("../PasskeyWallet")),
  balance:       lazy(() => import("../UnifiedBalance")),
} as const;

function PanelLoader() {
  return (
    <div className="panel-loader">
      <div className="panel-loader-spinner" />
    </div>
  );
}

const MOBILE_NAV: { icon: string; label: string; id: PanelId }[] = [
  { icon: "⌂",  label: "Home",     id: "overview"    },
  { icon: "⊞",  label: "Market",   id: "marketplace" },
  { icon: "⚡", label: "Pay",      id: "calls"       },
  { icon: "≡",  label: "Requests", id: "requests"    },
];

const PANEL_LABELS: Record<string, string> = {
  overview:"Overview", calls:"Call Builder", marketplace:"Services",
  requests:"My Requests", providers:"Providers", receipts:"Receipts",
  payments:"Payments", disputes:"Disputes", history:"Tx History",
  quality:"Quality Disputes", agent:"Agent Loop", lending:"RepFi Lending",
  futures:"SLA Futures", attestation:"SLA Bridge", subscriptions:"Subscriptions",
  admin:"Admin", mcp:"API / MCP", webhooks:"Webhooks", leaderboard:"Leaderboard",
  apidocs:"API Docs", verify:"Verify", provprofile:"Provider Profile",
  analytics:"Analytics", notifications:"Notifications", settings:"Settings",
  jobs:"Claims", bulkcall:"Bulk Call", register:"Register", nano:"Receipts",
  privacy:"Privacy", bridge:"Bridge",
  passkey:"Passkey Wallet", balance:"Unified Balance",
};

export default function AppShell() {
  const { activePanel, theme, setPanel } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("cg_sb_collapsed") === "1");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});

  const ActivePanel = panels[activePanel as keyof typeof panels] as React.LazyExoticComponent<() => JSX.Element>;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  const { mode } = useAppStore();
  useEffect(() => {
    document.body.classList.remove("simple-mode", "pro-mode");
    document.body.classList.add(mode === "simple" ? "simple-mode" : "pro-mode");
    document.body.setAttribute("data-mode", mode);
  }, [mode]);

  useEffect(() => initTabTitleCounter(), []);

  const toggleCollapsed = () => {
    setSidebarCollapsed(v => {
      localStorage.setItem("cg_sb_collapsed", v ? "0" : "1");
      return !v;
    });
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(o => !o);
        return;
      }
      // G + letter shortcuts (no modifier, not in input)
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") { setSidebarOpen(false); setPaletteOpen(false); return; }
      // g+o, g+c etc via data attribute trick
      if ((window as any).__cgLastKey === "g") {
        const map: Record<string, PanelId> = {
          o: "overview", c: "calls", m: "marketplace",
          r: "requests", p: "providers", e: "receipts",
          y: "payments", d: "disputes", h: "history",
          a: "analytics", n: "notifications",
        };
        if (map[e.key]) { setPanel(map[e.key]); (window as any).__cgLastKey = null; e.preventDefault(); return; }
      }
      (window as any).__cgLastKey = e.key;
      if ((window as any).__cgLastKeyTimer) clearTimeout((window as any).__cgLastKeyTimer);
      (window as any).__cgLastKeyTimer = setTimeout(() => { (window as any).__cgLastKey = null; }, 800);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPanel]);

  useEffect(() => {
    setBadges(b => ({ ...b, [activePanel]: 0 }));
  }, [activePanel]);

  useEffect(() => {
    function onBump(e: Event) {
      const { panel } = (e as CustomEvent<{ panel: string }>).detail ?? {};
      if (panel && panel !== activePanel)
        setBadges(b => ({ ...b, [panel]: (b[panel] ?? 0) + 1 }));
    }
    window.addEventListener("cg:badge", onBump);
    return () => window.removeEventListener("cg:badge", onBump);
  }, [activePanel]);

  // close sidebar on nav (mobile)
  const handleNav = () => setSidebarOpen(false);

  return (
    <div className="app-shell">
      {/* ── Topbar ── */}
      <AppTopbar
        onHamburger={() => setSidebarOpen(o => !o)}
        onCommandPalette={() => setPaletteOpen(true)}
        panelLabel={PANEL_LABELS[activePanel] ?? activePanel}
      />

      {/* ── Sidebar overlay (mobile) ── */}
      <div className={`sidebar-overlay${sidebarOpen ? " active" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}${sidebarCollapsed ? " collapsed" : ""} app-sidebar`}>
        <ProgressTracker />
        <Sidebar onNav={handleNav} />
        <button
          className="sidebar-collapse-btn"
          onClick={toggleCollapsed}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          ‹
        </button>
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        <LiveBar />
        <UsdcBanner />
        <Suspense fallback={<PanelLoader />}>
          {ActivePanel ? <ActivePanel /> : <PanelLoader />}
        </Suspense>
        <AppFooter />
      </main>

      {/* ── Onboarding ── */}
      <OnboardingWizard />

      {/* ── Role modal (first connect) ── */}
      <RoleModal />

      {/* ── Contextual hint ── */}
      <ContextualHint panel={activePanel} />

      {/* ── Command Palette ── */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-bottom-nav">
        {MOBILE_NAV.map(item => (
          <button
            key={item.id}
            className={`mbn-item${activePanel === item.id ? " active" : ""}`}
            onClick={() => { setPanel(item.id); setSidebarOpen(false); }}
          >
            <span className="mbn-icon">{item.icon}</span>
            <span className="mbn-label">{item.label}</span>
            {(badges[item.id] ?? 0) > 0 && (
              <span className="mbn-badge">
                {badges[item.id] > 9 ? "9+" : badges[item.id]}
              </span>
            )}
          </button>
        ))}
        <button className="mbn-item" onClick={() => setPaletteOpen(true)}>
          <span className="mbn-icon">🔍</span>
          <span className="mbn-label">Search</span>
        </button>
      </nav>
    </div>
  );
}
