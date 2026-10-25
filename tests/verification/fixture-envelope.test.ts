import { describe, expect, test } from "bun:test";
import { envelopeDigest, subjectUserData, validateEnvelope, type EvidenceEnvelope } from "../../src/lib/verification/schema";
import { decodeProofBytes } from "../../src/lib/verification/verify";
import { readFileSync } from "node:fs";

/**
 * The anchored claim has to be reproducible from the repository: the registry stores a
 * digest, so the envelope that produced it must rebuild byte-for-byte from a clean
 * checkout. These tests pin that. If they fail, the on-chain record no longer describes
 * the artifact in `test/fixtures/zk/`, which is the one thing evidence must not do.
 */

const envelope = JSON.parse(
  readFileSync("test/fixtures/zk/keccak-call.envelope.json", "utf8"),
) as EvidenceEnvelope;

/** Live anchor for call 0x8cfa1821… in SLAEvidenceRegistry 0x7d643B2b…62dB. */
const ANCHORED_CLAIM_HASH = "0x51323974d481dbcb701dfb12f57e988b73ddd4a2b0a60525b1382caf39608021";

describe("zk claim envelope fixture", () => {
  test("is a valid envelope under the schema", () => {
    expect(validateEnvelope(envelope)).toEqual({ ok: true, reasons: [] });
  });

  test("digests to the claim hash the registry anchored", () => {
    expect(envelopeDigest(envelope)).toBe(ANCHORED_CLAIM_HASH);
  });

  test("is about the live call and its committed response", () => {
    expect(envelope.subject.callId).toBe("0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265");
    expect(envelope.subject.responseHash).toBe("0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d");
    expect(envelope.subject.providerId).toBe(1);
    expect(subjectUserData(envelope.subject)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("names the claim as an output constraint, not as correctness", () => {
    expect(envelope.claim.kind).toBe("zk-constraint");
    expect(envelope.claim.statement.toLowerCase()).toContain("hashes to the committed responsehash");
    expect(envelope.claim.statement.toLowerCase()).not.toContain("correct answer");
    expect(envelope.claim.assumptions.length).toBeGreaterThan(0);
  });

  test("carries the proof blob the adapter decodes", () => {
    const blob = decodeProofBytes(envelope.proof.payload);
    // abi.encode(uint8, bytes): 32B first byte, 32B offset, 32B length, then the 8,768B proof
    expect(blob.length).toBe(8864);
    expect(blob[31]).toBe(0x70); // the predicate byte the circuit asserts
    expect(blob[63]).toBe(0x40); // offset: the bytes payload starts at word 2
    const proofLength = Number(
      BigInt(`0x${Buffer.from(blob.slice(64, 96)).toString("hex")}`),
    );
    expect(proofLength).toBe(8768);
  });

  test("matches the proof bytes checked in next to it", () => {
    const blob = decodeProofBytes(envelope.proof.payload);
    const onDisk = readFileSync("test/fixtures/zk/keccak-call.proof");
    expect(Buffer.from(blob.slice(96, 96 + 8768)).toString("hex")).toBe(onDisk.toString("hex"));
  });
});
