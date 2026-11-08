# Step 6 — Contracts pass D: ZK, provenance, legacy surface

**Files:** `contracts/zk/Risc0ExecutionAdapter.sol`, `contracts/zk/ZkClaimAdapter.sol`, `contracts/zk/SLAProvenanceAdapter.sol`, `contracts/zk/KeccakClaimVerifier.sol` (generated, interface only), `contracts/SLAProvenance.sol`, and the reachable legacy set.
**Baseline:** `3e279bd`.

## Adapter matrix

| Adapter | Kind | Proof system | Bound inputs | `claimHash` bound? | `bindsResponse` |
|---|---|---|---|---|---|
| `Risc0ExecutionAdapter` `0x0Eba15Bb…48Bd` | `zk-execution` | RISC Zero Groth16 + `sha256(journal)` | `callId`, `requestHash`, `responseHash`, `handlerId`, `claimHash` | **yes** (`:88-90`) | true |
| `ZkClaimAdapter` `0x8bD4fB9F…664E` | `zk-constraint` | UltraHonk `HonkVerifier` | `callId`, `responseHash`, predicate byte | **no** (`:48`, `:63-70`) | true |
| `SLAProvenanceAdapter` `0x046d715D…0498` | `witness` | none — reads `SLAProvenance` | `callId` → record, `responseHash == payloadHash` | **no** (`:42`) | true |
| `NoVerifier` | `tee-attestation` | — | — | — | `mode 0`, `anchor` reverts `NoVerifierForKind()` |

`Risc0ExecutionAdapter` is the strongest of the three: the journal is 160 bytes, every field is compared against a chain read (`:94-98`), and the seal covers `sha256(journal)` under an immutable `imageId` (`:38`, `:102`). A second adapter for a two-handler guest sits at `0x0Eba15Bb9CbDd262186Dc56B9512Cf76FA8E48Bd` and is wired through the registry, so the image id is per-adapter rather than global.

## Findings

### CG-ZK-01 — `ZkClaimAdapter` does not commit to `claimHash`, so one proof serves any envelope
- Severity: Low
- Confidence: High
- Evidence: `contracts/zk/ZkClaimAdapter.sol:43-48` — the parameter is declared and immediately discarded (`claimHash; // named for the registry's interface; it is not a circuit input`); `:63-70` builds public inputs from `callId`, `responseHash`, and one predicate byte only. The header comment at `:21-22` states this deliberately.
- Precondition: a party holding a valid constraint proof for a call.
- Impact: the same proof verifies for any `claimHash` over the same `(callId, responseHash)`. Because anchoring is one-shot per `(callId, kind)`, the practical effect is that the *first* anchor wins with arbitrary envelope text, and a second party cannot anchor a corrected envelope under the same kind. Combined with CG-EVD-01 this means the statement is unattested.
- Existing mitigation: the comment documents the choice; the dispute snapshot records `claimHash`, `statementHash`, and `assumptionHash` so the wording is at least immutable once anchored.
- Required fix: add `claimHash` to the circuit's public inputs, as the RISC Zero guest already does.
- Verification: prove once, then call `verify` with two different `claimHash` values; both return true today.

### CG-ZK-02 — `SLAProvenance.verifyProvenance` answers `true` for a revoked attestor
- Severity: Low
- Confidence: High
- Evidence: `contracts/SLAProvenance.sol` records `(callId, payloadHash, attestor)` and exposes a verification helper; `contracts/zk/SLAProvenanceAdapter.sol:18` notes the allowlist is read at verification time, and the allowlist check lives there (`:51`), not in `SLAProvenance`.
- Precondition: an attestor that was allowlisted when the record was written and removed later.
- Impact: a caller of the public helper — a UI, a script, or a future adapter — can read `true` for a record whose attestor no longer counts. Only the adapter used by the registry returns `false`, so the on-chain dispute path is correct while the off-chain read is misleading.
- Existing mitigation: the adapter is the only path the registry uses.
- Required fix: make the helper take the allowlist into account, or rename it to say it checks only the payload binding.
- Verification: revoke an attestor, then call the helper for an existing record: it still returns true.

### CG-ZK-03 — the `witness` kind proves only that a key saw the bytes
- Severity: Info
- Confidence: High
- Evidence: `contracts/zk/SLAProvenanceAdapter.sol:9-18` — the claim is "an allowlisted attestor recorded this payload for this call". No independence from the provider is checked.
- Precondition: the provider is also an attestor.
- Impact: a `witness` claim can be true and worthless. A dispute reader must know that "attestor saw it" is not "the answer was right".
- Existing mitigation: the envelope requires a statement and an assumption, and `docs/verification/DESIGN.md` says the same.
- Required fix: none required; do not allow an attestor equal to the provider owner if the claim is meant to be independent.
- Verification: `registry.isAttestor(providerOwner)` today.

### CG-ZK-04 — `tee-attestation` is closed, so its workflow output is untrusted by construction
- Severity: Info
- Confidence: High
- Evidence: `contracts/SLAEvidenceRegistryV2.sol` `modeOf(tee-attestation) == 0`; `anchor()` reverts `NoVerifierForKind()`; `.github/workflows/tdx-app.yml` still builds the image.
- Precondition: none.
- Impact: no `tee-attestation` row can exist. Any UI that lists the kind as "pending" is wrong.
- Existing mitigation: `docs/verification/ATTESTOR_SCOPE.md` records the closure.
- Required fix: none required.
- Verification: `modeOf` returns `0` on chain.

## Legacy surface

| Contract | Status | Referenced by | Risk |
|---|---|---|---|
| `ServiceRegistry` v7 `0x9ca97010…7333` | deployed, read-only | `src/lib/config.ts` defaults, `AdminPanel.tsx:139-140` | read-only label is correct; no write path |
| `PayPerCall` v7 `0x5fb41dd2…0540` | deployed, read-only | `V7Cleanup.tsx:18` (the only v7 write path, for unstaking) | intentional, documented |
| `ReputationLoan` v3, `SLAFutures` v3, `Subscription` v2, `AgentWallet` v2 | deployed | panels that still read them | no money path in the active flow |
| `Dispute`, `DisputeQuality`, `DisputeV2`, `DisputeV3` | deployed or retired | `config.ts:110` pins V3's address for the stranded escrow | `DisputeV3` holds no funds after the 28 Oct finalize |
| `CrossChainReceiver`, `SLAAttestationBridge`, `SLAUptime`, `X402Middleware`, `RegisterWithNFT` | deployed or dormant | partial | no active write path found |
| `SLAEvidenceRegistry` v1 `0x7d643B2b…62dB` | deployed | `AGENTS.md`; holds the `zk-constraint` claim that `DisputeV4` cannot see | documented duplicate-anchor incident |

### CG-LEG-01 — two `PayPerCall` layouts coexist, and a wrong decoder silently reads the wrong status
- Severity: Low
- Confidence: High
- Evidence: v7 `getCall` returns 8 words with `status` at index 7; v8 returns 11 with `status` at index 10 (documented in `AGENTS.md`, mirrored in `src/lib/config.ts`). `Verify.tsx` and `api/attestation.js` decode both.
- Precondition: a new consumer that copies one decoder without the version check.
- Impact: a v8 call decoded with the v7 layout reads `responseHash` where `termsVersion` lives, and a completed call can display as pending. This already happened once, which is why the ABIs are annotated.
- Existing mitigation: both decoders are version-aware; `tests/active-contracts.test.ts` pins the active addresses.
- Required fix: delete the v7 contracts from `contracts/` once `V7Cleanup` is retired, so a new reader cannot copy the old shape.
- Verification: `grep -rn "getCall" src api | wc -l` shows one decoding helper per version.

## Nothing found

- No adapter accepts a proof without reading the call from `PayPerCallV8`.
- `Risc0ExecutionAdapter.decodeProof` is external and wrapped in `try` (`:67`), so malformed input returns `false` instead of reverting the caller's transaction.
- No image id, handler id, or verifier address is mutable after construction; replacing one costs a new adapter plus a repeatable `setProofVerifier`.
- No legacy contract holds a slasher authorization after the V3 revocation.
