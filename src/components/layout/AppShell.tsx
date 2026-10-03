import { lazy, Suspense } from "react";
import { useAppStore } from "../../store/useAppStore";
import Sidebar from "./Sidebar";
import AppTopbar from "./AppTopbar";
import clsx from "clsx";

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
} as const;

function PanelLoader() {
  return (
    <div className="flex items-center justify-center h-64 text-text-faint text-sm">
      <span className="animate-pulse">Loading…</span>
    </div>
  );
}

export default function AppShell() {
  const { activePanel, theme } = useAppStore();
  const ActivePanel = panels[activePanel] as React.LazyExoticComponent<() => JSX.Element>;

  return (
    <div className={clsx("app-root min-h-screen flex flex-col", theme === "light" && "light-mode")}>
      <AppTopbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — hidden on mobile, shown via drawer */}
        <div className="hidden md:flex w-52 flex-shrink-0 border-r border-border bg-bg-1 overflow-y-auto">
          <Sidebar />
        </div>
        {/* Panel */}
        <main className="flex-1 overflow-y-auto bg-bg-0">
          <Suspense fallback={<PanelLoader />}>
            <ActivePanel />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
