import { describe, expect, test } from "bun:test";
import { decodeProofBytes, encodeProofBytes, verifyEvidence } from "../../src/lib/verification/verify";
import { CG_CLAIM_VERSION, envelopeDigest, type EvidenceEnvelope } from "../../src/lib/verification/schema";
import { nitroFixture } from "./fixtures/nitro";

const fixture = nitroFixture();
const NOW = fixture.timestamp + 60;

function teeEnvelope(doc: Uint8Array = fixture.doc): EvidenceEnvelope {
  return {
    version: CG_CLAIM_VERSION,
    subject: fixture.subject,
    claim: {
      kind: "tee-attestation",
      statement: "Image PCR0 abc produced the committed response for this call inside a Nitro enclave",
      assumptions: ["AWS Nitro root of trust", "the image allowlist is current"],
    },
    proof: { type: "aws-nitro-attestation-doc", payload: encodeProofBytes(doc) },
    issuedAt: fixture.timestamp,
  };
}

function baseOptions() {
  return {
    nitro: { rootCertsPem: [fixture.rootPem], now: NOW, maxAgeSec: 3600 },
    allowedPcr0: [fixture.pcr0],
  };
}

describe("proof payload encoding", () => {
  test("round-trips bytes through the envelope string field", () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 255]);
    expect(Array.from(decodeProofBytes(encodeProofBytes(bytes)))).toEqual(Array.from(bytes));
  });

  test("rejects a payload that is not base64 instead of decoding garbage", () => {
    expect(() => decodeProofBytes("not base64!!")).toThrow();
  });
});

describe("verifyEvidence", () => {
  test("verifies a TEE claim and reports the claim, not just a green badge", () => {
    const envelope = teeEnvelope();
    const report = verifyEvidence(envelope, baseOptions());
    expect(report.reasons).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.claim).toBe("tee-attestation");
    expect(report.statement).toBe(envelope.claim.statement);
    expect(report.assumptions).toEqual(envelope.claim.assumptions);
    expect(report.digest).toBe(envelopeDigest(envelope));
    expect(report.detail.kind).toBe("tee-attestation");
  });

  test("fails an envelope with an invalid claim before running any verifier", () => {
    const broken = { ...teeEnvelope(), claim: { ...teeEnvelope().claim, statement: "" } };
    const report = verifyEvidence(broken, baseOptions());
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("statement");
  });

  test("fails a TEE claim whose document does not chain to the configured root", () => {
    const report = verifyEvidence(teeEnvelope(), {
      ...baseOptions(),
      nitro: { rootCertsPem: [fixture.unrelatedRootPem], now: NOW, maxAgeSec: 3600 },
    });
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("trusted root");
  });

  test("fails a TEE claim whose image is not allowlisted", () => {
    const report = verifyEvidence(teeEnvelope(), { ...baseOptions(), allowedPcr0: [`0x${"00".repeat(48)}`] });
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("PCR0");
  });

  test("fails a TEE claim whose userData binds a different call", () => {
    const otherSubject = { ...fixture.subject, callId: `0x${"ff".repeat(32)}` as const };
    const report = verifyEvidence({ ...teeEnvelope(), subject: otherSubject }, baseOptions());
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("userData");
  });

  test("refuses an unknown proof type instead of assuming it is fine", () => {
    const report = verifyEvidence(
      { ...teeEnvelope(), proof: { type: "quantum-seal", payload: "AAAA" } },
      baseOptions(),
    );
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("no verifier");
  });
});

describe("verifyEvidence — witness claims", () => {
  function witnessEnvelope(): EvidenceEnvelope {
    return {
      ...teeEnvelope(),
      claim: {
        kind: "witness",
        statement: "An allowlisted attestor observed the committed payload for this call",
        assumptions: ["the attestor key is independent of the provider"],
      },
      proof: { type: "sla-provenance-record", payload: encodeProofBytes(new TextEncoder().encode("onchain")) },
    };
  }

  test("passes when the on-chain record commits to the same payload hash", () => {
    const report = verifyEvidence(witnessEnvelope(), {
      ...baseOptions(),
      witness: {
        payloadHash: fixture.subject.responseHash,
        attestor: `0x${"12".repeat(20)}`,
        originHash: `0x${"34".repeat(32)}`,
        observedAt: fixture.timestamp,
        recordedAt: fixture.timestamp,
      },
    });
    expect(report.ok).toBe(true);
    expect(report.detail.kind).toBe("witness");
  });

  test("fails when the on-chain record commits to a different payload", () => {
    const report = verifyEvidence(witnessEnvelope(), {
      ...baseOptions(),
      witness: {
        payloadHash: `0x${"99".repeat(32)}`,
        attestor: `0x${"12".repeat(20)}`,
        originHash: `0x${"34".repeat(32)}`,
        observedAt: fixture.timestamp,
        recordedAt: fixture.timestamp,
      },
    });
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("payloadHash");
  });

  test("fails when there is no on-chain record at all", () => {
    const report = verifyEvidence(witnessEnvelope(), baseOptions());
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("no on-chain provenance record");
  });
});
