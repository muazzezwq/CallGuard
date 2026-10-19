import type { CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";

export function Field({
  label, hint, error, htmlFor, required, className, style, children,
}: {
  label?: ReactNode; hint?: ReactNode; error?: ReactNode; htmlFor?: string;
  /** Marks the label with a visible "required" tag; the control itself still owns `aria-required`. */
  required?: boolean;
  className?: string; style?: CSSProperties; children: ReactNode;
}) {
  return (
    <div className={clsx("ui-field", className)} style={style}>
      {label && (
        <label className="ui-field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ui-field__req" aria-hidden="true">required</span>}
        </label>
      )}
      {children}
      {/* The ids follow `htmlFor`, which is what callers point `aria-describedby` at. */}
      {error ? <span className="ui-field__error" id={htmlFor ? `${htmlFor}-err` : undefined}>{error}</span>
        : hint ? <span className="ui-field__hint" id={htmlFor ? `${htmlFor}-hint` : undefined}>{hint}</span> : null}
    </div>
  );
}

export function Input({ className, mono, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; error?: boolean }) {
  return <input className={clsx("ui-input", mono && "ui-input--mono", error && "ui-input--err", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx("ui-select", className)} {...rest}>{children}</select>;
}

export function Textarea({ className, mono, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean; error?: boolean }) {
  return <textarea className={clsx("ui-textarea", mono && "ui-textarea--mono", error && "ui-textarea--err", className)} {...rest} />;
}
