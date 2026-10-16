import { clsx } from "clsx";

export function Skeleton({ width = "100%", height = 14, radius = 8, className }: {
  width?: number | string; height?: number | string; radius?: number; className?: string;
}) {
  return <div className={clsx("ui-skel", className)} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}
