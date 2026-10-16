import type { ReactNode } from "react";
import { clsx } from "clsx";

export type StepState = "done" | "active" | "pending" | "failed" | "idle";

export interface Step {
  id: string;
  label: ReactNode;
  sub?: ReactNode;
  state: StepState;
}

const GLYPH: Record<StepState, string> = {
  done: "✓",
  active: "·",
  pending: "·",
  failed: "!",
  idle: "",
};

/* Horizontal lifecycle stepper (payment → SLA → receipt → settlement, or
   the call detail stages). Purely presentational; state comes from real data. */
export function Stepper({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={clsx("ui-steps", className)}>
      {steps.map((s, i) => (
        <li key={s.id} className={clsx("ui-step", `is-${s.state}`)}>
          <div className="ui-step__rail">
            <span className="ui-step__dot" aria-hidden="true">{GLYPH[s.state]}</span>
            {i < steps.length - 1 && <span className="ui-step__bar" />}
          </div>
          <div className="ui-step__text">
            <span className="ui-step__label">{s.label}</span>
            {s.sub && <span className="ui-step__sub">{s.sub}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
