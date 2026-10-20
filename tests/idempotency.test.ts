import { describe, expect, test } from "bun:test";
import {
  callServiceFingerprint,
  createAliasRecord,
  createOperationRecord,
  deriveAliasId,
  deriveAuthorizationId,
  normalizeExplicitKey,
  stableStringify,
} from "../api/_idempotency";

const FROM = "0x1111111111111111111111111111111111111111";
const CONTRACT = "0x3333333333333333333333333333333333333333";
const USDC = "0x4444444444444444444444444444444444444444";
const OPERATION = "call-service";
const REQUEST_HASH = `0x${"aa".repeat(32)}`;
const NONCE = `0x${"bb".repeat(32)}`;

function authorization(overrides: Record<string, unknown> = {}) {
  return {
    from: FROM,
    to: CONTRACT,
    value: "1000000",
    validAfter: "0",
    validBefore: "2000000000",
    nonce: NONCE,
    ...overrides,
  };
}

describe("idempotency operation identity", () => {
  test("the signed authorization is always the canonical operation identity", () => {
    const id = deriveAuthorizationId({ operation: OPERATION, authorization: authorization() });

    expect(id).toBe(`call-service:auth:${FROM.toLowerCase()}:${NONCE.toLowerCase()}`);
  });

  test("a new nonce is a new canonical operation", () => {
    const first = deriveAuthorizationId({ operation: OPERATION, authorization: authorization() });
    const second = deriveAuthorizationId({
      operation: OPERATION,
      authorization: authorization({ nonce: `0x${"cc".repeat(32)}` }),
    });

    expect(second).not.toBe(first);
  });

  test("an explicit key is a separate alias identity, not the operation id", () => {
    expect(deriveAliasId({ operation: OPERATION, explicitKey: "client-key-1" }))
      .toBe("call-service:key:client-key-1");
    expect(deriveAliasId({ operation: OPERATION })).toBeNull();
  });

  test("operation scope is explicit and isolates records from another endpoint", () => {
    const auth = authorization();
    const scoped = deriveAuthorizationId({ operation: OPERATION, authorization: auth });
    const other = deriveAuthorizationId({ operation: "premium-report", authorization: auth });

    expect(other).toBe(`premium-report:auth:${FROM.toLowerCase()}:${NONCE.toLowerCase()}`);
    expect(other).not.toBe(scoped);
    expect(deriveAliasId({ operation: "premium-report", explicitKey: "shared-key" }))
      .toBe("premium-report:key:shared-key");
    expect(deriveAliasId({ operation: "premium-report", explicitKey: "shared-key" }))
      .not.toBe(deriveAliasId({ operation: OPERATION, explicitKey: "shared-key" }));
  });

  test("operation scope cannot be omitted", () => {
    expect(() => deriveAuthorizationId({ authorization: authorization() }))
      .toThrow("operation scope is required");
    expect(() => deriveAliasId({ explicitKey: "client-key-1" }))
      .toThrow("operation scope is required");
    expect(() => callServiceFingerprint({
      chainId: 5042002,
      contract: CONTRACT,
      asset: USDC,
      providerId: "1",
      requestHash: REQUEST_HASH,
      authorization: authorization(),
    })).toThrow("operation scope is required");
  });

  test("invalid explicit keys are rejected instead of normalized silently", () => {
    expect(normalizeExplicitKey("valid.Key-1:abc_2")).toBe("valid.Key-1:abc_2");
    expect(normalizeExplicitKey("")).toBeNull();
    expect(normalizeExplicitKey("has space")).toBeNull();
    expect(normalizeExplicitKey("x".repeat(129))).toBeNull();
    expect(normalizeExplicitKey(42 as unknown as string)).toBeNull();
  });
});

describe("call-service payment fingerprint", () => {
  test("the fingerprint normalizes address and hash case and ignores object insertion order", () => {
    const first = callServiceFingerprint({
      operation: OPERATION,
      chainId: 5042002,
      contract: CONTRACT,
      asset: USDC,
      providerId: "1",
      requestHash: REQUEST_HASH,
      authorization: authorization(),
    });
    const second = callServiceFingerprint({
      authorization: authorization({
        from: FROM.toUpperCase().replace("0X", "0x"),
        nonce: NONCE.toUpperCase().replace("0X", "0x"),
      }),
      requestHash: REQUEST_HASH.toUpperCase().replace("0X", "0x"),
      providerId: "1",
      contract: CONTRACT.toUpperCase().replace("0X", "0x"),
      asset: USDC.toUpperCase().replace("0X", "0x"),
      chainId: 5042002,
      operation: OPERATION,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  test("any payment-relevant field change produces a different fingerprint", () => {
    const base = {
      operation: OPERATION,
      chainId: 5042002,
      contract: CONTRACT,
      asset: USDC,
      providerId: "1",
      requestHash: REQUEST_HASH,
      authorization: authorization(),
    };
    const original = callServiceFingerprint(base);

    expect(callServiceFingerprint({ ...base, operation: "premium-report" })).not.toBe(original);
    expect(callServiceFingerprint({ ...base, chainId: 5042003 })).not.toBe(original);
    expect(callServiceFingerprint({
      ...base,
      contract: "0x6666666666666666666666666666666666666666",
    })).not.toBe(original);
    expect(callServiceFingerprint({
      ...base,
      asset: "0x7777777777777777777777777777777777777777",
    })).not.toBe(original);
    expect(callServiceFingerprint({ ...base, providerId: "2" })).not.toBe(original);
    expect(callServiceFingerprint({ ...base, requestHash: `0x${"dd".repeat(32)}` })).not.toBe(original);
    expect(callServiceFingerprint({
      ...base,
      authorization: authorization({ from: `0x${"88".repeat(20)}` }),
    })).not.toBe(original);
    expect(callServiceFingerprint({
      ...base,
      authorization: authorization({ to: `0x${"99".repeat(20)}` }),
    })).not.toBe(original);
    expect(callServiceFingerprint({ ...base, authorization: authorization({ value: "2" }) })).not.toBe(original);
    expect(callServiceFingerprint({ ...base, authorization: authorization({ validAfter: "1" }) })).not.toBe(original);
    expect(callServiceFingerprint({ ...base, authorization: authorization({ validBefore: "2000000001" }) })).not.toBe(original);
    expect(callServiceFingerprint({
      ...base,
      authorization: authorization({ nonce: `0x${"ee".repeat(32)}` }),
    })).not.toBe(original);
  });

  test("the payment asset cannot be omitted from the fingerprint", () => {
    expect(() => callServiceFingerprint({
      operation: OPERATION,
      chainId: 5042002,
      contract: CONTRACT,
      providerId: "1",
      requestHash: REQUEST_HASH,
      authorization: authorization(),
    })).toThrow("asset is required");
    expect(() => callServiceFingerprint({
      operation: OPERATION,
      chainId: 5042002,
      contract: CONTRACT,
      asset: "",
      providerId: "1",
      requestHash: REQUEST_HASH,
      authorization: authorization(),
    })).toThrow("asset is required");
  });
});

describe("operation records", () => {
  test("new operation records start prepared and carry the canonical identity", () => {
    const record = createOperationRecord({
      operationId: "call-service:auth:0xabc:0xdef",
      fingerprint: "f".repeat(64),
      explicitKey: "client-key-1",
      now: 123,
    });

    expect(record).toMatchObject({
      version: 1,
      kind: "operation",
      operationId: "call-service:auth:0xabc:0xdef",
      authId: "call-service:auth:0xabc:0xdef",
      explicitKey: "client-key-1",
      fingerprint: "f".repeat(64),
      state: "prepared",
      createdAt: 123,
      updatedAt: 123,
      attempts: 0,
    });
  });

  test("explicit keys are stored as aliases pointing at the operation", () => {
    const record = createAliasRecord({
      aliasId: "call-service:key:client-key-1",
      authId: "call-service:auth:0xabc:0xdef",
      fingerprint: "f".repeat(64),
      now: 123,
    });

    expect(record).toMatchObject({
      version: 1,
      kind: "alias",
      operationId: "call-service:key:client-key-1",
      aliasId: "call-service:key:client-key-1",
      authId: "call-service:auth:0xabc:0xdef",
      fingerprint: "f".repeat(64),
      createdAt: 123,
      updatedAt: 123,
    });
    expect(record).not.toHaveProperty("state");
  });

  test("stable stringify sorts keys so equivalent values serialize identically", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
    expect(stableStringify({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });
});
