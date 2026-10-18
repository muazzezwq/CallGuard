import type { ReactNode } from "react";
import { clsx } from "clsx";

/* Checkbox-based toggle. Keyboard-operable and exposed as role="switch". */
export function Switch({
  checked, onChange, label, disabled, name, className,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  name?: string;
  className?: string;
}) {
  return (
    <label className={clsx("ui-switch", className)}>
      <input
        type="checkbox"
        role="switch"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="ui-switch__track" aria-hidden="true">
        <span className="ui-switch__knob" />
      </span>
      {label && <span className="ui-switch__label">{label}</span>}
    </label>
  );
}
