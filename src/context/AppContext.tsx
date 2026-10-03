import { createContext, useContext, useState, ReactNode } from "react";

export type Panel =
  | "overview" | "calls" | "marketplace" | "requests" | "bulk"
  | "providers" | "receipts" | "payments" | "disputes" | "quality"
  | "agent" | "lending" | "futures" | "attestation" | "subscriptions"
  | "jobs" | "mcp" | "webhooks" | "leaderboard" | "register"
  | "settings" | "history" | "apidocs" | "verify" | "provprofile"
  | "nano" | "analytics" | "privacy";

export type AppMode = "simple" | "pro";
export type Theme = "dark" | "light";

interface AppContextValue {
  panel: Panel;
  setPanel: (p: Panel) => void;
  mode: AppMode;
  setMode: (m: AppMode) => void;
  theme: Theme;
  toggleTheme: () => void;
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<Panel>("overview");
  const [mode, setMode] = useState<AppMode>(() =>
    (localStorage.getItem("cg_mode") as AppMode) || "simple"
  );
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem("cg_theme") as Theme) || "dark"
  );
  const [advancedOpen, setAdvancedOpen] = useState(() =>
    mode === "pro"
  );

  const handleSetMode = (m: AppMode) => {
    setMode(m);
    localStorage.setItem("cg_mode", m);
    if (m === "pro") setAdvancedOpen(true);
    else setAdvancedOpen(false);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("cg_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <AppContext.Provider value={{
      panel, setPanel, mode, setMode: handleSetMode,
      theme, toggleTheme, advancedOpen, setAdvancedOpen
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
