import { useState } from "react";
import { clsx } from "clsx";

export function Copy({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button type="button" className={clsx("ui-copy", done && "ui-copy--done", className)} onClick={onClick} aria-label={label}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}
