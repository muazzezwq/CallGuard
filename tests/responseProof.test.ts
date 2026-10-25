import { describe, expect, test } from "bun:test";
import { keccak256, toBytes } from "viem";
import {
  buildPayloadEvidence,
  checkPayloadAgainstCommitment,
  hashPayload,
} from "../src/lib/responseProof";

const PAYLOAD = '{"tempC":21.4,"city":"Istanbul"}';
const HASH = keccak256(toBytes(PAYLOAD));

describe("hashPayload", () => {
  test("matches keccak256 of the exact bytes the provider signed", () => {
    expect(hashPayload(PAYLOAD)).toBe(HASH);
  });

  test("does not normalise whitespace, because the provider hashed raw bytes", () => {
    expect(hashPayload(` ${PAYLOAD}`)).not.toBe(HASH);
    expect(hashPayload(PAYLOAD.replace('"city"', '"city" '))).not.toBe(HASH);
  });

  test("hashes an empty payload instead of throwing", () => {
    expect(hashPayload("")).toBe(keccak256(toBytes("")));
  });
});

describe("checkPayloadAgainstCommitment", () => {
  test("reports a match when the payload is what the provider committed to", () => {
    const check = checkPayloadAgainstCommitment(PAYLOAD, HASH);
    expect(check.status).toBe("match");
    expect(check.computed).toBe(HASH);
    expect(check.committed).toBe(HASH);
  });

  test("reports a mismatch when the delivered payload differs from the commitment", () => {
    const check = checkPayloadAgainstCommitment('{"tempC":99,"city":"Istanbul"}', HASH);
    expect(check.status).toBe("mismatch");
    expect(check.computed).not.toBe(HASH);
    expect(check.committed).toBe(HASH);
  });

  test("mismatch is case-insensitive about the hex casing of the commitment", () => {
    const check = checkPayloadAgainstCommitment(PAYLOAD, HASH.toUpperCase().replace("0X", "0x"));
    expect(check.status).toBe("match");
  });

  test("reports uncommitted when the call has no response hash yet", () => {
    const check = checkPayloadAgainstCommitment(PAYLOAD, "0x" + "0".repeat(64));
    expect(check.status).toBe("uncommitted");
  });

  test("reports uncommitted when the call has no hash at all", () => {
    expect(checkPayloadAgainstCommitment(PAYLOAD, undefined).status).toBe("uncommitted");
    expect(checkPayloadAgainstCommitment(PAYLOAD, "").status).toBe("uncommitted");
  });

  test("rejects a malformed commitment instead of pretending it matched", () => {
    expect(checkPayloadAgainstCommitment(PAYLOAD, "0xdeadbeef").status).toBe("invalid");
  });
});

describe("buildPayloadEvidence", () => {
  test("produces a data: URI the dispute contract can store", () => {
    const uri = buildPayloadEvidence({
      callId: "0x" + "ab".repeat(32),
      committed: HASH,
      payload: PAYLOAD,
    });
    expect(uri.startsWith("data:application/json,")).toBe(true);
    const body = JSON.parse(uri.slice("data:application/json,".length));
    expect(body.callId).toBe("0x" + "ab".repeat(32));
    expect(body.committedResponseHash).toBe(HASH);
    expect(body.deliveredPayload).toBe(PAYLOAD);
    expect(body.claim).toContain("keccak256");
  });

  test("keeps the evidence under the 1 KB range for short payloads", () => {
    const uri = buildPayloadEvidence({ callId: "0x" + "ab".repeat(32), committed: HASH, payload: PAYLOAD });
    expect(uri.length).toBeLessThan(1024);
  });
});
