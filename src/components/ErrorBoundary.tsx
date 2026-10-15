import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; resetKey?: unknown };
type State = { error: Error | null };

/**
 * Keeps a single panel's runtime error from blanking the whole SPA.
 * Resets automatically when `resetKey` (e.g. the active panel id) changes.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surfaced in the browser console for debugging.
    console.error("[panel error]", error);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "40px 20px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 6px" }}>
            This panel hit an error
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 16px" }}>
            The rest of the app still works — pick another section, or retry.
          </p>
          <pre style={{
            textAlign: "left", fontSize: 11, fontFamily: "var(--font-mono)",
            color: "var(--text-faint)", background: "var(--bg-2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "10px 12px", overflowX: "auto", marginBottom: 16,
          }}>{this.state.error.message}</pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, background: "var(--accent)", color: "#fff",
            }}
          >Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
