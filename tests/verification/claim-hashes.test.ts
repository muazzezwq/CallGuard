import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  CG_CLAIM_VERSION,
  envelopeDigest,
  type EvidenceEnvelope,
} from "../../src/lib/verification/schema";
import { assumptionHash, statementHash } from "../../src/lib/verification/claimHashes";

// The committed zk-execution fixture is the artifact the live anchor (tx 0x21dbb04b…)
// is about. The expected constants below were computed from its statement and
// assumptions with `cast keccak` / `cast abi-encode`, then cross-checked against a
// Solidity `keccak256(bytes(s))` / `keccak256(abi.encode(string[]))` twin — so a drift
// in either language fails here instead of on chain.
const fixture = JSON.parse(
  readFileSync("src/lib/verification/fixtures/zk-execution.json", "utf8"),
) as {
  callId: `0x${string}`;
  providerId: number;
  termsHash: `0x${string}`;
  responseHash: `0x${string}`;
  claimHash: `0x${string}`;
  statement: string;
  assumptions: string[];
  issuedAt: number;
};

const STATEMENT = fixture.statement;

test("statement hash matches the value the contract stores", () => {
  expect(statementHash(STATEMENT)).toBe(
    "0xf638c765d435690aa9da23cf4ab8d3e58f5b29ea8f7ee90d85829f583cd510f9",
  );
});

test("assumption hash matches the value the contract stores and depends on order", () => {
  expect(assumptionHash(fixture.assumptions)).toBe(
    "0xa007194563d9649410719f9f3ba3daf8a8ccefb11c70a25d51be40753d91fef9",
  );
  expect(assumptionHash(["a", "b"])).not.toBe(assumptionHash(["b", "a"]));
});

test("statement hash hashes the string exactly as given", () => {
  // No trim, no case folding, no unicode normalization: the UI reports a match
  // against anchored_statement_hash, so any silent cleanup would compare a
  // bytestring the chain never saw.
  expect(statementHash(STATEMENT)).not.toBe(statementHash("A guest program with the published image id ran on a request hashing to the committed requestHash and committed this responseHash for this callId"));
  expect(statementHash("  A BC")).not.toBe(statementHash("A BC"));
  expect(statementHash("A BC")).toBe(statementHash("A BC"));
  expect(statementHash("A BC")).not.toBe(statementHash("a bc"));
});

/**
 * Map a flat fixture into an EvidenceEnvelope the same way `api/evidence.js` does.
 * Kept local so the test fails independently of the API module; the point is that
 * `claimHash` is reproducible from the flat fields in this exact format and order.
 */
function envelopeFromFixture(f: typeof fixture): EvidenceEnvelope {
  return {
    version: CG_CLAIM_VERSION,
    subject: {
      callId: f.callId,
      providerId: f.providerId,
      termsHash: f.termsHash,
      responseHash: f.responseHash,
    },
    claim: { kind: "zk-execution", statement: f.statement, assumptions: f.assumptions },
    proof: { type: "risc0-groth16-receipt", payload: "" },
    issuedAt: f.issuedAt,
  };
}

test("the fixture's own claimHash is the digest of the envelope built from its flat fields", () => {
  expect(envelopeDigest(envelopeFromFixture(fixture))).toBe(fixture.claimHash);
});
