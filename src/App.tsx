import { lazy, Suspense } from "react";
import { useAccount } from "wagmi";
import { Toaster } from "sonner";

const CgLanding = lazy(() => import("./components/CgLanding"));
const AppShell  = lazy(() => import("./components/layout/AppShell"));

export default function App() {
  const { isConnected } = useAccount();

  return (
    <>
      <Toaster position="top-right" theme="dark" richColors closeButton />
      <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg-0)" }} />}>
        {isConnected ? <AppShell /> : <CgLanding />}
      </Suspense>
    </>
  );
}
