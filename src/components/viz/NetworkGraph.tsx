import { useId, useMemo } from "react";
import { clsx } from "clsx";
import { useReducedMotion } from "../../hooks/useReducedMotion";

/* Deterministic PRNG so the topology is stable across renders (no flicker). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Node = { x: number; y: number; r: number; depth: number; hub: boolean };

function buildNodes(count: number, seed: number): Node[] {
  const rnd = mulberry32(seed);
  const nodes: Node[] = [];
  for (let i = 0; i < count; i++) {
    // spiral distribution → organic ring/cluster, denser near the core
    const a = i * 2.399963 + rnd() * 0.5;      // golden angle + jitter
    const t = Math.pow(i / count, 0.62);
    const dist = 26 + t * 118 + rnd() * 10;
    nodes.push({
      x: 200 + Math.cos(a) * dist,
      y: 150 + Math.sin(a) * dist * 0.72,
      r: 2 + rnd() * 4.5,
      depth: t,
      hub: rnd() > 0.86,
    });
  }
  return nodes;
}

/* Pseudo-3D network canvas: an on-chain service graph, drawn as SVG.
   Purely decorative topology — no fabricated metrics. */
export function NetworkGraph({
  labels = [], seed = 7, height = 340, className,
}: {
  labels?: string[];
  seed?: number;
  height?: number;
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const reduce = useReducedMotion();
  const nodes = useMemo(() => buildNodes(26, seed), [seed]);

  const edges = useMemo(() => {
    const rnd = mulberry32(seed + 91);
    const out: [Node, Node][] = [];
    nodes.forEach((n) => {
      const links = n.hub ? 3 : rnd() > 0.6 ? 2 : 1;
      for (let k = 0; k < links; k++) {
        const m = nodes[Math.floor(rnd() * nodes.length)];
        if (m !== n) out.push([n, m]);
      }
    });
    return out.slice(0, 40);
  }, [nodes, seed]);

  const labelSlots = [
    { left: "12%", top: "16%" },
    { left: "70%", top: "10%" },
    { left: "58%", top: "74%" },
    { left: "6%", top: "66%" },
  ];

  return (
    <div className={clsx("viz-net", className)} style={{ height }} aria-hidden="true">
      <svg viewBox="0 0 400 300" className="viz-net__svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="46%" r="52%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
            <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        <rect x="0" y="0" width="400" height="300" fill={`url(#${uid}-glow)`} />

        <g className={`viz-net__edges${reduce ? " is-static" : ""}`}>
          {edges.map(([a, b], i) => (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="var(--accent)"
              strokeOpacity={0.10 + (1 - Math.max(a.depth, b.depth)) * 0.16}
              strokeWidth={0.8}
            />
          ))}
        </g>

        <g>
          {nodes.map((n, i) => (
            <g key={i} opacity={0.35 + (1 - n.depth) * 0.6}>
              <circle cx={n.x} cy={n.y} r={n.r + 4} fill="var(--accent)" opacity="0.14" filter={`url(#${uid}-blur)`} />
              <circle cx={n.x} cy={n.y} r={n.r} fill={n.hub ? "var(--accent-2)" : "var(--accent)"} />
            </g>
          ))}
        </g>

        {/* core badge */}
        <g transform="translate(200 150)">
          <circle r="30" fill="var(--accent)" opacity="0.14" filter={`url(#${uid}-blur)`} />
          <polygon
            points="0,-19 16.5,-9.5 16.5,9.5 0,19 -16.5,9.5 -16.5,-9.5"
            fill="var(--bg-0)" stroke="var(--accent)" strokeWidth="1.6"
          />
          <text
            x="0" y="6" textAnchor="middle"
            fontSize="17" fontWeight="700" fill="var(--accent)"
            fontFamily="var(--font-display)"
          >C</text>
        </g>
      </svg>

      {labels.slice(0, 4).map((l, i) => (
        <span className="viz-net__label" key={l} style={labelSlots[i]}>
          <span className="viz-net__label-dot" />
          {l}
        </span>
      ))}
    </div>
  );
}
