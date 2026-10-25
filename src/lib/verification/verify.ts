import {
  envelopeDigest,
  subjectUserData,
  validateEnvelope,
  type ClaimKind,
  type ClaimSubject,
  type EvidenceEnvelope,
} from "./schema";
import { checkNitroBinding, verifyNitroDoc, type NitroOptions, type NitroResult } from "./nitro";

/**
 * Envelope-level verification: pick the verifier the proof names, run it, and
 * report the claim that survived.
 *
 * The report carries `statement` and `assumptions` because a boolean cannot. Two
 * very different artifacts — "an enclave with this image ran" and "a witness saw
 * these bytes" — both reduce to `ok: true`, and pretending they are the same claim
 * is how a marketplace ends up advertising correctness it never checked.
 */

export interface WitnessRecord {
  payloadHash: string;
  attestor: string;
  originHash: string;
  observedAt: number;
  recordedAt: number;
}

export interface VerifyOptions {
  nitro: NitroOptions;
  /** PCR0 values the caller considers acceptable for this claim. */
  allowedPcr0: string[];
  /** On-chain `SLAProvenance` record, when the caller fetched one. */
  witness?: WitnessRecord;
}

export type EvidenceDetail =
  | { kind: "tee-attestation"; nitro: NitroResult }
  | { kind: "witness"; record: WitnessRecord };

export interface EvidenceReport {
  ok: boolean;
  reasons: string[];
  claim: ClaimKind;
  statement: string;
  assumptions: string[];
  /** Digest the registry anchors. Proof bytes are excluded by design. */
  digest: `0x${string}`;
  /** The 32 bytes an enclave should put in `userData` for this subject. */
  userData: `0x${string}`;
  detail: EvidenceDetail;
}

const PROOF_TYPES = {
  tee: "aws-nitro-attestation-doc",
  witness: "sla-provenance-record",
} as const;

export function encodeProofBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function decodeProofBytes(payload: string): Uint8Array {
  const normalised = payload.trim();
  if (normalised === "") throw new Error("proof payload is empty");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalised)) throw new Error("proof payload is not base64");
  const decoded = Buffer.from(normalised, "base64");
  if (decoded.length === 0) throw new Error("proof payload decodes to nothing");
  return new Uint8Array(decoded);
}

export function verifyEvidence(envelope: EvidenceEnvelope, options: VerifyOptions): EvidenceReport {
  const digest = envelopeDigest(envelope);
  const base = {
    claim: envelope.claim?.kind,
    statement: envelope.claim?.statement ?? "",
    assumptions: envelope.claim?.assumptions ?? [],
    digest,
    userData: envelope.subject ? subjectUserData(envelope.subject) : (`0x${"0".repeat(64)}` as const),
  };

  const shape = validateEnvelope(envelope);
  if (!shape.ok) {
    return {
      ...base,
      ok: false,
      reasons: shape.reasons,
      detail: { kind: "witness", record: emptyWitness() },
    };
  }

  if (envelope.proof.type === PROOF_TYPES.tee) {
    return verifyTee(envelope, options, base);
  }
  if (envelope.proof.type === PROOF_TYPES.witness) {
    return verifyWitness(envelope, options, base);
  }

  return {
    ...base,
    ok: false,
    reasons: [`no verifier for proof type "${envelope.proof.type}"`],
    detail: { kind: "witness", record: emptyWitness() },
  };
}

export function verifyTee(
  envelope: EvidenceEnvelope,
  options: VerifyOptions,
  base: Omit<EvidenceReport, "ok" | "reasons" | "detail">,
): EvidenceReport {
  let doc: Uint8Array;
  try {
    doc = decodeProofBytes(envelope.proof.payload);
  } catch (error) {
    return {
      ...base,
      ok: false,
      reasons: [`proof payload is unusable: ${(error as Error).message}`],
      detail: { kind: "tee-attestation", nitro: { ok: false, reasons: [] } },
    };
  }

  const nitro = verifyNitroDoc(doc, options.nitro);
  const binding = checkNitroBinding(nitro, envelope.subject, { allowedPcr0: options.allowedPcr0 });
  return {
    ...base,
    ok: nitro.ok && binding.ok,
    reasons: [...nitro.reasons, ...binding.reasons],
    detail: { kind: "tee-attestation", nitro },
  };
}

export function verifyWitness(
  envelope: EvidenceEnvelope,
  options: VerifyOptions,
  base: Omit<EvidenceReport, "ok" | "reasons" | "detail">,
): EvidenceReport {
  const record = options.witness;
  if (!record || record.recordedAt === 0) {
    return {
      ...base,
      ok: false,
      reasons: ["no on-chain provenance record for this call"],
      detail: { kind: "witness", record: record ?? emptyWitness() },
    };
  }

  const reasons: string[] = [];
  if (record.payloadHash.toLowerCase() !== envelope.subject.responseHash.toLowerCase()) {
    reasons.push(
      `on-chain payloadHash ${record.payloadHash} is not the committed responseHash ${envelope.subject.responseHash}`,
    );
  }

  return { ...base, ok: reasons.length === 0, reasons, detail: { kind: "witness", record } };
}

function emptyWitness(): WitnessRecord {
  return {
    payloadHash: `0x${"0".repeat(64)}`,
    attestor: `0x${"0".repeat(40)}`,
    originHash: `0x${"0".repeat(64)}`,
    observedAt: 0,
    recordedAt: 0,
  };
}

/** Re-exported so callers do not reach into `schema` for the common type. */
export type { ClaimSubject, EvidenceEnvelope };
