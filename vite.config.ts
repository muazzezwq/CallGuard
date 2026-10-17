import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: "all",
  },
  root: ".",
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        // Long-term-cacheable vendor groups. Object form lets Rollup resolve each
        // package and its deps into the named chunk (imports/provider code untouched).
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-web3": ["wagmi", "viem", "connectkit"],
          "vendor-motion": ["framer-motion"],
        },
      },
    },
  },
});
