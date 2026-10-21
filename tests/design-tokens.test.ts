import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const tokenCss = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const uiCss = readFileSync(new URL("../src/ui/ui.css", import.meta.url), "utf8");
const uiIndex = readFileSync(new URL("../src/ui/index.ts", import.meta.url), "utf8");

describe("design tokens", () => {
  test("defines the typography, state, and control scale", () => {
    for (const token of [
      "--fs-2xs", "--fs-xs", "--fs-sm", "--fs-base", "--fs-md", "--fs-lg", "--fs-xl", "--fs-2xl", "--fs-3xl",
      "--lh-none", "--lh-tight", "--lh-snug", "--lh-base", "--lh-relaxed",
      "--fw-regular", "--fw-medium", "--fw-semibold", "--fw-bold", "--fw-heavy",
      "--tracking-snug", "--tracking-tight", "--tracking-normal", "--tracking-wide", "--tracking-caps",
      "--numeric", "--text-disabled", "--accent-hover", "--accent-pressed",
      "--control-h-sm", "--control-h", "--control-h-lg",
    ]) {
      expect(tokenCss).toContain(`${token}:`);
    }

    // State tokens must exist in both the dark root and the light override.
    expect(tokenCss.match(/--text-disabled:/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(tokenCss.match(/--accent-pressed:/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test("keeps ui.css on the token scale instead of raw type values", () => {
    expect(uiCss).not.toMatch(/font-size:\s*\d+(?:\.\d+)?px/);
    expect(uiCss).not.toMatch(/line-height:\s*\d+(?:\.\d+)?\s*;/);
    expect(uiCss).not.toMatch(/font-weight:\s*\d+\s*;/);
    expect(uiCss).not.toMatch(/letter-spacing:\s*-?\d*\.?\d+em\s*;/);
    expect(uiCss).not.toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(uiCss).toContain("height: var(--control-h)");
  });

  test("exports the popover primitive", () => {
    expect(uiIndex).toContain('export { Popover } from "./Popover";');
  });
});
