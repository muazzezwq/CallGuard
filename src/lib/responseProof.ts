import { keccak256, toBytes } from "viem";

/**
 * Response binding for B3a.
 *
 * The provider already commits to `responseHash` when it submits a receipt, but
 * nobody checked that the body the caller actually received hashes to it. These
 * helpers let the caller do that check locally: same bytes in, same hash out, so a
 * provider that delivers one payload and commits to another is caught by anyone.
 *
 * What this proves: the delivered payload is the one the provider committed to and
 * cannot be swapped afterwards. What it does not prove: that the payload is a
 * correct answer to the request. That gap (B3b) needs attested execution.
 */

export type PayloadCheckStatus = "match" | "mismatch" | "uncommitted" | "invalid";

export interface PayloadCheck {
  status: PayloadCheckStatus;
  /** keccak256 of the payload exactly as given. */
  computed: `0x${string}`;
  /** The commitment read from the call record, normalised to lowercase. */
  committed?: `0x${string}`;
}

const ZERO_HASH = `0x${"0".repeat(64)}`;

/** keccak256 over the raw UTF-8 bytes. No trimming: the provider hashed raw bytes. */
export function hashPayload(payload: string): `0x${string}` {
  return keccak256(toBytes(payload));
}

/**
 * Compare a delivered payload against the `responseHash` stored for the call.
 *
 * `uncommitted` means the call has no hash yet (no receipt submitted), and
 * `invalid` means the stored value is not a 32-byte hash — neither is a match.
 */
export function checkPayloadAgainstCommitment(
  payload: string,
  committed?: string | null,
): PayloadCheck {
  const computed = hashPayload(payload);
  const raw = (committed ?? "").trim();

  if (raw === "") {
    return { status: "uncommitted", computed };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    return { status: "invalid", computed };
  }

  const normalised = raw.toLowerCase() as `0x${string}`;
  if (normalised === ZERO_HASH) {
    return { status: "uncommitted", computed, committed: normalised };
  }

  return {
    status: computed.toLowerCase() === normalised ? "match" : "mismatch",
    computed,
    committed: normalised,
  };
}

/**
 * Wrap the delivered payload as dispute evidence. The arbiter can recompute
 * `keccak256(deliveredPayload)` and compare it with `committedResponseHash`, so
 * "the provider delivered X but committed to Y" stops being a matter of opinion.
 */
export function buildPayloadEvidence(args: {
  callId: string;
  committed: string;
  payload: string;
}): string {
  const body = {
    callId: args.callId,
    claim: "Delivered payload does not match the committed response (keccak256)",
    committedResponseHash: args.committed,
    deliveredPayload: args.payload,
  };
  return `data:application/json,${JSON.stringify(body)}`;
}
