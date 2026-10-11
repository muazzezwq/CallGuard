import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import { wagmiConfig } from "./lib/config";
import App from "./App";

const queryClient = new QueryClient();
const root = document.getElementById("root")!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="auto"
          customTheme={{
            "--ck-accent-color": "#10b981",
            "--ck-accent-text-color": "#ffffff",
            "--ck-border-radius": "16px",
            "--ck-font-family": '"DM Sans", -apple-system, sans-serif',
          }}
        >
          <App />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
