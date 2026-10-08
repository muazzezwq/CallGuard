import { lazy, Suspense, useState, useEffect } from "react";
import { useAppStore, PanelId } from "../../store/useAppStore";
import Sidebar from "./Sidebar";
import AppTopbar from "./AppTopbar";
import OnboardingWizard from "./OnboardingWizard";
import LiveBar from "./LiveBar";
import CommandPalette from "./CommandPalette";
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
} as const;

function PanelLoader() {
  return (
    <div className="panel-loader">
      <div className="panel-loader-spinner" />
    </div>
  );
}

const MOBILE_NAV: { icon: string; label: string; id: PanelId }[] = [
  { icon: "◫",  label: "Dashboard", id: "overview"    },
  { icon: "⊞",  label: "Market",    id: "marketplace" },
  { icon: "⚡", label: "Pay",       id: "nano"        },
  { icon: "≡",  label: "Jobs",      id: "jobs"        },
];

export default function AppShell() {
  const { activePanel, theme, setPanel } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      />

      {/* ── Sidebar overlay (mobile) ── */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <Sidebar onNav={handleNav} />
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        <LiveBar />
        <Suspense fallback={<PanelLoader />}>
          {ActivePanel ? <ActivePanel /> : <PanelLoader />}
        </Suspense>
        <AppFooter />
      </main>

      {/* ── Onboarding ── */}
      <OnboardingWizard />

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
