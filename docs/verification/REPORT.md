# Verification layer — measured report

Everything below was measured in this repository's environment (Arc Testnet, chain
`5042002`, solc 0.8.37 with `via_ir = true`, bun 1.4.3, Node 22 `crypto`, Noir 1.0.0-rc.5
with Barretenberg 6.0.0 on `aarch64-linux`). Nothing is estimated unless it says so.

## 1. Numbers

### ZK path (Noir / UltraHonk, keccak claim)

| Quantity | Value |
|---|---|
| circuit | 401 ACIR opcodes, 17 Brillig opcodes |
| proving time | 725 ms wall (`bb prove`, 8 threads) |
| proving memory | 72.4 MiB peak |
| proof size | 8,768 bytes |
| public inputs | 2,080 bytes (65 words) |
| verification key | 1,888 bytes |
| verifier contract (deployed) | 18,100 bytes, under the 24,576 limit |
| on-chain verification | **2,915,938 gas** (`ZkClaimAdapter.verify` → `HonkVerifier.verify`) |
| on-chain anchor through the registry | **3,224,009 gas** (simulation) / **3,810,232 gas** (live tx, block `69092517`) |
| proving key generation | 117–140 ms, 57 MiB (`bb write_vk`) |

The proof was produced for the live call `0x8cfa1821…b265` and its committed
`responseHash` `0x188fcd5c…6e8d` (= `keccak256("pong")`), both read from the v8 subgraph,
not invented. Fixtures: `test/fixtures/zk/keccak-call.{proof,inputs,vk}`.

### TEE path (AWS Nitro format, fixture chain)

| Quantity | Value |
|---|---|
| document size | 1,272 bytes (fixture; a real Nitro document is 4–6 KB) |
| COSE signature + X.509 chain + freshness + PCR extraction | **1.5–1.9 ms** (200 runs, Node `crypto`) |
| envelope digest | 0.06 ms |
| on-chain verification | **impossible** — P-384 has no EVM precompile; bn254 precompiles (`0x08`) do work on Arc |
| on-chain anchor through the registry | **191,022 gas** (Signature mode, test measurement) |
| comparable live anchor | 145,459 gas (`SLAProvenance` tx `0x7cd975ab…fa76`) |

### Execution path (RISC Zero zkVM, Groth16) — measured 26 Oct 2026

| Quantity | Value |
|---|---|
| proving time | **238 s** on `ubuntu-latest` (4 vCPU, warm crate cache, cold guest build) |
| proving cost | **$0** — GitHub Actions; the Groth16 prover is x86-only and does not run here |
| guest | `risc0-zkvm 3.0.6`, Rust `1.88.0`, ~40 lines; handler `keccak256("callguard.handler.ping/1")` |
| image id | `0x5fc483d58bc5eb7aa650ff3df138de5d435d97f39e2c06f74e7b40c48504b9fa` |
| journal | 128 bytes (4 × `bytes32`), digest `0xa86c1ab9…3694` |
| seal | **260 bytes** = 4-byte selector `0x73c457ba` + 256-byte Groth16 proof |
| anchor blob | 544 bytes (`abi.encode(seal, journal)`) |
| on-chain verification | **256,608 gas** (`RiscZeroGroth16Verifier.verify` alone) |
| on-chain verification + binding | **285,885 gas** (`Risc0ExecutionAdapter.verify`) |
| on-chain anchor through the registry | **404,917 gas** (live tx, block `69236411`, ≈0.012 USDC at 30 gwei) |
| deploy | verifier 1,135,268 gas, adapter 470,413 gas, `setProofVerifier` 33,907 gas |

Every row above measures the **pre-binding guest** (128-byte journal, no `claimHash`), which is
what the deployed adapter `0xD804F2E0…1a21` accepts. The source guest and adapter now commit and
compare a fifth word, so the numbers change with the next image: re-measure them when a new seal
is produced. See `DESIGN.md` §6, "Statement binding, current state".

The seal was produced by CI run `40398709972` for the same live call as the UltraHonk claim,
and the artifacts are committed (`test/fixtures/zk-execution/`). Two independent checks say it
is real: `test/Risc0Receipt.t.sol` verifies it against the vendored verifier locally, and the
chain accepted it in `SLAEvidenceRegistry.anchor`. Arc's `0x08` (bn254) precompile therefore
does execute a pairing check, which the TEE row above could only assert — the failed attempt
before it (`PRECOMPILES::ecpairing` → `false`) was a wrong image id, not a missing precompile.

### Whole-layer deployment (done, Arc Testnet)

`script/DeployEvidence.s.sol`, broadcast on 26 Oct 2026:

| Contract | Address | Gas |
|---|---|---|
| `RelationsLib` (CREATE2, verifier library) | `0xb3dfa23c23eb683615408db4389ff1bbf74169ed` | 2,503,537 |
| `ZKTranscriptLib` (CREATE2, verifier library) | `0x4cb5b3e5db8511c7caa53a073646267fd114d640` | 1,138,435 |
| `HonkVerifier` | `0xC64341aBd4dfC62aCd11E35245D06FCF2B094846` | 3,959,224 |
| `ZkClaimAdapter` | `0x8bD4fB9F364F9aAd80E4dB275B08a49B88e3664E` | 339,602 |
| `SLAEvidenceRegistry` | `0x7d643B2bE50F6E7593c09A0fc26246ca06d862dB` | 688,126 |
| `setProofVerifier(zk-constraint, adapter)` | — | 70,907 |

Total **8,699,831 gas ≈ 4.64 USDC** at 533 gwei, blocks `69090922`–`69090923`. Read back
from chain after the deploy: `modeOf(zk-constraint) = 2` (Proof), `proofVerifier =
0x8bD4fB9F…664E`, `owner = 0xfbac99E6…06Da`.

The verifier needs its two libraries at fixed CREATE2 addresses; forge deploys them inside
the script, so a redeploy is the same single command.

### Live claim (the evidence this report rests on)

| Field | Value |
|---|---|
| tx | `0xe8f6b0c594234d9ad318af41bcbade5374456e6c8e9ae552e0998fdb92673732` |
| block / gas | `69092517` / **3,810,232** |
| call | `0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265` (provider 1, `COMPLETED`) |
| kind | `keccak256("zk-constraint")` = `0x12b89b11…2531e` |
| claim hash | `0x51323974d481dbcb701dfb12f57e988b73ddd4a2b0a60525b1382caf39608021` |
| committed response | `0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d` |
| verifier recorded | `0x8bD4fB9F364F9aAd80E4dB275B08a49B88e3664E` (the adapter, i.e. proof mode) |

`getEvidence(callId, kind)` returns that tuple and `isAnchored(...) = true`. The Verify panel
renders it as `ZK output constraint · CHECKED ON CHAIN · MATCH`, and an unattested call
renders `No claim anchored for this call` — both branches checked in the dev server
(`docs/screenshots/verify-evidence-zk-411-light.png`).

## 2. Comparison

| | `witness` (`SLAProvenance`) | `tee-attestation` (Nitro) | `zk-constraint` (UltraHonk) | `zk-execution` (RISC Zero) |
|---|---|---|---|---|
| what is proven | a key saw these bytes | an image with this PCR0 signed this call's `userData` | the committed hash has a preimage satisfying the predicate, for this call | a guest with this image id ran and committed this call's `requestHash`/`responseHash` |
| on-chain verification | signature recovery, no proof | none — off chain, anchored by signature | full pairing check on chain | Groth16 pairing check on chain |
| verification cost | 145,459 gas (live) | ~0 on chain + 1.5 ms off chain | 2,915,938 gas | 256,608 gas (285,885 through the adapter) |
| proof size | 65-byte signature | 1.3–6 KB document | 8,768 bytes | 260-byte seal + 128-byte journal |
| proving cost | negligible | hardware run | 725 ms, 72 MiB | 238 s of free CI; not possible in this workspace |
| root of trust | the attestor key | AWS root + PCR0 allowlist + hardware | the verifier bytecode | the verifier bytecode, vendored at a pinned tag |
| independent operator needed | yes (that is the current weakness) | no (AWS is the third party) | no | no |
| tells you the answer is correct | no | no | no | no |
| can be produced today in this repo | yes, live | **no** — fixtures only, no AWS account | yes, verified locally and in `forge test` | yes, live and anchored |
| integration complexity | low | medium (attestation plumbing, nonce/`userData`, PCR allowlist, freshness window) | high (circuit authoring, vk generation, verifier compile workaround, gas) | high (guest/host split, x86-only prover, version-pinned toolchain, image id binding) |
| what breaks it | a provider-colluding attestor | model extraction, side channels, wrong PCR allowlist, stale document | a badly chosen predicate, i.e. the claim itself | a guest whose journal does not describe the answer the provider actually sent |

### Effort that was actually required per path

- **Witness:** already shipped. A CLI (`scripts/provenance-attest.js`) and one registry.
- **TEE:** ~600 lines (`cbor.ts`, `nitro.ts`, `schema.ts`, `verify.ts`) plus 51 tests. The
  hard part is not the code; it is the operational chain — enclave image build, PCR0
  measurement, KMS-attested signing key, real Nitro hardware. Attempting it without hardware
  would have produced a badge, not evidence, which is why it is labelled `PARTIAL`.
  A second platform (Intel TDX) was built the same way and stopped at the same wall for a
  different reason: the container and the verifier exist, but Phala Cloud refuses to
  provision a CVM on a `$0` balance, so no quote was captured
  (`docs/V8_DEPLOYMENT.md` §12.4).
- **Execution proof:** ~450 lines (guest, host, adapter, TS verifier, workflow) and one
  vendored verifier. The risk is the toolchain, not the code: the Groth16 prover is x86-only, so
  every iteration costs a CI run; `rzup` refuses `linux/aarch64`; and the guest resolves its own
  dependency graph, so it keeps a committed `Cargo.lock`. The one bug that reached the chain was
  the image id's byte order (`DESIGN.md` §4.3) — invisible everywhere except as `VerificationFailed`.
- **ZK:** the circuit is 40 lines of Noir, but the toolchain is the risk. Noir 1.0 has no
  `keccak256` (only the permutation), `bb` requires `-t evm` for both `write_vk` and
  `prove`, and the generated verifier does not compile under `via_ir` until five
  `assembly` blocks are annotated `("memory-safe")`. All three were found the hard way and
  are documented in `DESIGN.md` §4.

## 3. Recommendation

1. **Keep `witness` as the default evidence tier.** It is live, cheap, and its weakness is
   visible in the envelope: it names the attestor as an assumption.
2. **Use `zk-constraint` when the claim can be expressed as a predicate over committed
   bytes** — hash preimage, schema shape, numeric bound, field equality. That is the one
   tier that verifies without trusting a key, and 2.9 M gas is affordable on Arc because
   gas is USDC-denominated and predictable.
3. **Do not deploy the TEE tier as "verified"** until a real enclave exists and PCR0 values
   come from an image the repository can rebuild. Until then the correct label is
   `PARTIAL`, and the envelope says exactly what is assumed.
4. **Wire the tier you intend to rely on.** A tier that can be described but not wired is not
   evidence: `anchor()` reverts `NoVerifierForKind()` at mode `0`, and no dispute can bind the
   kind. `witness` was wired on 28 Oct 2026 — `SLAProvenanceAdapter`
   `0x046d715D…0498` in proof mode, `bindsResponse = true` — because the provenance record
   already matched a live call. `tee-attestation` stays at mode `0`, blocked by a missing quote.
   Wiring is not anchoring: a kind with a verifier still carries no claim until someone anchors
   one. Per-kind status and re-open conditions: `docs/verification/ATTESTOR_SCOPE.md`.

## 4. What would have to change for production

| Tier | Missing piece |
|---|---|
| `tee-attestation` | AWS account, reproducible enclave image, published PCR0, KMS-attested signing key, nonce freshness policy, and an enclave that actually serves the provider's endpoint |
| `zk-constraint` | predicates worth proving (schema conformance, SLA thresholds), a circuit registry so `/kind` cannot be claimed by an arbitrary circuit, and a cheap way to bind `claimHash` inside the circuit so the description is constrained too |
| both | a dispute path that *reads* the anchored evidence. `DisputeV3` deliberately did not; `DisputeV4` snapshots and binds it in `openDispute`, so a bound claim now moves nothing and is read as evidence only |

Status on 31 Oct 2026, stated so no reader mistakes a synthetic pass for hardware:

- `test/fixtures/tdx/` is empty. `tests/verification/tdx-fixture.test.ts` therefore reports a
  skip, not a pass. Only `tests/verification/tdx.test.ts` runs, and it verifies quotes the test
  builds itself against a trust root the test injects.
- `tests/verification/nitro.test.ts` verifies a locally generated P-384 chain with an injected
  root. No AWS Nitro enclave was reached, and no KMS-attested key exists.
- `SLAEvidenceRegistryV2.modeOf(keccak256("tee-attestation"))` reads `0` on chain, so
  `anchor()` reverts `NoVerifierForKind()`: a `tee-attestation` row cannot exist yet, and a
  `DisputeV4` snapshot records it as `NoVerifier`.
- What a passing TDX quote *would* prove, and what it still would not: `src/lib/verification/tdx.ts`
  header and `DESIGN.md` §6. The gap is hardware, not code — the verifier, the binding and the
  envelope are written and tested.

Minimum evidence that would move this row from PARTIAL to PASS, in order:

1. A quote captured from a CVM whose `app_compose` hash is in the caller's allowlist, written by
   `bun scripts/tdx-attest.ts --base <cvm> --call <callId> --write`.
2. The capture's `verifiedAt` inside the DCAP collateral's validity window, with the Intel root
   chain resolving through `@phala/dcap-qvl` (no injected root).
3. `report_data` equal to `subjectUserData ‖ nonce` for that call, with the nonce chosen by the
   caller and echoed by the quote.
4. A `tee-attestation` verifier wired at mode `2` (`bindsResponse = true`) and one anchored
   claim, then `evidenceOf(disputeId)` reading `bound = true` for that kind.


## 5. Evidence trail

- `bun test tests/verification/` — 57 tests: envelope validation, digest invariance, strict
  CBOR, Nitro signature/chain/freshness/PCR, call binding, unknown-proof refusal, and the
  fixture envelope reproducing the anchored `claimHash` and the checked-in proof bytes.
- `forge test --match-path test/SLAEvidenceRegistry.t.sol` — 21 tests: both modes, replay,
  revocation, cross-call/cross-chain/cross-response signatures, malleability, zero hashes.
- `forge test --match-path test/HonkKeccakClaim.t.sol` — 5 tests: real proof verifies,
  tampered proof reverts, wrong public input reverts, layout is
  `callId ‖ responseHash ‖ predicate`.
- `forge test --match-path test/ZkClaimEvidence.t.sol` — 9 tests: adapter rejects another
  call, another response, an unmet predicate, truncated proofs; the registry anchors a
  proof-verified claim and refuses a claim bound to another call.
- Suite totals after this layer: `forge test` 526 tests / 22 suites; `bun test tests/`
  464 tests / 40 files; `bun run check` clean.
