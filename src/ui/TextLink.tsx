import type { AnchorHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

/* Inline text link with a consistent accent + focus ring. */
export function TextLink({
  className, children, ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) {
  return <a className={clsx("ui-link", className)} {...rest}>{children}</a>;
}
