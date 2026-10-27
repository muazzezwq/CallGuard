/**
 * GET /api/evidence?callId=0x…&kind=zk-execution
 *
 * Serves a claim envelope next to what `SLAEvidenceRegistryV2` anchored for the
 * same `(callId, kind)`, and a hash comparison between the two. It is a mirror,
 * not a trust root: it never labels anything "verified" — the response carries
 * `match`, which is the comparison of four hashes, never a verdict about whether
 * the statement is true.
 *
 * The only bundled envelope is the committed zk-execution fixture. For any other
 * `(callId, kind)` the endpoint reports what the chain anchored and nothing else;
 * it never invents an envelope the caller did not ask for.
 */

// The deploy runtime (nodejs24.x, ESM) rejects a bare JSON import with
// `needs an import attribute of "type: json"`; createRequire loads it under both
// bun and node and keeps the fixture traced into the function bundle on every runtime.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fixture = require("../src/lib/verification/fixtures/zk-execution.json");
import { CG_CLAIM_VERSION, envelopeDigest } from "../src/lib/verification/schema.js";
import { assumptionHash, statementHash } from "../src/lib/verification/claimHashes.js";
import { encodeFunctionData, decodeFunctionResult, keccak256, toBytes } from "viem";
import { getRpcUrl } from "./_rpc.js";

// The claim kinds cg-claim/1 defines. A kind outside this list cannot have a
// bundled envelope, so the chain row for it would serve nothing to compare.
const KINDS = new Set(["witness", "tee-attestation", "zk-constraint", "zk-execution"]);

// getEvidence returns the same `Evidence` struct the V2 contract stores; all seven
// fields are static, so the return data is seven words, no offsets.
const SLA_EVIDENCE_ABI_V2 = [
  {
    name: "getEvidence",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "callId", type: "bytes32" },
      { name: "kind", type: "bytes32" },
    ],
    outputs: [
      {
        name: "evidence",
        type: "tuple",
        components: [
          { name: "kind", type: "bytes32" },
          { name: "claimHash", type: "bytes32" },
          { name: "responseHash", type: "bytes32" },
          { name: "statementHash", type: "bytes32" },
          { name: "assumptionHash", type: "bytes32" },
          { name: "verifier", type: "address" },
          { name: "anchoredAt", type: "uint64" },
        ],
      },
    ],
  },
];

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Map the flat fixture into an `EvidenceEnvelope`. The fixture is flat (top-level
 * `callId`, `statement`, …) because it is the proof artifact; the envelope groups
 * the same fields the way `envelopeDigest` expects. The proof payload is carried
 * through unchanged — `envelopeDigest` never reads it, which is exactly why a
 * re-encoded proof cannot move the anchored hash.
 */
function envelopeFromFixture(f) {
  return {
    version: CG_CLAIM_VERSION,
    subject: {
      callId: f.callId,
      providerId: f.providerId,
      termsHash: f.termsHash,
      responseHash: f.responseHash,
    },
    claim: { kind: "zk-execution", statement: f.statement, assumptions: f.assumptions },
    proof: { type: "risc0-groth16-receipt", payload: f.journal },
    issuedAt: f.issuedAt,
  };
}

const EMPTY = Object.freeze({
  anchored: false,
  claimHash: null,
  envelope: null,
  digest: null,
  statementHash: null,
  assumptionHash: null,
  anchoredStatementHash: null,
  anchoredAssumptionHash: null,
  match: false,
  source: null,
});

async function readAnchoredFromChain(callId, kind32, env) {
  const registry = env.SLA_EVIDENCE_V2 || env.VITE_SLA_EVIDENCE_V2 || "";
  if (!registry) return null;
  const rpcUrl = getRpcUrl(env);
  if (!rpcUrl) return null;

  const data = encodeFunctionData({
    abi: SLA_EVIDENCE_ABI_V2,
    functionName: "getEvidence",
    args: [callId, kind32],
  });
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: registry, data }, "latest"] }),
    signal: AbortSignal.timeout(3000),
  });
  const body = await response.json();
  if (body?.error) return null;
  const [row] = decodeFunctionResult({
    abi: SLA_EVIDENCE_ABI_V2,
    functionName: "getEvidence",
    data: body.result,
  });
  // An empty claimHash means "nothing anchored for this pair", not an error.
  if (!row || row.claimHash === `0x${"0".repeat(64)}`) return null;
  return row;
}

/**
 * The testable handler. `deps.readAnchored(callId, kind32)` resolves the on-chain
 * `getEvidence` row (or `null` when nothing is anchored); the default asks the
 * environment's SLA_EVIDENCE_V2 (or VITE_SLA_EVIDENCE_V2) registry over the shared
 * RPC resolver. Tests inject a stub and never touch the network.
 *
 * @param {{ callId?: unknown, kind?: unknown }} query
 * @param {{ readAnchored?: (callId: `0x${string}`, kind32: `0x${string}`) => Promise<object|null> }} [deps]
 */
export async function handle(query, deps = {}) {
  const callId = typeof query?.callId === "string" ? query.callId.toLowerCase() : "";
  const kind = typeof query?.kind === "string" ? query.kind : "";

  // Serve nothing on chain for an input that is not a call of this registry: an
  // unnormalized or partial callId can never be a subject anyway.
  if (!HASH_RE.test(callId)) {
    return { callId: query?.callId ?? null, kind, ...EMPTY };
  }

  // The chain row is looked up even when the fixture stays silent, so the
  // response always answers exactly what some attestor anchored — nothing more.
  let anchored = false;
  let row = null;
  if (KINDS.has(kind)) {
    const readAnchored = deps.readAnchored ?? ((id, k32) => readAnchoredFromChain(id, k32, process.env));
    try {
      row = await readAnchored(callId, keccak256(toBytes(kind)));
      anchored = row !== null;
    } catch {
      anchored = false;
    }
  }

  // Never return a fixture envelope for a callId/kind the fixture does not
  // describe: a miss stays null instead of an envelope about another call.
  const bundles = kind === "zk-execution" && callId === fixture.callId.toLowerCase();
  const envelope = bundles ? envelopeFromFixture(fixture) : null;
  const digest = envelope ? envelopeDigest(envelope) : null;

  const statementHashEnvelope = envelope ? statementHash(envelope.claim.statement) : null;
  const assumptionHashEnvelope = envelope ? assumptionHash(envelope.claim.assumptions) : null;

  // All four hashes must agree. A partial match (right claim hash, different
  // statement) is not a match — it is the drift the UI has to show.
  const match =
    anchored &&
    envelope !== null &&
    digest === row.claimHash &&
    statementHashEnvelope === row.statementHash &&
    assumptionHashEnvelope === row.assumptionHash;

  return {
    callId,
    kind,
    anchored,
    claimHash: row ? row.claimHash : null,
    envelope,
    digest,
    statementHash: statementHashEnvelope,
    assumptionHash: assumptionHashEnvelope,
    anchoredStatementHash: row ? row.statementHash : null,
    anchoredAssumptionHash: row ? row.assumptionHash : null,
    match,
    source: envelope ? "fixture" : null,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const payload = await handle(req.query ?? {});
  // 404 when there is nothing to show at all: no anchored row and no bundled
  // envelope. 200 otherwise, even when match is false — a hash mismatch is data.
  const status = payload.envelope || payload.anchored ? 200 : 404;
  res.setHeader("Content-Type", "application/json");
  return res.status(status).json(payload);
}
