import { useId } from "react";

/* Dependency-free smooth sparkline. Colors are CSS variables so it
   follows the theme and the accent tokens automatically. */
export function Sparkline({
  data, height = 40, color = "var(--accent)", fill = true, className,
}: {
  data: number[];
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
}) {
  const id = useId().replace(/[:]/g, "");
  if (!data || data.length < 2) return null;

  const W = 100;
  const H = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return [x, y] as const;
  });

  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = (pts[i][0] - pts[i - 1][0]) / 3;
    d += ` C${pts[i - 1][0] + cx},${pts[i - 1][1]} ${pts[i][0] - cx},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`;
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      aria-hidden="true"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={`spk-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#spk-${id})`} stroke="none" />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
