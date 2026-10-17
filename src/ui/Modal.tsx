import { useEffect, type ReactNode } from "react";
import { IconButton } from "./IconButton";

export function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="ui-modal-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-modal" role="dialog" aria-modal="true">
        {title && (
          <div className="ui-modal__head">
            <span className="ui-modal__title">{title}</span>
            <IconButton label="Close" size="sm" onClick={onClose}>✕</IconButton>
          </div>
        )}
        <div className="ui-modal__body">{children}</div>
      </div>
    </div>
  );
}
