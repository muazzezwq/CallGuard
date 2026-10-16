import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Field({
  label, hint, error, htmlFor, children,
}: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="ui-field">
      {label && <label className="ui-field__label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="ui-field__error">{error}</span> : hint ? <span className="ui-field__hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ className, mono, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; error?: boolean }) {
  return <input className={clsx("ui-input", mono && "ui-input--mono", error && "ui-input--err", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx("ui-select", className)} {...rest}>{children}</select>;
}
