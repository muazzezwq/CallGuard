import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import { Toaster } from "sonner";
import { useAppStore } from "./store/useAppStore";
import { allowsWalletlessAccess } from "./lib/deepLink";

const MarketingLayout = lazy(() => import("./marketing/MarketingLayout"));
const Landing        = lazy(() => import("./marketing/Landing"));
const HowItWorks     = lazy(() => import("./marketing/HowItWorks"));
const Docs           = lazy(() => import("./marketing/Docs"));
const ProvidersPage  = lazy(() => import("./marketing/Providers"));
const Security       = lazy(() => import("./marketing/Security"));
const About          = lazy(() => import("./marketing/About"));
const AppShell       = lazy(() => import("./components/layout/AppShell"));

function AppGate() {
  const { isConnected } = useAccount();
  const loc = useLocation();
  // A verification link reads the attestation API and the chain, so it opens
  // without a wallet: nothing in that flow signs. Every other panel under /app can
  // write, so it keeps the gate. `?nogate` stays the dev-only escape hatch.
  const bypass =
    (import.meta.env.DEV && new URLSearchParams(loc.search).has("nogate")) ||
    allowsWalletlessAccess(loc.search);
  if (!isConnected && !bypass) return <Navigate to="/" replace state={{ from: loc.pathname + loc.search }} />;
  return <AppShell />;
}

function Fallback() {
  return <div style={{ minHeight: "100vh", background: "var(--bg-0)" }} />;
}

/* Toast surface mapped to the app's own tokens, so it follows the theme. */
const TOAST_VARS = {
  "--normal-bg": "var(--surface-3)",
  "--normal-border": "var(--border-hi)",
  "--normal-text": "var(--text)",
  "--normal-bg-hover": "var(--surface-3)",
  "--normal-border-hover": "var(--accent)",
  "--success-bg": "var(--accent-bg)",
  "--success-border": "color-mix(in srgb, var(--accent) 45%, transparent)",
  "--success-text": "var(--text)",
  "--error-bg": "var(--danger-bg)",
  "--error-border": "color-mix(in srgb, var(--danger) 45%, transparent)",
  "--error-text": "var(--text)",
  "--info-bg": "var(--info-bg)",
  "--info-border": "color-mix(in srgb, var(--info) 45%, transparent)",
  "--info-text": "var(--text)",
  "--warning-bg": "var(--warn-bg)",
  "--warning-border": "color-mix(in srgb, var(--warn) 45%, transparent)",
  "--warning-text": "var(--text)",
  "--border-radius": "var(--radius)",
  "--width": "360px",
} as React.CSSProperties;

export default function App() {
  const theme = useAppStore((s) => s.theme);
  return (
    <BrowserRouter>
      <Toaster position="top-right" theme={theme} closeButton style={TOAST_VARS} />
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route index element={<Landing />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="docs" element={<Docs />} />
            <Route path="providers" element={<ProvidersPage />} />
            <Route path="security" element={<Security />} />
            <Route path="about" element={<About />} />
          </Route>
          <Route path="/app" element={<AppGate />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
