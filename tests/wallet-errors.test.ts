import { describe, expect, test } from "bun:test";
import { classifyWalletError } from "../src/lib/txLifecycle";

/* Phase 6 §5 asks for three wallet outcomes to be driven: a rejected switch to
   Arc, an insufficient balance, and a wrong-network wallet. The browser half of
   that still needs a funded wallet, but the classification that decides what the
   caller is told is pure, so it is pinned here. */

describe("wallet rejection", () => {
  test("EIP-1193 code 4001 is a rejection, not a failure", () => {
    expect(classifyWalletError({ code: 4001 })).toEqual({ kind: "rejected" });
  });

  test("viem's ACTION_REJECTED string code is a rejection", () => {
    expect(classifyWalletError({ code: "ACTION_REJECTED" })).toEqual({ kind: "rejected" });
  });

  test("a rejection phrased only in the message is still a rejection", () => {
    expect(classifyWalletError({ message: "User rejected the request." })).toEqual({ kind: "rejected" });
    expect(classifyWalletError({ shortMessage: "User denied transaction signature." })).toEqual({ kind: "rejected" });
  });

  test("a rejected chain switch carries no submitted-transaction message", () => {
    // wallet_switchEthereumChain rejects with 4001 when the user refuses Arc.
    const result = classifyWalletError(Object.assign(new Error("User rejected the request."), { code: 4001 }));
    expect(result.kind).toBe("rejected");
    expect("message" in result).toBe(false);
  });
});

describe("wallet failures that are not rejections", () => {
  test("an unrecognised chain is a failure the caller can act on, never a silent success", () => {
    const result = classifyWalletError({ code: 4902, message: "Unrecognized chain ID" });
    expect(result.kind).toBe("failed");
    expect(result.kind === "failed" && result.message.length).toBeGreaterThan(0);
  });

  test("insufficient balance says nothing was charged", () => {
    const result = classifyWalletError({ message: "insufficient funds for gas * price + value" });
    expect(result.kind).toBe("failed");
    expect(result.kind === "failed" && result.message).toContain("Nothing was charged");
  });

  test("a nonce or replacement conflict tells the caller to check the wallet first", () => {
    const result = classifyWalletError({ message: "replacement transaction underpriced" });
    expect(result.kind === "failed" && result.message).toContain("nonce or replacement conflict");
  });

  test("a transport error admits the request may have reached the chain", () => {
    const result = classifyWalletError({ message: "fetch failed" });
    expect(result.kind === "failed" && result.message).toContain("may not have reached the chain");
  });

  test("an empty error is not treated as success", () => {
    expect(classifyWalletError(null)).toEqual({ kind: "failed", message: "The wallet did not return a response." });
    expect(classifyWalletError({})).toEqual({ kind: "failed", message: "The wallet returned an unknown error." });
  });
});
