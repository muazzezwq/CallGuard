#!/usr/bin/env bun
/**
 * ZK execution envelope — rebuilds the `cg-claim/1` envelope for the RISC Zero receipt
 * in `test/fixtures/zk-execution/`, prints the claim hash the registry anchors, and
 * writes the JSON the Verify panel reads.
 *
 * Why this exists: the chain stores a digest, and the seal is checked on chain by
 * `Risc0ExecutionAdapter`. What the repository has to keep reproducible is the link
 * between the two — the exact envelope, journal and handler id that produced that
 * digest. Rerun this after replacing the fixture and the numbers either match or the
 * fixture is lying about which call it is about.
 *
 * Usage:
 *   bun scripts/zk-execution-proof.ts                 # print digest + sizes
 *   bun scripts/zk-execution-proof.ts --write         # also write the panel fixture
 *   bun scripts/zk-execution-proof.ts --blob /tmp/zk.blob   # also write the proof blob
 *
 * Honest scope: the statement is about a program's output for a committed request. It
 * is not a claim that the answer is correct, and no field here can make it one.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { encodeAbiParameters, keccak256, parseAbiParameters, toBytes } from "viem";

import { CG_CLAIM_VERSION, envelopeDigest, type EvidenceEnvelope } from "../src/lib/verification/schema";
import { decodeJournal } from "../src/lib/verification/risc0";

const FIXTURE_DIR = "test/fixtures/zk-execution";
const ENVELOPE_PATH = "src/lib/verification/fixtures/zk-execution.json";

const CALL_ID = "0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265";
const TERMS_HASH = "0xbe8c8cd7ff8e85af17a1ccdba790eb1dae47a008d61feccdd682559d8d099fcf";
const RESPONSE_HASH = "0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d";
const HANDLER_ID = keccak256(toBytes("callguard.handler.ping/1"));
const PROVIDER_ID = 1;
/** Fixed so the digest can be recomputed; a proof of a past execution does not expire. */
const ISSUED_AT = 1793020800;

const argv = process.argv.slice(2);

const seal = readFileSync(`${FIXTURE_DIR}/seal.bin`);
const journal = readFileSync(`${FIXTURE_DIR}/journal.bin`);
const imageId = readFileSync(`${FIXTURE_DIR}/image_id.txt`, "utf8").trim();
const journalHex = `0x${journal.toString("hex")}` as `0x${string}`;
const decoded = decodeJournal(journalHex);

// The fixture has to describe the call this repository publishes. A mismatch here is
// not a warning: it means the envelope would anchor a digest for a proof about
// something else.
const problems: string[] = [];
if (decoded.callId.toLowerCase() !== CALL_ID) problems.push(`journal callId ${decoded.callId} is not ${CALL_ID}`);
if (decoded.responseHash.toLowerCase() !== RESPONSE_HASH) {
  problems.push(`journal responseHash ${decoded.responseHash} is not ${RESPONSE_HASH}`);
}
if (decoded.handlerId.toLowerCase() !== HANDLER_ID) {
  problems.push(`journal handlerId ${decoded.handlerId} is not ${HANDLER_ID}`);
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const blob = encodeAbiParameters(parseAbiParameters("bytes seal, bytes journal"), [
  `0x${seal.toString("hex")}`,
  journalHex,
]);

const statement =
  "A guest program with the published image id ran on a private request whose keccak256 is the call's committed requestHash and committed this responseHash for this callId";

const assumptions = [
  "the on-chain Groth16 verifier bytecode is the published risc0-ethereum v3.0.1 verifier",
  "the committed responseHash is the provider's own receipt commitment, not a value the prover chose",
  "the call's requestHash was read from PayPerCallV8.getCall and is the request the provider committed to",
];

const envelope: EvidenceEnvelope = {
  version: CG_CLAIM_VERSION,
  subject: {
    callId: CALL_ID as `0x${string}`,
    providerId: PROVIDER_ID,
    termsHash: TERMS_HASH as `0x${string}`,
    responseHash: RESPONSE_HASH as `0x${string}`,
  },
  claim: { kind: "zk-execution", statement, assumptions },
  // The envelope payload is the journal, not the on-chain blob: the off-chain verifier
  // reads the 128 bytes a reader can check against the call, while the blob
  // (`abi.encode(seal, journal)`) is what the registry's adapter takes and is written
  // separately with `--blob`.
  proof: { type: "risc0-groth16-receipt", payload: journal.toString("base64") },
  issuedAt: ISSUED_AT,
};

const claimHash = envelopeDigest(envelope);
const journalDigest = `0x${createHash("sha256").update(journal).digest("hex")}`;
const blobPath = argv.includes("--blob") ? argv[argv.indexOf("--blob") + 1] : undefined;

if (argv.includes("--write")) {
  writeFileSync(
    ENVELOPE_PATH,
    `${JSON.stringify(
      {
        callId: CALL_ID,
        providerId: PROVIDER_ID,
        termsHash: TERMS_HASH,
        responseHash: RESPONSE_HASH,
        imageId,
        handlerId: HANDLER_ID,
        journal: journalHex,
        journalDigest,
        claimHash,
        sealBytes: seal.length,
        statement,
        assumptions,
        issuedAt: ISSUED_AT,
      },
      null,
      2,
    )}\n`,
  );
}
if (blobPath) writeFileSync(blobPath, `${blob}\n`);

console.log(
  JSON.stringify(
    {
      claimHash,
      callId: CALL_ID,
      responseHash: RESPONSE_HASH,
      imageId,
      journalDigest,
      sealBytes: seal.length,
      proofBlobBytes: (blob.length - 2) / 2,
      envelopeWritten: argv.includes("--write") ? ENVELOPE_PATH : null,
      blobWritten: blobPath ?? null,
    },
    null,
    2,
  ),
);
