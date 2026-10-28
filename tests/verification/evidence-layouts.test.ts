import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { EVIDENCE_MODES, decodeEvidence } from "../../src/lib/verification/evidenceRecord";

/**
 * The two registry layouts, as raw return words. v1 keeps five fields
 * `(kind, claimHash, responseHash, verifier, anchoredAt)`; v2 appends
 * `statementHash` and `assumptionHash` before `verifier`/`anchoredAt`
 * (seven words). The decoder only sees what the ABI handed back, so these
 * fixtures are plain words, not parsed objects.
 */
const v1Tuple = [
  "0x" + "01".repeat(32), // kind
  "0x" + "11".repeat(32), // claimHash
  "0x" + "22".repeat(32), // responseHash
  "0x" + "aa".repeat(20), // verifier
  "0x64", // anchoredAt (100)
];

const v2Tuple = [
  v1Tuple[0],
  v1Tuple[1],
  v1Tuple[2],
  "0x" + "33".repeat(32), // statementHash
  "0x" + "44".repeat(32), // assumptionHash
  v1Tuple[3],
  v1Tuple[4],
];

test("decodes the 5-field v1 tuple and the 7-field v2 tuple", () => {
  const v1 = decodeEvidence(v1Tuple);
  expect(v1?.statementHash).toBeUndefined();
  expect(v1?.assumptionHash).toBeUndefined();
  expect(v1?.claimHash).toBe(v1Tuple[1]);
  expect(v1?.responseHash).toBe(v1Tuple[2]);
  expect(v1?.verifier).toBe(v1Tuple[3]);
  expect(v1?.anchoredAt).toBe(100);
  expect(v1?.source).toBe("v1");

  const v2 = decodeEvidence(v2Tuple);
  expect(v2?.statementHash).toBe(v2Tuple[3]);
  expect(v2?.assumptionHash).toBe(v2Tuple[4]);
  expect(v2?.verifier).toBe(v1Tuple[3]);
  expect(v2?.anchoredAt).toBe(100);
  expect(v2?.source).toBe("v2");

  // The mode-label vocabulary lives with the decoder so both call sites and the
  // panel share one wording for what a mode proves.
  expect(EVIDENCE_MODES).toEqual([
    "no verifier",
    "off-chain check, signed by a key",
    "checked on chain",
  ]);
});

test("returns null, and never throws, for anything that is neither 5 nor 7 words", () => {
  expect(decodeEvidence([])).toBeNull();
  expect(decodeEvidence(v1Tuple.slice(0, 4))).toBeNull();
  expect(decodeEvidence(v2Tuple.slice(0, 4))).toBeNull();
  expect(decodeEvidence(v2Tuple.slice(0, 6))).toBeNull();
  expect(decodeEvidence([...v2Tuple, "extra"])).toBeNull();
  // Defensive against malformed words a shape shift could hand it: length is the
  // only layout discriminator, so garbage in a correctly-sized array still
  // decodes without throwing (anchoredAt follows whatever the word said).
  expect(() => decodeEvidence(["hello", "0x2", "0x3", "0x4", "0x5"])).not.toThrow();
  const junk = decodeEvidence(["hello", "0x2", "0x3", "0x4", "0x5"]);
  expect(junk?.anchoredAt).toBe(5);
});

test("decode passes the statement hash through byte-for-byte", () => {
  // The MATCH badge is computed elsewhere, so the decoder must not normalize,
  // re-case or otherwise touch the hash it hands upward: any change here would
  // silently break the `statementHash()` comparison the panel relies on.
  const upper = "0x" + "33".repeat(32).toUpperCase();
  const upperTuple = [v2Tuple[0], v2Tuple[1], v2Tuple[2], upper, v2Tuple[4], v2Tuple[5], v2Tuple[6]];
  expect(decodeEvidence(upperTuple)?.statementHash).toBe(upper);
});

test("panel reads both registries and labels the mismatch", async () => {
  const src = await readFile("src/components/panels/Verify.tsx", "utf8");
  expect(src).toContain("SLA_EVIDENCE_V2_ADDRESS");
  expect(src).toMatch(/MATCH|MISMATCH/);
});
