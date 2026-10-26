import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import type { Collateral } from "@phala/dcap-qvl";
import {
  checkTdxBinding,
  composeHash,
  verifyTdxQuote,
  type TdxEvent,
} from "../../src/lib/verification/tdx";
import { envelopeDigest, validateEnvelope, type EvidenceEnvelope } from "../../src/lib/verification/schema";

/**
 * Regression test against a real CVM. The fixtures are captured by
 * `bun scripts/tdx-attest.ts --write` from a running Phala Cloud deployment; until
 * one exists the suite says so instead of pretending a synthetic quote passed.
 *
 * The quote is checked at the timestamp it was verified (`verifiedAt`, recorded by
 * the capture), because DCAP collateral expires and the point of this test is that
 * the chain resolved — not that today's TCB is still current.
 */
const DIR = "test/fixtures/tdx";
const present = existsSync(`${DIR}/quote.bin`);

interface Capture {
  callId: `0x${string}`;
  termsHash: `0x${string}`;
  responseHash: `0x${string}`;
  providerId: number;
  nonce: string;
  verifiedAt: number;
}

function load(): { quote: Uint8Array; events: TdxEvent[]; appCompose: string; collateral: Collateral; call: Capture; envelope: EvidenceEnvelope } {
  return {
    quote: new Uint8Array(readFileSync(`${DIR}/quote.bin`)),
    events: JSON.parse(readFileSync(`${DIR}/events.json`, "utf8")) as TdxEvent[],
    appCompose: (JSON.parse(readFileSync(`${DIR}/app_compose.json`, "utf8")) as { app_compose: string }).app_compose,
    collateral: JSON.parse(readFileSync(`${DIR}/collateral.json`, "utf8")) as Collateral,
    call: JSON.parse(readFileSync(`${DIR}/call.json`, "utf8")) as Capture,
    envelope: JSON.parse(readFileSync(`${DIR}/envelope.json`, "utf8")) as EvidenceEnvelope,
  };
}

describe("real TDX attestation", () => {
  const maybe = present ? test : test.skip;

  maybe("verifies the captured quote against Intel's root and binds it to the call", () => {
    const { quote, events, appCompose, collateral, call, envelope } = load();
    const options = { collateral, allowedComposeHashes: [composeHash(appCompose)], now: call.verifiedAt };

    const hardware = verifyTdxQuote(quote, options);
    expect(hardware.reasons).toEqual([]);
    expect(hardware.ok).toBe(true);

    const nonce = new Uint8Array(Buffer.from(call.nonce.replace(/^0x/, ""), "hex"));
    const bound = checkTdxBinding(
      hardware,
      { callId: call.callId, providerId: call.providerId, termsHash: call.termsHash, responseHash: call.responseHash },
      nonce,
      events,
      appCompose,
      options,
    );
    expect(bound.reasons).toEqual([]);
    expect(bound.ok).toBe(true);

    // The envelope that produced the anchored digest must still validate, and its
    // proof payload must be exactly this quote.
    expect(validateEnvelope(envelope).reasons).toEqual([]);
    expect(envelopeDigest(envelope)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(Buffer.from(envelope.proof.payload, "base64").equals(Buffer.from(quote))).toBe(true);
  });

  maybe("refuses the captured quote when it is replayed onto another call", () => {
    const { quote, events, appCompose, collateral, call } = load();
    const options = { collateral, allowedComposeHashes: [composeHash(appCompose)], now: call.verifiedAt };

    const hardware = verifyTdxQuote(quote, options);
    const nonce = new Uint8Array(Buffer.from(call.nonce.replace(/^0x/, ""), "hex"));
    const other = { ...call, callId: `0x${"ab".repeat(32)}` as `0x${string}` };

    const bound = checkTdxBinding(hardware, other, nonce, events, appCompose, options);
    expect(bound.ok).toBe(false);
    expect(bound.reasons.join(" ")).toContain("report_data");
  });

  maybe("refuses the captured quote when the nonce is not the caller's", () => {
    const { quote, events, appCompose, collateral, call } = load();
    const options = { collateral, allowedComposeHashes: [composeHash(appCompose)], now: call.verifiedAt };

    const hardware = verifyTdxQuote(quote, options);
    const bound = checkTdxBinding(
      hardware,
      call,
      new Uint8Array(32).fill(0x5a),
      events,
      appCompose,
      options,
    );
    expect(bound.ok).toBe(false);
    expect(bound.reasons.join(" ")).toContain("report_data");
  });
});
