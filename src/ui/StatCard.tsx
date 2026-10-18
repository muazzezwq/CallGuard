import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Sparkline } from "./Sparkline";
import { Skeleton } from "./Skeleton";

/* Dim flat baseline shown when a metric has no sparkline data yet, so the
   sparkline slot never collapses and the tile keeps its rhythm. */
function FlatBaseline({ height = 34 }: { height?: number }) {
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      aria-hidden="true"
    >
      <path
        d="M0,29 L100,29"
        fill="none"
        stroke="var(--border-hi)"
        strokeWidth="1.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* Dashboard metric tile: label, value, optional delta chip, always-present
   sparkline slot (dim flat baseline when there is no series). Renders an
   honest em-dash when value is unavailable and a skeleton while loading —
   never a fabricated number. */
export function StatCard({
  label, value, hint, delta, spark, loading, unavailable, className,
}: {
  label: ReactNode;
  value: ReactNode;
  /* Short basis note: what the number is counted from. Kept visible so a
     metric never reads as an unexplained figure. */
  hint?: ReactNode;
  delta?: number | null;
  spark?: number[];
  loading?: boolean;
  unavailable?: boolean;
  className?: string;
}) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const up = hasDelta ? (delta as number) >= 0 : true;
  const showSpark = !!spark && spark.length > 1 && spark.some((v) => v > 0);

  return (
    <div className={clsx("ui-statcard", className)}>
      <div className="ui-statcard__label">{label}</div>
      {loading ? (
        <Skeleton height={28} width="60%" />
      ) : (
        <div className="ui-statcard__val">{unavailable ? "—" : value}</div>
      )}
      {hint && !loading && <div className="ui-statcard__hint">{hint}</div>}
      <div className="ui-statcard__foot">
        {hasDelta && !loading && (
          <span className={clsx("ui-statcard__delta", up ? "is-up" : "is-down")}>
            {up ? "▲" : "▼"} {Math.abs(delta as number)}%
          </span>
        )}
        <span className="ui-statcard__spark">
          {showSpark
            ? <Sparkline data={spark!} height={34} color={up ? "var(--accent)" : "var(--danger)"} />
            : <FlatBaseline />}
        </span>
      </div>
    </div>
  );
}
