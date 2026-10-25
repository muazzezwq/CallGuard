import { describe, expect, test } from "bun:test";
import { checkNitroBinding, verifyNitroDoc } from "../../src/lib/verification/nitro";
import { nitroFixture } from "./fixtures/nitro";

const fixture = nitroFixture();
const NOW = fixture.timestamp + 60;

function verify(doc: Uint8Array, overrides: Partial<Parameters<typeof verifyNitroDoc>[1]> = {}) {
  return verifyNitroDoc(doc, {
    rootCertsPem: [fixture.rootPem],
    now: NOW,
    maxAgeSec: 3600,
    ...overrides,
  });
}

describe("verifyNitroDoc", () => {
  test("accepts a COSE_Sign1 document signed by a certificate chaining to the trust root", () => {
    const result = verify(fixture.doc);
    expect(result.reasons).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.moduleId).toBe(fixture.moduleId);
    expect(result.timestamp).toBe(fixture.timestamp);
    expect(result.pcrs?.[0]).toBe(fixture.pcr0);
  });

  test("rejects a document whose signature was tampered with", () => {
    const tampered = Uint8Array.from(fixture.doc);
    tampered[tampered.length - 1] ^= 0xff;
    const result = verify(tampered);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("signature");
  });

  test("rejects a document that chains to an unrelated root", () => {
    const result = verify(fixture.doc, { rootCertsPem: [fixture.unrelatedRootPem] });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("trusted root");
  });

  test("rejects a document older than the freshness window", () => {
    const result = verify(fixture.doc, { now: fixture.timestamp + 7200, maxAgeSec: 3600 });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("stale");
  });

  test("rejects a document dated in the future beyond clock skew", () => {
    const result = verify(fixture.doc, { now: fixture.timestamp - 3600 });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("future");
  });

  test("rejects a chain whose certificates have expired", () => {
    const tenYears = 60 * 60 * 24 * 365 * 10;
    const result = verify(fixture.doc, { now: fixture.timestamp + tenYears });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("expired");
  });

  test("rejects a payload that is signed with an algorithm other than ES384", () => {
    const result = verify(fixture.build({ alg: -7 }));
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("ES384");
  });

  test("rejects bytes that are not a COSE_Sign1 array of four items", () => {
    const result = verify(new Uint8Array([0x83, 0x01, 0x02, 0x03]));
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("COSE_Sign1");
  });

  test("requires a configured trust root instead of trusting anything by default", () => {
    const result = verifyNitroDoc(fixture.doc, { rootCertsPem: [], now: NOW, maxAgeSec: 3600 });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("trust root");
  });
});

describe("checkNitroBinding", () => {
  test("accepts an attestation whose userData binds this call, terms and response", () => {
    const verdict = checkNitroBinding(verify(fixture.doc), fixture.subject, { allowedPcr0: [fixture.pcr0] });
    expect(verdict.ok).toBe(true);
  });

  test("rejects an attestation whose userData binds another call", () => {
    const otherCall = { ...fixture.subject, callId: `0x${"ff".repeat(32)}` as const };
    const verdict = checkNitroBinding(verify(fixture.doc), otherCall, { allowedPcr0: [fixture.pcr0] });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("userData");
  });

  test("rejects an attestation whose terms hash differs, so a proof cannot outlive its terms", () => {
    const otherTerms = { ...fixture.subject, termsHash: `0x${"ee".repeat(32)}` as const };
    const verdict = checkNitroBinding(verify(fixture.doc), otherTerms, { allowedPcr0: [fixture.pcr0] });
    expect(verdict.ok).toBe(false);
  });

  test("rejects an image that is not on the allowlist", () => {
    const verdict = checkNitroBinding(verify(fixture.doc), fixture.subject, {
      allowedPcr0: [`0x${"00".repeat(48)}`],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("PCR0");
  });

  test("does not bind anything when the document itself failed to verify", () => {
    const failed = verify(fixture.doc, { rootCertsPem: [fixture.unrelatedRootPem] });
    const verdict = checkNitroBinding(failed, fixture.subject, { allowedPcr0: [fixture.pcr0] });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("not verified");
  });
});
