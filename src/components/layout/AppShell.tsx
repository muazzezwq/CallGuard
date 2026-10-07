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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--text-faint)", fontSize: 13 }}>
      <span>Loading…</span>
    </div>
  );
}

// Mobile bottom nav items — matches orijinal HTML
const MOBILE_NAV = [
  { icon: "📊", label: "Dashboard", id: "overview"    as PanelId, badge: 0 },
  { icon: "💼", label: "Market",    id: "marketplace" as PanelId, badge: 0 },
  { icon: "⚡", label: "Pay",       id: "nano"        as PanelId, badge: 0 },
  { icon: "📋", label: "Jobs",      id: "jobs"        as PanelId, badge: 0 },
];

export default function AppShell() {
  const { activePanel, theme, setPanel } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // badge counters — incremented by live events, cleared on panel visit
  const [badges, setBadges] = useState<Record<string, number>>({});

  const ActivePanel = panels[activePanel as keyof typeof panels] as React.LazyExoticComponent<() => JSX.Element>;

  // apply theme to body
  useEffect(() => {
    document.body.classList.toggle("light-mode", theme === "light");
  }, [theme]);

  // tab title unseen counter
  useEffect(() => initTabTitleCounter(), []);

  // Ctrl+K / Cmd+K → CommandPalette
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

  // clear badge when panel is visited
  useEffect(() => {
    setBadges(b => ({ ...b, [activePanel]: 0 }));
  }, [activePanel]);

  // listen for live-feed badge bumps from Overview
  useEffect(() => {
    function onBump(e: Event) {
      const { panel } = (e as CustomEvent<{ panel: string }>).detail ?? {};
      if (panel && panel !== activePanel) {
        setBadges(b => ({ ...b, [panel]: (b[panel] ?? 0) + 1 }));
      }
    }
    window.addEventListener("cg:badge", onBump);
    return () => window.removeEventListener("cg:badge", onBump);
  }, [activePanel]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-0)",
      color: "var(--text)",
      fontFamily: "var(--font-sans)",
    }} data-theme={theme}>

      {/* Topbar */}
      <AppTopbar onHamburger={() => setSidebarOpen(o => !o)} onCommandPalette={() => setPaletteOpen(true)} />

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }}
          />
        )}

        {/* Sidebar — desktop always visible, mobile drawer */}
        <div style={{
          width: 220,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--bg-1)",
          overflowY: "auto",
          position: "sticky" as const,
          top: 0,
          height: "calc(100vh - 48px)",
        }} className="sidebar-wrapper">
          <Sidebar onNav={() => setSidebarOpen(false)} />
        </div>

        {/* Mobile sidebar drawer */}
        <div style={{
          position: "fixed",
          top: 48,
          left: sidebarOpen ? 0 : -220,
          width: 220,
          height: "calc(100vh - 48px)",
          zIndex: 50,
          background: "var(--bg-1)",
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          transition: "left 0.25s ease",
          display: "none",
        }} className="sidebar-mobile">
          <Sidebar onNav={() => setSidebarOpen(false)} />
        </div>

        {/* Main content */}
        <main style={{
          flex: 1,
          overflowY: "auto",
          background: "var(--bg-0)",
          minWidth: 0,
        }}>
          {/* Live bar — clock + SLA gauge */}
          <LiveBar />
          <Suspense fallback={<PanelLoader />}>
            {ActivePanel ? <ActivePanel /> : <PanelLoader />}
          </Suspense>
        </main>
      </div>

      {/* Onboarding wizard — fixed bottom-right */}
      <OnboardingWizard />

      {/* Command Palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Mobile bottom nav — 4 items + ⌘K button */}
      <nav className="mobile-bottom-nav">
        {MOBILE_NAV.map(item => (
          <button
            key={item.id}
            className={`mbn-item${activePanel === item.id ? " active" : ""}`}
            onClick={() => setPanel(item.id)}
            style={{ position: "relative" }}
          >
            <span className="mbn-icon">{item.icon}</span>
            <span>{item.label}</span>
            {(badges[item.id] ?? 0) > 0 && (
              <span style={{
                position: "absolute", top: 4, right: "calc(50% - 18px)",
                background: "var(--danger)", color: "#fff",
                borderRadius: "99px", fontSize: 9, fontWeight: 700,
                padding: "1px 5px", lineHeight: "14px", minWidth: 14, textAlign: "center",
              }}>
                {badges[item.id] > 9 ? "9+" : badges[item.id]}
              </span>
            )}
          </button>
        ))}
        {/* ⌘K button — opens CommandPalette */}
        <button
          className="mbn-item"
          onClick={() => setPaletteOpen(true)}
          style={{ position: "relative" }}
        >
          <span className="mbn-icon">🔍</span>
          <span>Search</span>
        </button>
      </nav>
    </div>
  );
}
