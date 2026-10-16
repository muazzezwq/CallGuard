import type { ReactNode } from "react";
import { clsx } from "clsx";

/* Titled panel surface — the dashboard's repeated container. */
export function SectionCard({
  title, action, subtitle, bodyClass, className, children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  bodyClass?: string;
  className?: string;
  children: ReactNode;
}) {
  const hasHead = title != null || action != null;
  return (
    <section className={clsx("ui-section", className)}>
      {hasHead && (
        <div className="ui-section__head">
          <div>
            {title != null && <span className="ui-section__title">{title}</span>}
            {subtitle && <div className="ui-section__sub">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={clsx("ui-section__body", bodyClass)}>{children}</div>
    </section>
  );
}
