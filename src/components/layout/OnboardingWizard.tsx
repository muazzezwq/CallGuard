import { useState, useEffect } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useAccount } from "wagmi";

const STEPS = [
  {
    num: "Step 1 of 4",
    title: "Welcome to CallGuard",
    desc: "CallGuard is an on-chain SLA marketplace on Arc Testnet. Providers stake USDC and commit to responding within a time window. Miss the deadline — get slashed.",
    highlight: "🔒 Stake · ⚡ Call · ✓ Receipt · ⚠ Slash — the full lifecycle in one contract.",
    nextLabel: "Connect wallet →",
    skipLabel: "Skip tour",
  },
  {
    num: "Step 2 of 4",
    title: "Register as a provider",
    desc: "Stake USDC and set your price per call. You commit to responding within your max response time. Callers get a refund + slash if you miss it.",
    highlight: "Go to Register and set your stake, price, and endpoint URL.",
    nextLabel: "Next: make a call →",
    skipLabel: "Skip",
  },
  {
    num: "Step 3 of 4",
    title: "Call a service",
    desc: "Pick a provider from the list, approve USDC, and open a call. The USDC goes into escrow. The provider has until the deadline to respond.",
    highlight: "Go to Call Builder and enter a provider ID and payload.",
    nextLabel: "Next: submit receipt →",
    skipLabel: "Skip",
  },
  {
    num: "Step 4 of 4",
    title: "Submit a receipt or claim timeout",
    desc: "If you are the provider: submit a signed receipt before the deadline to release the escrow. If you are the caller and the deadline passes: claim the timeout to get a refund and slash the provider.",
    highlight: "Your active calls show a live countdown in the Calls panel.",
    nextLabel: "Got it — let's go ✓",
    skipLabel: null,
  },
];

const STORAGE_KEY = "callguard_onboarding_done";

export default function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const { setActivePanel } = useAppStore();
  const { isConnected } = useAccount();

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const next = () => {
    if (step === 0 && !isConnected) {
      // nudge toward wallet connect — just advance
    }
    if (step === 1) setActivePanel("register" as never);
    if (step === 2) setActivePanel("calls" as never);
    if (step >= STEPS.length - 1) { dismiss(); return; }
    setStep(s => s + 1);
  };

  if (!visible) return null;

  const current = STEPS[step];

  const s = {
    overlay: {
      position: "fixed" as const,
      bottom: 24,
      right: 24,
      zIndex: 8888,
      width: 340,
      maxWidth: "calc(100vw - 32px)",
    } as React.CSSProperties,
    card: {
      background: "var(--bg-1)",
      border: "1px solid var(--border-hi)",
      borderRadius: 20,
      padding: 28,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      position: "relative" as const,
    } as React.CSSProperties,
    closeBtn: {
      position: "absolute" as const,
      top: 10,
      right: 14,
      fontSize: 20,
      padding: 0,
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "var(--text-faint)",
      lineHeight: 1,
    } as React.CSSProperties,
    progressRow: {
      display: "flex",
      gap: 6,
      marginBottom: 20,
    },
    dot: (done: boolean): React.CSSProperties => ({
      height: 3,
      flex: 1,
      borderRadius: 100,
      background: done ? "var(--accent)" : "var(--bg-3)",
      transition: "background 0.3s",
    }),
    stepNum: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.1em",
      textTransform: "uppercase" as const,
      color: "var(--accent)",
      marginBottom: 6,
    },
    title: {
      fontSize: 18,
      fontWeight: 700,
      color: "var(--text)",
      marginBottom: 10,
      fontFamily: "var(--font-display)",
    },
    desc: {
      fontSize: 13,
      color: "var(--text-dim)",
      lineHeight: 1.6,
      marginBottom: 14,
    },
    highlight: {
      background: "var(--accent-bg)",
      border: "1px solid rgba(16,185,129,0.2)",
      borderRadius: 10,
      padding: "10px 14px",
      fontSize: 12,
      color: "var(--accent)",
      marginBottom: 18,
      lineHeight: 1.5,
    },
    btns: {
      display: "flex",
      gap: 10,
      justifyContent: "flex-end",
      alignItems: "center",
    },
    skipBtn: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "var(--text-faint)",
      fontSize: 13,
      padding: "6px 10px",
    },
    nextBtn: {
      background: "var(--accent)",
      color: "#fff",
      border: "none",
      borderRadius: 10,
      padding: "8px 16px",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
    },
  };

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        {/* Close */}
        <button style={s.closeBtn} onClick={dismiss} title="Close">×</button>

        {/* Progress dots */}
        <div style={s.progressRow}>
          {STEPS.map((_, i) => (
            <div key={i} style={s.dot(i <= step)} />
          ))}
        </div>

        {/* Content */}
        <div style={s.stepNum}>{current.num}</div>
        <div style={s.title}>{current.title}</div>
        <div style={s.desc}>{current.desc}</div>
        <div style={s.highlight}>{current.highlight}</div>

        {/* Buttons */}
        <div style={s.btns}>
          {current.skipLabel && (
            <button style={s.skipBtn} onClick={dismiss}>{current.skipLabel}</button>
          )}
          <button style={s.nextBtn} onClick={next}>{current.nextLabel}</button>
        </div>
      </div>
    </div>
  );
}
