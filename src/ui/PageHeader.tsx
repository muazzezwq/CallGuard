import type { ReactNode } from "react";
import { clsx } from "clsx";

/* Standard page header for every panel: optional eyebrow chip,
   title, subtitle and a right-aligned actions slot. */
export function PageHeader({
  eyebrow, title, subtitle, actions, className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("ui-pagehead", className)}>
      <div className="ui-pagehead__main">
        {eyebrow && <div className="ui-pagehead__eyebrow">{eyebrow}</div>}
        <h1 className="ui-pagehead__title">{title}</h1>
        {subtitle && <p className="ui-pagehead__sub">{subtitle}</p>}
      </div>
      {actions && <div className="ui-pagehead__actions">{actions}</div>}
    </header>
  );
}
