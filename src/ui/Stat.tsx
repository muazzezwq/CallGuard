import type { ReactNode } from "react";
import { clsx } from "clsx";

export function Stat({
  label, value, hint, tone, className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "guard" | "slash";
  className?: string;
}) {
  return (
    <div className={clsx("ui-stat", className)}>
      <span className="ui-stat__label">{label}</span>
      <span className={clsx("ui-stat__value", tone && `ui-stat__value--${tone}`)}>{value}</span>
      {hint && <span className="ui-stat__hint">{hint}</span>}
    </div>
  );
}
