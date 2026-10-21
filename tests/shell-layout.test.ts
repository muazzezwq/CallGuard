import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const shellCss = readFileSync(
  new URL("../src/components/layout/shell.css", import.meta.url),
  "utf8",
);

describe("mobile app shell", () => {
  test("keeps a zero-minimum single column even when a desktop collapse preference is stored", () => {
    const rule = shellCss.match(
      /\.app-shell, \.app-shell\.sb-collapsed \{ grid-template-columns: ([^;]+); \}/,
    )?.[1];

    expect(rule).toBe("minmax(0, 1fr)");
  });
});
