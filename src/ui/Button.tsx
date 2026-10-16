import type { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  variant = "secondary", size = "md", loading = false, block = false,
  leftIcon, rightIcon, className, children, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx("ui-btn", `ui-btn--${variant}`, `ui-btn--${size}`, block && "ui-btn--block", className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="ui-btn__spinner" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
