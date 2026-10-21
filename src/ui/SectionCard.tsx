import type { ReactNode } from "react";
import { clsx } from "clsx";

/* Titled panel surface — the dashboard's repeated container. */
export function SectionCard({
  title, action, subtitle, bodyClass, className, titleAs, children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  bodyClass?: string;
  className?: string;
  /** Optional semantic heading level. Defaults to a plain span for
   *  backward compatibility with panels that provide their own structure. */
  titleAs?: "h2" | "h3" | "h4";
  children: ReactNode;
}) {
  const hasHead = title != null || action != null;
  const TitleTag = titleAs ?? "span";
  return (
    <section className={clsx("ui-section", className)}>
      {hasHead && (
        <div className="ui-section__head">
          <div>
            {title != null && <TitleTag className="ui-section__title">{title}</TitleTag>}
            {subtitle && <div className="ui-section__sub">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={clsx("ui-section__body", bodyClass)}>{children}</div>
    </section>
  );
}
