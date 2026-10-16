import type { ReactNode } from "react";
import { clsx } from "clsx";

export function Tabs<T extends string>({
  tabs, value, onChange, className,
}: {
  tabs: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx("ui-tabs", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className={clsx("ui-tabs__tab", value === t.id && "ui-tabs__tab--active")}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
