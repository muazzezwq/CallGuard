import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { ErrorState, Button } from "../ui";

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
        <ErrorState
          icon={<AlertTriangle size={22} />}
          title="This panel hit an error"
          description="The rest of the app still works — pick another section, or retry."
          detail={this.state.error.message}
          action={
            <Button variant="primary" size="sm" onClick={() => this.setState({ error: null })}>
              Retry
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
