/* Isometric SLA lifecycle board: four plates on a slanted rail.
   Stage states come from the real call status — nothing is invented. */

export type SlaStageState = "done" | "active" | "pending" | "failed" | "info";
export type SlaStage = { key: string; label: string; sub?: string; state: SlaStageState };

/* Maps a subgraph call status to the four lifecycle stages. */
export function slaStages(status?: string, opts?: { amount?: string; respondedMs?: number | null }): SlaStage[] {
  const s = String(status ?? "").toUpperCase();
  const open: SlaStageState = "pending";
  const base: SlaStage[] = [
    { key: "escrow", label: "Escrow", sub: opts?.amount ? `${opts.amount} USDC` : undefined, state: open },
    { key: "call", label: "Service call", sub: "provider notified", state: open },
    { key: "receipt", label: "Receipt", sub: "EIP-712 signed", state: open },
    { key: "settle", label: "Settlement", sub: "payout or slash", state: open },
  ];

  if (s === "COMPLETED") {
    base[0].state = "done";
    base[1].state = "done";
    base[2].state = "done";
    base[2].sub = "signature verified";
    base[3].state = "done";
    base[3].sub = "paid to provider";
    if (opts?.respondedMs != null) base[1].sub = `answered in ${(opts.respondedMs / 1000).toFixed(1)}s`;
    return base;
  }
  if (s === "SLASHED") {
    base[0].state = "done";
    base[1].state = "done";
    base[2].state = "failed";
    base[2].sub = "no valid receipt";
    base[3].state = "failed";
    base[3].sub = "stake slashed";
    return base;
  }
  if (s === "REFUNDED") {
    base[0].state = "done";
    base[1].state = "info";
    base[1].sub = "caller refunded";
    base[2].state = "pending";
    base[3].state = "info";
    base[3].sub = "escrow returned";
    return base;
  }
  if (s === "STARTED" || s === "OPEN") {
    base[0].state = "done";
    base[1].state = "active";
    base[2].state = "pending";
    base[3].state = "pending";
    return base;
  }
  /* Unknown status: show the board with an idle first plate. */
  base[0].state = "active";
  return base;
}

const STATE_FILL: Record<SlaStageState, string> = {
  done: "var(--accent)",
  active: "var(--accent-2)",
  pending: "var(--border-hi)",
  failed: "var(--danger)",
  info: "var(--info, #1F77EF)",
};

/* Isometric projection: board (x, y) → screen, with y growing "into" the scene. */
const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = Math.sin(Math.PI / 6);

function iso(x: number, y: number, z: number) {
  return { x: (x - y) * ISO_COS, y: (x + y) * ISO_SIN - z };
}

/* A single isometric plate: top face + two visible side faces. */
function Plate({ cx, cy, w, d, t, state, delay }: {
  cx: number; cy: number; w: number; d: number; t: number; state: SlaStageState; delay: number;
}) {
  const hw = w / 2, hd = d / 2;
  const top = [
    iso(cx - hw, cy - hd, t), iso(cx + hw, cy - hd, t),
    iso(cx + hw, cy + hd, t), iso(cx - hw, cy + hd, t),
  ];
  const left = [top[3], top[2], iso(cx + hw, cy + hd, 0), iso(cx - hw, cy + hd, 0)];
  const right = [top[1], top[2], iso(cx + hw, cy + hd, 0), iso(cx + hw, cy - hd, 0)];
  const pts = (p: { x: number; y: number }[]) => p.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(" ");

  return (
    <g style={{ animation: `sla-in .45s ease-out ${delay}ms both` }}>
      <polygon points={pts(left)} style={{ fill: "var(--bg-3)" }} />
      <polygon points={pts(right)} style={{ fill: "var(--bg-2)" }} />
      <polygon
        points={pts(top)}
        style={{ fill: STATE_FILL[state], fillOpacity: state === "pending" ? 0.35 : 0.85 }}
      />
      <polygon
        points={pts(top)}
        style={{ fill: "none", stroke: STATE_FILL[state], strokeWidth: 1 }}
      />
      {state === "active" && (
        <polygon points={pts(top)} style={{ fill: "var(--accent-2)", fillOpacity: 0.18, animation: "sla-pulse 1.8s ease-in-out infinite" }} />
      )}
    </g>
  );
}

export function SLACanvas({ stages }: { stages: SlaStage[] }) {
  const gap = 46;
  const plateW = 34;
  const plateD = 24;
  const thickness = 9;

  /* Board space → viewBox. Board runs along +x; y is a fixed depth offset. */
  const corners = stages.flatMap((_, i) => {
    const cx = i * gap;
    return [iso(cx - plateW, -plateD, thickness), iso(cx + plateW, plateD, 0)];
  });
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const padX = 10, padY = 12;
  const vw = maxX - minX + padX * 2;
  const vh = maxY - minY + padY * 2;

  return (
    <div className="sla-canvas">
      <svg viewBox={`${minX - padX} ${minY - padY} ${vw} ${vh}`} role="img" aria-label="SLA lifecycle">
        {/* rail between plates */}
        {stages.slice(0, -1).map((st, i) => {
          const a = iso(i * gap + plateW / 2 + 4, 0, thickness / 2);
          const b = iso((i + 1) * gap - plateW / 2 - 4, 0, thickness / 2);
          const on = st.state === "done" || st.state === "active";
          return (
            <line
              key={st.key}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              style={{ stroke: on ? "var(--accent)" : "var(--border-hi)" }}
              strokeWidth={1.5}
              strokeDasharray={on ? undefined : "3 3"}
            />
          );
        })}
        {stages.map((st, i) => (
          <Plate
            key={st.key}
            cx={i * gap}
            cy={0}
            w={plateW}
            d={plateD}
            t={thickness}
            state={st.state}
            delay={i * 70}
          />
        ))}
      </svg>

      {/* Labels are positioned on the same isometric axis as their plate. */}
      <div className="sla-canvas__labels">
        {stages.map((st, i) => {
          const c = iso(i * gap, 0, thickness);
          const left = ((c.x - (minX - padX)) / vw) * 100;
          return (
            <div key={st.key} className="sla-canvas__label" style={{ left: `clamp(56px, ${left}%, calc(100% - 56px))` }}>
              <span className={`sla-canvas__name sla-canvas__name--${st.state}`}>{st.label}</span>
              <span className="sla-canvas__sub">{st.sub ?? "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
