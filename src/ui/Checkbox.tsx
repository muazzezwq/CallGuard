import type { ReactNode } from "react";
import { clsx } from "clsx";

export function Checkbox({
  checked, onChange, label, hint, disabled, error, name, value, className,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  error?: boolean;
  name?: string;
  value?: string;
  className?: string;
}) {
  return (
    <label
      className={clsx("ui-check", disabled && "ui-check--disabled", error && "ui-check--err", className)}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-invalid={error || undefined}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="ui-check__box" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.8" />
        </svg>
      </span>
      {(label || hint) && (
        <span className="ui-check__text">
          {label && <span className="ui-check__label">{label}</span>}
          {hint && <span className="ui-check__hint">{hint}</span>}
        </span>
      )}
    </label>
  );
}
