import { encodePacked, keccak256 } from "viem";

/**
 * Evidence envelope for the modular verification layer.
 *
 * The rule this file exists to enforce: an artifact may not say "verified". It
 * says which claim was verified, under which assumptions, for which call. A proof
 * of execution and a proof of factual correctness look identical in a green badge,
 * so the claim has to be data, not a label.
 */

export const CG_CLAIM_VERSION = "cg-claim/1";

/** The claim shapes CallGuard can actually check today. */
export type ClaimKind = "witness" | "tee-attestation" | "zk-constraint" | "zk-execution";

/** What the evidence is about. Every field also exists on chain for the call. */
export interface ClaimSubject {
  callId: `0x${string}`;
  providerId: number;
  /** Terms version hash snapshotted at call start; a proof cannot outlive it. */
  termsHash: `0x${string}`;
  /** The `responseHash` the provider committed to in its receipt. */
  responseHash: `0x${string}`;
}

export interface ClaimStatement {
  kind: ClaimKind;
  /** One sentence, exact. Never "the answer is correct". */
  statement: string;
  /** What the reader has to trust for the statement to hold. */
  assumptions: string[];
}

export interface EvidenceEnvelope {
  version: typeof CG_CLAIM_VERSION;
  subject: ClaimSubject;
  claim: ClaimStatement;
  /** Opaque to the schema: the verifier named by `type` owns this format. */
  proof: { type: string; payload: string };
  issuedAt: number;
}

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const KINDS: ClaimKind[] = ["witness", "tee-attestation", "zk-constraint", "zk-execution"];

function isHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && HASH_RE.test(value);
}

/**
 * Reject anything whose claim is not stated. An envelope with no statement, no
 * assumption, or an unknown kind is not evidence — it is a green badge pretending
 * to be evidence.
 */
export function validateEnvelope(envelope: EvidenceEnvelope): ValidationResult {
  const reasons: string[] = [];

  if (envelope?.version !== CG_CLAIM_VERSION) {
    reasons.push(`version must be ${CG_CLAIM_VERSION}`);
  }

  const subject = envelope?.subject;
  if (!subject) {
    reasons.push("subject is required");
  } else {
    if (!isHash(subject.callId)) reasons.push("subject.callId must be a 32-byte hash");
    if (!isHash(subject.termsHash)) reasons.push("subject.termsHash must be a 32-byte hash");
    if (!isHash(subject.responseHash)) reasons.push("subject.responseHash must be a 32-byte hash");
    if (!Number.isSafeInteger(subject.providerId) || subject.providerId < 0) {
      reasons.push("subject.providerId must be a non-negative integer");
    }
  }

  const claim = envelope?.claim;
  if (!claim) {
    reasons.push("claim is required");
  } else {
    if (!KINDS.includes(claim.kind)) reasons.push(`claim.kind must be one of ${KINDS.join(", ")}`);
    if (typeof claim.statement !== "string" || claim.statement.trim() === "") {
      reasons.push("claim.statement is required: an unnamed claim proves nothing");
    }
    if (!Array.isArray(claim.assumptions) || claim.assumptions.length === 0) {
      reasons.push("claim.assumptions must name at least one trust assumption");
    }
  }

  const proof = envelope?.proof;
  if (!proof || typeof proof.type !== "string" || proof.type.trim() === "") {
    reasons.push("proof.type is required");
  } else if (typeof proof.payload !== "string" || proof.payload.trim() === "") {
    reasons.push("proof.payload is required");
  }

  if (!Number.isSafeInteger(envelope?.issuedAt) || envelope.issuedAt <= 0) {
    reasons.push("issuedAt must be a positive unix timestamp");
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Digest the parts of an envelope that make a claim — not the proof bytes. Two
 * envelopes that claim the same thing about the same call hash identically no
 * matter how their proof is encoded, which is what lets the registry anchor the
 * claim while the proof stays off chain.
 *
 * Built from an explicit field array: JSON key order and whitespace cannot move it.
 */
export function envelopeDigest(envelope: EvidenceEnvelope): `0x${string}` {
  const { subject, claim } = envelope;
  const canonical = JSON.stringify([
    envelope.version,
    subject.callId.toLowerCase(),
    subject.providerId,
    subject.termsHash.toLowerCase(),
    subject.responseHash.toLowerCase(),
    claim.kind,
    claim.statement,
    claim.assumptions,
    envelope.issuedAt,
  ]);
  return keccak256(encodePacked(["string"], [canonical]));
}

/**
 * The 32 bytes an enclave should place in `userData`. This is the binding between
 * the hardware statement and one call: response hash alone would let an attestor
 * replay a good attestation onto a different call under the same terms.
 */
export function subjectUserData(subject: ClaimSubject): `0x${string}` {
  return keccak256(
    encodePacked(
      ["bytes32", "bytes32", "bytes32"],
      [subject.callId, subject.termsHash, subject.responseHash],
    ),
  );
}
