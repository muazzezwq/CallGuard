import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const shellCss = readFileSync(
  new URL("../src/components/layout/shell.css", import.meta.url),
  "utf8",
);
const canvasTsx = readFileSync(
  new URL("../src/components/viz/SLACanvas.tsx", import.meta.url),
  "utf8",
);

describe("SLA canvas labels", () => {
  test("desktop captions use a four-column grid, not absolute plate anchors", () => {
    const row = shellCss.match(/\.sla-canvas__labels\s*\{[^}]*\}/)?.[0] ?? "";
    const label = shellCss.match(/\.sla-canvas__label\s*\{[^}]*\}/)?.[0] ?? "";

    expect(row).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(label).not.toContain("position: absolute");
    expect(label).toContain("min-width: 0");
  });

  test("zoom hides the legend while keeping the inspect line mounted", () => {
    expect(shellCss).toContain(".sla-canvas__board.is-zoomed .sla-canvas__labels { display: none; }");
    expect(canvasTsx).toContain('view.s > 1 && "is-zoomed"');
    expect(canvasTsx).toContain('className="sla-canvas__inspect"');
  });
});
