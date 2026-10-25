import { describe, expect, test } from "bun:test";
import {
  CG_CLAIM_VERSION,
  envelopeDigest,
  subjectUserData,
  validateEnvelope,
  type EvidenceEnvelope,
} from "../../src/lib/verification/schema";

const CALL_ID = `0x${"11".repeat(32)}` as const;
const TERMS_HASH = `0x${"22".repeat(32)}` as const;
const RESPONSE_HASH = `0x${"33".repeat(32)}` as const;

function envelope(overrides: Partial<EvidenceEnvelope> = {}): EvidenceEnvelope {
  return {
    version: CG_CLAIM_VERSION,
    subject: { callId: CALL_ID, providerId: 1, termsHash: TERMS_HASH, responseHash: RESPONSE_HASH },
    claim: {
      kind: "tee-attestation",
      statement: "The response was produced by image PCR0 abc inside a TEE for this call",
      assumptions: ["AWS Nitro root of trust", "enclave measurement matches the allowlist"],
    },
    proof: { type: "aws-nitro-attestation-doc", payload: "0xdeadbeef" },
    issuedAt: 1793000000,
    ...overrides,
  };
}

describe("validateEnvelope", () => {
  test("accepts an envelope whose claim is stated explicitly", () => {
    expect(validateEnvelope(envelope())).toEqual({ ok: true, reasons: [] });
  });

  test("rejects an unknown schema version instead of guessing", () => {
    const result = validateEnvelope(envelope({ version: "cg-claim/2" as never }));
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("version");
  });

  test("rejects a call id that is not a 32-byte hash", () => {
    const result = validateEnvelope(
      envelope({ subject: { callId: "0x1234" as never, providerId: 1, termsHash: TERMS_HASH, responseHash: RESPONSE_HASH } }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("callId");
  });

  test("rejects a terms hash or response hash that is not 32 bytes", () => {
    const badTerms = validateEnvelope(
      envelope({ subject: { callId: CALL_ID, providerId: 1, termsHash: "0xzz" as never, responseHash: RESPONSE_HASH } }),
    );
    const badResponse = validateEnvelope(
      envelope({ subject: { callId: CALL_ID, providerId: 1, termsHash: TERMS_HASH, responseHash: "0x" as never } }),
    );
    expect(badTerms.ok).toBe(false);
    expect(badResponse.ok).toBe(false);
  });

  test("rejects an unknown claim kind", () => {
    const result = validateEnvelope(envelope({ claim: { ...envelope().claim, kind: "vibes" as never } }));
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("kind");
  });

  test("rejects a claim with no statement, because an unnamed claim proves nothing", () => {
    const result = validateEnvelope(envelope({ claim: { ...envelope().claim, statement: "   " } }));
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("statement");
  });

  test("rejects a claim that lists no trust assumption", () => {
    const result = validateEnvelope(envelope({ claim: { ...envelope().claim, assumptions: [] } }));
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("assumption");
  });

  test("rejects a negative or fractional provider id", () => {
    expect(validateEnvelope(envelope({ subject: { ...envelope().subject, providerId: -1 } })).ok).toBe(false);
    expect(validateEnvelope(envelope({ subject: { ...envelope().subject, providerId: 1.5 } })).ok).toBe(false);
  });

  test("rejects proof material that is empty", () => {
    expect(validateEnvelope(envelope({ proof: { type: "aws-nitro-attestation-doc", payload: "" } })).ok).toBe(false);
  });
});

describe("envelopeDigest", () => {
  test("does not depend on the order the envelope object was built in", () => {
    const a = envelope();
    const b = {
      issuedAt: a.issuedAt,
      proof: a.proof,
      claim: a.claim,
      subject: a.subject,
      version: a.version,
    } as EvidenceEnvelope;
    expect(envelopeDigest(a)).toBe(envelopeDigest(b));
  });

  test("changes when the subject changes, so one envelope cannot cover two calls", () => {
    const base = envelopeDigest(envelope());
    const other = envelopeDigest(envelope({ subject: { ...envelope().subject, responseHash: `0x${"44".repeat(32)}` } }));
    expect(other).not.toBe(base);
  });

  test("excludes the proof bytes, so anchoring does not require carrying the proof twice", () => {
    const base = envelopeDigest(envelope());
    const otherProof = envelopeDigest(envelope({ proof: { type: "aws-nitro-attestation-doc", payload: "0xfeed" } }));
    expect(otherProof).toBe(base);
  });

  test("returns a 32-byte hex digest", () => {
    expect(envelopeDigest(envelope())).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("subjectUserData", () => {
  test("binds call id, terms hash and response hash into 32 bytes", () => {
    const userData = subjectUserData(envelope().subject);
    expect(userData).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("changes when the terms hash changes, so a proof cannot outlive its SLA terms", () => {
    const base = envelope().subject;
    const moved = { ...base, termsHash: `0x${"55".repeat(32)}` as const };
    expect(subjectUserData(moved)).not.toBe(subjectUserData(base));
  });
});
