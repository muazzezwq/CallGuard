#!/usr/bin/env bun
/**
 * Anchor a `witness` claim for one call, using the provenance record
 * `SLAProvenance` already holds.
 *
 * This exists because wiring the `witness` kind to `SLAProvenanceAdapter` (28 Oct
 * 2026) only made anchoring *possible*; a kind with a verifier and no claim is still
 * an absent row. The claim's three hashes have to be derived from the record, not
 * typed by hand, or the anchor and the envelope `/api/evidence` serves would
 * disagree on every byte.
 *
 * Usage:
 *
 *   bun scripts/witness-anchor.ts --call 0x<callId>
 *   bun scripts/witness-anchor.ts --call 0x<callId> --emit-fixture
 *   PRIVATE_KEY=0x... bun scripts/witness-anchor.ts --call 0x<callId> --send
 *
 * Env:
 *   ARC_RPC_URL       default https://rpc.testnet.arc.io
 *   WA_PPC            PayPerCallV8, default 0xedce61eF5be31DC22cEfE342692622A26919a7EF
 *   WA_PROVENANCE     SLAProvenance, default 0xa74D1A809184e4A906f11C9EE38fff8C1155aFeb
 *   WA_EVIDENCE       SLAEvidenceRegistryV2, default 0x64872c29A19dF8E471103d0708397BAb96A311FC
 *
 * `--send` is opt-in and needs a key on this machine. Without it the script prints
 * the exact `cast send` command instead, so a human signs at their own terminal.
 */
import { writeFileSync } from "node:fs";
import { encodeFunctionData, decodeFunctionResult, keccak256, toBytes } from "viem";

import { anchorHashes, buildWitnessEnvelope, type WitnessInput } from "../src/lib/verification/witnessClaim";
import { validateEnvelope } from "../src/lib/verification/schema";

const RPC = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io";
const PPC = process.env.WA_PPC ?? "0xedce61eF5be31DC22cEfE342692622A26919a7EF";
const PROVENANCE = process.env.WA_PROVENANCE ?? "0xa74D1A809184e4A906f11C9EE38fff8C1155aFeb";
const EVIDENCE = process.env.WA_EVIDENCE ?? "0x64872c29A19dF8E471103d0708397BAb96A311FC";

const GET_CALL_ABI = [
  {
    name: "getCall",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "callId", type: "bytes32" }],
    outputs: [
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
] as const;

const GET_PROVENANCE_ABI = [
  {
    name: "getProvenance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "callId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "payloadHash", type: "bytes32" },
          { name: "attestor", type: "address" },
          { name: "originHash", type: "bytes32" },
          { name: "observedAt", type: "uint64" },
          { name: "recordedAt", type: "uint64" },
        ],
      },
    ],
  },
] as const;

const ANCHOR_ABI = [
  {
    name: "anchor",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "callId", type: "bytes32" },
      { name: "kind", type: "bytes32" },
      { name: "claimHash", type: "bytes32" },
      { name: "responseHash", type: "bytes32" },
      { name: "statementHash", type: "bytes32" },
      { name: "assumptionHash", type: "bytes32" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function ethCall(to: string, data: `0x${string}`): Promise<`0x${string}`> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const body = (await res.json()) as { result?: `0x${string}`; error?: { message: string } };
  if (body.error) throw new Error(`eth_call failed: ${body.error.message}`);
  if (!body.result) throw new Error("eth_call returned no result");
  return body.result;
}

function role(text: string): void {
  console.log(`\n${text}`);
}

async function main(): Promise<void> {
  const callId = arg("call");
  if (!callId || !/^0x[0-9a-fA-F]{64}$/.test(callId)) {
    console.error("usage: bun scripts/witness-anchor.ts --call 0x<32-byte callId> [--emit-fixture] [--send]");
    process.exit(1);
  }

  // `getCall` has eleven outputs, so viem hands back a positional array; the
  // provenance struct is one tuple output and arrives keyed by name. Both shapes are
  // read through `pick` so a decode change cannot silently yield `undefined`.
  const rawCall = decodeFunctionResult({
    abi: GET_CALL_ABI,
    functionName: "getCall",
    data: await ethCall(PPC, encodeFunctionData({ abi: GET_CALL_ABI, functionName: "getCall", args: [callId as `0x${string}`] })),
  }) as unknown as Record<string | number, unknown>;

  function pick(source: Record<string | number, unknown>, name: string, index: number): unknown {
    const value = source[name] ?? source[index];
    if (value === undefined) throw new Error(`could not read ${name} from the contract response`);
    return value;
  }

  const call = {
    providerId: pick(rawCall, "providerId", 0) as bigint,
    termsHash: pick(rawCall, "termsHash", 7) as `0x${string}`,
    responseHash: pick(rawCall, "responseHash", 9) as `0x${string}`,
  };

  const provenance = decodeFunctionResult({
    abi: GET_PROVENANCE_ABI,
    functionName: "getProvenance",
    data: await ethCall(
      PROVENANCE,
      encodeFunctionData({ abi: GET_PROVENANCE_ABI, functionName: "getProvenance", args: [callId as `0x${string}`] }),
    ),
  });

  if (call.responseHash === `0x${"0".repeat(64)}`) {
    console.error("this call has no committed responseHash: a witness claim would be about nothing");
    process.exit(1);
  }
  if (provenance.recordedAt === 0n) {
    console.error("no provenance record for this call: run scripts/provenance-attest.js first");
    process.exit(1);
  }
  if (provenance.payloadHash !== call.responseHash) {
    console.error(
      `the provenance record names payload ${provenance.payloadHash}, which is not the call's responseHash ${call.responseHash}`,
    );
    process.exit(1);
  }

  const input: WitnessInput = {
    // A callId is a 32-byte key, not an address: `getAddress` rejects it. Lowercase
    // only, so the hash input is the bytes the chain holds.
    callId: callId.toLowerCase() as `0x${string}`,
    providerId: Number(call.providerId),
    termsHash: call.termsHash,
    responseHash: call.responseHash,
    attestor: provenance.attestor,
    originHash: provenance.originHash,
    observedAt: Number(provenance.observedAt),
    recordedAt: Number(provenance.recordedAt),
    // The claim is issued when the record it rests on was written, so re-running
    // this script on the same call produces the same hashes instead of a new claim
    // every time.
    issuedAt: Number(provenance.recordedAt),
  };

  const envelope = buildWitnessEnvelope(input);
  const validity = validateEnvelope(envelope);
  if (!validity.ok) {
    console.error(`refusing to anchor an invalid envelope: ${validity.reasons.join("; ")}`);
    process.exit(1);
  }
  const hashes = anchorHashes(envelope);
  const kind = keccak256(toBytes("witness"));

  role("Call");
  console.log(`  callId      ${input.callId}`);
  console.log(`  providerId  ${input.providerId}`);
  console.log(`  responseHash ${input.responseHash}  (matches the provenance payloadHash)`);
  console.log(`  attestor    ${input.attestor}`);
  console.log(`  observedAt  ${input.observedAt}   recordedAt ${input.recordedAt}`);

  role("Anchor");
  console.log(`  kind            ${kind}  (keccak256("witness"))`);
  console.log(`  claimHash       ${hashes.claimHash}`);
  console.log(`  statementHash   ${hashes.statementHash}`);
  console.log(`  assumptionHash  ${hashes.assumptionHash}`);

  role("Statement");
  console.log(`  ${envelope.claim.statement}`);

  if (flag("emit-fixture")) {
    const fixture = {
      ...input,
      claimKind: "witness",
      statement: envelope.claim.statement,
      assumptions: envelope.claim.assumptions,
      claimHash: hashes.claimHash,
    };
    const path = "src/lib/verification/fixtures/witness.json";
    writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`\nwrote ${path}`);
  }

  if (!flag("send")) {
    role("Sign this at your own terminal (the script does not hold a key):");
    console.log(
      `  cast send ${EVIDENCE} 'anchor(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes)' \\\n` +
        `    ${input.callId} ${kind} ${hashes.claimHash} ${input.responseHash} \\\n` +
        `    ${hashes.statementHash} ${hashes.assumptionHash} 0x \\\n` +
        `    --account owner --rpc-url ${RPC}`,
    );
    return;
  }

  const key = process.env.PRIVATE_KEY;
  if (!key) {
    console.error("--send needs PRIVATE_KEY");
    process.exit(1);
  }
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(key as `0x${string}`);
  const client = createWalletClient({ account, transport: http(RPC) });
  const hash = await client.sendTransaction({
    to: EVIDENCE as `0x${string}`,
    data: encodeFunctionData({
      abi: ANCHOR_ABI,
      functionName: "anchor",
      args: [
        input.callId,
        kind,
        hashes.claimHash,
        input.responseHash,
        hashes.statementHash,
        hashes.assumptionHash,
        "0x",
      ],
    }),
  });
  console.log(`\nsent ${hash}`);
}

await main();
