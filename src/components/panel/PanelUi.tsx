import type { ReactNode } from "react";
import { clsx } from "clsx";
import "./panel.css";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  TestTube2,
  XCircle,
} from "lucide-react";
import { Copy } from "../../ui";

/* Shared composition for the remaining premium panels. It deliberately owns
   layout and truth-state presentation only; data, actions and copy stay in the
   panel that already owns them. */

export function PanelShell({
  children, className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={clsx("pg-root", className)}>{children}</div>;
}

export type SourceState = "live" | "cached" | "unavailable" | "idle";

export function PanelSource({
  label, value, hint, state = "idle",
}: {
  label: ReactNode;
  value?: ReactNode;
  hint?: ReactNode;
  state?: SourceState;
}) {
  return (
    <div className="pg-source">
      <span className={clsx("pg-source__dot", `is-${state}`)} aria-hidden="true" />
      <span className="pg-source__label">{label}</span>
      {value != null && <span className="pg-source__value">{value}</span>}
      {hint != null && <span className="pg-source__hint">{hint}</span>}
    </div>
  );
}

/* One bordered metric surface rather than four independent cards. The values
   come from the panel; the kit never fills, rounds or invents one. */
export function SignalRow({
  children, label, className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div className={clsx("pg-signals", className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function PanelSplit({
  main, rail, className,
}: {
  main: ReactNode;
  rail: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("pg-split", className)}>
      <div className="pg-main">{main}</div>
      <aside className="pg-rail">{rail}</aside>
    </div>
  );
}

export type LedgerTone = "neutral" | "guard" | "warn" | "danger" | "muted";

export function Ledger({
  children, label, action, empty, className,
}: {
  children?: ReactNode;
  label?: ReactNode;
  action?: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  const hasChildren = Boolean(children);
  return (
    <section className={clsx("pg-ledger", className)}>
      {(label != null || action != null) && (
        <div className="pg-ledger__head">
          {label != null && <h2 className="pg-ledger__title">{label}</h2>}
          {action}
        </div>
      )}
      {hasChildren ? (
        <ul className="pg-ledger__list">{children}</ul>
      ) : empty != null ? (
        <div className="pg-ledger__empty">{empty}</div>
      ) : null}
    </section>
  );
}

export function LedgerRow({
  lead, meta, trailing, tone = "neutral", onClick, ariaLabel,
}: {
  lead: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  tone?: LedgerTone;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const body = (
    <>
      <span className="pg-ledger__lead">
        <span className="pg-ledger__lead-main">{lead}</span>
        {meta != null && <span className="pg-ledger__meta">{meta}</span>}
      </span>
      {trailing != null && <span className="pg-ledger__trail">{trailing}</span>}
    </>
  );
  return (
    <li className={clsx("pg-ledger__row", `is-${tone}`)}>
      {onClick ? (
        <button type="button" className="pg-ledger__button" onClick={onClick} aria-label={ariaLabel}>
          {body}
        </button>
      ) : body}
    </li>
  );
}

export type KeyValueItem = {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
};

export function KeyValue({
  rows, label, className,
}: {
  rows: KeyValueItem[];
  label?: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("pg-kv", className)}>
      {label != null && <h2 className="pg-kv__title">{label}</h2>}
      <dl className="pg-kv__list">
        {rows.map((row, i) => (
          <div className="pg-kv__row" key={i}>
            <dt className="pg-kv__label">{row.label}</dt>
            <dd className={clsx("pg-kv__value", row.mono && "is-mono")}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CodeSurface({
  code, label, language, wrap = false, className, copyValue, copyLabel,
}: {
  code: string;
  label?: ReactNode;
  language?: ReactNode;
  wrap?: boolean;
  className?: string;
  copyValue?: string;
  copyLabel?: string;
}) {
  return (
    <section className={clsx("pg-code", className)}>
      <div className="pg-code__head">
        <span className="pg-code__label">{label ?? language ?? "Code"}</span>
        <div className="pg-code__actions">
          {language != null && label != null && <span className="pg-code__lang">{language}</span>}
          <Copy value={copyValue ?? code} label={copyLabel ?? "Copy code"} />
        </div>
      </div>
      <pre className={clsx("pg-code__pre", wrap && "is-wrap")}>{code}</pre>
    </section>
  );
}

export type NoticeTone = "info" | "success" | "warn" | "danger" | "retired" | "preview";

const NOTICE_ICON = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  danger: XCircle,
  retired: ShieldAlert,
  preview: TestTube2,
} satisfies Record<NoticeTone, typeof Info>;

export function StatusNotice({
  tone, title, children, live, icon, action, className,
}: {
  tone: NoticeTone;
  title: ReactNode;
  children?: ReactNode;
  live?: "polite" | "assertive" | "off";
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = NOTICE_ICON[tone];
  const role = tone === "danger" ? "alert" : "status";
  const ariaLive = live === "off" ? undefined : live ?? (tone === "danger" ? "assertive" : "polite");
  return (
    <div
      className={clsx("pg-notice", `is-${tone}`, className)}
      role={role}
      aria-live={ariaLive}
    >
      <span className="pg-notice__icon" aria-hidden="true">{icon ?? <Icon size={18} />}</span>
      <div className="pg-notice__text">
        <div className="pg-notice__title">{title}</div>
        {children != null && <div className="pg-notice__body">{children}</div>}
      </div>
      {action != null && <div className="pg-notice__action">{action}</div>}
    </div>
  );
}
