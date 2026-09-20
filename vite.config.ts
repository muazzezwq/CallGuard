import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ["if7hsble6teiitklbaq5l.preview.studio.arc.io"],
  },
  root: ".",
  build: { outDir: "dist" },
});
