/**
 * Decoder for the `Evidence` struct `SLAEvidenceRegistry` (v1) and
 * `SLAEvidenceRegistryV2` return from `getEvidence`. The two layouts differ in
 * width:
 *
 *   v1 (5 words):  kind, claimHash, responseHash, verifier, anchoredAt
 *   v2 (7 words):  kind, claimHash, responseHash, statementHash, assumptionHash, verifier, anchoredAt
 *
 * The decoder is deliberately dumb about content: the MATCH badge is computed
 * by callers against `statementHash()`/`assumptionHash()` from `claimHashes.ts`,
 * so every field is passed through byte-for-byte, no case folding, no
 * normalization. It never throws: a registry answered with these words, and a
 * failed decode must read as "unreadable row", not a crash.
 */
import { keccak256, toBytes } from "viem";

export interface EvidenceRecord {
  claimHash: string;
  responseHash: string;
  /** v2 only: digest of the statement text; absent on a v1 row. */
  statementHash?: string;
  /** v2 only: digest of the assumption list; absent on a v1 row. */
  assumptionHash?: string;
  verifier: string;
  anchoredAt: number;
  /** Which registry shape the words came from. */
  source: "v1" | "v2";
}

/** `SLAEvidenceRegistry.VerifierMode`. The difference is the whole trust story:
 *  0 = none configured, 1 = verified off chain and vouched for by a key,
 *  2 = proof checked on chain by the verifier contract. */
export const EVIDENCE_MODES = [
  "no verifier",
  "off-chain check, signed by a key",
  "checked on chain",
] as const;

/** The claim kinds the verification layer can record. Each label names the
 *  claim instead of saying "verified", because the tiers prove different things.
 *  `name` is the wire name `/api/evidence` answers for; `kind` is its keccak.
 *  Shared by the Verify panel and the Disputes evidence snapshot card. */
export const EVIDENCE_KINDS = [
  // The one proof this repository can point at a committed artifact for: a RISC Zero
  // receipt about the call's execution, verified on chain by `Risc0ExecutionAdapter`.
  { label: "ZK execution proof", name: "zk-execution", kind: keccak256(toBytes("zk-execution")) },
  { label: "ZK output constraint", name: "zk-constraint", kind: keccak256(toBytes("zk-constraint")) },
  { label: "TEE execution image", name: "tee-attestation", kind: keccak256(toBytes("tee-attestation")) },
  { label: "Witness observation", name: "witness", kind: keccak256(toBytes("witness")) },
] as const;

export const EVIDENCE_KIND_NAMES = new Map<string, string>(EVIDENCE_KINDS.map(({ label, name }) => [label, name]));

/** String(v) then BigInt, tolerating hex strings, decimal strings and bigints. */
function toUint64(value: unknown): number {
  const n = BigInt(String(value));
  return Number(n < 0n ? 0n : n <= BigInt(Number.MAX_SAFE_INTEGER) ? n : n);
}

/**
 * Decode one `getEvidence` return. Returns null when the word count is neither
 * 5 (v1) nor 7 (v2) — the count is the only layout discriminator — and coerces
 * fields defensively instead of throwing on unexpected words.
 */
export function decodeEvidence(words: readonly unknown[]): EvidenceRecord | null {
  try {
    if (words.length !== 5 && words.length !== 7) return null;
    const source = words.length === 7 ? "v2" : "v1";
    // v2 inserts statementHash/assumptionHash at [3]/[4]; verifier is at index 5
    // for v2 and 3 for v1, anchoredAt at 6 resp. 4.
    const statementHash = source === "v2" ? String(words[3]) : undefined;
    const assumptionHash = source === "v2" ? String(words[4]) : undefined;
    return {
      claimHash: String(words[1]),
      responseHash: String(words[2]),
      ...(statementHash !== undefined ? { statementHash } : {}),
      ...(assumptionHash !== undefined ? { assumptionHash } : {}),
      verifier: String(words[source === "v2" ? 5 : 3]),
      anchoredAt: toUint64(words[source === "v2" ? 6 : 4]),
      source,
    } satisfies EvidenceRecord;
  } catch {
    return null;
  }
}
