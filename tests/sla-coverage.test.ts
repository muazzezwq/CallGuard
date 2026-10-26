import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

// The score table is a claim about the rows underneath it. It drifted once (a new
// row was added without moving the count), so it is counted here instead of trusted.
const AXES = { A: "A — Availability", B: "B — Quality", C: "C — Financial" } as const;

function statusOf(row: string): "PASS" | "PARTIAL" | "GAP" | null {
  const cells = row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  const last = (cells[cells.length - 1] || "").trim();
  if (last.includes("PARTIAL")) return "PARTIAL";
  if (last.includes("PASS")) return "PASS";
  if (last.includes("GAP")) return "GAP";
  return null;
}

describe("SLA coverage score", () => {
  test("the score table matches the rows it summarises", async () => {
    const doc = await readFile("docs/SLA_COVERAGE.md", "utf8");
    const lines = doc.split("\n");

    const counts: Record<string, Record<string, number>> = {};
    for (const [axis, label] of Object.entries(AXES)) {
      counts[label] = { PASS: 0, PARTIAL: 0, GAP: 0 };
      for (const line of lines) {
        if (!new RegExp(`^\\| ${axis}\\d`).test(line)) continue;
        const status = statusOf(line);
        expect(status, `row without a status: ${line.slice(0, 60)}`).not.toBeNull();
        counts[label][status as string] += 1;
      }
    }

    for (const [label, tally] of Object.entries(counts)) {
      const tableRow = lines.find((line) => line.startsWith(`| ${label} |`));
      expect(tableRow, `missing score row for ${label}`).toBeDefined();
      const numbers = (tableRow as string)
        .split("|")
        .slice(2, 5)
        .map((cell) => Number(cell.trim()));
      expect(numbers).toEqual([tally.PASS, tally.PARTIAL, tally.GAP]);
    }

    const totalRow = lines.find((line) => line.startsWith("| **Total** |"));
    expect(totalRow).toBeDefined();
    const totals = (totalRow as string)
      .split("|")
      .slice(2, 5)
      .map((cell) => Number(cell.replaceAll("*", "").trim()));
    const sum = Object.values(counts).reduce(
      (acc, tally) => [acc[0] + tally.PASS, acc[1] + tally.PARTIAL, acc[2] + tally.GAP],
      [0, 0, 0]
    );
    expect(totals).toEqual(sum);
  });

  test("no PASS row claims a proof it does not have", async () => {
    const doc = await readFile("docs/SLA_COVERAGE.md", "utf8");
    // B3b is the one row that must stay PARTIAL until real enclave hardware signs a
    // claim: the Nitro and TDX verifiers have only ever run against fixtures.
    const b3b = doc.split("\n").find((line) => line.startsWith("| B3b |"));
    expect(b3b).toBeDefined();
    expect(statusOf(b3b as string)).toBe("PARTIAL");
  });
});
