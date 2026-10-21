import type { ReactNode } from "react";
import { clsx } from "clsx";
import {
  Activity, Clock, Database, Radio, ReceiptText, ShieldCheck,
} from "lucide-react";
import {
  Badge, Button, Copy, EmptyState, ErrorState, Skeleton, Sparkline,
} from "../../ui";
import {
  formatAbsolute, formatCount, formatUsdc, relTime, shortId, statusMeta,
} from "./format";
import type { SgCall, SgProvider, SgMeta } from "./types";

/* ── Metric tile ──────────────────────────────────────────────────────────
   The number is rendered only when the source has answered. An unavailable
   source is an em dash, a first read is a skeleton, and a value from a failed
   refresh is marked "Cached" instead of being presented as fresh. */
export function MetricCard({
  label, value, unit, hint, icon, tone = "neutral", loading, unavailable, stale,
  spark, sparkLabel, delta, className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "accent" | "cyan";
  loading?: boolean;
  unavailable?: boolean;
  stale?: boolean;
  spark?: number[];
  sparkLabel?: string;
  delta?: number | null;
  className?: string;
}) {
  const showSpark = !!spark && spark.length > 1 && spark.some((v) => v > 0);

  return (
    <article
      className={clsx("ovd-metric", `ovd-metric--${tone}`, className)}
      aria-busy={loading || undefined}
    >
      <div className="ovd-metric__head">
        {icon && <span className="ovd-metric__icon" aria-hidden="true">{icon}</span>}
        <span className="ovd-metric__label">{label}</span>
        {stale && <Badge tone="pending">Cached</Badge>}
      </div>

      {loading ? (
        <Skeleton height={34} width="56%" />
      ) : (
        <div className="ovd-metric__reading">
          <span className="ovd-metric__value" key={String(value)}>
            {unavailable ? "—" : value}
          </span>
          {unit && !unavailable && <span className="ovd-metric__unit">{unit}</span>}
        </div>
      )}

      {hint && !loading && <p className="ovd-metric__hint">{hint}</p>}

      {typeof delta === "number" && !loading && (
        <span className={clsx("ovd-metric__delta", delta >= 0 ? "is-up" : "is-down")}>
          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% <small>vs previous 7d</small>
        </span>
      )}

      {showSpark && (
        <div className="ovd-metric__spark">
          <Sparkline
            data={spark!}
            height={38}
            color={tone === "cyan" ? "var(--accent-2)" : "var(--accent)"}
          />
          {sparkLabel && <span className="ovd-sr-only">{sparkLabel}</span>}
        </div>
      )}
    </article>
  );
}

export type ActivityBucket = { ago: number; count: number };

/* ── 24-hour activity ─────────────────────────────────────────────────────
   Every column is one indexed call timestamp. The accessible label carries the
   total and the busiest hour; the individual bars are decorative once that
   summary is present. */
export function ActivityChart({
  buckets, total, peak, truncated,
}: {
  buckets: ActivityBucket[];
  total: number;
  peak: { ago: number; count: number };
  truncated?: boolean;
}) {
  const max = Math.max(1, peak.count);
  const summary = total === 0
    ? "No calls in the last 24 hours."
    : `Calls per hour over the last 24 hours. ${formatCount(total)} call${total === 1 ? "" : "s"} in total. Busiest ${peak.ago === 0 ? "in the current hour" : `${peak.ago} hour${peak.ago === 1 ? "" : "s"} ago`} with ${formatCount(peak.count)} call${peak.count === 1 ? "" : "s"}.`;

  return (
    <div className="ovd-activity-chart">
      <div className="ovd-activity-chart__plot" role="img" aria-label={summary}>
        {buckets.map((b) => {
          const isPeak = peak.count > 0 && b.ago === peak.ago;
          return (
            <span
              key={b.ago}
              className={clsx("ovd-activity-chart__col", isPeak && "is-peak")}
              title={`${b.ago === 0 ? "This hour" : `${b.ago}h ago`} — ${formatCount(b.count)} call${b.count === 1 ? "" : "s"}`}
              aria-hidden="true"
            >
              <span
                className={clsx("ovd-activity-chart__bar", b.count === 0 && "is-zero")}
                style={{ height: b.count === 0 ? "0%" : `${Math.max(3, (b.count / max) * 100)}%` }}
              />
            </span>
          );
        })}
      </div>
      <div className="ovd-activity-chart__axis" aria-hidden="true">
        <span>24h ago</span>
        <span>12h</span>
        <span>now</span>
      </div>
      <p className="ovd-chart-summary">
        {formatCount(total)} call{total === 1 ? "" : "s"} in the last 24 hours
        {peak.count > 0 && (
          <> · busiest {peak.ago === 0 ? "now" : `${peak.ago}h ago`} with {formatCount(peak.count)}</>
        )}
        {truncated && <> · from the latest {formatCount(1000)} indexed calls</>}
      </p>
    </div>
  );
}

export type OutcomeRow = {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
};

export function OutcomeChart({
  rows, total, completed, slashed, refunded, open, honorPct, truncated,
}: {
  rows: OutcomeRow[];
  total: number;
  completed: number;
  slashed: number;
  refunded: number;
  open: number;
  honorPct: number | null;
  truncated?: boolean;
}) {
  return (
    <div className="ovd-outcomes">
      <ul className="ovd-outcomes__list" aria-label={`SLA outcomes across ${formatCount(total)} indexed calls`}>
        {rows.map((row) => (
          <li key={row.key} className="ovd-outcomes__row">
            <span className="ovd-outcomes__label">{row.label}</span>
            <span className="ovd-outcomes__track" aria-hidden="true">
              <i style={{ width: `${row.pct}%`, background: row.color }} />
            </span>
            <span className="ovd-outcomes__val">
              {formatCount(row.count)}
              <span>{row.pct}%</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="ovd-chart-summary">
        {formatCount(completed)} completed · {formatCount(slashed)} timeout claimed · {formatCount(refunded)} refunded · {formatCount(open)} open
        {honorPct !== null
          ? <> · SLA success {honorPct}% of settled calls</>
          : <> · success rate unknown until a call settles</>}
        {truncated && <> · from the latest {formatCount(1000)} indexed calls</>}
      </p>
    </div>
  );
}

/* ── Live Network ─────────────────────────────────────────────────────────
   A real availability ring plus indexed provider facts. No generated nodes:
   the ring is active / indexed providers, and each row is a provider record. */
export function LiveNetwork({
  providers, providerCount, activeProviders, completedAll, slashedAll, stakeRaw, priceRange, meta,
  loading, unavailable, stale, truncated, errorText, onRetry, onViewProviders, onRegister,
}: {
  providers: SgProvider[];
  providerCount: number | null;
  activeProviders: number;
  completedAll: number;
  slashedAll: number;
  stakeRaw: bigint | null;
  priceRange: { min: string; max: string } | null;
  meta?: SgMeta;
  loading: boolean;
  unavailable: boolean;
  stale: boolean;
  truncated?: boolean;
  errorText?: string;
  onRetry: () => void;
  onViewProviders: () => void;
  onRegister: () => void;
}) {
  if (loading) {
    return (
      <div className="ovd-live__loading" aria-busy="true">
        <Skeleton height={132} />
        <Skeleton height={42} />
        <Skeleton height={42} />
      </div>
    );
  }

  if (unavailable) {
    return (
      <ErrorState
        title="Network state unavailable"
        description="The indexer request failed, so provider availability cannot be read. Nothing is shown as zero."
        detail={errorText}
        action={<Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
      />
    );
  }

  if (providers.length === 0) {
    const registryHasProviders = (providerCount ?? 0) > 0;
    return (
      <EmptyState
        icon={<Database size={20} />}
        title={registryHasProviders ? "Provider records not indexed yet" : "No providers registered yet"}
        description={registryHasProviders
          ? `The registry reports ${formatCount(providerCount ?? 0)} provider${providerCount === 1 ? "" : "s"}, but the indexer returned no provider records. The live graph stays empty rather than inventing a topology.`
          : "The registry has no provider records for this deployment. This is an empty registry, not a failed request."}
        action={
          <Button size="sm" variant="secondary" onClick={registryHasProviders ? onViewProviders : onRegister}>
            {registryHasProviders ? "View providers" : "Register a provider"}
          </Button>
        }
      />
    );
  }

  const indexed = providers.length;
  const activePct = indexed > 0 ? Math.round((activeProviders / indexed) * 100) : 0;
  const stake = stakeRaw === null ? null : formatUsdc(stakeRaw);
  const idxBlock = meta?.block?.number;
  const idxTs = meta?.block?.timestamp;
  const visible = providers.slice(0, 5);

  return (
    <div className="ovd-live">
      <div className="ovd-live__summary">
        <div
          className="ovd-live__ring"
          role="img"
          aria-label={`${activeProviders} of ${indexed} indexed providers accepting calls`}
        >
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="18" pathLength="100" className="ovd-live__ring-track" />
            <circle
              cx="22" cy="22" r="18" pathLength="100"
              className="ovd-live__ring-fill"
              strokeDasharray={`${activePct} ${100 - activePct}`}
            />
          </svg>
          <span className="ovd-live__ring-value">{activeProviders}<small>/{indexed}</small></span>
        </div>
        <div className="ovd-live__facts">
          <div className="ovd-live__fact">
            <span>Accepting calls</span>
            <b>{formatCount(activeProviders)} of {formatCount(indexed)} indexed</b>
          </div>
          <div className="ovd-live__fact">
            <span>Registry providers</span>
            <b>{providerCount === null ? "—" : formatCount(providerCount)}</b>
          </div>
          <div className="ovd-live__fact">
            <span>Stake indexed</span>
            <b>{stake === null ? "—" : `${stake} USDC`}</b>
          </div>
          <div className="ovd-live__fact">
            <span>Price per call</span>
            <b>{priceRange === null ? "—" : priceRange.min === priceRange.max
              ? `${priceRange.min} USDC`
              : `${priceRange.min}–${priceRange.max} USDC`}</b>
          </div>
          <div className="ovd-live__fact">
            <span>Completed calls</span>
            <b>{formatCount(completedAll)} all providers</b>
          </div>
          <div className="ovd-live__fact">
            <span>Timeout claimed</span>
            <b>{formatCount(slashedAll)} all providers</b>
          </div>
        </div>
      </div>

      <div className="ovd-live__providers">
        <div className="ovd-live__providers-head">
          <h3>Provider availability</h3>
          <span className="ovd-live__providers-note">
            {stale
              ? "Cached indexer read"
              : truncated
                ? `Latest ${formatCount(1000)} records`
                : visible.length < indexed
                  ? `Top ${visible.length} of ${indexed}`
                  : "Indexed records"}
          </span>
        </div>
        <ul className="ovd-live__list">
          {visible.map((p) => {
            const active = !!p.active;
            const price = formatUsdc(p.pricePerCall);
            const stakeValue = formatUsdc(p.stake);
            return (
              <li key={p.id} className="ovd-live__row">
                <span className={clsx("ovd-live__dot", active ? "is-active" : "is-idle")} aria-hidden="true" />
                <span className="ovd-live__provider">
                  <b>Provider #{p.id}</b>
                  <span>{price === null ? "Price unavailable" : `${price} USDC / call`}{stakeValue === null ? "" : ` · ${stakeValue} USDC stake`}</span>
                </span>
                <Badge tone={active ? "guard" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="ovd-live__meta">
        <span>
          <Clock size={12} aria-hidden="true" />
          {idxTs ? `Indexed ${relTime(idxTs)}` : "Indexer timestamp unavailable"}
        </span>
        <span>
          <Database size={12} aria-hidden="true" />
          {idxBlock === undefined
            ? "Indexer block unavailable"
            : `Block ${formatCount(idxBlock)}`}
        </span>
        {meta?.hasIndexingErrors && <Badge tone="slash">Indexing error</Badge>}
        <button className="ovd-linkbtn" onClick={onViewProviders}>View providers</button>
      </div>
    </div>
  );
}

/* ── Recent activity ──────────────────────────────────────────────────────
   The subgraph exposes a call id, not a transaction hash, so the row offers
   the id and the existing verify destination rather than a fabricated explorer
   link. */
export function RecentActivity({
  calls, loading, unavailable, errorText, onRetry, onViewAll, onMakeCall, onVerify,
}: {
  calls: SgCall[];
  loading: boolean;
  unavailable: boolean;
  errorText?: string;
  onRetry: () => void;
  onViewAll: () => void;
  onMakeCall: () => void;
  onVerify: (callId: string) => void;
}) {
  if (loading) {
    return (
      <div className="ovd-activity" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={54} />)}
      </div>
    );
  }

  if (unavailable) {
    return (
      <ErrorState
        title="Activity unavailable"
        description="The indexer request failed. No activity is shown rather than an arrangement."
        detail={errorText}
        action={<Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
      />
    );
  }

  if (calls.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={20} />}
        title="No calls indexed yet"
        description="No calls are indexed at the last indexed block. This is an empty indexed set, not a failed request."
        action={<Button size="sm" variant="secondary" onClick={onMakeCall}>Make the first call</Button>}
      />
    );
  }

  return (
    <div className="ovd-activity">
      <ul className="ovd-activity__list">
        {calls.map((call) => {
          const meta = statusMeta(call.status);
          const icon = call.status === "SLASHED" ? <ShieldCheck size={15} />
            : call.status === "COMPLETED" ? <ReceiptText size={15} />
              : <Radio size={15} />;
          const ts = parseInt(call.createdAt || "0", 10);
          const amount = formatUsdc(call.amount);
          return (
            <li key={call.id ?? `${call.providerId}-${call.createdAt}`} className="ovd-activity__row">
              <span className={clsx("ovd-activity__icon", `is-${meta.tone}`)} aria-hidden="true">{icon}</span>
              <span className="ovd-activity__body">
                <span className="ovd-activity__title">
                  Provider #{call.providerId ?? "unknown"}
                </span>
                <span className="ovd-activity__sub">
                  {amount === null ? "Amount unavailable" : `${amount} USDC`}
                  {" · "}
                  {ts > 0
                    ? <span title={formatAbsolute(ts)}>{relTime(ts)}</span>
                    : "timestamp unavailable"}
                </span>
                {call.id && (
                  <span className="ovd-activity__id">
                    <span className="ovd-code" title={call.id}>{shortId(call.id)}</span>
                    <Copy value={call.id} label="Copy call id" />
                    <button
                      className="ovd-linkbtn"
                      onClick={() => onVerify(call.id!)}
                      aria-label={`Verify call ${call.id}`}
                    >
                      Verify
                    </button>
                  </span>
                )}
              </span>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </li>
          );
        })}
      </ul>
      <div className="ovd-activity__foot">
        <button className="ovd-linkbtn" onClick={onViewAll}>View all transactions</button>
        <span className="ovd-activity__hint">Newest indexed calls</span>
      </div>
    </div>
  );
}
