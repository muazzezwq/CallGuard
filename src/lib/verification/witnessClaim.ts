import { envelopeDigest, type EvidenceEnvelope } from "./schema.js";
import { assumptionHash, statementHash } from "./claimHashes.js";

/**
 * The `witness` claim as data.
 *
 * `SLAProvenance` stores one record per call: who attested, what payload hash they
 * saw, which origin it came from, and when. This module turns that record into the
 * envelope `SLAEvidenceRegistryV2` anchors, so the anchor script, the bundled
 * fixture and the UI all derive the same bytes instead of each formatting the
 * sentence its own way.
 *
 * The statement stays inside what the record proves. It does not say the answer is
 * correct, and it does not say the attestor is honest — both are assumptions, and
 * an assumption a reader cannot see is one they cannot price.
 */

export const WITNESS_PROOF_TYPE = "sla-provenance-record";

export interface WitnessInput {
  callId: `0x${string}`;
  providerId: number;
  termsHash: `0x${string}`;
  responseHash: `0x${string}`;
  /** The key that signed the provenance record, as `SLAProvenance` stored it. */
  attestor: `0x${string}`;
  /** `keccak256(bytes(origin))` — the origin string itself stays off chain. */
  originHash: `0x${string}`;
  /** When the attestor says it saw the payload. */
  observedAt: number;
  /** When the record was written on chain. `0` means there is no record. */
  recordedAt: number;
  issuedAt: number;
}

export function buildWitnessEnvelope(input: WitnessInput): EvidenceEnvelope {
  const statement =
    `An allowlisted attestor ${input.attestor} recorded on chain that it saw this call's payload ` +
    `${input.responseHash} at origin ${input.originHash}, observed at ${input.observedAt} and ` +
    `recorded at ${input.recordedAt}.`;

  const assumptions = [
    `the attestor key is independent of the provider: a key this repository controls makes this claim "trust CallGuard's witness", not an independent one`,
    "the attestor's own log is honest about the bytes it fetched and the origin it fetched them from",
    "this claim records provenance, not correctness: it does not say the answer is correct",
  ];

  return {
    version: "cg-claim/1",
    subject: {
      callId: input.callId,
      providerId: input.providerId,
      termsHash: input.termsHash,
      responseHash: input.responseHash,
    },
    claim: { kind: "witness", statement, assumptions },
    // The proof is the on-chain record itself; the payload is carried for humans and
    // is never read by `envelopeDigest`, so re-encoding it cannot move the anchor.
    proof: {
      type: WITNESS_PROOF_TYPE,
      payload: `attestor=${input.attestor};observedAt=${input.observedAt};recordedAt=${input.recordedAt}`,
    },
    issuedAt: input.issuedAt,
  };
}

/**
 * The three hashes `anchor()` takes. `claimHash` digests the claim and not the
 * proof, which is why the registry can anchor a claim whose proof never leaves the
 * caller's machine.
 */
export function anchorHashes(envelope: EvidenceEnvelope): {
  claimHash: `0x${string}`;
  statementHash: `0x${string}`;
  assumptionHash: `0x${string}`;
} {
  return {
    claimHash: envelopeDigest(envelope),
    statementHash: statementHash(envelope.claim.statement),
    assumptionHash: assumptionHash(envelope.claim.assumptions),
  };
}
