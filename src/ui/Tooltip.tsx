import { useId, type ReactNode } from "react";
import { clsx } from "clsx";

/* Hover/focus tooltip. The bubble is linked with aria-describedby so keyboard
   focus on the child reveals it as well. Never hover-only. */
export function Tooltip({
  label, children, className,
}: { label: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <span className={clsx("ui-tooltip", className)} aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className="ui-tooltip__bubble">{label}</span>
    </span>
  );
}
