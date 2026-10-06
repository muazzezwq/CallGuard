import { lazy, Suspense, useState, useEffect } from "react";
import { useAppStore } from "../../store/useAppStore";
import Sidebar from "./Sidebar";
import AppTopbar from "./AppTopbar";
import OnboardingWizard from "./OnboardingWizard";
import LiveBar from "./LiveBar";
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

export default function AppShell() {
  const { activePanel, theme } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const ActivePanel = panels[activePanel as keyof typeof panels] as React.LazyExoticComponent<() => JSX.Element>;

  // apply theme to body
  useEffect(() => {
    document.body.classList.toggle("light-mode", theme === "light");
  }, [theme]);

  // tab title unseen counter
  useEffect(() => initTabTitleCounter(), []);

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
      <AppTopbar onHamburger={() => setSidebarOpen(o => !o)} />

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
          position: "sticky",
          top: 0,
          height: "calc(100vh - 48px)",
          // Mobile: slide in/out
          ...(typeof window !== "undefined" && window.innerWidth < 768 ? {
            position: "fixed" as const,
            top: 48,
            left: sidebarOpen ? 0 : -220,
            height: "calc(100vh - 48px)",
            zIndex: 50,
            transition: "left 0.25s ease",
          } : {}),
        }}>
          <Sidebar onNav={() => setSidebarOpen(false)} />
        </div>

        {/* Main content */}
        <main style={{
          flex: 1,
          overflowY: "auto",
          background: "var(--bg-0)",
          minWidth: 0,
        }}>
          {/* Live bar — clock + SLA gauge, orijinal HTML'deki .live-bar */}
          <LiveBar />
          <Suspense fallback={<PanelLoader />}>
            {ActivePanel ? <ActivePanel /> : <PanelLoader />}
          </Suspense>
        </main>
      </div>

      {/* Onboarding wizard — fixed bottom-right, localStorage dismissed */}
      <OnboardingWizard />
    </div>
  );
}
