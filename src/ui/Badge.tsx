import type { ReactNode } from "react";
import { clsx } from "clsx";

type Tone = "neutral" | "guard" | "slash" | "pending" | "info";

export function Badge({
  tone = "neutral", dot = false, className, children,
}: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={clsx("ui-badge", `ui-badge--${tone}`, className)}>
      {dot && <span className="ui-badge__dot" />}
      {children}
    </span>
  );
}
