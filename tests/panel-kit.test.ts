import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const kit = readFileSync(
  new URL("../src/components/panel/PanelUi.tsx", import.meta.url),
  "utf8",
);
const kitCss = readFileSync(
  new URL("../src/components/panel/panel.css", import.meta.url),
  "utf8",
);

describe("panel kit", () => {
  test("exports the composition used by the remaining panels", () => {
    for (const name of [
      "PanelShell", "PanelSource", "SignalRow", "PanelSplit",
      "Ledger", "LedgerRow", "KeyValue", "CodeSurface", "StatusNotice",
    ]) {
      expect(kit).toContain(`export function ${name}`);
    }
  });

  test("keeps type and colour on the shared token scale", () => {
    expect(kitCss).not.toMatch(/font-size:\s*\d+(?:\.\d+)?px/);
    expect(kitCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(kitCss).toContain("var(--fs-base)");
    expect(kitCss).toContain("var(--surface-1)");
  });

  test("has mobile and reduced-motion fallbacks", () => {
    expect(kitCss).toContain("@media (max-width: 1100px)");
    expect(kitCss).toContain("@media (max-width: 768px)");
    expect(kitCss).toContain("@media (max-width: 480px)");
    expect(kitCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("presents status without colour alone", () => {
    expect(kit).toContain("role={role}");
    expect(kit).toContain("aria-live={ariaLive}");
    expect(kit).toContain("aria-hidden=\"true\"");
  });
});
