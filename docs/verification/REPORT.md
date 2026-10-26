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

| | `witness` (`SLAProvenance`) | `tee-attestation` (Nitro) | `zk-constraint` (UltraHonk) |
|---|---|---|---|
| what is proven | a key saw these bytes | an image with this PCR0 signed this call's `userData` | the committed hash has a preimage satisfying the predicate, for this call |
| on-chain verification | signature recovery, no proof | none — off chain, anchored by signature | full pairing check on chain |
| verification cost | 145,459 gas (live) | ~0 on chain + 1.5 ms off chain | 2,915,938 gas |
| proof size | 65-byte signature | 1.3–6 KB document | 8,768 bytes |
| proving cost | negligible | hardware run | 725 ms, 72 MiB |
| root of trust | the attestor key | AWS root + PCR0 allowlist + hardware | the verifier bytecode |
| independent operator needed | yes (that is the current weakness) | no (AWS is the third party) | no |
| tells you the answer is correct | no | no | no |
| can be produced today in this repo | yes, live | **no** — fixtures only, no AWS account | yes, verified locally and in `forge test` |
| integration complexity | low | medium (attestation plumbing, nonce/`userData`, PCR allowlist, freshness window) | high (circuit authoring, vk generation, verifier compile workaround, gas) |
| what breaks it | a provider-colluding attestor | model extraction, side channels, wrong PCR allowlist, stale document | a badly chosen predicate, i.e. the claim itself |

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

## 4. What would have to change for production

| Tier | Missing piece |
|---|---|
| `tee-attestation` | AWS account, reproducible enclave image, published PCR0, KMS-attested signing key, nonce freshness policy, and an enclave that actually serves the provider's endpoint |
| `zk-constraint` | predicates worth proving (schema conformance, SLA thresholds), a circuit registry so `/kind` cannot be claimed by an arbitrary circuit, and a cheap way to bind `claimHash` inside the circuit so the description is constrained too |
| both | a dispute path that *reads* the anchored evidence. `DisputeV3` deliberately does not, so evidence is advisory today |

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
