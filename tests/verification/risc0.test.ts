import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { encodeAbiParameters, keccak256, parseAbiParameters, toBytes } from "viem";

import {
  CG_CLAIM_VERSION,
  envelopeDigest,
  validateEnvelope,
  type EvidenceEnvelope,
} from "../../src/lib/verification/schema";
import { checkRisc0Binding, decodeJournal } from "../../src/lib/verification/risc0";
import { encodeProofBytes, verifyEvidence } from "../../src/lib/verification/verify";

/**
 * The off-chain half of the execution proof. It cannot verify the Groth16 seal — that
 * happens on chain, inside `Risc0ExecutionAdapter` — so what is tested here is the part
 * that can silently disagree: whether the journal being displayed is the journal of
 * *this* call and *this* response. A journal that decodes but describes another call is
 * the failure mode that would turn a real proof into a misleading page.
 */

const CALL_ID = "0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265";
const REQUEST_HASH = "0xcd541a5f22d1f8d9c088efa3474acd3d04f58894b42e4ffb4bc0dbb4c0b879c7";
const RESPONSE_HASH = "0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d";
const HANDLER_ID = keccak256(toBytes("callguard.handler.ping/1"));
const TERMS_HASH = "0xbe8c8cd7ff8e85af17a1ccdba790eb1dae47a008d61feccdd682559d8d099fcf";

function journalHex(overrides: Partial<Record<"callId" | "requestHash" | "responseHash" | "handlerId", `0x${string}`>> = {}) {
  return encodeAbiParameters(parseAbiParameters("bytes32,bytes32,bytes32,bytes32"), [
    overrides.callId ?? CALL_ID,
    overrides.requestHash ?? REQUEST_HASH,
    overrides.responseHash ?? RESPONSE_HASH,
    overrides.handlerId ?? HANDLER_ID,
  ]);
}

function subject(overrides: Partial<{ callId: `0x${string}`; responseHash: `0x${string}` }> = {}) {
  return {
    callId: (overrides.callId ?? CALL_ID) as `0x${string}`,
    providerId: 1,
    termsHash: TERMS_HASH as `0x${string}`,
    responseHash: (overrides.responseHash ?? RESPONSE_HASH) as `0x${string}`,
  };
}

function envelope(journal: string): EvidenceEnvelope {
  return {
    version: CG_CLAIM_VERSION,
    subject: subject(),
    claim: {
      kind: "zk-execution",
      statement:
        "A guest program with the published image id ran on a request hashing to the committed requestHash and committed this responseHash for this callId",
      assumptions: [
        "the on-chain Groth16 verifier bytecode is the published one",
        "the committed responseHash is the provider's own receipt commitment",
      ],
    },
    proof: { type: "risc0-groth16-receipt", payload: encodeProofBytes(Buffer.from(journal.slice(2), "hex")) },
    issuedAt: 1793020800,
  };
}

describe("decodeJournal", () => {
  test("round-trips the four journal fields", () => {
    expect(decodeJournal(journalHex())).toEqual({
      callId: CALL_ID,
      requestHash: REQUEST_HASH,
      responseHash: RESPONSE_HASH,
      handlerId: HANDLER_ID,
    });
  });

  test("refuses a journal that is not 128 bytes", () => {
    expect(() => decodeJournal("0x")).toThrow("journal must be 128 bytes");
    expect(() => decodeJournal(journalHex().slice(0, 2 + 64 * 2))).toThrow("journal must be 128 bytes");
    expect(() => decodeJournal(`0x${"00".repeat(132)}`)).toThrow("journal must be 128 bytes");
  });
});

describe("checkRisc0Binding", () => {
  test("accepts a journal that names the subject and the published handler", () => {
    expect(checkRisc0Binding(decodeJournal(journalHex()), subject(), { handlerId: HANDLER_ID })).toEqual({
      ok: true,
      reasons: [],
    });
  });

  test("reports a foreign callId by name", () => {
    const journal = decodeJournal(journalHex({ callId: keccak256(toBytes("other call")) }));
    const result = checkRisc0Binding(journal, subject(), { handlerId: HANDLER_ID });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("callId");
  });

  test("reports a response that is not the committed one", () => {
    const journal = decodeJournal(journalHex({ responseHash: keccak256(toBytes("pong!")) }));
    const result = checkRisc0Binding(journal, subject(), { handlerId: HANDLER_ID });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("responseHash");
  });

  test("reports a handler other than the published one", () => {
    const journal = decodeJournal(journalHex({ handlerId: keccak256(toBytes("callguard.handler.other/1")) }));
    const result = checkRisc0Binding(journal, subject(), { handlerId: HANDLER_ID });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("handlerId");
  });

  test("carries requestHash through without comparing it: the chain is its only source", () => {
    // `cg-claim/1` subjects do not carry a requestHash, so off chain there is nothing
    // trustworthy to compare it against. `Risc0ExecutionAdapter` compares it with
    // `PayPerCallV8.getCall(callId).requestHash`; this layer only displays it.
    const requestHash = keccak256(toBytes("some other request"));
    const journal = decodeJournal(journalHex({ requestHash }));
    expect(journal.requestHash).toBe(requestHash);
    expect(checkRisc0Binding(journal, subject(), { handlerId: HANDLER_ID })).toEqual({
      ok: true,
      reasons: [],
    });
  });
});

describe("zk-execution claim kind", () => {
  test("is accepted by the schema, with the same statement and assumption rules", () => {
    expect(validateEnvelope(envelope(journalHex()))).toEqual({ ok: true, reasons: [] });
  });

  test("still rejects an unnamed claim of this kind", () => {
    const broken = envelope(journalHex());
    const result = validateEnvelope({ ...broken, claim: { ...broken.claim, statement: "  " } });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("statement");
  });
});

describe("verifyEvidence for an execution proof", () => {
  test("reports the binding result as the detail, not a bare boolean", () => {
    const report = verifyEvidence(envelope(journalHex()), {
      nitro: { rootCertsPem: [], now: 1793020900, maxAgeSec: 3600 },
      allowedPcr0: [],
      risc0: { handlerId: HANDLER_ID },
    });
    expect(report.ok).toBe(true);
    expect(report.claim).toBe("zk-execution");
    expect(report.detail.kind).toBe("zk-execution");
    if (report.detail.kind === "zk-execution") {
      expect(report.detail.journal.callId).toBe(CALL_ID);
      expect(report.detail.journal.handlerId).toBe(HANDLER_ID);
    }
  });

  test("fails a journal about another response with a reason, not a throw", () => {
    const report = verifyEvidence(envelope(journalHex({ responseHash: keccak256(toBytes("pong!")) })), {
      nitro: { rootCertsPem: [], now: 1793020900, maxAgeSec: 3600 },
      allowedPcr0: [],
      risc0: { handlerId: HANDLER_ID },
    });
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("responseHash");
  });

  test("fails a malformed payload with a reason instead of throwing", () => {
    const bad = envelope(journalHex());
    const report = verifyEvidence(
      { ...bad, proof: { ...bad.proof, payload: encodeProofBytes(Buffer.alloc(64)) } },
      {
        nitro: { rootCertsPem: [], now: 1793020900, maxAgeSec: 3600 },
        allowedPcr0: [],
        risc0: { handlerId: HANDLER_ID },
      },
    );
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("journal");
  });
});

/**
 * The committed fixture is the artifact the chain anchor is about, so these tests pin the
 * two things a reader cannot check by eye: the journal names this call and this response,
 * and the claim hash the registry would store is reproducible from the fixture itself.
 */
describe("committed zk-execution fixture", () => {
  const fixture = JSON.parse(readFileSync("src/lib/verification/fixtures/zk-execution.json", "utf8")) as {
    callId: `0x${string}`;
    providerId: number;
    termsHash: `0x${string}`;
    responseHash: `0x${string}`;
    imageId: `0x${string}`;
    handlerId: `0x${string}`;
    journal: `0x${string}`;
    journalDigest: `0x${string}`;
    claimHash: `0x${string}`;
    sealBytes: number;
    statement: string;
    assumptions: string[];
    issuedAt: number;
  };

  test("is a valid envelope and about the published call", () => {
    const rebuilt: EvidenceEnvelope = {
      version: CG_CLAIM_VERSION,
      subject: {
        callId: fixture.callId,
        providerId: fixture.providerId,
        termsHash: fixture.termsHash,
        responseHash: fixture.responseHash,
      },
      claim: { kind: "zk-execution", statement: fixture.statement, assumptions: fixture.assumptions },
      proof: {
        type: "risc0-groth16-receipt",
        payload: Buffer.from(fixture.journal.slice(2), "hex").toString("base64"),
      },
      issuedAt: fixture.issuedAt,
    };
    expect(validateEnvelope(rebuilt)).toEqual({ ok: true, reasons: [] });
    expect(fixture.callId).toBe(CALL_ID);
    expect(fixture.responseHash).toBe(RESPONSE_HASH);
    expect(envelopeDigest(rebuilt)).toBe(fixture.claimHash);
  });

  test("journal is the one the adapter decodes, naming the published handler", () => {
    const journal = decodeJournal(fixture.journal);
    expect(journal.requestHash).toBe(REQUEST_HASH);
    expect(journal.responseHash).toBe(RESPONSE_HASH);
    expect(journal.handlerId).toBe(fixture.handlerId);
    expect(fixture.handlerId).toBe(HANDLER_ID);
    expect(checkRisc0Binding(journal, subject(), { handlerId: fixture.handlerId })).toEqual({
      ok: true,
      reasons: [],
    });
  });

  test("matches the committed binary artifacts byte for byte", () => {
    const journal = readFileSync("test/fixtures/zk-execution/journal.bin");
    const seal = readFileSync("test/fixtures/zk-execution/seal.bin");
    expect(`0x${journal.toString("hex")}`).toBe(fixture.journal);
    expect(journal.length).toBe(128);
    // 4-byte verifier selector + 256-byte Groth16 seal.
    expect(seal.length).toBe(260);
    expect(seal.length).toBe(fixture.sealBytes);
    expect(readFileSync("test/fixtures/zk-execution/image_id.txt", "utf8").trim()).toBe(fixture.imageId);
  });
});
