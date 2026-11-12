# CG-EVD-01 — the claim's words are not proof inputs

Status: open, and it cannot be closed in this repository. This note records what
closing it would take so the next attempt does not start from scratch.

## What the audit found

`SLAEvidenceRegistryV2.anchor` takes `statementHash` and `assumptionHash` and
stores them (`contracts/SLAEvidenceRegistryV2.sol:165-200`), and it rejects an
empty one (`:172`). They are part of the anchor digest
(`anchorDigest(callId, kind, claimHash, responseHash, statementHash, assumptionHash)`,
`:181`, `:220`).

That digest is not what any verifier checks. `ZkClaimAdapter` rebuilds the
circuit's public inputs from `callId`, `responseHash` and the predicate byte only
(`contracts/zk/ZkClaimAdapter.sol:22-31`, `:46-49`), and its own comment says
`claimHash` is "deliberately not part of the circuit". A `zk-execution` seal binds
the journal, which carries `(callId, requestHash, responseHash, handlerId)` and
nothing about the statement.

Consequence: the proof is real and the hashes are immutable, but the sentence the
claim is described by is only as trustworthy as whoever called `anchor`. An
attestor can present a valid proof and describe it falsely, and every on-chain
check still passes.

## Why no source fix exists here

The fix is one more public input on the constraint circuit and one more journal
field on the execution guest:

1. Noir circuit: add `claim_hash` to the public inputs and constrain it against
   the envelope. No `*.nr` file and no `Nargo.toml` are committed to this
   repository, so the circuit source is not here to edit.
2. Re-run `bb write_vk -t evm` and regenerate the Solidity verifier. The checked-in
   `KeccakClaimVerifier.sol` pins `NUMBER_OF_PUBLIC_INPUTS = 73` and a `VK_HASH`;
   changing the inputs changes both, and the file is generated.
3. `ZkClaimAdapter` then takes `claimHash` as a fourth input and appends 32 field
   elements to the array (`HASH_WORDS * 3 + 1`).
4. RISC Zero guest: add `claim_hash` to the committed journal and `EXPECTED_IMAGE_ID`
   moves, which needs the x86 Groth16 prover in
   `.github/workflows/zk-execution.yml` (requested with `[prove]`).
5. New verifier + adapter deployment, `setProofVerifier` for each kind, and a fresh
   anchor for any claim whose binding must be relied on.

Steps 2 and 4 cannot run on this machine or in this repository alone, and step 5
is a deployment that changes which registry rows exist.

## What is true today

- The proof itself is sound: `zk-constraint` proves a preimage for the committed
  hash and `zk-execution` proves the published guest ran and committed the four
  journal fields.
- `responseHash`, `callId` and `handlerId` are bound to chain state.
- The statement and assumptions are bound to the claim by the registry digest and
  by nothing else, so they are a claim about the claim.

Do not describe an anchored row as "proves the statement". It proves the predicate
and it records the words.
