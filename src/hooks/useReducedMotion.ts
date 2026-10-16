import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";

/** OS-level `prefers-reduced-motion`. */
export function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Effective preference: the user's explicit setting OR the OS setting. */
export function useReducedMotion(): boolean {
  const pref = useAppStore((s) => s.reducedMotion);
  const sys = useSystemReducedMotion();
  return pref || sys;
}

/** Reflects the effective preference onto <html data-motion> for CSS to gate on. */
export function useApplyMotionPreference(): void {
  const reduced = useReducedMotion();
  useEffect(() => {
    document.documentElement.setAttribute("data-motion", reduced ? "reduced" : "full");
  }, [reduced]);
}
