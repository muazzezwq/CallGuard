import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { validateEnvelope, envelopeDigest } from "../src/lib/verification/schema";
import {
  WITNESS_PROOF_TYPE,
  anchorHashes,
  buildWitnessEnvelope,
  type WitnessInput,
} from "../src/lib/verification/witnessClaim";

const CALL_ID = "0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265" as const;
const RESPONSE_HASH = "0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d" as const;
const TERMS_HASH = "0xbe8c8cd7ff8e85af17a1ccdba790eb1dae47a008d61feccdd682559d8d099fcf" as const;

const input: WitnessInput = {
  callId: CALL_ID,
  providerId: 1,
  termsHash: TERMS_HASH,
  responseHash: RESPONSE_HASH,
  attestor: "0x528581fB8E66186Ba14650a1bD0bbd88DBC82F9c",
  originHash: "0x0533755f352233ad0fe3675873655f9a13056f080bed0f759461613b00f6a78b",
  observedAt: 1792955719,
  recordedAt: 1792955722,
  issuedAt: 1793020800,
};

describe("buildWitnessEnvelope", () => {
  test("produces an envelope the schema accepts", () => {
    const envelope = buildWitnessEnvelope(input);
    const result = validateEnvelope(envelope);
    expect(result.reasons).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("names the witnessing key and the origin in the statement", () => {
    const { claim } = buildWitnessEnvelope(input);
    expect(claim.kind).toBe("witness");
    // A witness claim is only meaningful if the reader can see *who* witnessed and
    // *where*: the same response hash seen by an unrelated key is a different claim.
    expect(claim.statement).toContain(input.attestor);
    expect(claim.statement).toContain(input.originHash);
  });

  test("does not claim the answer is correct or verified", () => {
    const { claim } = buildWitnessEnvelope(input);
    // The badge language this layer exists to prevent. "Correct" belongs in the
    // assumptions, where it is named as *not* proven — not in the statement.
    expect(claim.statement.toLowerCase()).not.toContain("is correct");
    expect(claim.statement.toLowerCase()).not.toContain("verified");
  });

  test("names independence and correctness as assumptions", () => {
    const { claim } = buildWitnessEnvelope(input);
    expect(claim.assumptions.length).toBeGreaterThanOrEqual(2);
    const joined = claim.assumptions.join(" ").toLowerCase();
    expect(joined).toContain("independent");
    expect(joined).toContain("correct");
  });

  test("carries the provenance record as an off-chain payload", () => {
    const envelope = buildWitnessEnvelope(input);
    expect(envelope.proof.type).toBe(WITNESS_PROOF_TYPE);
    expect(envelope.proof.payload).toContain(input.attestor);
  });

  test("the digest covers the claim, not the proof encoding", () => {
    const a = buildWitnessEnvelope(input);
    const b = buildWitnessEnvelope({ ...input, issuedAt: input.issuedAt + 1 });
    // Same words, later timestamp: the digest must move, because `issuedAt` is part
    // of what was claimed. A digest that ignores it would let a claim be re-dated.
    expect(envelopeDigest(a)).not.toBe(envelopeDigest(b));
  });
});

describe("anchorHashes", () => {
  test("returns the three hashes the registry stores", () => {
    const hashes = anchorHashes(buildWitnessEnvelope(input));
    expect(hashes.claimHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashes.statementHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashes.assumptionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashes.claimHash).toBe(envelopeDigest(buildWitnessEnvelope(input)));
  });
});

describe("the committed witness fixture", () => {
  test("is the envelope its own fields describe", () => {
    const fixture = JSON.parse(
      readFileSync("src/lib/verification/fixtures/witness.json", "utf8"),
    ) as WitnessInput & { statement: string; assumptions: string[]; claimHash: `0x${string}` };

    const rebuilt = buildWitnessEnvelope(fixture);
    // The fixture is what /api/evidence serves next to the chain row, so a builder
    // change that moves the digest without moving the fixture would make every
    // match column read false. This test is the link between the two.
    expect(rebuilt.claim.statement).toBe(fixture.statement);
    expect(rebuilt.claim.assumptions).toEqual(fixture.assumptions);
    expect(anchorHashes(rebuilt).claimHash).toBe(fixture.claimHash);
  });
});
