/* Isometric SLA lifecycle board: four plates on a slanted rail.
   Stage states come from the real call status — nothing is invented.
   The board is optionally interactive: pass `selected` + `onSelect` and each
   plate (and its label) becomes a keyboard-operable control, backed by a
   stacked stage list that also serves as the accessible reading order. */

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

export type SlaStageState = "done" | "active" | "pending" | "failed" | "info";
export type SlaStage = { key: string; label: string; sub?: string; state: SlaStageState };

/* Maps a subgraph call status to the four lifecycle stages.
   There is no "timed out" variant: the subgraph sets `completedAt` on every
   `CallSlashed` (subgraph/src/mapping.ts), so a slash without a settlement
   timestamp cannot be observed from the indexed fields — inventing the
   distinction would be a claim the data does not support. */
export function slaStages(
  status?: string,
  opts?: { amount?: string; respondedMs?: number | null },
): SlaStage[] {
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

/* The state in words, so a stage never reads as colour alone. */
const STATE_WORD: Record<SlaStageState, string> = {
  done: "Done",
  active: "In progress",
  pending: "Waiting",
  failed: "Failed",
  info: "Info",
};

/* Isometric projection: board (x, y) → screen, with y growing "into" the scene. */
const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = Math.sin(Math.PI / 6);

function iso(x: number, y: number, z: number) {
  return { x: (x - y) * ISO_COS, y: (x + y) * ISO_SIN - z };
}

/* A single isometric plate: top face + two visible side faces. */
function Plate({ cx, cy, w, d, t, state, delay, ring }: {
  cx: number; cy: number; w: number; d: number; t: number; state: SlaStageState; delay: number;
  ring: boolean;
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
      {/* Edge outline: carries the selected / focused state (see shell.css). */}
      <polygon
        className={clsx("sla-plate__outline", ring && "is-selected")}
        points={pts(top)}
        style={{ fill: "none" }}
      />
      {state === "active" && (
        <polygon points={pts(top)} style={{ fill: "var(--accent-2)", fillOpacity: 0.18, animation: "sla-pulse 1.8s ease-in-out infinite" }} />
      )}
    </g>
  );
}

function LabelBody({ stage }: { stage: SlaStage }) {
  return (
    <>
      <span className={`sla-canvas__name sla-canvas__name--${stage.state}`}>{stage.label}</span>
      <span className="sla-canvas__sub">{stage.sub ?? "—"}</span>
    </>
  );
}

export function SLACanvas({ stages, selected, onSelect }: {
  stages: SlaStage[];
  selected?: string | null;
  onSelect?: (key: string) => void;
}) {
  const gap = 46;
  const plateW = 34;
  const plateD = 24;
  const thickness = 9;
  const interactive = typeof onSelect === "function";
  const selIndex = selected ? stages.findIndex((s) => s.key === selected) : -1;
  const selStage = selIndex >= 0 ? stages[selIndex] : null;
  /* The plate is the control that owns the keyboard; the label below it is only
     its pointer twin (aria-hidden, out of the tab order), so a pointer press
     there hands focus to the plate instead of leaving it on the body. */
  const plateRefs = useRef<(SVGGElement | null)[]>([]);

  /* Zoom and pan: the SVG scales, the label row does not. Labels are re-anchored
     to the scaled plate positions (see `labelLeft`), so a zoomed plate keeps its
     label at a constant, readable size instead of scaling text out of the frame.
     Pan is stored as a fraction of the transformed element's own box, which is
     what a percentage translate measures — no pixel measurement needed to paint
     it. The fraction is taken from `offsetWidth`/`offsetHeight` (layout box)
     because `getBoundingClientRect()` of a scaled element reports the scaled
     size, which would make a drag move slower than the pointer. */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const zoomSteps = [1, 1.25, 1.6, 2, 2.5];
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const zoomIndex = zoomSteps.indexOf(view.s);
  /* The board is drawn to fit the box, so the drawn board is narrower than the
     box whenever the height cap applies. Labels are anchored through the same
     fit ("meet" scaling about the box centre) or they would drift from their
     plate. */
  const [fitBox, setFitBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setFitBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Scaling about the centre means the furthest useful pan is half the growth,
     so the stage can never be dragged clear of the frame. */
  const clampPan = (x: number, y: number, s: number) => {
    const max = Math.max(0, (s - 1) / 2);
    return { x: Math.max(-max, Math.min(max, x)), y: Math.max(-max, Math.min(max, y)) };
  };
  /* Where a plate sits across the board at rest, through the same fit the SVG
     uses. One source for both the label anchor and the zoom target. */
  const atRest = (c: { x: number }) => {
    const k = fitBox.w && fitBox.h ? Math.min(fitBox.w / vw, fitBox.h / vh) : 0;
    if (!fitBox.w || !k) return 0.5;
    const offsetX = (fitBox.w - vw * k) / 2;
    return (offsetX + (c.x - (minX - padX)) * k) / fitBox.w;
  };
  const zoomTo = (index: number) => {
    const s = zoomSteps[Math.max(0, Math.min(zoomSteps.length - 1, index))];
    setView(() => {
      /* Zoom towards the stage in hand: the selected plate is what the reader
         is inspecting, so it is what should stay in frame. Without one, the
         board's centre. */
      const anchor = selIndex >= 0 ? atRest(iso(selIndex * gap, 0, thickness)) : 0.5;
      const x = -(anchor - 0.5) * s;
      return { s, ...clampPan(x, 0, s) };
    });
  };
  const resetView = () => {
    /* Focus stays where it is: the reader activated a control in the tool group,
       so the keyboard is already in the tool group and never lands nowhere. */
    setView({ s: 1, x: 0, y: 0 });
  };
  const onStagePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (view.s <= 1) return;
    dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onStagePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    d.moved = true;
    const box = stageRef.current;
    const fx = box?.offsetWidth ? dx / box.offsetWidth : 0;
    const fy = box?.offsetHeight ? dy / box.offsetHeight : 0;
    setView((v) => ({ ...v, ...clampPan(d.ox + fx, d.oy + fy, v.s) }));
  };
  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  };
  /* The same pan, from the keyboard, while the board has focus (the tab stop
     only exists while zoomed, so the default view gains no extra tab stop). */
  const onStageKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (view.s <= 1) return;
    const step = 0.04;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setView((v) => ({ ...v, ...clampPan(v.x + move[0], v.y + move[1], v.s) }));
  };

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

  const pick = (key: string) => onSelect?.(key);
  const stageTitle = (st: SlaStage) => `${st.label} — ${STATE_WORD[st.state]}${st.sub ? `. ${st.sub}` : ""}`;

  return (
    <div className="sla-canvas">
      {/* View controls. At a limit the control reports itself unavailable with
          `aria-disabled` instead of `disabled`: a control that becomes disabled
          while it holds focus throws focus to the body, so a keyboard reader
          would lose their place at the exact moment the limit is reached. The
          handler is a no-op in that state, and the limit is visible in words. */}
      <div className="sla-canvas__tools" role="group" aria-label="Board view">
        <button
          type="button"
          className="sla-tool"
          aria-label="Zoom out"
          title="Zoom out"
          aria-disabled={zoomIndex <= 0}
          onClick={() => zoomTo(zoomIndex - 1)}
        >
          −
        </button>
        <span className="sla-canvas__zoom" role="status" aria-live="polite">{Math.round(view.s * 100)}%</span>
        <button
          type="button"
          className="sla-tool"
          aria-label="Zoom in"
          title="Zoom in"
          aria-disabled={zoomIndex >= zoomSteps.length - 1}
          onClick={() => zoomTo(zoomIndex + 1)}
        >
          +
        </button>
        <button
          type="button"
          className="sla-tool sla-tool--wide"
          aria-label="Reset view"
          title="Reset view"
          aria-disabled={view.s === 1 && view.x === 0 && view.y === 0}
          onClick={resetView}
        >
          Fit
        </button>
      </div>
      <div
        className={clsx("sla-canvas__board", view.s > 1 && "is-zoomed")}
      >
        <div
          className="sla-canvas__stage"
          ref={stageRef}
          style={{ transform: `translate(${view.x * 100}%, ${view.y * 100}%) scale(${view.s})` }}
        >
        {/* `role="img"` is a leaf: assistive tech ignores everything inside it,
            so an interactive board would expose no stage at all. When the
            plates are controls the board is a labelled group instead.
            While zoomed the board itself becomes the tab stop for arrow-key
            panning (no extra tab stop in the default view). */}
        <svg
          ref={svgRef}
          viewBox={`${minX - padX} ${minY - padY} ${vw} ${vh}`}
          role={interactive ? "group" : "img"}
          aria-label={view.s > 1 ? "SLA lifecycle. Use the arrow keys to pan the board." : "SLA lifecycle"}
          tabIndex={view.s > 1 ? 0 : -1}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onStageKeyDown}
        >
          {/* rail between plates */}
          {stages.slice(0, -1).map((st, i) => {
            const a = iso(i * gap + plateW / 2 + 4, 0, thickness / 2);
            const b = iso((i + 1) * gap - plateW / 2 - 4, 0, thickness / 2);
            const on = st.state === "done" || st.state === "active";
            const near = selIndex >= 0 && (i === selIndex || i + 1 === selIndex);
            return (
              <line
                key={st.key}
                className={clsx("sla-rail", near && "is-near")}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                style={{ stroke: on ? "var(--accent)" : "var(--border-hi)" }}
                strokeWidth={1.5}
                strokeDasharray={on ? undefined : "3 3"}
              />
            );
          })}
          {stages.map((st, i) => (
            <g
              key={st.key}
              ref={(el) => { plateRefs.current[i] = el; }}
              className={clsx(
                "sla-plate",
                `sla-plate--${st.state}`,
                interactive && "sla-plate--pick",
                selIndex === i && "is-selected",
              )}
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? "button" : undefined}
              aria-pressed={interactive ? selIndex === i : undefined}
              aria-label={interactive ? stageTitle(st) : undefined}
              onClick={interactive ? () => pick(st.key) : undefined}
              onKeyDown={interactive ? (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(st.key); }
              } : undefined}
            >
              {interactive && <title>{stageTitle(st)}</title>}
              <Plate
                cx={i * gap}
                cy={0}
                w={plateW}
                d={plateD}
                t={thickness}
                state={st.state}
                delay={i * 70}
                ring={selIndex === i}
              />
            </g>
          ))}
        </svg>
        </div>

        {/* The label row is a four-column legend at rest. It keeps its own
            size, and the board hides it while zoomed (see shell.css) so a
            caption cannot imply a position it no longer occupies. */}
        <div className="sla-canvas__labels">
          {stages.map((st, i) => {
            return interactive ? (
              <button
                key={st.key}
                type="button"
                className={clsx("sla-canvas__label", "sla-canvas__label--btn", selIndex === i && "is-selected")}
                aria-pressed={selIndex === i}
                aria-label={stageTitle(st)}
                /* The plate above is the accessible control; this is the
                   pointer-sized twin of it, so keep it out of the tab order. */
                tabIndex={-1}
                aria-hidden="true"
                /* A pointer press must not move focus into this aria-hidden
                   node (the plate owns keyboard focus), hence the mousedown. */
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  pick(st.key);
                  /* …and because the press still changes the selection, focus
                     follows it to the plate that represents this stage. */
                  plateRefs.current[i]?.focus();
                }}
              >
                <LabelBody stage={st} />
              </button>
            ) : (
              <div key={st.key} className="sla-canvas__label">
                <LabelBody stage={st} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Same stages as a list: the reading order for assistive tech, and the
          board's replacement on narrow screens (the isometric labels collide
          well before the phone breakpoint). */}
      <ol className="sla-canvas__stack">
        {stages.map((st, i) => {
          const body = (
            <>
              <span className="sla-canvas__stack-idx" aria-hidden="true">{i + 1}</span>
              <span className="sla-canvas__stack-body">
                <span className={`sla-canvas__name sla-canvas__name--${st.state}`}>{st.label}</span>
                <span className="sla-canvas__sub">{st.sub ?? "—"}</span>
              </span>
              <span className={`sla-canvas__state sla-canvas__state--${st.state}`}>{STATE_WORD[st.state]}</span>
            </>
          );
          return (
            <li key={st.key}>
              {/* Only the interactive call gets a control. A props-less board is a
                  picture of the stages, so it must not ship a button that nothing
                  listens to — the static entry is the same card without the role. */}
              {interactive ? (
                <button
                  type="button"
                  className={clsx("sla-canvas__stack-btn", selIndex === i && "is-selected")}
                  onClick={() => pick(st.key)}
                  aria-pressed={selIndex === i}
                  aria-label={stageTitle(st)}
                >
                  {body}
                </button>
              ) : (
                <div className={clsx("sla-canvas__stack-btn", "sla-canvas__stack-btn--static")}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Selection is announced through a live region. It must already be in
          the DOM before the text arrives, or screen readers skip the change,
          and its line box is reserved by CSS so picking a stage cannot shift
          the cards below. Empty state announces nothing. */}
      {interactive && (
        <p className="sla-canvas__inspect" role="status" aria-live="polite">
          {selStage ? (
            <>
              <strong>{selStage.label}</strong> · {STATE_WORD[selStage.state]}
              {selStage.sub ? ` · ${selStage.sub}` : ""}
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
