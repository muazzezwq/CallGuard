#!/usr/bin/env bun
/**
 * TDX attestation — fetch an answer from a Phala Cloud CVM, verify the Intel TDX
 * quote off chain, and print the claim envelope the registry can anchor.
 *
 * What this proves when it passes:
 *   - the quote's signing chain resolves to Intel's root CA (genuine TDX, not an
 *     emulator) and the TCB is not revoked or out of date;
 *   - `report_data` = subjectUserData(callId, termsHash, responseHash) ‖ nonce, so
 *     the quote is about this call and the nonce this run generated;
 *   - the event log replays to the quoted RTMR3 and its `compose-hash` is both
 *     sha256 of the `app_compose` the CVM served and on the caller's allowlist;
 *   - the served body hashes to the `responseHash` the provider committed on chain.
 *
 * What it does not prove: that the answer is correct. The claim is about execution
 * and measured code, and the envelope says so in its statement.
 *
 * Usage:
 *   bun scripts/tdx-attest.ts --base https://<cvm-host> --call 0x<callId>
 *   bun scripts/tdx-attest.ts --base https://<cvm-host> --call 0x<callId> --write
 *   bun scripts/tdx-attest.ts --base http://localhost:8080 --call 0x<callId> --collateral collateral.json
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, keccak256, toHex, type Hex } from "viem";
import { getCollateral, PHALA_PCCS_URL } from "@phala/dcap-qvl";

import { CG_CLAIM_VERSION, envelopeDigest, type EvidenceEnvelope } from "../src/lib/verification/schema";
import {
  checkTdxBinding,
  composeHash,
  expectedReportData,
  verifyTdxQuote,
  type TdxEvent,
} from "../src/lib/verification/tdx";

const RPC = "https://rpc.testnet.arc.io";
const PAY_PER_CALL = "0xedce61eF5be31DC22cEfE342692622A26919a7EF" as const;

const CALL_ABI = [
  {
    type: "function",
    name: "getCall",
    stateMutability: "view",
    inputs: [{ name: "callId", type: "bytes32" }],
    outputs: [
      {
        name: "call",
        type: "tuple",
        components: [
          { name: "providerId", type: "uint256" },
          { name: "caller", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "startedAt", type: "uint32" },
          { name: "deadline", type: "uint32" },
          { name: "completedAt", type: "uint32" },
          { name: "termsVersion", type: "uint32" },
          { name: "termsHash", type: "bytes32" },
          { name: "requestHash", type: "bytes32" },
          { name: "responseHash", type: "bytes32" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
] as const;

const argv = process.argv.slice(2);
function arg(name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

const base = arg("base");
const callId = arg("call") as Hex | undefined;
const write = argv.includes("--write");
const collateralPath = arg("collateral");
const allowedComposeHashArg = arg("compose-hash");

if (!base || !callId) {
  console.error("usage: bun scripts/tdx-attest.ts --base <url> --call 0x<callId> [--write] [--collateral file.json] [--compose-hash 0x..]");
  process.exit(1);
}

const client = createPublicClient({ transport: http(RPC) });

function fail(message: string): never {
  console.error(`FAIL  ${message}`);
  process.exit(2);
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, base));
  } catch (error) {
    fail(`cannot reach ${base}${path}: ${(error as Error).message}`);
  }
  if (!response.ok) fail(`${path} answered ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

interface AnswerPayload {
  body: string;
  callId: string;
  termsHash: string;
  responseHash: string;
  nonce: string;
  reportData: string;
  quote: string;
  event_log: TdxEvent[];
}

const call = await client.readContract({
  address: PAY_PER_CALL,
  abi: CALL_ABI,
  functionName: "getCall",
  args: [callId],
});

const nonce = randomBytes(32);
const answer = await getJson<AnswerPayload>(
  `/answer?callId=${callId}&termsHash=${call.termsHash}&nonce=0x${nonce.toString("hex")}`,
);

console.log("── 1. the body ─────────────────────────────────────────────────");
const bodyHash = keccak256(toHex(new TextEncoder().encode(answer.body)));
if (bodyHash.toLowerCase() !== call.responseHash.toLowerCase()) {
  fail(`served body hashes to ${bodyHash}, the call committed ${call.responseHash}`);
}
if (answer.responseHash.toLowerCase() !== bodyHash.toLowerCase()) {
  fail(`enclave reported responseHash ${answer.responseHash}, its body hashes to ${bodyHash}`);
}
console.log(`body            ${answer.body}`);
console.log(`keccak256(body) ${bodyHash}`);
console.log(`call committed  ${call.responseHash}  → MATCH`);

console.log("\n── 2. hardware ──────────────────────────────────────────────────");
const quoteBytes = new Uint8Array(Buffer.from(answer.quote.replace(/^0x/, ""), "hex"));
const collateral = collateralPath
  ? JSON.parse(readFileSync(collateralPath, "utf8"))
  : await getCollateral(PHALA_PCCS_URL, quoteBytes);

const subject = {
  callId,
  providerId: Number(call.providerId),
  termsHash: call.termsHash,
  responseHash: call.responseHash,
};

const options = {
  collateral,
  allowedComposeHashes: [] as string[],
  now: Math.floor(Date.now() / 1000),
};

const hardware = verifyTdxQuote(quoteBytes, options);
if (!hardware.ok) fail(`quote rejected: ${hardware.reasons.join("; ")}`);
console.log(`tcb status      ${hardware.tcbStatus}`);
console.log(`mrtd            ${hardware.measurements?.mrTd}`);
console.log(`rtmr3           ${hardware.measurements?.rtMr3}`);
console.log(`report_data     ${hardware.reportData}`);
if (hardware.advisoryIds.length) console.log(`advisories      ${hardware.advisoryIds.join(", ")}`);

console.log("\n── 3. which code, and for which call ────────────────────────────");
const info = await getJson<{ tcb_info?: { app_compose?: string } }>("/info");
const appCompose = info.tcb_info?.app_compose;
if (!appCompose) fail("/info carried no tcb_info.app_compose: the running code cannot be named");

const measuredCompose = answer.event_log.find(event => event.imr === 3 && event.event === "compose-hash");
if (!measuredCompose) fail("event log has no compose-hash");
const allowed = (allowedComposeHashArg ? [allowedComposeHashArg] : [composeHash(appCompose)]).map(value =>
  value.toLowerCase(),
);
const bound = checkTdxBinding(
  hardware,
  subject,
  nonce,
  answer.event_log,
  appCompose,
  { ...options, allowedComposeHashes: allowed },
);
if (!bound.ok) fail(`binding rejected: ${bound.reasons.join("; ")}`);

console.log(`compose-hash    ${bound.composeHash}  (sha256 of the served app_compose, replayed through RTMR3)`);
console.log(`nonce           ${answer.nonce}  → echoed inside report_data`);
console.log(`report_data ok  ${Buffer.from(answer.reportData.replace(/^0x/, ""), "hex").equals(
  Buffer.from(expectedReportData(subject, nonce)),
)}`);

console.log("\n── 4. claim ─────────────────────────────────────────────────────");
const envelope: EvidenceEnvelope = {
  version: CG_CLAIM_VERSION,
  subject,
  claim: {
    kind: "tee-attestation",
    statement:
      "The committed response for this call was produced inside an Intel TDX trust domain whose measured compose file is the one listed here, and the quote binds this call and a fresh caller nonce",
    assumptions: [
      "Intel TDX root of trust: the quote signature resolves to Intel's root CA through DCAP collateral",
      "Phala Cloud dstack measures the compose file into RTMR3; the compose-hash allowlist is current",
      "the container image digest inside the compose file is the image whose source was reviewed",
    ],
  },
  proof: { type: "intel-tdx-quote", payload: Buffer.from(quoteBytes).toString("base64") },
  issuedAt: Math.floor(Date.now() / 1000),
};

const digest = envelopeDigest(envelope);
console.log(`statement       ${envelope.claim.statement}`);
console.log(`assumptions     ${envelope.claim.assumptions.length}`);
console.log(`claimHash       ${digest}`);
console.log(`kind            keccak256("tee-attestation") = ${keccak256(toHex("tee-attestation"))}`);

if (write) {
  writeFileSync("test/fixtures/tdx/quote.bin", Buffer.from(quoteBytes));
  writeFileSync("test/fixtures/tdx/events.json", JSON.stringify(answer.event_log, null, 2));
  writeFileSync("test/fixtures/tdx/app_compose.json", JSON.stringify({ app_compose: appCompose }, null, 2));
  writeFileSync("test/fixtures/tdx/collateral.json", JSON.stringify(collateral, null, 2));
  writeFileSync("test/fixtures/tdx/call.json", JSON.stringify({ callId, termsHash: call.termsHash, responseHash: call.responseHash, providerId: Number(call.providerId), nonce: answer.nonce, verifiedAt: options.now }, null, 2));
  writeFileSync("test/fixtures/tdx/envelope.json", JSON.stringify(envelope, null, 2));
  console.log("\nwrote test/fixtures/tdx/{quote.bin,events.json,app_compose.json,collateral.json,call.json,envelope.json}");
}

console.log("\nPASS  the quote is genuine, the code is named, and the body is the committed one.");
console.log("      It is still not a proof that the answer is correct — the envelope says so.");
