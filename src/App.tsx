import { lazy, Suspense } from "react";
import { useAccount } from "wagmi";

const LandingPage = lazy(() => import("./components/LandingPage"));
const AppShell    = lazy(() => import("./components/layout/AppShell"));

export default function App() {
  const { isConnected } = useAccount();

  // /app path veya ?app=1 query parametresi → AppShell
  const isAppPath =
    window.location.pathname.startsWith("/app") ||
    new URLSearchParams(window.location.search).get("app") === "1";

  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#070b12" }} />}>
      {(isAppPath || isConnected) ? <AppShell /> : <LandingPage />}
    </Suspense>
  );
}
