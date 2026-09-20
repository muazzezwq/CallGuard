import { useEffect, useRef } from "react";

export function SparklineChart() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // Generate synthetic sparkline from random walk (replaced by real data later)
    const points = Array.from({ length: 32 }, (_, i) => {
      const base = 30 + Math.sin(i * 0.4) * 12 + Math.random() * 8;
      return Math.max(4, Math.min(58, base));
    });

    const svg = svgRef.current;
    if (!svg) return;
    const W = 680, H = 64;
    const step = W / (points.length - 1);

    const coords = points.map((y, i) => ({ x: i * step, y: H - y }));
    const path = coords.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    const fill = path + ` L${W},${H} L0,${H} Z`;

    const lineEl = svg.getElementById("spLine");
    const fillEl = svg.getElementById("spFill");
    if (lineEl) lineEl.setAttribute("d", path);
    if (fillEl) fillEl.setAttribute("d", fill);

    // Animate line draw
    if (lineEl) {
      const length = (lineEl as SVGPathElement).getTotalLength?.() ?? 1000;
      (lineEl as SVGPathElement).style.strokeDasharray = `${length}`;
      (lineEl as SVGPathElement).style.strokeDashoffset = `${length}`;
      (lineEl as SVGPathElement).style.animation = "spDraw 1.5s ease forwards 0.5s";
    }
  }, []);

  return (
    <div className="glass rounded-2xl border border-white/[0.05] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-glow" />
          <span className="mono text-[10px] text-white/30 uppercase tracking-wider">Network Call Activity</span>
        </div>
        <span className="mono text-[10px] text-white/20">last 32 blocks</span>
      </div>
      <div className="px-2 py-2">
        <svg ref={svgRef} viewBox="0 0 680 64" preserveAspectRatio="none" className="w-full h-14">
          <defs>
            <linearGradient id="spGrad2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(16,185,129,0.25)" />
              <stop offset="100%" stopColor="rgba(16,185,129,0)" />
            </linearGradient>
            <style>{`@keyframes spDraw { to { stroke-dashoffset: 0; } }`}</style>
          </defs>
          <path id="spFill" fill="url(#spGrad2)" />
          <path id="spLine" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
