import type { HTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  pad?: boolean;
  hover?: boolean;
}
export function Card({ pad = true, hover = false, className, children, ...rest }: CardProps) {
  return (
    <div className={clsx("ui-card", pad && "ui-card--pad", hover && "ui-card--hover", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHead({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-card__head">
      <span className="ui-card__title">{title}</span>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("ui-card__body", className)}>{children}</div>;
}
