import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./ui/ui.css";
import "./marketing/marketing.css";
import "./components/layout/shell.css";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import { wagmiConfig } from "./lib/config";
import App from "./App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reduce RPC polling pressure — default 4s is too aggressive for mobile
      refetchInterval: false,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});
const root = document.getElementById("root")!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          options={{ initialChainId: 5042002 }}
          theme="midnight"
          customTheme={{
            "--ck-accent-color": "#12B981",
            "--ck-accent-text-color": "#06110d",
            "--ck-body-background": "#10151E",
            "--ck-border-radius": "14px",
            "--ck-font-family": '"Geist", -apple-system, sans-serif',
          }}
        >
          <App />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
