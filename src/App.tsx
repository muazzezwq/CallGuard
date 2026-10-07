import { lazy, Suspense } from "react";
import { useAccount } from "wagmi";

const LandingPage = lazy(() => import("./components/LandingPage"));
const AppShell    = lazy(() => import("./components/layout/AppShell"));

export default function App() {
  const { isConnected } = useAccount();

  // If path starts with /app, always show the app shell
  const isAppPath = window.location.pathname.startsWith("/app");

  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#070b12" }} />}>
      {(isAppPath || isConnected) ? <AppShell /> : <LandingPage />}
    </Suspense>
  );
}
