import { useAccount } from "wagmi";
import { lazy, Suspense } from "react";

const LandingPage = lazy(() => import("./components/LandingPage"));
const AppShell = lazy(() => import("./components/layout/AppShell"));

export default function App() {
  const { isConnected } = useAccount();
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-0" />}>
      {isConnected ? <AppShell /> : <LandingPage />}
    </Suspense>
  );
}
