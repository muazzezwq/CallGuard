# Announcement — zk-execution on Arc

Draft copy for the zk-execution release. Every number here is measured and recorded in
`docs/verification/REPORT.md` (§ "Execution path") and `docs/V8_DEPLOYMENT.md` §13; the live
anchor is `0x21dbb04b…`. Do not swap in the older `0xe8f6b0c5…` transaction — that one is the
UltraHonk `zk-constraint` anchor and proves a different claim.

## Short post

> CallGuard now anchors zk-execution on Arc, not just zk-constraints.
>
> A RISC Zero Groth16 seal verifies on chain in 256,608 gas — 285,885 through the adapter that
> also binds the journal to the call. Full anchor: 404,917 gas, ≈0.012 USDC. Proof: 260 bytes.
> Proving: 238 s on free CI.
>
> Verification links are shareable now:
> https://arcsla.vercel.app/app?verify=0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265
>
> What it proves: the guest with image id `0x5fc483d5…` ran and committed
> `(callId, requestHash, responseHash, handlerId)`.
> What it does not prove: that the answer is correct.

## Long post

### On-chain proof of execution, and the limits of the word "proof"

CallGuard settles pay-per-call SLAs on Arc. A provider stakes USDC, commits to a response window,
and gets slashed if the deadline passes. That settles money. It never said anything about the work
itself — until now.

Four claim kinds exist, and none of them means "the answer is correct":

| kind | claim |
|---|---|
| `witness` | a key saw the bytes |
| `tee-attestation` | an allowlisted image signed `report_data` (synthetic evidence only; no enclave hardware was reached) |
| `zk-constraint` | the committed hash has a private preimage satisfying a stated predicate |
| `zk-execution` | a RISC Zero guest with a pinned image id ran and committed `(callId, requestHash, responseHash, handlerId)` |

`zk-execution` is the new one. A ~40-line guest (`risc0-zkvm 3.0.6`, handler
`keccak256("callguard.handler.ping/1")`) produces a 128-byte journal and a 260-byte Groth16 seal.
On Arc the seal costs 256,608 gas to verify, 285,885 through `Risc0ExecutionAdapter`, which
additionally reads `requestHash` from `PayPerCallV8` so a seal cannot be replayed onto a different
call. The whole anchor — journal and seal stored through `SLAEvidenceRegistry` — costs 404,917 gas,
about 0.012 USDC at 30 gwei.

Live anchor: tx `0x21dbb04b7f265fb67ce2ed83cae10f0413bcf14310c2a764f77d297ef2be57cf`, block
`69236411`. The chain answers `modeOf(zk-execution) = 2` (Proof) and `isAnchored(claim) = true`.

The proof is real and it is narrow. It says an execution environment with that image id existed and
committed those four values for that call. It does not say the provider returned a good answer, or a
correct one, or the one the caller wanted. Evidence stays advisory: `DisputeV3` does not read it.
That is the honest state of the system today, and it is why every claim kind carries a statement and
an assumption that the envelope schema rejects without.

One bug is worth publishing because it was silent: the guest image id is `[u32; 8]` in
little-endian byte order. Formatted by hand, it produced an id that every artifact agreed with and
the chain rejected with a bare `VerificationFailed`. Formatting it through `risc0_zkvm::Digest` made
the verifier accept. A wrong id is immutable in a deployed adapter, so the unit test that pins
`EXPECTED_IMAGE_ID` now runs on every push, and proving itself runs in CI under the `[prove]` commit
trigger because the Groth16 prover is x86-only.

Verify any call yourself, no wallet required:

```
https://arcsla.vercel.app/app?verify=<callId>
```

The link opens the Verify panel without a wallet, calls the attestation API once, and shows the call
state next to the claim the evidence actually makes.

## Facts the copy depends on

| Quantity | Value | Source |
|---|---|---|
| anchor tx / block | `0x21dbb04b…57cf` / `69236411` | `docs/V8_DEPLOYMENT.md` §13 |
| anchor gas | 404,917 (≈0.012 USDC at 30 gwei) | `docs/verification/REPORT.md` |
| `RiscZeroGroth16Verifier.verify` | 256,608 gas | `docs/verification/REPORT.md` |
| `Risc0ExecutionAdapter.verify` | 285,885 gas | `docs/verification/REPORT.md` |
| seal / journal | 260 bytes / 128 bytes | `docs/verification/REPORT.md` |
| proving time | 238 s on `ubuntu-latest`, $0 | `docs/verification/REPORT.md` |
| image id | `0x5fc483d58bc5eb7aa650ff3df138de5d435d97f39e2c06f74e7b40c48504b9fa` | `docs/verification/REPORT.md` |
| claim hash | `0xe3baff68e7c0299a4275cc3e7553fb27da16d1929fa47a5fe04ab7b58b9f419c` | `docs/V8_DEPLOYMENT.md` §13 |
| verifier / adapter | `0x8F0a67be…8f01` / `0xD804F2E0…1a21` | `AGENTS.md` |
| demo call | `0x8cfa1821…b265`, `COMPLETED`, provider `#1`, 1 USDC | Arc Testnet |

Check any of these before publishing:

```bash
R=https://rpc.testnet.arc.io
KIND=$(cast keccak "zk-execution")          # 0x1543345a…9031
CALL=0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265
CLAIM=0xe3baff68e7c0299a4275cc3e7553fb27da16d1929fa47a5fe04ab7b58b9f419c

cast call 0x7d643B2bE50F6E7593c09A0fc26246ca06d862dB \
  'isAnchored(bytes32,bytes32,bytes32)(bool)' $CALL $KIND $CLAIM --rpc-url $R   # true
cast call 0x7d643B2bE50F6E7593c09A0fc26246ca06d862dB 'modeOf(bytes32)(uint8)' $KIND --rpc-url $R   # 2
cast receipt 0x21dbb04b7f265fb67ce2ed83cae10f0413bcf14310c2a764f77d297ef2be57cf \
  --rpc-url $R | grep -E '^gasUsed|^blockNumber'   # 404917 / 69236411
```

`isAnchored` takes three arguments (`callId`, `kind`, `claimHash`); calling it with the claim hash
alone reverts.
