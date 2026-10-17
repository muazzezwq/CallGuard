import type { ReactNode } from "react";

/* Shared error surface. Mirrors EmptyState but carries a danger tone, an
   optional raw detail block and a recovery action. Classes: .ui-error */
export function ErrorState({
  icon, title, description, detail, action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-error" role="alert">
      {icon && <div className="ui-error__icon">{icon}</div>}
      <div className="ui-error__title">{title}</div>
      {description && <p className="ui-error__desc">{description}</p>}
      {detail && <pre className="ui-error__detail mono">{detail}</pre>}
      {action && <div className="ui-error__action">{action}</div>}
    </div>
  );
}
