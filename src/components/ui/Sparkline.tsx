import { useEffect, useRef } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

function buildPath(data: number[], W: number, H: number, fill: boolean): string {
  if (!data || data.length < 2) return "";
  const max = Math.max(...data) || 1;
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 8) - 4;
    return [x, y];
  });
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) / 3;
    const cp2x = pts[i][0] - (pts[i][0] - pts[i - 1][0]) / 3;
    d += ` C${cp1x},${pts[i - 1][1]} ${cp2x},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`;
  }
  if (fill) {
    d += ` L${pts[pts.length - 1][0]},${H} L0,${H} Z`;
  }
  return d;
}

export default function Sparkline({ data, width = 680, height = 56, color = "#10b981" }: SparklineProps) {
  const lineRef = useRef<SVGPathElement>(null);
  const fillRef = useRef<SVGPathElement>(null);
  const gradId = `sg-${Math.random().toString(36).slice(2, 7)}`;

  useEffect(() => {
    if (!lineRef.current || data.length < 2) return;
    const W = width, H = height;
    const line = buildPath(data, W, H, false);
    const area = buildPath(data, W, H, true);
    lineRef.current.setAttribute("d", line);
    if (fillRef.current) fillRef.current.setAttribute("d", area);
    // Animate draw
    const len = lineRef.current.getTotalLength?.() ?? 1200;
    lineRef.current.style.strokeDasharray = String(len);
    lineRef.current.style.strokeDashoffset = String(len);
    lineRef.current.style.transition = "none";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!lineRef.current) return;
        lineRef.current.style.transition = "stroke-dashoffset 1.8s cubic-bezier(0.4,0,0.2,1)";
        lineRef.current.style.strokeDashoffset = "0";
      });
    });
  }, [data, width, height]);

  if (data.length < 2) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: `${height}px`, display: "block" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path
        ref={fillRef}
        fill={`url(#${gradId})`}
        stroke="none"
      />
      <path
        ref={lineRef}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
