import { encodeAbiParameters, keccak256, toBytes } from "viem";

/**
 * The two component hashes a Solidity attestor stores alongside a claim in
 * `SLAEvidenceRegistryV2` (`statementHash`, `assumptionHash`), computed here so
 * the UI and tests can reproduce exactly the same bytes the contract keeps.
 *
 * The registry hashes the claim's *words*, not its truth: it answers "are these
 * the words the chain anchored", which is what lets a dispute page compare the
 * envelope it renders against `registry.getEvidence(...)` without trusting either
 * string.
 */

/**
 * `keccak256(bytes(statement))` — the string is hashed exactly as given. There is
 * deliberately no `trim()`, no case folding and no unicode normalization here.
 * A "helpful" normalizing helper would let the UI report a match for words the
 * chain never anchored, because the anchored hash is whatever bytes the attestor
 * supplied; only a byte-identical comparison proves the statement matches.
 */
export function statementHash(statement: string): `0x${string}` {
  return keccak256(toBytes(statement));
}

/**
 * `keccak256(abi.encode(string[] assumptions))` — ABI-encodes the whole list, so
 * the hash is order-sensitive by construction. A set-valued hash (sorted before
 * hashing, say) would hide a reordering: swapping two assumptions has economic
 * meaning ("this proof holds *even if* the verifier bytecode differs"?), so the
 * order the chain pinned has to be the order the UI read back.
 */
export function assumptionHash(assumptions: string[]): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: "string[]" }], [assumptions]));
}
