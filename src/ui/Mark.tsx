import { clsx } from "clsx";

export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cg-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1CE08E" />
          <stop offset="1" stopColor="#0E9F6E" />
        </linearGradient>
      </defs>
      <path d="M16 2.1 27.2 6.5v8.2c0 7.3-4.8 12.6-11.2 15C9.6 27.3 4.8 22 4.8 14.7V6.5L16 2.1Z" fill="url(#cg-mark)" />
      <path d="M17.5 8.2 11.2 17h4.2l-1.4 6.9 6.3-9.1h-4.3l1.5-6.6Z" fill="#000D1A" />
    </svg>
  );
}

export function Wordmark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx("ui-wordmark", className)} style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <Mark size={size} />
      <span style={{ fontSize: size * 0.72, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)" }}>
        CallGuard
      </span>
    </span>
  );
}
