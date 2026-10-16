import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import { Toaster } from "sonner";

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
  if (!isConnected) return <Navigate to="/" replace state={{ from: loc.pathname + loc.search }} />;
  return <AppShell />;
}

function Fallback() {
  return <div style={{ minHeight: "100vh", background: "var(--bg-0)" }} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" theme="dark" richColors closeButton />
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
