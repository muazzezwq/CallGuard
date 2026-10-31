import { decodeAbiParameters, parseAbiParameters } from "viem";

import type { ClaimSubject } from "./schema.js";

/**
 * RISC Zero execution receipts, off chain.
 *
 * What the artifact proves is decided on chain, not here: `Risc0ExecutionAdapter`
 * hands the seal to `RiscZeroGroth16Verifier`, which discharges it against the
 * control root it was deployed with. What this module does is the part that can
 * disagree silently — reading the journal and asking whether it is about the call
 * and the response the page is showing. A journal that decodes but names another
 * response is exactly how a real proof becomes a misleading page.
 *
 * The journal is `abi.encode(bytes32 callId, bytes32 requestHash, bytes32
 * responseHash, bytes32 handlerId, bytes32 claimHash)`, 160 bytes, written by the
 * guest in `zk-execution/methods/guest`. The fifth word is what binds the seal to
 * the envelope: a proof produced for one statement cannot be re-anchored under
 * another, because the adapter compares that word with the claim it is asked to
 * verify. Journals of 128 bytes come from the earlier guest and carry no binding;
 * they decode with `claimHashBound: false` instead of silently passing.
 *
 * Deliberately checked, and deliberately not:
 * - `callId` and `responseHash` are compared with the envelope subject;
 * - `handlerId` is compared with the guest the repository published;
 * - `claimHash` is compared when the caller passes the envelope's own digest, and a
 *   legacy journal is reported as unbound rather than as a match;
 * - `requestHash` is carried and displayed but not compared, because a `cg-claim/1`
 *   subject has no request commitment. The chain is its source: the adapter also
 *   compares it with `PayPerCallV8.getCall(callId).requestHash`.
 */

export const JOURNAL_BYTES = 160;
export const LEGACY_JOURNAL_BYTES = 128;

export interface Risc0Journal {
  callId: `0x${string}`;
  requestHash: `0x${string}`;
  responseHash: `0x${string}`;
  handlerId: `0x${string}`;
  /** Envelope digest, present only in journals from the claim-binding guest. */
  claimHash?: `0x${string}`;
  /** False for a 128-byte journal, which the binding guest never produced. */
  claimHashBound: boolean;
}

export interface Risc0Binding {
  ok: boolean;
  reasons: string[];
}

const JOURNAL_PARAMS = parseAbiParameters("bytes32 callId, bytes32 requestHash, bytes32 responseHash, bytes32 handlerId");
const JOURNAL_PARAMS_BOUND = parseAbiParameters(
  "bytes32 callId, bytes32 requestHash, bytes32 responseHash, bytes32 handlerId, bytes32 claimHash",
);

/** Strict on length: 160 is the binding guest, 128 is the guest it replaced. */
export function decodeJournal(journalHex: string): Risc0Journal {
  const body = journalHex.startsWith("0x") ? journalHex.slice(2) : journalHex;
  if (!/^[0-9a-fA-F]*$/.test(body) || body.length % 2 !== 0) {
    throw new Error("journal is not hex");
  }
  const bytes = body.length / 2;
  if (bytes === LEGACY_JOURNAL_BYTES) {
    const [callId, requestHash, responseHash, handlerId] = decodeAbiParameters(
      JOURNAL_PARAMS,
      `0x${body}` as `0x${string}`,
    );
    return { callId, requestHash, responseHash, handlerId, claimHashBound: false };
  }
  if (bytes !== JOURNAL_BYTES) {
    throw new Error(`journal must be ${JOURNAL_BYTES} bytes (or ${LEGACY_JOURNAL_BYTES} legacy), got ${bytes}`);
  }
  const [callId, requestHash, responseHash, handlerId, claimHash] = decodeAbiParameters(
    JOURNAL_PARAMS_BOUND,
    `0x${body}` as `0x${string}`,
  );
  return { callId, requestHash, responseHash, handlerId, claimHash, claimHashBound: true };
}

export function checkRisc0Binding(
  journal: Risc0Journal,
  subject: ClaimSubject,
  expected: { handlerId: string; claimHash?: string },
): Risc0Binding {
  const reasons: string[] = [];

  if (journal.callId.toLowerCase() !== subject.callId.toLowerCase()) {
    reasons.push(`journal callId ${journal.callId} is not the claim's callId ${subject.callId}`);
  }
  if (journal.responseHash.toLowerCase() !== subject.responseHash.toLowerCase()) {
    reasons.push(
      `journal responseHash ${journal.responseHash} is not the committed responseHash ${subject.responseHash}`,
    );
  }
  if (journal.handlerId.toLowerCase() !== expected.handlerId.toLowerCase()) {
    reasons.push(
      `journal handlerId ${journal.handlerId} is not the published handler ${expected.handlerId}`,
    );
  }
  if (expected.claimHash) {
    if (!journal.claimHashBound) {
      reasons.push("journal predates claim binding: it carries no claimHash, so the seal does not constrain this envelope");
    } else if (journal.claimHash?.toLowerCase() !== expected.claimHash.toLowerCase()) {
      reasons.push(
        `journal claimHash ${journal.claimHash} is not the envelope's claimHash ${expected.claimHash}`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}
