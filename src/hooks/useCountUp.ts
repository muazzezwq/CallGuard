import { useState, useEffect, useRef } from "react";

export function useCountUp(target: number, duration = 800, enabled = true): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (!enabled || target === prevTarget.current) return;
    prevTarget.current = target;
    if (target === 0) { setValue(0); return; }
    let start = 0;
    const step = target / (duration / 16);
    const t = setInterval(() => {
      start = Math.min(start + step, target);
      setValue(Math.round(start));
      if (start >= target) clearInterval(t);
    }, 16);
    return () => clearInterval(t);
  }, [target, duration, enabled]);

  return value;
}
