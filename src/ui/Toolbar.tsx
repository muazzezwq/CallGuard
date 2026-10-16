import type { ReactNode } from "react";
import { clsx } from "clsx";

/* Toolbar row — search + filter chips layout used across list screens. */
export function Toolbar({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("ui-toolbar", className)}>{children}</div>;
}

/* Selectable filter chip. */
export function Chip({
  active = false, onClick, children, className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={clsx("ui-chip", active && "is-active", className)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ChipRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("ui-chiprow", className)}>{children}</div>;
}
