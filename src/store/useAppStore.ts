import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PanelId =
  | "overview" | "calls" | "x402" | "marketplace" | "requests" | "providers"
  | "receipts" | "payments" | "disputes" | "quality" | "agent"
  | "lending" | "futures" | "attestation" | "subscriptions" | "jobs"
  | "mcp" | "webhooks" | "leaderboard" | "history" | "apidocs"
  | "verify" | "provprofile" | "analytics" | "notifications" | "settings"
  | "nano" | "privacy" | "register" | "bulkcall" | "bridge";

/** HTML'de x402 = Call Builder, calls = Requests — her iki ID'yi normalize et */
export function normalizePanel(p: PanelId): PanelId {
  if (p === "x402") return "calls";
  return p;
}

export type AppMode = "simple" | "pro";

interface AppState {
  activePanel: PanelId;
  mode: AppMode;
  theme: "dark" | "light";
  advancedOpen: boolean;
  setPanel: (panel: PanelId) => void;
  setMode: (mode: AppMode) => void;
  setTheme: (theme: "dark" | "light") => void;
  toggleAdvanced: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activePanel: "overview",
      mode: "simple",
      theme: "light",
      advancedOpen: false,
      setPanel: (panel) => set({ activePanel: normalizePanel(panel) }),
      setMode: (mode) => set({ mode, advancedOpen: mode === "pro" }),
      setTheme: (theme) => set({ theme }),
      toggleAdvanced: () => set((s) => ({ advancedOpen: !s.advancedOpen })),
    }),
    { name: "cg-app-state", partialize: (s) => ({ mode: s.mode, theme: s.theme, advancedOpen: s.advancedOpen }) }
  )
);
