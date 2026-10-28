# Verification layer — design

Status: prototype, additive to the v8 deployment. Nothing in `PayPerCallV8`,
`ServiceRegistryV8` or `DisputeV3` was modified, and no payment path depends on this
layer.

## 1. The problem this layer is allowed to solve

CallGuard already proves three things about a call:

| Already proven | Where |
|---|---|
| the provider committed to a `responseHash` | EIP-712 receipt, `PayPerCallV8.submitReceipt` |
| the bytes the caller received hash to that commitment | `src/lib/responseProof.ts` (B3a, off chain) |
| an allowlisted witness saw those bytes at an origin | `SLAProvenance` (B3b, on chain) |

None of them says anything about **how** the response was produced. That is the gap this
layer fills, and it fills it narrowly. Three claim shapes exist, each with a statement that
is exact:

| Claim kind | Statement that is actually verified | Requires trusting |
|---|---|---|
| `witness` | an allowlisted attestor signed `(callId, payloadHash, origin, observedAt)` | the attestor key |
| `tee-attestation` | an enclave measuring to an allowlisted PCR0 signed `userData`, and `userData` binds this call's `callId`, `termsHash` and `responseHash` | AWS Nitro root of trust, the PCR0 allowlist, the absence of side channels |
| `zk-constraint` | there exists a private body whose keccak256 is the committed `responseHash`, and whose first byte is a declared public value, for this `callId` | the verifier bytecode; that the commitment itself was honest |

Registry status (28 Oct 2026): only `zk-constraint` and `zk-execution` are wired as proof
verifiers on `SLAEvidenceRegistryV2`. `witness` and `tee-attestation` sit at mode `0`, so
`anchor()` reverts `NoVerifierForKind()` for them and a dispute records them as absent. Why,
and what would close each: `docs/verification/ATTESTOR_SCOPE.md`.

**None of these is a proof of factual correctness.** A TEE proves an image ran; the image
can compute a wrong answer. A zk proof proves the committed output satisfies a stated
constraint; the constraint is chosen by whoever wrote the circuit. The envelope forces the
statement and the assumptions to travel with the artifact, so a verifier badge can never be
read as "the answer is right".

## 2. Envelope (`src/lib/verification/schema.ts`)

```ts
interface EvidenceEnvelope {
  version: "cg-claim/1";
  subject: { callId; providerId; termsHash; responseHash };
  claim: { kind: ClaimKind; statement: string; assumptions: string[] };
  proof: { type: string; payload: string };  // base64
  issuedAt: number;
}
```

`validateEnvelope` rejects an envelope whose claim is unnamed (`statement` blank), whose
`assumptions` array is empty, or whose `kind` is unknown. Those three checks are the whole
point: a blank statement is a green badge pretending to be evidence.

`termsHash` is in `subject` because terms can be replaced between calls; a proof that
outlives its terms would certify a different promise.

### 2.1 Digest

`envelopeDigest` keccaks a JSON array of explicit fields in a fixed order (version, subject
fields lowercased, kind, statement, assumptions, `issuedAt`). Consequences:

- object key order and whitespace cannot move the digest;
- the proof bytes are **excluded**, so the digest is what gets anchored on chain while the
  artifact stays wherever the caller keeps it;
- two envelopes that claim the same thing about the same call digest identically regardless
  of proof encoding.

### 2.2 `userData` binding

`subjectUserData = keccak256(callId ‖ termsHash ‖ responseHash)` is the 32 bytes an enclave
must place in `userData`. Binding only `responseHash` would let a good attestation be
replayed onto another call under the same terms.

## 3. AWS Nitro path (`src/lib/verification/nitro.ts`)

`verifyNitroDoc` checks, in this order:

1. a trust root is configured (refusing to trust anything by default);
2. the document is CBOR, and a `COSE_Sign1` array of four items;
3. protected header names ES384 (`-35`);
4. the COSE signature verifies against the leaf certificate;
5. the leaf chains to a configured root (depth-capped at 6, cycle-detected, expiry checked);
6. the payload timestamp is not in the future beyond 300 s skew and not older than
   `maxAgeSec`;
7. PCR0 is present.

`checkNitroBinding` then compares `userData` with `subjectUserData(subject)` and PCR0 with
the caller's allowlist. A document that failed verification binds nothing — the failure is
carried through, not retried.

`src/lib/verification/cbor.ts` is a hand-written, strict codec (no floats, no
indefinite lengths, no tags, no trailing bytes) because the decoder parses the bytes whose
signature is then checked; a lenient parser is attack surface.

**Why this runs off chain:** Nitro signs with P-384, and the EVM has no P-384 precompile
(Arc's available pairing is bn254 — verified this session: precompile `0x08` returns `1`).
So on chain the result is anchored in `Signature` mode by an allowlisted key. That is the
same trust shape as `SLAProvenance`, deliberately: the layer must not pretend a P-384
signature was checked by the EVM.

## 3.1 Intel TDX path (`src/lib/verification/tdx.ts`)

A second TEE platform behind the same envelope. The claim kind is still
`tee-attestation`; the proof type says which root of trust applied
(`aws-nitro-attestation-doc` vs `intel-tdx-quote`), so a reader never has to guess.

TDX differs from Nitro in three ways that shape the code:

- **No timestamp in the quote.** Nitro documents carry `timestamp` and the verifier
  enforces `maxAgeSec`. A TDX quote carries nothing of the sort, so freshness comes from
  the caller: it generates a 32-byte nonce, sends it with the request, and refuses a quote
  whose `report_data` does not echo it. Replay is excluded by the nonce, not by a clock.
- **64 bytes of `report_data`.** Layout is `subjectUserData(callId, termsHash,
  responseHash)` (32) followed by the nonce (32). The first half is the same binding the
  Nitro path puts in `userData`, so a quote for one call cannot be presented for another.
- **Collateral, not an embedded chain.** Verification needs PCK certificates, TCB info,
  QE identity and CRLs. `@phala/dcap-qvl` does the crypto (pure JS, Intel production root
  pinned); this repo never lets the verifier fetch its own evidence — collateral is passed
  in, so a verification run is reproducible offline from a pinned JSON file.

What the event log adds: `RTMR3` is replayed locally as
`RTMR3_new = SHA384(RTMR3_old ‖ digest)` from 48 zero bytes, and the `compose-hash` event
must equal `sha256` of the exact `app_compose` the CVM served **and** match an allowlist the
caller supplies. That is what turns "a TDX machine signed something" into "this compose
file, whose image digest I can read, produced this body".

Accepted TCB statuses are `UpToDate` and `SWHardeningNeeded`. A revoked, out-of-date or
debug TD (`td_attributes` bit 0) is a refusal, reported with the status that caused it.

The chain check is off chain for the same reason as Nitro: TDX quotes are ECDSA over P-256
with X.509 collateral, and the EVM has no verifier for that chain. The registry therefore
anchors the attestor's EIP-712 signature over the claim digest — the proof stays off chain
and is reproducible from `test/fixtures/tdx/`.

## 4. ZK path

Circuit (`/tmp/opencode/zk/keccakclaim`, source kept out of the repo because it needs
`nargo` 1.0.0-rc.5 + `bb` 6.0.0):

```noir
fn main(body: [u8; 4], call_id: pub [u8; 32], response_hash: pub [u8; 32], first_byte: pub u8) {
    let computed = keccak_256(body);
    assert(computed == response_hash);
    assert(body[0] == first_byte);
    // call_id is bound by being a public input: UltraHonk constrains every declared
    // public input, so a proof about one call cannot be presented for another.
}
```

Noir 1.0 ships only the permutation (`std::hash::keccakf1600`), so the keccak-256 sponge
for a 4-byte input is written in the circuit (one 136-byte rate block, pad `0x01 … 0x80`).
The circuit was checked against the live hash of `pong`
(`0x188fcd5c…6e8d`), which is the `responseHash` of call `0x8cfa1821…`.

Public input layout, in order and as individual field elements: `call_id` (32 words),
`response_hash` (32 words), `first_byte` (1 word) — 65 words total. `bb` reports
`NUMBER_OF_PUBLIC_INPUTS = 73`, which is 65 plus the 8-word pairing-point object the
generated verifier requires; `verify` asserts `publicInputs.length == vk.publicInputsSize -
PAIRING_POINTS_SIZE`.

### 4.1 Adapter (`contracts/zk/ZkClaimAdapter.sol`)

The registry's verifier surface takes `(proof, callId, claimHash, responseHash)`. The
adapter rebuilds the 65 public inputs from `callId` and `responseHash`, takes the predicate
byte from the proof blob (`abi.encode(uint8 firstByte, bytes honkProof)`), and calls the
UltraHonk verifier. Changing any of the three changes a public input and the pairing check
fails.

`claimHash` is not a circuit input. It commits to the off-chain envelope (statement,
assumptions, `issuedAt`), which the circuit cannot constrain; the registry stores it
alongside the proof so the description cannot be swapped after anchoring.

The generated verifier signals failure by reverting (`ShpleminiFailed()`), so the adapter
catches reverts and returns `false`; the registry treats a revert as `VerifierFailed` and a
`false` as `ProofRejected`.

### 4.2 Verifier compilation

`bb write_solidity_verifier -t evm` emits `assembly {` blocks with no memory annotation.
With `via_ir = true` the `--optimized` variant fails to compile (`Could not create stack
layout after 1000 iterations`) and the plain variant fails with
`Variable expr_mpos_20 is 1 too deep in the stack ... No memoryguard was present`.
Patching the five `assembly {` sites to `assembly ("memory-safe") {` compiles cleanly on
solc 0.8.37 → 18,100 bytes deployed, under the 24,576-byte limit. This patch is applied to
the checked-in `contracts/zk/KeccakClaimVerifier.sol` and must be reapplied whenever the
verifier is regenerated.

### 4.3 RISC Zero execution proof (`zk-execution`)

The UltraHonk circuit above constrains an *output* — the committed hash has a preimage with a
chosen prefix. The second ZK path constrains *execution*: a guest program runs inside a zkVM and
commits a journal, and a Groth16 seal proves that this program, with this image id, produced
exactly that journal. That is the strongest honest answer to "how was this answer produced"
that a chain can check by itself, and it needs no key and no enclave.

Guest (`zk-execution/methods/guest/src/main.rs`): reads `(call_id: [u8;32], request: Vec<u8>)`,
answers `ping` with `pong`, and commits

```
journal = abi.encode(bytes32 callId, bytes32 requestHash, bytes32 responseHash, bytes32 handlerId)
```

128 bytes, where `requestHash = keccak256(request)`, `responseHash = keccak256(response)` and
`handlerId = keccak256("callguard.handler.ping/1")`. Journal contents are public in a zkVM:
privacy is over the input and the execution trace, not the output.

On chain, `contracts/zk/Risc0ExecutionAdapter.sol` takes the registry's
`(proof, callId, claimHash, responseHash)` and:

1. decodes the blob as `abi.encode(bytes seal, bytes journal)`; a malformed blob returns
   `false` instead of reverting, because the registry treats a revert as "the verifier broke";
2. decodes the four journal words and requires `journalCallId == callId`,
   `journalResponseHash == responseHash`, `journalHandler == handlerId`;
3. reads the call's `requestHash` from `PayPerCallV8.getCall(callId)` and requires the journal's
   `requestHash` to equal it — this is what ties a proof to a call rather than to a judgment
   about the call;
4. calls `IRiscZeroVerifier.verify(seal, imageId, sha256(journal))`.

`imageId`, `handlerId` and `verifier` are immutable, so swapping the guest program needs a new
adapter and a new `setProofVerifier`; the registry's `setProofVerifier` is deliberately
repeatable so that migration is one owner transaction, and the old claims stay readable because
each is already labelled with the adapter that vouched for it.

`claimHash` is not a circuit input here either. It commits to the envelope (statement,
assumptions), and the image id is bound by the adapter's immutable field. Neither is a verdict
about correctness.

The verifier is vendored, not written here: `lib/risc0-ethereum` at `365e7b2` (`v3.0.1`),
GPL-3.0, with `ControlID` supplying `CONTROL_ROOT` and `BN254_CONTROL_ID`. `IRiscZeroVerifier`
is `external view` and signals failure by reverting `VerificationFailed`, so the adapter wraps
it in `try/catch` and any mock in tests must be `view`.

**The image id is eight little-endian words.** `PING_ID` is `[u32; 8]` and `Digest::as_bytes`
lays each word out little-endian. Formatting the words big-endian produces a plausible-looking
id that commits to nothing, and the only symptom on chain is `VerificationFailed`, because the
claim digest the verifier builds is not the one the proof proved. The host therefore formats
through `Digest::from(PING_ID)` rather than doing byte order by hand, and
`test/Risc0Receipt.t.sol` pins both directions: the committed seal verifies against
`0x5fc483d5…` and is rejected against the misread id. The selector in the seal covers the
control root, the BN254 control id and the verification-key digest, not the caller's image id,
so a selector match says nothing about whether the image id is right.

## 5. `SLAEvidenceRegistry` (`contracts/SLAEvidenceRegistry.sol`)

Deployed on Arc Testnet at `0x7d643B2bE50F6E7593c09A0fc26246ca06d862dB`, with
`HonkVerifier` `0xC64341aBd4dfC62aCd11E35245D06FCF2B094846` and `ZkClaimAdapter`
`0x8bD4fB9F364F9aAd80E4dB275B08a49B88e3664E`; `zk-constraint` is wired to the adapter in
`Proof` mode. Deploy script: `script/DeployEvidence.s.sol`.

State: `modeOf[kind]`, `signatureVerifier[kind][address]`, `proofVerifier[kind]`,
`_evidence[callId][kind]`, `_anchored[callId][kind]`.

- **One claim per `(callId, kind)`.** A second anchor reverts `AlreadyAnchored`, so a call's
  evidence cannot be rewritten by a later, cheaper claim.
- **`Signature` mode.** EIP-712 domain `CallGuardEvidence` / `1` over
  `Evidence(bytes32 callId,bytes32 kind,bytes32 claimHash,bytes32 responseHash)`. The digest
  includes `block.chainid` and `address(this)`, so a signature cannot move chains or
  contracts. Signatures are checked low-`s` to kill malleability. Revoking a verifier stops
  new anchors and leaves history readable.
- **`Proof` mode.** Calls `IEvidenceVerifier.verify`. A reverting verifier is
  `VerifierFailed`, not a silent pass.
- Zero `callId`, `claimHash` or `responseHash` is refused (`EmptyHash`).
- `anchorDigest` is public so clients cannot guess the encoding.

## 6. Trust model, stated plainly

| Artifact | What it proves | What it does not prove |
|---|---|---|
| `witness` | a specific key signed this call's payload hash | that the key is independent of the provider |
| `tee-attestation` | an enclave with this image signed this call's `userData` | that the image is honest, that hardware is side-channel free, that the answer is correct |
| `zk-constraint` | the committed hash has a preimage satisfying the circuit's predicate | that the predicate is the right one, that the body came from the provider's endpoint, that the answer is correct |
| `zk-execution` | the guest with the published image id ran and committed this `callId`/`requestHash`/`responseHash`/`handlerId`, verified on chain by a Groth16 seal | that the guest's `ping`/`pong` handler is the code that produced the answer the provider actually sent, that the answer is correct |

The layer's own limitation, repeated because it matters: **neither TEE path is exercised
against real hardware.** No AWS account exists in this environment, so the Nitro verifier is
tested with a locally generated P-384 chain and a trust root injected by the test. The TDX
verifier is tested the same way — synthetic quotes for the refusal and binding cases, and a
real-quote suite (`tests/verification/tdx-fixture.test.ts`) that skips while
`test/fixtures/tdx/` is empty. The path to hardware exists and is one deploy away: the
container is built, the verifier runs, and a Phala Cloud CVM would supply the quote. It was
not reached, because provisioning is refused on a zero account balance
(`ERR-04-001: Balance $0.00`) and no payment method was added. So B3b stays PARTIAL for the
reason it always had: no hardware evidence anchored on chain.

## 7. Files

- `src/lib/verification/schema.ts` — envelope, validation, digest, `userData`
- `src/lib/verification/cbor.ts` — strict CBOR codec
- `src/lib/verification/nitro.ts` — Nitro document verification + call binding
- `src/lib/verification/tdx.ts` — TDX quote verification, `report_data` binding, RTMR3 replay
- `src/lib/verification/verify.ts` — dispatcher, report with statement and assumptions
- `contracts/SLAEvidenceRegistry.sol` — anchoring, both modes
- `contracts/zk/KeccakClaimVerifier.sol` — bb-generated UltraHonk verifier (patched)
- `contracts/zk/ZkClaimAdapter.sol` — proof → registry surface
- `scripts/zk-claim-envelope.ts` — rebuilds the envelope, its digest and the proof blob
- `scripts/tdx-attest.ts` — fetches an attested answer from a CVM and verifies it end to end
- `verification/tdx-app/` — the container that runs inside the CVM (Dockerfile, compose, server)
- `tests/verification/*.test.ts` — 60 tests (envelope, CBOR, Nitro, TDX, dispatcher, fixture reproduction)
- `test/SLAEvidenceRegistry.t.sol` — 21 tests
- `test/HonkKeccakClaim.t.sol`, `test/ZkClaimEvidence.t.sol` — 14 tests
- `contracts/zk/Risc0ExecutionAdapter.sol` — Groth16 receipt → registry surface, 14 tests
- `zk-execution/` — guest, host prover and methods (`risc0-zkvm 3.0.6`)
- `test/Risc0Receipt.t.sol` — the committed seal verifies locally, 4 tests
- `test/fixtures/zk-execution/`, `src/lib/verification/fixtures/zk-execution.json` — the artifacts and the envelope
- `scripts/zk-execution-proof.ts` — rebuilds the envelope digest and the anchor blob
- `.github/workflows/zk-execution.yml` — the free Groth16 run (`[prove]`)
