import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Sparkline } from "./Sparkline";
import { Skeleton } from "./Skeleton";

/* Dashboard metric tile: label, value, optional delta chip, optional
   sparkline. Renders an honest em-dash when value is unavailable and a
   skeleton while loading — never a fabricated number. */
export function StatCard({
  label, value, delta, spark, loading, unavailable, className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: number | null;
  spark?: number[];
  loading?: boolean;
  unavailable?: boolean;
  className?: string;
}) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const up = hasDelta && (delta as number) >= 0;

  return (
    <div className={clsx("ui-statcard", className)}>
      <div className="ui-statcard__label">{label}</div>
      {loading ? (
        <Skeleton height={28} width="60%" />
      ) : (
        <div className="ui-statcard__val">{unavailable ? "—" : value}</div>
      )}
      <div className="ui-statcard__foot">
        {hasDelta && !loading ? (
          <span className={clsx("ui-statcard__delta", up ? "is-up" : "is-down")}>
            {up ? "▲" : "▼"} {Math.abs(delta as number)}%
          </span>
        ) : (
          <span className="ui-statcard__delta is-flat">—</span>
        )}
        {spark && spark.length > 1 && (
          <span className="ui-statcard__spark">
            <Sparkline data={spark} height={34} color={up ? "var(--accent)" : "var(--danger)"} />
          </span>
        )}
      </div>
    </div>
  );
}
