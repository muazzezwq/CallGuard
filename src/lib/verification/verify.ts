import {
  envelopeDigest,
  subjectUserData,
  validateEnvelope,
  type ClaimKind,
  type ClaimSubject,
  type EvidenceEnvelope,
} from "./schema.js";
import { checkNitroBinding, verifyNitroDoc, type NitroOptions, type NitroResult } from "./nitro.js";
import {
  checkTdxBinding,
  verifyTdxQuote,
  type TdxEvent,
  type TdxOptions,
  type TdxResult,
} from "./tdx.js";
import { checkRisc0Binding, decodeJournal, type Risc0Journal } from "./risc0.js";

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
  /** The guest whose id the journal must name; required only for a RISC Zero receipt. */
  risc0?: { handlerId: string };
  /** TDX verification inputs; required only for an `intel-tdx-quote` proof. */
  tdx?: {
    options: TdxOptions;
    /** The nonce the caller sent to the enclave before it produced the quote. */
    nonce: Uint8Array;
    /** `event_log` returned next to the quote, replayed against RTMR3. */
    events: TdxEvent[];
    /** The exact `app_compose` string the CVM served at `/info`. */
    appCompose: string;
  };
}

export type EvidenceDetail =
  | { kind: "tee-attestation"; platform: "nitro"; nitro: NitroResult }
  | { kind: "tee-attestation"; platform: "tdx"; tdx: TdxResult }
  | { kind: "witness"; record: WitnessRecord }
  | { kind: "zk-execution"; journal: Risc0Journal };

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
  tdx: "intel-tdx-quote",
  witness: "sla-provenance-record",
  risc0: "risc0-groth16-receipt",
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
  if (envelope.proof.type === PROOF_TYPES.tdx) {
    return verifyIntelTdx(envelope, options, base);
  }
  if (envelope.proof.type === PROOF_TYPES.witness) {
    return verifyWitness(envelope, options, base);
  }
  if (envelope.proof.type === PROOF_TYPES.risc0) {
    return verifyRisc0(envelope, options, base);
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
      detail: { kind: "tee-attestation", platform: "nitro", nitro: { ok: false, reasons: [] } },
    };
  }

  const nitro = verifyNitroDoc(doc, options.nitro);
  const binding = checkNitroBinding(nitro, envelope.subject, { allowedPcr0: options.allowedPcr0 });
  return {
    ...base,
    ok: nitro.ok && binding.ok,
    reasons: [...nitro.reasons, ...binding.reasons],
    detail: { kind: "tee-attestation", platform: "nitro", nitro },
  };
}

/**
 * TDX quotes cannot be checked on chain either: the chain is ECDSA over P-256 with
 * collateral, so the registry anchors an attestor's signature over this result.
 * The proof type names the platform so a reader knows which root of trust applied.
 */
export function verifyIntelTdx(
  envelope: EvidenceEnvelope,
  options: VerifyOptions,
  base: Omit<EvidenceReport, "ok" | "reasons" | "detail">,
): EvidenceReport {
  let quote: Uint8Array;
  try {
    quote = decodeProofBytes(envelope.proof.payload);
  } catch (error) {
    return {
      ...base,
      ok: false,
      reasons: [`proof payload is unusable: ${(error as Error).message}`],
      detail: { kind: "tee-attestation", platform: "tdx", tdx: { ok: false, reasons: [], platform: "tdx", advisoryIds: [] } },
    };
  }

  const inputs = options.tdx;
  if (!inputs) {
    return {
      ...base,
      ok: false,
      reasons: [
        "no TDX verifier inputs: a quote is checked against collateral, a nonce, an event log and an app_compose, and none was supplied",
      ],
      detail: { kind: "tee-attestation", platform: "tdx", tdx: { ok: false, reasons: [], platform: "tdx", advisoryIds: [] } },
    };
  }

  const hardware = verifyTdxQuote(quote, inputs.options);
  const bound = checkTdxBinding(
    hardware,
    envelope.subject,
    inputs.nonce,
    inputs.events,
    inputs.appCompose,
    inputs.options,
  );

  return {
    ...base,
    ok: bound.ok,
    reasons: bound.reasons,
    detail: { kind: "tee-attestation", platform: "tdx", tdx: bound },
  };
}

/**
 * A RISC Zero receipt is discharged on chain, by `Risc0ExecutionAdapter` calling the
 * Groth16 verifier. This function therefore cannot say "the seal is valid" — it says
 * whether the journal the proof commits to is about this call, this response and the
 * published guest, and leaves the seal to the registry's anchor. Presenting it as a
 * local verification would be a claim the browser cannot make.
 */
export function verifyRisc0(
  envelope: EvidenceEnvelope,
  options: VerifyOptions,
  base: Omit<EvidenceReport, "ok" | "reasons" | "detail">,
): EvidenceReport {
  const emptyJournal: Risc0Journal = {
    callId: `0x${"0".repeat(64)}`,
    requestHash: `0x${"0".repeat(64)}`,
    responseHash: `0x${"0".repeat(64)}`,
    handlerId: `0x${"0".repeat(64)}`,
  };

  const fail = (reason: string): EvidenceReport => ({
    ...base,
    ok: false,
    reasons: [reason],
    detail: { kind: "zk-execution", journal: emptyJournal },
  });

  let bytes: Uint8Array;
  try {
    bytes = decodeProofBytes(envelope.proof.payload);
  } catch (error) {
    return fail(`proof payload is unusable: ${(error as Error).message}`);
  }

  let journal: Risc0Journal;
  try {
    journal = decodeJournal(`0x${Buffer.from(bytes).toString("hex")}`);
  } catch (error) {
    return fail((error as Error).message);
  }

  const expected = options.risc0;
  if (!expected) {
    return {
      ...base,
      ok: false,
      reasons: [
        "no handler id supplied: the journal names a guest, and without the published id there is nothing to compare it with",
      ],
      detail: { kind: "zk-execution", journal },
    };
  }

  const binding = checkRisc0Binding(journal, envelope.subject, expected);
  return {
    ...base,
    ok: binding.ok,
    reasons: binding.reasons,
    detail: { kind: "zk-execution", journal },
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
