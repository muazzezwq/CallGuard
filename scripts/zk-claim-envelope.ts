#!/usr/bin/env bun
/**
 * ZK claim envelope — rebuilds the exact `cg-claim/1` envelope, the digest the
 * registry anchors, and the proof blob the adapter expects, for the fixture proof
 * in `test/fixtures/zk/`.
 *
 * Why this exists: the anchored claim is a digest, so the artifact that produced it
 * has to be reproducible from the repository. Anyone can rerun this and get the same
 * `claimHash` for the same call, terms and response.
 *
 * Usage:
 *   bun scripts/zk-claim-envelope.ts                       # print digest + sizes
 *   bun scripts/zk-claim-envelope.ts --write                # also write the envelope JSON
 *   bun scripts/zk-claim-envelope.ts --blob /tmp/proof.hex   # also write the proof blob
 *
 * Honest scope: the claim is an output constraint. It proves the committed response
 * has a preimage that starts with a stated byte; it says nothing about whether the
 * response is a correct answer.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { encodeAbiParameters, parseAbiParameters } from "viem";

import { CG_CLAIM_VERSION, envelopeDigest, type EvidenceEnvelope } from "../src/lib/verification/schema";

const CALL_ID = "0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265";
const TERMS_HASH = "0xbe8c8cd7ff8e85af17a1ccdba790eb1dae47a008d61feccdd682559d8d099fcf";
const RESPONSE_HASH = "0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d";
const FIRST_BYTE = 0x70; // "p" of "pong"
const PROVIDER_ID = 1;
/** Fixed so the digest can be recomputed; the proof does not expire on chain. */
const ISSUED_AT = 1793020800;

const argv = process.argv.slice(2);
const envelopePath = "test/fixtures/zk/keccak-call.envelope.json";
const blobPath = argv.includes("--blob") ? argv[argv.indexOf("--blob") + 1] : undefined;

const proofHex = readFileSync("test/fixtures/zk/keccak-call.proof");
const blob = encodeAbiParameters(parseAbiParameters("uint8 firstByte, bytes honkProof"), [
  FIRST_BYTE,
  `0x${proofHex.toString("hex")}`,
]);

const envelope: EvidenceEnvelope = {
  version: CG_CLAIM_VERSION,
  subject: {
    callId: CALL_ID as `0x${string}`,
    providerId: PROVIDER_ID,
    termsHash: TERMS_HASH as `0x${string}`,
    responseHash: RESPONSE_HASH as `0x${string}`,
  },
  claim: {
    kind: "zk-constraint",
    statement:
      "A private 4-byte body hashes to the committed responseHash and starts with the byte 0x70, for this callId",
    assumptions: [
      "the UltraHonk verifier bytecode is the published one",
      "the committed responseHash is the provider's own receipt commitment",
    ],
  },
  proof: { type: "ultrahonk-keccak-claim", payload: Buffer.from(blob.slice(2), "hex").toString("base64") },
  issuedAt: ISSUED_AT,
};

const digest = envelopeDigest(envelope);

if (argv.includes("--write")) writeFileSync(envelopePath, `${JSON.stringify(envelope, null, 2)}\n`);
if (blobPath) writeFileSync(blobPath, `${blob}\n`);

console.log(JSON.stringify({
  claimHash: digest,
  callId: CALL_ID,
  responseHash: RESPONSE_HASH,
  kind: "zk-constraint",
  proofBlobBytes: (blob.length - 2) / 2,
  envelopeWritten: argv.includes("--write") ? envelopePath : null,
  blobWritten: blobPath ?? null,
}, null, 2));
