import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// Lazy load providers to isolate any import-time error
const root = document.getElementById("root")!;
root.style.cssText = "background:#080b10;min-height:100vh;";

async function boot() {
  try {
    const { WagmiProvider } = await import("wagmi");
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { ConnectKitProvider } = await import("connectkit");
    const { wagmiConfig } = await import("./lib/config");
    const { default: App } = await import("./App");

    const queryClient = new QueryClient();

    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <ConnectKitProvider
              theme="midnight"
              customTheme={{
                "--ck-accent-color": "#10b981",
                "--ck-accent-text-color": "#ffffff",
                "--ck-body-background": "#0d1117",
                "--ck-border-radius": "16px",
              }}
            >
              <App />
            </ConnectKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </React.StrictMode>
    );
  } catch (e) {
    root.style.cssText = "background:#080b10;color:#10b981;padding:40px;font-family:monospace;min-height:100vh;";
    root.innerHTML = `<h2 style="color:#10b981">Boot error</h2><pre style="color:#e8edf3;white-space:pre-wrap">${String(e)}</pre>`;
    console.error("Boot failed:", e);
  }
}

boot();
