import { lazy, Suspense, useState, useEffect } from "react";
import { House, Store, Zap, Wallet } from "lucide-react";
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
import ErrorBoundary from "../ErrorBoundary";
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
  pipelinehook:  lazy(() => import("../panels/PipelineHook")),
} as const;

function PanelLoader() {
  return (
    <div className="panel-loader">
      <div className="panel-loader-spinner" />
    </div>
  );
}

const MOBILE_NAV: { Icon: React.ComponentType<{ size?: number | string }>; label: string; id: PanelId }[] = [
  { Icon: House,  label: "Home",   id: "overview"    },
  { Icon: Store,  label: "Market", id: "marketplace" },
  { Icon: Zap,    label: "Calls",  id: "calls"       },
  { Icon: Wallet, label: "Wallet", id: "balance"     },
];

const PANEL_LABELS: Record<string, string> = {
  overview:"Overview", calls:"Call Builder", marketplace:"Marketplace",
  requests:"My Requests", providers:"Providers", receipts:"Receipts",
  payments:"Payments", disputes:"Disputes", history:"Transactions",
  quality:"Quality Disputes", agent:"Agent Wallet", lending:"RepFi Lending",
  futures:"SLA Futures", attestation:"SLA Bridge", subscriptions:"Subscriptions",
  admin:"Admin", mcp:"API / MCP", webhooks:"Webhooks", leaderboard:"Reputation",
  apidocs:"API Docs", verify:"Verify", provprofile:"Provider details",
  analytics:"Analytics", notifications:"Logs", settings:"Settings",
  jobs:"Jobs", bulkcall:"Bulk Call", register:"Register", nano:"Nanopayments",
  privacy:"Privacy", bridge:"Bridge", pipelinehook:"Pipeline Hook",
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

  // Deep-link: /?provider=X opens the provider profile (shareable links)
  useEffect(() => {
    const pId = new URLSearchParams(window.location.search).get("provider");
    if (pId && /^\d+$/.test(pId)) setPanel("provprofile");
  }, [setPanel]);

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
      const w = window as unknown as Window & {
        __cgLastKey?: string | null;
        __cgLastKeyTimer?: ReturnType<typeof setTimeout>;
      };
      if (w.__cgLastKey === "g") {
        const map: Record<string, PanelId> = {
          o: "overview", c: "calls", m: "marketplace",
          r: "requests", p: "providers", e: "receipts",
          y: "payments", d: "disputes", h: "history",
          a: "analytics", n: "notifications",
        };
        if (map[e.key]) { setPanel(map[e.key]); w.__cgLastKey = null; e.preventDefault(); return; }
      }
      w.__cgLastKey = e.key;
      if (w.__cgLastKeyTimer) clearTimeout(w.__cgLastKeyTimer);
      w.__cgLastKeyTimer = setTimeout(() => { w.__cgLastKey = null; }, 800);
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
      <div role="presentation" className={`sidebar-overlay${sidebarOpen ? " active" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}${sidebarCollapsed ? " collapsed" : ""} app-sidebar`}>
        <Sidebar onNav={handleNav} collapsed={sidebarCollapsed} onExpandGroup={() => setSidebarCollapsed(false)} />
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
        <ErrorBoundary resetKey={activePanel}>
          <Suspense fallback={<PanelLoader />}>
            {ActivePanel ? <ActivePanel /> : <PanelLoader />}
          </Suspense>
        </ErrorBoundary>
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
            <span className="mbn-icon"><item.Icon size={19} /></span>
            <span className="mbn-label">{item.label}</span>
            {(badges[item.id] ?? 0) > 0 && (
              <span className="mbn-badge">
                {badges[item.id] > 9 ? "9+" : badges[item.id]}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
