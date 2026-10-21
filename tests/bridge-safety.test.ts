import { describe, expect, test } from "bun:test";
import { BRIDGE_SOURCE_CHAINS } from "../src/lib/bridgeChains";
import {
  CCTP_CONFIG,
  parseCctpAttestationResponse,
  validateCctpMintMessage,
  type CctpDecodedMessage,
} from "../src/lib/cctp";
import { cctpStageDecision, readCctpOperation, startCctpOperation, updateCctpOperation } from "../src/lib/cctpOperation";
import { checkPaymentStart, resetPaymentGateState } from "../src/lib/paymentGate";
import type { GuardStorage } from "../src/lib/facilitatorGuard";

const V2_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const V1_TOKEN_MESSENGER = "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5";
const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const DEST = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const ZERO = "0x0000000000000000000000000000000000000000";
const HASH = `0x${"aa".repeat(32)}`;

function makeStorage(): { storage: GuardStorage; backing: Map<string, string> } {
  const backing = new Map<string, string>();
  return {
    backing,
    storage: {
      getItem: (key) => backing.get(key) ?? null,
      setItem: (key, value) => { backing.set(key, value); },
      removeItem: (key) => { backing.delete(key); },
    },
  };
}

function bytes32(value: string): string {
  return value.slice(2).padStart(64, "0");
}

function uint32(value: number): string {
  return value.toString(16).padStart(8, "0");
}

function uint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

type MessageOverrides = {
  headerVersion?: number;
  bodyVersion?: number;
  sourceDomain?: number;
  destinationDomain?: number;
  sender?: string;
  recipient?: string;
  destinationCaller?: string;
  burnToken?: string;
  mintRecipient?: string;
  amount?: bigint;
  messageSender?: string;
  maxFee?: bigint;
  feeExecuted?: bigint;
  hookData?: string;
};

/* Builds the same fixed-size CCTP v2 header and BurnMessage body that
   TokenMessengerV2 sends. Tests decode this, not IRIS's JSON summary. */
function buildMessage(overrides: MessageOverrides = {}): `0x${string}` {
  const header = [
    uint32(overrides.headerVersion ?? 2),
    uint32(overrides.sourceDomain ?? 0),
    uint32(overrides.destinationDomain ?? 26),
    "00".repeat(32),
    bytes32(overrides.sender ?? V2_TOKEN_MESSENGER),
    bytes32(overrides.recipient ?? V2_TOKEN_MESSENGER),
    bytes32(overrides.destinationCaller ?? ZERO),
    uint32(1000),
    uint32(1000),
  ].join("");
  const body = [
    uint32(overrides.bodyVersion ?? 2),
    bytes32(overrides.burnToken ?? USDC_SEPOLIA),
    bytes32(overrides.mintRecipient ?? DEST),
    uint256(overrides.amount ?? 1_000_000n),
    bytes32(overrides.messageSender ?? DEST),
    uint256(overrides.maxFee ?? 0n),
    uint256(overrides.feeExecuted ?? 0n),
    uint256(0n),
  ].join("");
  return `0x${header}${body}${(overrides.hookData ?? "0x").slice(2)}`;
}

function decoded(overrides: Partial<CctpDecodedMessage> = {}): CctpDecodedMessage {
  return {
    sourceDomain: 0,
    destinationDomain: 26,
    recipient: V2_TOKEN_MESSENGER,
    mintRecipient: DEST,
    destinationCaller: ZERO,
    burnToken: USDC_SEPOLIA,
    amount: "1000000",
    cctpVersion: 2,
    bodyVersion: 2,
    sender: V2_TOKEN_MESSENGER,
    messageSender: DEST,
    maxFee: "0",
    feeExecuted: "0",
    hookData: "0x",
    ...overrides,
  };
}

function expected() {
  return {
    sourceDomain: 0,
    destinationDomain: 26,
    recipient: V2_TOKEN_MESSENGER,
    mintRecipient: DEST,
    burnToken: USDC_SEPOLIA,
    amount: 1_000_000n,
    destinationCaller: ZERO,
    sender: V2_TOKEN_MESSENGER,
    messageSender: DEST,
    maxFee: 0n,
    hookData: "0x",
  };
}

function startBurnConfirmed(storage: GuardStorage): void {
  expect(startCctpOperation(storage, { chain: "11155111", amount: "1000000" }).ok).toBe(true);
  expect(updateCctpOperation(storage, { stage: "burn-pending" }).ok).toBe(true);
  expect(updateCctpOperation(storage, { stage: "burn-confirmed", burnHash: HASH }).ok).toBe(true);
}

describe("Bridge source-chain configuration", () => {
  test("every bridge source chain uses the CCTP v2 TokenMessenger", () => {
    expect(BRIDGE_SOURCE_CHAINS).toHaveLength(3);
    expect(BRIDGE_SOURCE_CHAINS.map((c) => c.domain)).toEqual([0, 6, 7]);
    for (const source of BRIDGE_SOURCE_CHAINS) {
      expect(source.tokenMessenger.toLowerCase()).toBe(V2_TOKEN_MESSENGER.toLowerCase());
      expect(source.tokenMessenger.toLowerCase()).not.toBe(V1_TOKEN_MESSENGER.toLowerCase());
      expect(source.tokenMessenger).toBe(CCTP_CONFIG.contracts.TokenMessengerV2);
    }
  });
});

describe("CCTP message validation before mint", () => {
  test("accepts a message that matches the burn", () => {
    expect(validateCctpMintMessage(decoded(), expected())).toEqual({ ok: true });
  });

  test("rejects missing decoded message data", () => {
    const result = validateCctpMintMessage(null, expected());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.toLowerCase()).toContain("decoded");
  });

  const mismatches: Array<[string, Partial<CctpDecodedMessage>]> = [
    ["source domain", { sourceDomain: 6 }],
    ["destination domain", { destinationDomain: 7 }],
    ["header recipient", { recipient: OTHER }],
    ["mint recipient", { mintRecipient: OTHER }],
    ["burn token", { burnToken: OTHER }],
    ["amount", { amount: "999999" }],
    ["destination caller", { destinationCaller: OTHER }],
    ["cctp version", { cctpVersion: 1 }],
    ["body version", { bodyVersion: 1 }],
    ["token messenger", { sender: OTHER }],
    ["burn initiator", { messageSender: OTHER }],
    ["max fee", { maxFee: "1" }],
    ["fee executed", { feeExecuted: "1" }],
    ["hook data", { hookData: "0x1234" }],
  ];

  for (const [label, patch] of mismatches) {
    test(`rejects a mismatched ${label}`, () => {
      const result = validateCctpMintMessage(decoded(patch), expected());
      expect(result.ok).toBe(false);
    });
  }
});

describe("IRIS attestation parsing", () => {
  const payload = {
    messages: [{
      status: "complete",
      message: buildMessage(),
      attestation: `0x${"ab".repeat(65)}`,
      cctpVersion: 2,
      /* These JSON values are not trusted; only the message bytes are decoded. */
      decodedMessage: {
        sourceDomain: "999",
        destinationDomain: "999",
        decodedMessageBody: { mintRecipient: OTHER, amount: "1" },
      },
    }],
  };

  test("decodes the actual message bytes used to validate a mint", () => {
    const parsed = parseCctpAttestationResponse(payload);
    expect(parsed?.message).toBe(buildMessage());
    expect(parsed?.attestation).toBe(`0x${"ab".repeat(65)}`);
    expect(parsed?.decoded).toEqual(decoded());
  });

  test("does not treat a pending or incomplete message as complete", () => {
    expect(parseCctpAttestationResponse({ messages: [{ status: "pending" }] })).toBeNull();
    expect(parseCctpAttestationResponse({ messages: [{ status: "complete", message: "0x12" }] })).toBeNull();
  });
});

describe("Bridge operation marker", () => {
  test("a previous uncertain operation blocks another bridge burn", () => {
    const { storage } = makeStorage();
    startBurnConfirmed(storage);

    const gate = checkPaymentStart({ storage, operation: "bridge" });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.code).toBe("cctp-operation-active");
  });

  test("a missing mint message leaves the marker in place and keeps the burn blocked", () => {
    const { storage } = makeStorage();
    startBurnConfirmed(storage);

    const validation = validateCctpMintMessage(null, expected());
    expect(validation.ok).toBe(false);

    const read = readCctpOperation(storage);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.operation?.stage).toBe("burn-confirmed");

    const gate = checkPaymentStart({ storage, operation: "bridge" });
    expect(gate.ok).toBe(false);
  });

  test("only a confirmed mint can clear the marker", () => {
    expect(cctpStageDecision("mint-pending", "confirmed")).toMatchObject({ action: "advance", clearOperation: true });
    expect(cctpStageDecision("mint-pending", "reverted")).toMatchObject({ action: "stop", clearOperation: false });
    expect(cctpStageDecision("mint-pending", "unknown")).toMatchObject({ action: "stop", clearOperation: false });
  });
});

describe("payment gate reset", () => {
  test("reset clears module state between tests", () => {
    resetPaymentGateState();
    const { storage } = makeStorage();
    expect(checkPaymentStart({ storage, operation: "bridge" })).toEqual({ ok: true });
  });
});
