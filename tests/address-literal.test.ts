import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { isAddress } from "viem";

// A mixed-case literal is an EIP-55 checksum, and viem refuses a bad one at call
// time: `Address "0x…" is invalid`. That failure is silent in the UI — the read
// simply never returns data — so it has to be caught here. This is not
// hypothetical: `DISPUTE_V3_ADDRESS` shipped one wrong capital (`E4F4846`) and the
// retired V3 section in the Disputes panel rendered nothing at all.
//
// All-lowercase literals are exempt on purpose: viem accepts them, since there is
// no checksum to disagree with.

const ROOTS = ["src", "api"];

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

function mixedCaseLiterals(source: string): string[] {
  const hits = source.match(/0x[0-9a-fA-F]{40}/g) ?? [];
  return hits.filter((a) => a !== a.toLowerCase());
}

describe("address literals", () => {
  test("every mixed-case address in src/ and api/ carries a valid EIP-55 checksum", async () => {
    const bad: string[] = [];
    for (const root of ROOTS) {
      for (const path of await sourceFiles(root)) {
        const source = await readFile(path, "utf8");
        for (const address of mixedCaseLiterals(source)) {
          if (!isAddress(address, { strict: true })) bad.push(`${path}: ${address}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  // The retired contract holds dispute #4's escrow, so the pinned address is the
  // one thing the legacy read path cannot get wrong.
  test("the pinned DisputeV3 literal is checksummed and matches the deployed contract", async () => {
    const source = await readFile("src/lib/config.ts", "utf8");
    const match = source.match(/DISPUTE_V3_ADDRESS = "(0x[0-9a-fA-F]{40})"/);
    expect(match).not.toBeNull();
    const pinned = match![1];
    expect(isAddress(pinned, { strict: true })).toBe(true);
    expect(pinned.toLowerCase()).toBe("0xef9f21ece9b4c58bcb76913887e4f4846ec36fec");
  });
});
