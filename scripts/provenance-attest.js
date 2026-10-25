#!/usr/bin/env bun
/**
 * Provenance attestor — SLAProvenance (B3b).
 *
 * Watches one call's payload, hashes the exact bytes, signs the contract's own
 * EIP-712 digest over `(callId, payloadHash, originHash, observedAt)` and records
 * it on chain. The contract recovers the signer with `ecrecover` and accepts the
 * record only because this key is on the attestor allowlist.
 *
 * Honest scope: this proves *who* observed the payload and when, not that the
 * payload is a correct answer to the request. Nothing here verifies the provider's
 * execution.
 *
 * Usage:
 *   CALL_ID=0x... ENDPOINT_URL=https://api.example.com/x \
 *     ATTESTOR_PK=0x... bun scripts/provenance-attest.js
 *
 *   CALL_ID=0x... PAYLOAD_FILE=/tmp/body.txt ORIGIN=api.example.com \
 *     ATTESTOR_PK=0x... bun scripts/provenance-attest.js
 *
 * Env:
 *   CALL_ID              required, 32-byte PayPerCallV8 call id
 *   ATTESTOR_PK          required, allowlisted attestor private key (pays gas)
 *   ENDPOINT_URL         optional, payload is the raw response body of this URL
 *   PAYLOAD_FILE         optional, payload is the contents of this file
 *   PAYLOAD              optional, payload taken verbatim from the env var
 *   ORIGIN               optional, defaults to the host of ENDPOINT_URL
 *   OBSERVED_AT          optional, unix seconds; defaults to now
 *   ARC_RPC_URL          optional, defaults to the public Arc Testnet RPC
 *   SLA_PROVENANCE       optional, defaults to the deployed registry
 *   DRY_RUN              optional, print the digest and signature without sending
 */
import { ethers } from "ethers";
import { readFileSync } from "node:fs";

const RPC = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io";
const PROVENANCE = process.env.SLA_PROVENANCE ?? "0xa74D1A809184e4A906f11C9EE38fff8C1155aFeb";

const ABI = [
  "function recordProvenance(bytes32 callId, bytes32 payloadHash, string origin, uint64 observedAt, bytes signature)",
  "function provenanceDigest(bytes32 callId, bytes32 payloadHash, bytes32 originHash, uint64 observedAt) view returns (bytes32)",
  "function getProvenance(bytes32 callId) view returns (bytes32 payloadHash, address attestor, bytes32 originHash, uint64 observedAt, uint64 recordedAt)",
  "function verifyProvenance(bytes32 callId, bytes32 expectedPayloadHash) view returns (bool)",
  "function isAttestor(address attestor) view returns (bool)",
  "function MAX_CLOCK_SKEW() view returns (uint64)",
];

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const callId = process.env.CALL_ID?.trim();
if (!callId || !/^0x[0-9a-fA-F]{64}$/.test(callId)) fail("CALL_ID must be a 32-byte hex call id");
if (!process.env.ATTESTOR_PK) fail("ATTESTOR_PK not set");

/**
 * Resolve the payload without normalising it. The provider hashed raw bytes, so
 * trimming or re-serialising here would produce a hash nobody committed to.
 */
async function readPayload() {
  if (process.env.PAYLOAD !== undefined) {
    return { payload: process.env.PAYLOAD, origin: process.env.ORIGIN ?? "" };
  }
  if (process.env.PAYLOAD_FILE) {
    return { payload: readFileSync(process.env.PAYLOAD_FILE, "utf8"), origin: process.env.ORIGIN ?? "" };
  }
  if (process.env.ENDPOINT_URL) {
    const res = await fetch(process.env.ENDPOINT_URL);
    if (!res.ok) fail(`endpoint returned ${res.status}`);
    const payload = await res.text();
    const origin = process.env.ORIGIN ?? new URL(process.env.ENDPOINT_URL).host;
    return { payload, origin };
  }
  return fail("one of ENDPOINT_URL, PAYLOAD_FILE or PAYLOAD is required");
}

const { payload, origin } = await readPayload();
if (!origin.trim()) fail("ORIGIN is required when the payload does not come from ENDPOINT_URL");

const observedAt = Number(process.env.OBSERVED_AT ?? Math.floor(Date.now() / 1000));
const payloadHash = ethers.keccak256(ethers.toUtf8Bytes(payload));
const originHash = ethers.keccak256(ethers.toUtf8Bytes(origin));

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(process.env.ATTESTOR_PK, provider);
const contract = new ethers.Contract(PROVENANCE, ABI, provider);
const writer = new ethers.Contract(PROVENANCE, ABI, wallet);

const allowed = await contract.isAttestor(wallet.address);
const digest = await contract.provenanceDigest(callId, payloadHash, originHash, observedAt);

console.log(`call        ${callId}`);
console.log(`payload     ${payload.length} bytes, keccak256 ${payloadHash}`);
console.log(`origin      ${origin} → ${originHash}`);
console.log(`observedAt  ${observedAt}`);
console.log(`attestor    ${wallet.address} allowlisted=${allowed}`);
console.log(`digest      ${digest}`);

if (!allowed) fail("attestor is not allowlisted on the registry; refusing to burn gas");

// Signing the raw digest, not an EIP-191 message: the contract recovers against
// the digest it computed itself, so a prefixed hash would recover to a stranger.
const signature = wallet.signingKey.sign(digest).serialized;

if (process.env.DRY_RUN) {
  console.log(`signature   ${signature}`);
  console.log("dry run: nothing sent");
  process.exit(0);
}

const tx = await writer.recordProvenance(callId, payloadHash, origin, observedAt, signature);
console.log(`tx          ${tx.hash}`);
const receipt = await tx.wait();
console.log(`mined       block ${receipt.blockNumber}, gas ${receipt.gasUsed}`);

const record = await contract.getProvenance(callId);
const matches = await contract.verifyProvenance(callId, payloadHash);
console.log(`stored      payloadHash=${record.payloadHash} attestor=${record.attestor}`);
console.log(`stored      observedAt=${record.observedAt} recordedAt=${record.recordedAt}`);
console.log(`verify      ${matches ? "MATCH" : "MISMATCH"}`);

if (!matches) fail("the registry does not confirm the record it just accepted");
