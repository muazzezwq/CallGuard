import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* Disclosure popover anchored to a real button. It is intentionally
   non-modal: focus can leave the panel, and Escape/outside click dismiss it.
   The trigger keeps its accessible name from `label`, even when the visible
   trigger is an icon. */
export function Popover({
  label,
  trigger,
  children,
  align = "start",
  className,
  panelClassName,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    }

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleTrigger = () => {
    if (open) {
      setOpen(false);
      triggerRef.current?.focus();
    } else {
      setOpen(true);
    }
  };

  return (
    <div className={clsx("ui-popover", align === "end" && "ui-popover--end", className)} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-btn ui-btn--secondary ui-btn--sm ui-popover__trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={handleTrigger}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className={clsx("ui-popover__panel", panelClassName)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
