/* Executed with `bun test`. Scope: how a wallet response and a transaction receipt
   become UI state, so a hash is never shown as success and a rejection never looks
   like a submission. */
import { describe, expect, test } from "bun:test";
import {
  canSubmit, classifyReceipt, classifyVerdict, classifyWalletError, txStatus, type TxPhase,
} from "../src/lib/txLifecycle";

describe("classifyWalletError", () => {
  test("a user rejection is not a submission and not a generic failure", () => {
    expect(classifyWalletError({ code: 4001 })).toEqual({ kind: "rejected" });
    expect(classifyWalletError({ code: "ACTION_REJECTED" })).toEqual({ kind: "rejected" });
    expect(classifyWalletError(new Error("User rejected the request.")))
      .toEqual({ kind: "rejected" });
  });

  test("an RPC failure is a failure, not a rejection", () => {
    const result = classifyWalletError({ code: -32603, message: "RPC error" });
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") expect(result.message.length).toBeGreaterThan(0);
  });
});

describe("classifyReceipt", () => {
  test("a mined transaction is only confirmed when its receipt succeeded", () => {
    expect(classifyReceipt("success")).toBe("confirmed");
  });

  test("a reverted receipt is a failure even though a hash exists", () => {
    expect(classifyReceipt("reverted")).toBe("reverted");
  });
});

describe("classifyVerdict", () => {
  test("only an honoured or completed call is verified", () => {
    expect(classifyVerdict("HONORED").ok).toBe(true);
    expect(classifyVerdict("completed").ok).toBe(true);
    expect(classifyVerdict("PENDING").ok).toBe(false);
    expect(classifyVerdict("VIOLATED").ok).toBe(false);
  });

  test("pending and unknown verdicts keep their own status and message", () => {
    expect(classifyVerdict("PENDING").status).toBe("PENDING");
    expect(classifyVerdict("PENDING").message).toContain("pending");
    expect(classifyVerdict(undefined).status).toBe("UNKNOWN");
    expect(classifyVerdict(undefined).ok).toBe(false);
  });
});

describe("txStatus", () => {
  test("a hash alone says submitted and still waiting", () => {
    const phase: TxPhase = { kind: "submitted", hash: "0xabc123" };
    const copy = txStatus(phase);
    expect(copy.tone).toBe("info");
    expect(copy.text).toContain("submitted");
    expect(copy.text).toContain("waiting for confirmation");
    expect(copy.text.toLowerCase()).not.toContain("success");
    expect(copy.text.toLowerCase()).not.toContain("complete");
  });

  test("confirmation is stated only for the confirmed phase", () => {
    expect(txStatus({ kind: "confirmed", hash: "0xabc123" }).tone).toBe("ok");
    expect(txStatus({ kind: "reverted", hash: "0xabc123" }).tone).toBe("error");
    expect(txStatus({ kind: "rejected" }).text).toContain("Nothing was submitted");
    expect(txStatus({ kind: "failed", message: "boom" }).text).toContain("boom");
  });
});

describe("canSubmit", () => {
  test("blocked while submitting, disconnected, or any blocker exists", () => {
    expect(canSubmit({ submitting: true, connected: true, blockers: [] })).toBe(false);
    expect(canSubmit({ submitting: false, connected: false, blockers: [] })).toBe(false);
    expect(canSubmit({ submitting: false, connected: true, blockers: ["inactive"] })).toBe(false);
    expect(canSubmit({ submitting: false, connected: true, blockers: [] })).toBe(true);
  });
});
