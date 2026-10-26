import { decodeAbiParameters, parseAbiParameters } from "viem";

import type { ClaimSubject } from "./schema";

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
 * responseHash, bytes32 handlerId)`, 128 bytes, written by the guest in
 * `zk-execution/methods/guest`; the adapter rejects any other length.
 *
 * Deliberately checked, and deliberately not:
 * - `callId` and `responseHash` are compared with the envelope subject;
 * - `handlerId` is compared with the guest the repository published;
 * - `requestHash` is carried and displayed but not compared, because a `cg-claim/1`
 *   subject has no request commitment. The chain is its source: the adapter also
 *   compares it with `PayPerCallV8.getCall(callId).requestHash`.
 */

export const JOURNAL_BYTES = 128;

export interface Risc0Journal {
  callId: `0x${string}`;
  requestHash: `0x${string}`;
  responseHash: `0x${string}`;
  handlerId: `0x${string}`;
}

export interface Risc0Binding {
  ok: boolean;
  reasons: string[];
}

const JOURNAL_PARAMS = parseAbiParameters("bytes32 callId, bytes32 requestHash, bytes32 responseHash, bytes32 handlerId");

/** Strict: the guest always emits 128 bytes, so any other length is a different program. */
export function decodeJournal(journalHex: string): Risc0Journal {
  const body = journalHex.startsWith("0x") ? journalHex.slice(2) : journalHex;
  if (!/^[0-9a-fA-F]*$/.test(body) || body.length % 2 !== 0) {
    throw new Error("journal is not hex");
  }
  if (body.length / 2 !== JOURNAL_BYTES) {
    throw new Error(`journal must be ${JOURNAL_BYTES} bytes, got ${body.length / 2}`);
  }
  const [callId, requestHash, responseHash, handlerId] = decodeAbiParameters(
    JOURNAL_PARAMS,
    `0x${body}` as `0x${string}`,
  );
  return { callId, requestHash, responseHash, handlerId };
}

export function checkRisc0Binding(
  journal: Risc0Journal,
  subject: ClaimSubject,
  expected: { handlerId: string },
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

  return { ok: reasons.length === 0, reasons };
}
