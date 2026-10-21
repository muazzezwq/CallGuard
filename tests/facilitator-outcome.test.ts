import { describe, expect, test } from "bun:test";
import {
  classifyFacilitatorResult,
  permitsOnChainFallback,
} from "../src/lib/facilitatorOutcome";

const HASH_A = `0x${"ab".repeat(32)}`;

describe("facilitator response classification", () => {
  test("an unreachable facilitator is uncertain", () => {
    const outcome = classifyFacilitatorResult({ reached: false, status: 0, body: null });
    expect(outcome.kind).toBe("uncertain");
  });

  test("a pre-settlement code is only an unauthenticated claim", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { error: "Provider not active", code: "PRE_SETTLEMENT" },
    });
    expect(outcome.kind).toBe("uncertain");
    if (outcome.kind === "uncertain") {
      expect(outcome.detail).toContain("not authenticated");
      expect(outcome.detail).toContain("not proof");
    }
  });

  test("a payment-required shape error is not fallback-eligible", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { error: "X-Payment header required", code: "PAYMENT_REQUIRED" },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("an allowlisted 402 error without the structured code is uncertain", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { error: "Provider not active" },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("an allowlisted 402 with any settlement-related extra field is uncertain", () => {
    for (const extra of [
      { success: false },
      { settled: false },
      { demo: false },
      { txHash: null },
      { callId: "0xabc" },
      { blockNumber: 1 },
    ]) {
      const outcome = classifyFacilitatorResult({
        reached: true,
        status: 402,
        body: { error: "Provider not active", code: "PRE_SETTLEMENT", ...extra },
      });
      expect(outcome.kind).toBe("uncertain");
    }
  });

  test("a 402 with a malformed error type is uncertain", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { success: false, error: { message: "Provider not active" }, code: "PRE_SETTLEMENT" },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("a 402 with a callId is uncertain even when the error is allowlisted", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { error: "Provider not active", callId: "0xabc" },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("Nonce already used is uncertain and never permits fallback", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { error: "Nonce already used", code: "AUTHORIZATION_ALREADY_USED" },
    });
    expect(outcome.kind).toBe("uncertain");
    if (outcome.kind === "uncertain") {
      expect(outcome.detail).toContain("Nonce already used");
      expect(outcome.detail).toContain("No automatic fallback");
    }
  });

  test("an unknown 402 error is uncertain by default", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { error: "New facilitator rejection", code: "PRE_SETTLEMENT" },
    });
    expect(outcome.kind).toBe("uncertain");
    if (outcome.kind === "uncertain") expect(outcome.detail).toContain("No automatic fallback");
  });

  test("a 402 without a classified error is uncertain", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: null,
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("a 402 that claims success or a hash is uncertain", () => {
    const success = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { success: true, error: "Provider not active", txHash: HASH_A },
    });
    const hashed = classifyFacilitatorResult({
      reached: true,
      status: 402,
      body: { error: "Provider not active", txHash: HASH_A },
    });
    expect(success.kind).toBe("uncertain");
    expect(hashed.kind).toBe("uncertain");
  });

  test("no facilitator response permits an on-chain fallback", () => {
    const outcomes = [
      classifyFacilitatorResult({ reached: true, status: 402, body: { error: "Provider not active", code: "PRE_SETTLEMENT" } }),
      classifyFacilitatorResult({ reached: true, status: 402, body: { error: "Nonce already used", code: "AUTHORIZATION_ALREADY_USED" } }),
      classifyFacilitatorResult({ reached: true, status: 402, body: { error: "Unknown 402 code", code: "PRE_SETTLEMENT" } }),
      classifyFacilitatorResult({ reached: true, status: 200, body: { success: true, demo: true, settled: false, txHash: null } }),
      classifyFacilitatorResult({ reached: true, status: 200, body: { success: true, settled: false } }),
      classifyFacilitatorResult({ reached: false, status: 0, body: null }),
    ];
    for (const outcome of outcomes) {
      expect(permitsOnChainFallback(outcome)).toBe(false);
    }
  });

  test("HTTP 500 after a possible broadcast is uncertain", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 500,
      body: { error: "Internal settlement error" },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("a 200 without success is uncertain", () => {
    const outcome = classifyFacilitatorResult({ reached: true, status: 200, body: {} });
    expect(outcome.kind).toBe("uncertain");
  });

  test("an HTTP error status is uncertain even with success:true", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 500,
      body: { success: true, txHash: HASH_A },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("success without a hash is uncertain", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, txHash: null },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("success with a malformed hash is uncertain", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, txHash: "0xnot-a-hash" },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("demo mode is an unverified claim, not a no-settlement proof", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, demo: true, settled: false, txHash: null },
    });
    expect(outcome.kind).toBe("uncertain");
    if (outcome.kind === "uncertain") expect(outcome.detail).toContain("unauthenticated");
  });

  test("settled:false cannot clear a guard on its own", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, settled: false },
    });
    expect(outcome.kind).toBe("uncertain");
    if (outcome.kind === "uncertain") expect(outcome.detail).toContain("unauthenticated");
  });

  test("a call id with settled:false and no demo flag is contradictory", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, settled: false, callId: "0xabc" },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("a success with a valid hash is settled", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, txHash: HASH_A },
    });
    expect(outcome.kind).toBe("settled");
    if (outcome.kind === "settled") expect(outcome.txHash).toBe(HASH_A);
  });

  test("a null callId does not override a valid hash", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, callId: null, txHash: HASH_A, blockNumber: 1 },
    });
    expect(outcome.kind).toBe("settled");
    if (outcome.kind === "settled") expect(outcome.txHash).toBe(HASH_A);
  });

  test("a valid hash is not overridden by demo:true", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, demo: true, settled: false, txHash: HASH_A },
    });
    expect(outcome.kind).toBe("uncertain");
    if (outcome.kind === "uncertain") expect(outcome.detail).toContain("hash");
  });

  test("a valid hash is not overridden by settled:false", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, settled: false, txHash: HASH_A },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("a string success flag is malformed, not a settlement", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: "true", error: "Provider not active" },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("a non-boolean demo or settled flag is malformed", () => {
    for (const body of [
      { success: true, demo: "true", txHash: HASH_A },
      { success: true, settled: "false", txHash: HASH_A },
      { success: true, demo: true, settled: true, txHash: null },
    ]) {
      const outcome = classifyFacilitatorResult({ reached: true, status: 200, body });
      expect(outcome.kind).toBe("uncertain");
    }
  });

  test("a non-string or malformed callId is malformed", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, callId: 42, txHash: null },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("an unknown success field is uncertain", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, txHash: HASH_A, blockNumber: 1, settlementAmount: "1" },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("a success with an error field is contradictory", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, txHash: HASH_A, error: "Provider not active" },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("demo with a hash is contradictory even without settled:false", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 200,
      body: { success: true, demo: true, txHash: HASH_A },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("a terminal reverted settlement with a valid hash is reverted, not uncertain", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 409,
      body: {
        success: false,
        code: "SETTLEMENT_REVERTED",
        error: "Settlement transaction reverted",
        txHash: HASH_A,
        operationId: "call-service:auth:0x1:0x2",
      },
    });
    expect(outcome.kind).toBe("reverted");
    if (outcome.kind === "reverted") expect(outcome.txHash).toBe(HASH_A);
  });

  test("a reverted claim without a valid hash stays uncertain", () => {
    for (const txHash of [undefined, null, "0xnot-a-hash"]) {
      const outcome = classifyFacilitatorResult({
        reached: true,
        status: 409,
        body: {
          success: false,
          code: "SETTLEMENT_REVERTED",
          error: "Settlement transaction reverted",
          ...(txHash === undefined ? {} : { txHash }),
        },
      });
      expect(outcome.kind).toBe("uncertain");
    }
  });

  test("a reverted claim with an unknown field stays uncertain", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 409,
      body: {
        success: false,
        code: "SETTLEMENT_REVERTED",
        error: "Settlement transaction reverted",
        txHash: HASH_A,
        settlementAmount: "1",
      },
    });
    expect(outcome.kind).toBe("uncertain");
  });

  test("a reverted claim without success:false stays uncertain", () => {
    const outcome = classifyFacilitatorResult({
      reached: true,
      status: 409,
      body: {
        code: "SETTLEMENT_REVERTED",
        error: "Settlement transaction reverted",
        txHash: HASH_A,
      },
    });
    expect(outcome.kind).toBe("uncertain");
  });
});
