import { lazy, Suspense } from "react";
import { useAccount } from "wagmi";

const CgLanding = lazy(() => import("./components/CgLanding"));
const AppShell  = lazy(() => import("./components/layout/AppShell"));

export default function App() {
  const { isConnected } = useAccount();

  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#070b12" }} />}>
      {isConnected ? <AppShell /> : <CgLanding />}
    </Suspense>
  );
}
