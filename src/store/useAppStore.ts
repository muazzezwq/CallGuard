import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PanelId =
  | "overview" | "calls" | "marketplace" | "requests" | "providers"
  | "receipts" | "payments" | "disputes" | "quality" | "agent"
  | "lending" | "futures" | "attestation" | "subscriptions" | "jobs"
  | "mcp" | "webhooks" | "leaderboard" | "history" | "apidocs"
  | "verify" | "provprofile" | "analytics" | "notifications" | "settings"
  | "nano" | "privacy" | "register" | "bulkcall" | "bridge";

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
      theme: "dark",
      advancedOpen: false,
      setPanel: (panel) => set({ activePanel: panel }),
      setMode: (mode) => set({ mode, advancedOpen: mode === "pro" }),
      setTheme: (theme) => set({ theme }),
      toggleAdvanced: () => set((s) => ({ advancedOpen: !s.advancedOpen })),
    }),
    { name: "cg-app-state", partialize: (s) => ({ mode: s.mode, theme: s.theme, advancedOpen: s.advancedOpen }) }
  )
);
