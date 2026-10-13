import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PanelId =
  | "overview" | "calls" | "x402" | "marketplace" | "requests" | "providers"
  | "receipts" | "payments" | "disputes" | "quality" | "agent"
  | "lending" | "futures" | "attestation" | "subscriptions" | "jobs"
  | "mcp" | "webhooks" | "leaderboard" | "history" | "apidocs"
  | "verify" | "provprofile" | "analytics" | "notifications" | "settings"
  | "nano" | "privacy" | "register" | "bulkcall" | "bridge" | "admin"
  | "passkey" | "balance" | "pipelinehook";

/** HTML'de x402 = Call Builder, calls = Requests — her iki ID'yi normalize et */
export function normalizePanel(p: PanelId): PanelId {
  if (p === "x402") return "calls";
  return p;
}

export type AppMode = "simple" | "pro";
export type UserRole = "provider" | "caller" | null;

interface AppState {
  activePanel: PanelId;
  mode: AppMode;
  theme: "dark" | "light";
  advancedOpen: boolean;
  role: UserRole;
  onboardingDone: boolean;
  hintsSeen: string[];
  progressSteps: { id: string; done: boolean }[];
  pendingVerify: string | null;           // callId to auto-verify when Verify panel opens
  setPanel: (panel: PanelId) => void;
  setMode: (mode: AppMode) => void;
  setTheme: (theme: "dark" | "light") => void;
  toggleAdvanced: () => void;
  setRole: (role: UserRole) => void;
  setOnboardingDone: () => void;
  markHintSeen: (id: string) => void;
  markStep: (id: string) => void;
  openVerify: (callId: string) => void;   // navigate to verify panel with pre-filled callId
  clearPendingVerify: () => void;
}

const INIT_STEPS = [
  { id: "wallet",  done: false },
  { id: "usdc",    done: false },
  { id: "action",  done: false },
  { id: "receipt", done: false },
];

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activePanel: "overview",
      mode: "simple",
      theme: "light",
      advancedOpen: false,
      role: null,
      onboardingDone: false,
      hintsSeen: [],
      progressSteps: INIT_STEPS,
      pendingVerify: null,
      setPanel: (panel) => set({ activePanel: normalizePanel(panel) }),
      setMode: (mode) => set({ mode, advancedOpen: mode === "pro" }),
      setTheme: (theme) => set({ theme }),
      toggleAdvanced: () => set((s) => ({ advancedOpen: !s.advancedOpen })),
      setRole: (role) => set({ role }),
      setOnboardingDone: () => set({ onboardingDone: true }),
      markHintSeen: (id) => set((s) => {
        if (s.hintsSeen.includes(id)) return s;
        return { hintsSeen: [...s.hintsSeen, id] };
      }),
      markStep: (id) => set((s) => {
        const step = s.progressSteps.find(st => st.id === id);
        if (!step || step.done) return s;
        return { progressSteps: s.progressSteps.map(st => st.id === id ? { ...st, done: true } : st) };
      }),
      openVerify: (callId) => set({ pendingVerify: callId, activePanel: "verify" }),
      clearPendingVerify: () => set({ pendingVerify: null }),
    }),
    {
      name: "cg-app-state-v2",
      partialize: (s) => ({
        mode: s.mode, theme: s.theme, advancedOpen: s.advancedOpen,
        role: s.role, onboardingDone: s.onboardingDone,
        hintsSeen: s.hintsSeen, progressSteps: s.progressSteps,
      })
    }
  )
);
