import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./IconButton";

export function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    restoreRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="ui-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title && (
          <div className="ui-modal__head">
            <span className="ui-modal__title" id={titleId}>{title}</span>
            <IconButton label="Close" size="sm" onClick={onClose}>✕</IconButton>
          </div>
        )}
        <div className="ui-modal__body">{children}</div>
      </div>
    </div>
  );
}
