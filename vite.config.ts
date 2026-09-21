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
  build: { outDir: "dist" },
});
