import { useAccount } from "wagmi";
import { useAppStore } from "../../store/useAppStore";

const STEP_LABELS: Record<string, string> = {
  wallet:  "Connect wallet",
  usdc:    "Get USDC",
  action:  "Make first call",
  receipt: "Submit receipt",
};

export default function ProgressTracker() {
  const { isConnected } = useAccount();
  const { progressSteps, markStep } = useAppStore();

  // Mark wallet step on connection
  if (isConnected) markStep("wallet");

  const total = progressSteps.length;
  const done = progressSteps.filter(s => s.done).length;

  // Hide when all done
  if (done === total) return null;
  // Don't show before wallet connection
  if (!isConnected) return null;

  const pct = Math.round((done / total) * 100);

  return (
    <div style={{
      margin: "8px 12px 4px",
      background: "var(--bg-2)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "10px 12px",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Getting started
        </span>
        <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600 }}>
          {done}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 3, background: "var(--border)", borderRadius: 2, marginBottom: 8, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: "linear-gradient(90deg,#10b981,#059669)",
          borderRadius: 2,
          transition: "width 0.4s ease",
        }} />
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {progressSteps.map(step => (
          <div key={step.id} style={{
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
              background: step.done ? "var(--accent)" : "var(--bg-3)",
              border: step.done ? "none" : "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: "#fff",
              transition: "background 0.3s",
            }}>
              {step.done ? "✓" : ""}
            </div>
            <span style={{
              fontSize: 11,
              color: step.done ? "var(--text-dim)" : "var(--text)",
              textDecoration: step.done ? "line-through" : "none",
              fontWeight: step.done ? 400 : 500,
            }}>
              {STEP_LABELS[step.id] || step.id}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
