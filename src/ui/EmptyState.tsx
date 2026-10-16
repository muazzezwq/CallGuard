import type { ReactNode } from "react";

export function EmptyState({
  icon, title, description, action,
}: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      {icon && <div className="ui-empty__icon">{icon}</div>}
      <div className="ui-empty__title">{title}</div>
      {description && <p className="ui-empty__desc">{description}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
