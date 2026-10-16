import type { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md";
}
export function IconButton({ label, size = "md", className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx("ui-iconbtn", size === "sm" && "ui-iconbtn--sm", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
