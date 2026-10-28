# Attestor scope — `witness` and `tee-attestation`

Status: decided 28 October 2026. Two of the four evidence kinds have no verifier and will not
get one until an artifact exists. This document records why, what the absence means for a
dispute, and what would have to be true for it to change.

The short version: `zk-constraint` and `zk-execution` are checked on chain today.
`witness` and `tee-attestation` are not, and the registry will not even accept an anchor for
them — `anchor()` reverts `NoVerifierForKind()`, so the absence is a refusal, not a failed
check that got recorded.

## 1. What is wired today

Read from Arc Testnet on 28 Oct 2026. Evidence registry `0x64872c29A19dF8E471103d0708397BAb96A311FC`
(`SLAEvidenceRegistryV2`), dispute contract `0xECDb019F1E92Ad35324cc7bBDf1D56b9e70B305B`
(`DisputeV4`), which returns these four hashes from `evidenceKinds()` — the set below, in this order.

| Kind | `keccak256` | `modeOf` | `bindsResponse` | `anchor()` with any proof |
|---|---|---|---|---|
| `witness` | `0xe55f8707…53c5` | `2` | `true` | checked by `0x046d715D…0498` (`SLAProvenanceAdapter`, wired 28 Oct) |
| `tee-attestation` | `0x31d95559…67eb` | `0` | `false` | reverts `NoVerifierForKind()` (`0xd4f78146`) |
| `zk-constraint` | `0x12b89b11…531e` | `2` | `true` | reaches the adapter; a junk proof answers `ProofRejected()` (`0xc3b0d8cd`) |
| `zk-execution` | `0x1543345a…9031` | `2` | `true` | reaches the adapter; a junk proof answers `ProofRejected()` (`0xc3b0d8cd`) |

This table was measured before the `witness` adapter was wired, when that row read mode `0` and
`NoVerifierForKind()`. It is kept as the record of that state:

| Kind | `modeOf` before wiring | `anchor()` |
|---|---|---|
| `witness` | `0` | reverts `NoVerifierForKind()` (`0xd4f78146`) |
| `tee-attestation` | `0` | reverts `NoVerifierForKind()` (`0xd4f78146`) |

The distinction that matters: a kind with a verifier gets as far as the verifier and is judged,
even when the proof is junk (`ProofRejected`). A kind without one is refused before the proof is
read, so no claim of any strength can exist for it — which is still true of `tee-attestation`.

`DisputeV4` snapshots all four kinds at `openDispute`. Before the wiring it recorded
`present = false, reason = NoVerifier` for the pair; `witness` can now be anchored, and a snapshot
taken without an anchor records `NoAnchor` for it instead — a different sentence, because now the
absence is the caller's omission rather than the registry's refusal.

No dispute has been opened on `DisputeV4` yet (`getDispute(1..3)` returns an empty record and
`evidenceOf(1..3)` an empty array), so no snapshot on chain carries either sentence. The
four-kind wiring has therefore been read back but never exercised end to end; the first real
dispute will be the first snapshot with rows in it.

## 2. What each kind claims

None of the four says "the answer is correct". The statements are narrower:

| Kind | Claim | What breaks it |
|---|---|---|
| `witness` | an allowlisted key signed `(callId, payloadHash, origin, observedAt)` | the attestor colluding with the provider |
| `tee-attestation` | an enclave measuring to an allowlisted image signed `userData`, and `userData` binds this call's `callId`, `termsHash` and `responseHash` | a dishonest image, a wrong PCR allowlist, or side channels |
| `zk-constraint` | the committed hash has a private preimage satisfying the circuit's predicate | the predicate not describing the answer |
| `zk-execution` | the pinned guest ran and committed `(callId, requestHash, responseHash, handlerId)`, proven by a Groth16 seal checked on chain | the guest's handler not being the code that produced the answer |

The envelope schema (`src/lib/verification/schema.ts`) rejects a claim with no statement or no
assumption, so a kind cannot be anchored while pretending to be self-explanatory.

## 3. The constraint that decides this

A key cannot close `witness`. The registry has two verifier modes:

- `setSignatureVerifier(kind, key, true)` → mode `1`. `anchor()` recovers the signer and
  checks the allowlist. `bindsResponse` becomes `true` **by construction**, because the digest
  it recovers covers `responseHash`.
- `setProofVerifier(kind, adapter, binds)` → mode `2`. `anchor()` calls
  `IEvidenceVerifier(adapter).verify(proof, callId, claimHash, responseHash)` and stores the
  answer.

`DisputeV4` requires **mode `2`** for `bound`:

```
mode 0                       → NoVerifier
nothing anchored             → NoAnchor
stored responseHash mismatch → WrongResponse
mode 1                       → ModeIsSignature
mode 2, bindsResponse=false  → VerifierNotBinding
otherwise                    → bound
```

So a signature-mode kind is never `bound`, no matter how many attestors sign. Wiring a witness
key today would produce rows that read "Vouched by key" in the Verify panel and
`ModeIsSignature` in the dispute snapshot — a claim the dispute cannot use. That is worse than
an absent row, because it looks like progress. **Provisioning an attestor is therefore not
sufficient: `witness` needs a proof adapter contract.**

`bindsResponse` is worth stating plainly: it is the owner's assertion about an adapter, not
something the registry derives. The adapter's own `verify` is the thing that has to be right.

## 4. What closing each would take

### `witness` — a provenance adapter

The artifact already exists, and it already matches a live call. `SLAProvenance`
(`0xa74D1A809184e4A906f11C9EE38fff8C1155aFeb`, B3b) stores
`Provenance { payloadHash, attestor, originHash, observedAt, recordedAt }` per `callId`, plus
`isAttestor` and `verifyProvenance(callId, expectedPayloadHash)`.

Measured on call `0x8cfa1821…fb265` (28 Oct 2026):

| Read | Result |
|---|---|
| `getProvenance(callId).payloadHash` | `0x188fcd5c…6e8d` — the call's committed `responseHash` |
| `getProvenance(callId).attestor` | `0x528581fB…2F9c` |
| `isAttestor(0x528581fB…2F9c)` | `true` |
| `verifyProvenance(callId, responseHash)` | `true` |

So the missing pieces for `witness` are the adapter contract and the owner transaction that
points the kind at it — not the evidence.

**Built, deployed and wired 28 Oct 2026.** `contracts/zk/SLAProvenanceAdapter.sol` implements
`verify(proof, callId, claimHash, responseHash)` as: the provenance address has code, the record
exists, `record.payloadHash == responseHash`, and `isAttestor(record.attestor)` — the allowlist
read *now*, so a revoked key cannot anchor new claims while its old records stay readable. It
answers `false` on every miss instead of reverting, because the registry maps a revert to
`VerifierFailed` and a refusal to `ProofRejected`, and those are different sentences.

Measured in `test/SLAProvenanceAdapter.t.sol` (11 tests): a registry `anchor()` through this
adapter costs `206,535` gas — below the `256,608` the RISC Zero adapter spends on one Groth16
verification. The same tests prove the two integration properties: with the kind wired, `anchor`
lands and `modeOf` reads `2`; with a mismatched payload, the registry answers `ProofRejected`,
not `VerifierFailed`.

Deploy script: `script/DeploySLAProvenanceAdapter.s.sol` (deploy only; it prints the wiring
command and deliberately does not send it).

| Step | Tx / value | Block | Gas |
|---|---|---|---|
| deploy `SLAProvenanceAdapter` → `0x046d715D28143e45E38f1a1114A0462898630498` | `0x965576ce…4f38` | `69493246` | `221,813` |
| `setProofVerifier(keccak256("witness"), adapter, true)` | `0xd5499453…6f81` | `69494118` | `93,512` |

Read back after wiring: `modeOf = 2`, `bindsResponse = true`, `proofVerifier = 0x046d715D…0498`.
The adapter answers `true` for the live call `0x8cfa1821…` and `false` for a wrong response hash
or an unknown call, so the wiring points at a contract that already agrees with the chain.

Wiring `witness` does not create a claim. Someone still has to call
`anchor(callId, keccak256("witness"), claimHash, responseHash, statementHash, assumptionHash, "")`.
Until that happens the Verify panel shows no witness row, and a dispute snapshot records
`NoAnchor`.

### Anchoring one

The three hashes are derived, never typed. `bun scripts/witness-anchor.ts --call <callId>` reads
`getCall` from `PayPerCallV8` and `getProvenance` from `SLAProvenance`, refuses to build an
envelope when the record's `payloadHash` is not the call's `responseHash`, and prints the
`cast send … anchor(...)` line for a human to sign. `--emit-fixture` writes
`src/lib/verification/fixtures/witness.json` from the same builder `/api/evidence` uses, so the
served statement cannot drift from the anchored one; `--send` takes `PRIVATE_KEY` and is opt-in.

The first claim is anchored, for the live call `0x8cfa1821…`:

| Field | Value |
|---|---|
| tx | `0x5c4d8deb947105f7d5240fcb54881487f877e2b80f51ab65416bb131eafaba2d` |
| block / gas | `69497159` / `206,535` (the adapter figure predicted before the send) |
| `claimHash` | `0x3e1dc967…2514` |
| `responseHash` | `0x188fcd5c…6e8d` (the call's own commitment, equal to the provenance `payloadHash`) |
| `statementHash` | `0x7050a35c…9be5` |
| `assumptionHash` | `0x7d9b9f5b…6a4a` |
| `verifier` | `0x046d715D…0498` |

`getEvidence` reads the row back with all five hashes and `anchoredAt = 1793188858`, and
`/api/evidence?callId=0x8cfa1821…&kind=witness` answers `anchored: true, match: true` — the served
envelope digests to the anchored claim, so the page and the chain agree on every byte. `zk-constraint`
and `tee-attestation` still answer `anchored: false` for the same call, which is the expected
asymmetry: three kinds have a verifier, one has a claim.

The adapter is that small: `verify` reads `getProvenance(callId)` and answers
`recordedAt != 0 && payloadHash == responseHash && isAttestor(attestor)`. The proof blob stays
empty because everything the check needs is already on chain. What it still would not prove: that the response body came from the provider's endpoint (an
attestor sees what it fetched, and it is the attestor's log that is trusted), and never that the
answer is correct.

Re-open condition, met on 28 Oct 2026: the adapter is deployed and the kind is wired. The allowlist
is not empty, but it holds one key that this repository controls (`0x528581fB…2F9c`), so a bound
`witness` row states "trust CallGuard's own witness" — the `PARTIAL` this layer already carries in
`docs/SLA_COVERAGE.md`. The adapter makes that sentence checkable on chain; it does not make it
independent. A second, independent attestor is what would.

### `tee-attestation` — blocked twice

1. **No artifact exists.** No enclave has ever produced a quote for this app.
   `test/fixtures/tdx/` is empty: Phala Cloud refuses to provision a CVM on a `$0` balance
   (`ERR-04-001`), which is why the Nitro and TDX verifiers in this repository are exercised
   against synthetic evidence only, and why B3b is `PARTIAL`. A registry row cannot be built
   from a quote nobody captured.
2. **It would need on-chain document verification.** Even with a quote, the registry needs a
   proof-mode adapter that verifies it — a Nitro document verifier or DCAP at the gas scale of
   the Groth16 verifier or worse. That contract does not exist here yet.

And the honest sentence: a TEE proves that an allowlisted image ran and signed `userData`. It
does not prove the answer is correct, and a quote carries no timestamp, so freshness is the
caller's nonce and never a clock.

Re-open condition: a funded CVM produces a quote that verifies against a fixture captured in
this repository.

## 5. Decision

- `witness` is wired to `SLAProvenanceAdapter` in proof mode with `bindsResponse = true`. It was
  never a candidate for a signature verifier: that changes nothing for `bound`, and it would let a
  key anchor a claim the dispute cannot use. `tee-attestation` stays at mode `0` for the missing
  artifact, not for a missing decision.
- The panels state the absence rather than hiding it: `DisputesV8` renders reason `NoVerifier`
  as "no verifier is wired for this kind on the evidence registry", and `Verify` labels mode `0`
  as "no verifier".
- Nothing in this scope can touch a bond, a response window, `disputeSlashBps`, or a verdict.
  `DisputeV4` reads the snapshot in `openDispute` only; `resolve`, `resolveAppeal`, `finalize`
  and `reclaimExpiredBond` never read it.

## 5a. What a dispute snapshot actually said

### The first dispute, on a call nothing was anchored for

`DisputeV4` dispute `1` is open on Arc Testnet, and it is the first one this contract has ever
held. Opening it needed a call with no V3 record: all four earlier completed V8 calls already carry
a V3 dispute id, and V4 answers those with `AlreadyDisputedElsewhere` so one stake cannot be slashed
twice. So a fresh call was made and completed, then disputed by its own caller.

| Field | Value |
|---|---|
| call | `0x5ca2100b…b9ed1` (provider `1`, `1.000000` USDC, `Completed` at `1793209388`) |
| tx | `0x3ce4abe3a09b2c0b522f6487b64240cc60774b360349983a11aec7cce02aaed1` |
| block / gas | `69537552` / `775,507` |
| `openedAt` | `1793209403` |
| bond | `2,000,000` (2 USDC, pulled from the caller) |
| `heldSlash` | `1,283,554` — `10%` of stake `12,835,548`, escrowed, not moved |
| events | `DisputeOpened`, `SlashHeld`, and `EvidenceAbsent` four times |

The four rows it wrote, read back with `evidenceOf(1)`:

| Kind | mode | present | bound | reason |
|---|---|---|---|---|
| `witness` | `2` | false | false | `NoAnchor` |
| `tee-attestation` | `0` | false | false | `NoVerifier` |
| `zk-constraint` | `2` | false | false | `NoAnchor` |
| `zk-execution` | `2` | false | false | `NoAnchor` |

Four `EvidenceAbsent` events for four rows, and the reasons differ in exactly the way the enum
promises: `NoVerifier` is the registry refusing a kind no claim of any strength can exist for,
`NoAnchor` is a checkable kind where nobody anchored a claim for *this* call. The claims that do
exist — `witness` and `zk-execution` — belong to call `0x8cfa1821…`, so they are correctly not
offered here. That is the sentence a snapshot has to get right: evidence for another call must never
read as evidence for this one.

### The second dispute, where the chain shows a bound row

Dispute `2` was opened for exactly this reason: a `bound = true` row had only ever existed in a fork
test, and a mechanism whose only evidence is a test is not evidence that the deployment works. The
call is `0xf68c0c62…b488`, completed inside its window on 28 Oct, and its `zk-execution` claim was
anchored in the transaction before the dispute — `openDispute` snapshots the rows in its own
transaction, so anchoring afterwards would leave the row empty for ever.

| Field | Value |
|---|---|
| call | `0xf68c0c62…b488` (provider `1`, `1.000000` USDC, `Completed` at `1793210915`) |
| anchor tx | `0x7ef31f301229f6194363a3e420d8d71e6ae4f2b1f77e1a17f6b0e73da02cbcf3`, block `69548388` |
| dispute tx | `0xf607faf05159e6ebdbfce645675e785dffe70951d6371f7a5e252bea7436033b`, block `69548457`, gas `730,827` |
| `openedAt` | `1793214948` (2026-10-28 19:15:48 UTC) |
| bond | `2,000,000` (2 USDC, pulled from the caller) |
| `heldSlash` | `924,159` — `10%` of stake `9,241,596`, escrowed, not moved |
| events | `DisputeOpened`, `SlashHeld`, `EvidenceLinked` for `zk-execution`, `EvidenceAbsent` three times |

The four rows it wrote, read back with `evidenceOf(2)`:

| Kind | mode | present | bound | reason |
|---|---|---|---|---|
| `witness` | `2` | false | false | `NoAnchor` |
| `tee-attestation` | `0` | false | false | `NoVerifier` |
| `zk-constraint` | `2` | false | false | `NoAnchor` |
| `zk-execution` | `2` | true | **true** | `None` — claim `0xd0b03a84…64bc2`, verifier `0xD804F2E0…1a21` |

This is the same snapshot vocabulary as dispute `1` plus the one row it could not have: a present
claim whose response hash equals the call's, recorded as binding by the kind's verifier. The other
three rows keep their distinct sentences, so "bound", "nobody anchored one", and "this kind has no
verifier at all" are three different reads of live state.

### The bound rows a fork still has to supply

Dispute `2` binds one kind on a call that carries one claim. It cannot show two bound rows at once,
and it cannot show a `zk-constraint` anchor that exists on the **v1** registry, because those claims
belong to other calls. `test/DisputeV4ForkEvidence.t.sol` supplies those cases: it clears the single
V3 read with `vm.mockCall` and opens a dispute against the deployed contracts at block `69498000`, on
the call that has both `witness` and `zk-execution` claims.

| Kind | mode | present | bound | reason |
|---|---|---|---|---|
| `witness` | `2` | true | **true** | `None` — adapter `0x046d715D…0498`, claim `0x3e1dc967…2514` |
| `tee-attestation` | `0` | false | false | `NoVerifier` — the registry refuses the kind before reading a proof |
| `zk-constraint` | `2` | false | false | `NoAnchor` — its live claim is on the **v1** registry `0x7d643B2b…`, which V4 does not read |
| `zk-execution` | `2` | true | **true** | `None` — claim `0xe3baff68…419c`, verifier `0xD804F2E0…1a21` |

Read the two tables together and the snapshot's whole vocabulary is covered: bound, `NoAnchor`,
`NoVerifier`, and a `zk-constraint` anchor that exists but on a registry this contract does not
read. Two Arc system contracts behind USDC are stubbed in that test because Foundry cannot execute
them inside a fork, so it asserts the recorded bond and `heldSlash` rather than token deltas; real
token movement is covered by `test/DisputeV4.t.sol` and by the live transactions above.

## 6. What a reader should not conclude

Four kinds in `evidenceKinds()` is not four claims per dispute, and a wired kind is not an anchored
one. Three kinds have a verifier (`witness`, `zk-constraint`, `zk-execution`) and only one call has
claims, so a dispute on any other call reads `NoAnchor` on all three of them; two calls carry claims —
`0x8cfa1821…` (`witness`, `zk-execution`) and `0xf68c0c62…` (`zk-execution`, bound in dispute `2`) —
and the rest do not; `tee-attestation`
cannot be anchored at all and reads `NoVerifier`. Count `bound = true` rows when judging a dispute
snapshot, not rows, and read the reason on each unbound one — the reasons are different sentences
for a reason. A bound row also never decides the dispute by itself: `DisputeV4` writes the snapshot
in `openDispute` and no resolution function reads it back.
