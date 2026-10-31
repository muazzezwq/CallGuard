# CallGuard — Agent Notes (Arc Testnet, chain ID 5042002)

Pay-per-call SLA marketplace: providers stake USDC, callers pay per request, missed
deadlines auto-slash stake. Solidity contracts + React frontend + Vercel functions +
subgraph indexer (v7 Goldsky, v8 The Graph Studio) + x402 facilitator, all on Arc Testnet.

## Repo shape (not a workspace monorepo)

Root holds the React/Vite frontend **and** the Foundry contracts. Each subdir is a
separate deployable with its own `package.json` and `node_modules`:

- `src/` — frontend. `src/main.tsx` → `src/App.tsx`, which is a wallet gate:
  connected → `components/layout/AppShell.tsx`, else `components/CgLanding.tsx`.
  Feature screens are lazy `React.lazy` panels in `src/components/panels/`.
- `contracts/` / `test/` / `script/` — Solidity, Foundry tests, deploy scripts.
- `api/` — Vercel serverless functions (ESM Node, shipped as-is; no Vite build).
- `subgraph/` — v7 Goldsky subgraph (`graph codegen` / `build` / `goldsky` deploy).
  `subgraph/v8/` is the v8 indexer source (`npm run codegen:v8` / `build:v8`); it is
  deployed to The Graph Studio as `onur/1.0.0` and starts at block `68651068`.
- `x402-facilitator/` — standalone Node/Express server.
- `src/lib/config.ts` — **frontend source of truth** for contract addresses and the
  inline ABIs (they encode fix history for tuple/field shape). AGENTS.md mirrors it.

## Redesign phase work (`design/`)

Before starting a redesign phase, read `design/PHASE_<n>.md` (the verbatim prompt),
`design/PHASE_PROCESS.md`, the relevant `docs/decisions.md` entries, and the previous phase's
open `PARTIAL`/`FAIL`/`UNVERIFIED` rows in `design/phase-checklists/`. Then verify the real
repository state (`git status`, `git log`, fresh file reads) instead of trusting a summary of it.
Keep scope to the current phase, and keep an evidence-based checklist
(`PASS`/`PARTIAL`/`FAIL`/`UNVERIFIED`) at `design/phase-checklists/PHASE_<n>_CHECKLIST.md` — a
phase is not complete while any required row is not `PASS`. Never carry skill-usage claims from
one phase into another. Process details: `design/PHASE_PROCESS.md`; UI rules: `design/RULES.md`.

## Commands

CI runs the same three gates on every push to `main` and every pull request
(`.github/workflows/checks.yml`): `bun run check`, `bun test tests/`, `forge test`.
A red run posts the failing test names as annotations, because the job log needs
repository admin rights — read the annotation before rerunning.

Frontend (from repo root; uses bun on Vercel):
```bash
bun run dev          # vite dev server, port 5173
bun run build        # vite build → dist/
bun run typecheck    # tsc -p tsconfig.json --noEmit
bun run check        # typecheck + lint
bun run check-env    # node check.js — validates .env against active v7 addresses
bun run setup        # check.js && bun install
```
Contracts (Foundry):
```bash
forge test -vv       # 621 tests, 30 test suites (31 Oct 2026)
forge build
forge script script/Deploy.s.sol:Deploy --account deployer --rpc-url arc_testnet --broadcast
```
Subgraph / facilitator (use npm there, not bun):
```bash
cd subgraph && npm run codegen && npm run build && npm run deploy
cd x402-facilitator && npm run dev     # node --watch server.js
# e2e happy/timeout lifecycle: bun scripts/e2e-lifecycle.js (needs ARC_RPC_URL, CALLER_PK, PROVIDER_PK)
# 7-day v8 keeper soak: ARC_RPC_URL=... KEEPER_PK=... bun scripts/keeper-soak.js
```

## Toolchain gotchas

- **`bun run lint` is a real gate** — `eslint src --max-warnings=0`, so any ESLint error
  *or* warning fails it. Run it with `typecheck` (both are wrapped by `bun run check`).
- Solidity `0.8.37`, `via_ir = true`, optimizer 200, `evm_version = "cancun"` (OZ v5.6
  needs mcopy). Arc’s baseline is Osaka, so it accepts Cancun bytecode: **do not pass
  `--evm-version paris`** — OZ v5.6 `Bytes.sol` fails to compile for Paris.
- `lib/` are git submodules (openzeppelin-contracts v5.6.1, forge-std v1.16.1). Run
  `git submodule update --init` after clone.
- Both `bun.lock` and `package-lock.json` are committed. Frontend/Vercel build with **bun**;
  subgraph and facilitator use **npm**.
- `dist/` is **generated build output and ignored by Git** (`.gitignore:25`). Vercel builds
  the site from source with `bun run build` and publishes `dist/` (`vercel.json`); never
  commit it. A local build leaves `git status` clean.
- `app/` no longer exists. It was the legacy static HTML app, removed in `54dbd38`
  (2026-10-16); `dist/` was intentionally untracked in `e06494b` (2026-10-17).
- Env: server code (`api/`, `x402-facilitator/`) reads **unprefixed** vars first, falling
  back to `VITE_*`. `VITE_*` ships in the browser bundle — **never** put `*_PRIVATE_KEY`
  or secrets in a `VITE_*` var. `.env.example` documents all vars; never commit `.env`.
- Recent commits migrated all Turkish strings/comments to English — write English.

## Protocol facts agents get wrong

- `callService` returns and `callId` is **`bytes32`** (not `uint256`); v8 `submitReceipt` takes
  `(bytes32 callId, bytes32 responseHash, uint64 respondedAt, uint32 termsVersion, bytes signature)`.
- `getProvider` on v8 returns an **11-field** tuple (`owner, signer, stake, pricePerCall,
  latestTermsVersion, active, pendingCalls, completedCalls, slashedCalls, maxConcurrentCalls,
  zkTier`); the registry counter is `nextProviderId` (not `providerCount`).
  `src/lib/config.ts` ABIs already reflect these fixes — trust it.
- Receipts are **EIP-712** (`EIP712("ArcSLA", "2")` on v8, `"1"` on v7, both include
  `respondedAt`; v8 adds `termsVersion`). `ARCHITECTURE.md` §4 documents this correctly.
- `getCall` has **two layouts**: v7 returns 8 words with `status` at index `7`; v8 returns
  11 words with `status` at index `10` (after `completedAt`, `termsVersion`, `termsHash`).
  `Verify.tsx` and `api/attestation.js` decode both, so a v8 call no longer verifies as
  "no receipt found". Read the **active** PayPerCall (`ACTIVE_PPC_ADDRESS` in the frontend,
  `ACTIVE` in `api/_contracts.js`), never the hardcoded v7 address.
- Test counts drift fast. Measured 31 Oct 2026: `forge test` **621 tests / 30 suites**,
  `bun test tests/` **603 tests / 56 files** (596 pass, 7 skip), `bun run check` clean with
  **0 ESLint warnings**. Earlier: 28 Oct `forge test` **617 tests / 29 suites**,
  `bun test tests/` **570 tests / 53 files** (563 pass, 7 skip), and a fork suite the same day
  took `forge test` to **619 tests / 30 suites**. `ARCHITECTURE.md` §4 now documents
  the EIP-712 receipt scheme correctly (`ArcSLA/2` for v8, `ArcSLA/1` for v7); the older
  `personal_sign` description is gone.
- The subgraph deploy script (`subgraph/package.json`) deploys `callguard-v7/1.1.0`, which
  matches the canonical query URL in `src/lib/config.ts`. (The old `arcsla/1.1.7` script and
  the `callguard-v7/1.0.0` deploy were stale — they indexed the retired v3 registry.)

## Core Contracts — legacy v7 (13 Oct 2026; read-only since the v8 cutover)

Panels that still hardcode `CONFIG.<address>` keep reading v7. The audit, the per-panel
verdicts, and the phased fix live in `docs/V7_V8_PANEL_MIGRATION.md`; `V7Cleanup.tsx` is
the only intentional v7 write path.

| Contract | Address |
|---|---|
| `ServiceRegistry` (v7) | `0x9ca97010464e8e6de6e27cf25eae9b939fbd7333` |
| `PayPerCall` (v7.1 — ERC-8183 hook) | `0x5fb41dd22c44e1de08f37d98c2995a62d6220540` |
| `ReputationLoan` (v3) | `0x9e0622828a03a578050e45ba2fde6b9140e676aa` |
| `SLAFutures` (v3) | `0xcd57a9b924a565b12889277173b9ec06d4e10435` |
| `Subscription` (v2) | `0xc090ff2b856a5cc1bfe1137cf75ca566339f01db` |
| `AgentWallet` (v2) | `0x6a7a41481e47a38bbe0236438c10e5ab8ca141e5` |

Unchanged: `Dispute` `0xa47162d8e4785d867f05800f35a334fd78575e56`,
`CrossChainReceiver` (v2) `0x760326de3cba39994dfd81d2b71b072c0265601c`,
`SLAAttestationBridge` `0x62a63a94a41601fdb8e9d60ed7e56b1e4c4c5da7`.

Dependent: `FACILITATOR_ADDRESS` `0x0E515aEd287a7b3d2D9F7911321d99826653Fbd8`,
`SELLER_ADDRESS` `0x9adEDa85604C205791B98B4C239b5625688a4ba5`,
`USDC_ADDRESS` `0x3600000000000000000000000000000000000000` (Arc native USDC, 6 decimals).

**RETIRED — do not use** (superseded 13 Oct 2026 unless noted): `ServiceRegistry` v5
`0xc3ff2169…`, `PayPerCall` v5 `0x389b44b7…`, `PayPerCall` v6-standby `0xe901462b…`,
`DisputeQuality` v2 `0x7e2771df…`, `SLAFutures` v2 `0x19d03ff1…`, `ReputationLoan` v2
`0x5a2f5455…`; (7 Oct) `PayPerCall` v3 `0x51bbd776…`, `ServiceRegistry` v3 `0xea00f898…`.
Also superseded: AgentWallet `0xf73f2Fc5…` (1 Oct).

## SLA P0 v8 — ACTIVE (Arc Testnet, 23 Oct 2026)

| Contract | Address |
|---|---|
| `ServiceRegistryV8` | `0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3` |
| `PayPerCallV8` | `0xedce61eF5be31DC22cEfE342692622A26919a7EF` |
| `SLAKeeper` | `0xBe897043e4c21cFe9A6532e43542CA48EaD83CB7` |
| `DisputeV2` | `0xe5D993E0B328B506B874505B23b4bE876d7c0900` |

Registry admin, arbiter, appeal arbiter, and treasury are all the owner wallet
`0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da`. On-chain wiring is verified:
`registry.payPerCall()` is `PayPerCallV8`, and `SLAKeeper.payPerCall()` is `PayPerCallV8`.

**`DisputeV2` no longer holds slasher authority.** Its last dispute was finalized on 26 Oct 2026
18:59:36 UTC (tx `0xa09b50b2…`), and `registry.revokeSlasher(DisputeV2)` followed at 21:53 UTC
(tx `0xc0d3f541…`, block `69238925`), so `registry.authorizedSlashers(DisputeV2)` is now `false`
while `authorizedSlashers(DisputeV3)` stays `true`. The contract remains deployed and readable;
do not route new disputes to it.

The v8 env vars are set in Vercel production (23 Oct 2026). The frontend and API now use
`ServiceRegistryV8` + `PayPerCallV8`; v7 stays deployed and read-only. The v8 indexer is live
on The Graph Studio: `https://api.studio.thegraph.com/query/1763627/onur/1.0.0`. Provider
migration ran on 23 Oct: v8 provider `1` is the owner wallet with `7.485694 USDC` stake (nine
slashed calls since, the first a timeout drill that took `2`), `1 USDC` price, terms v1 (window `120`, slash `2000`, availability `9950`), and endpoint
`https://arcsla.vercel.app/api/auto-receipt`. The v7 provider `1` was deactivated on 24 Oct 15:22:45 UTC
(tx `0x2b730469…`) and unstaked at 16:23:01 UTC (tx `0x5db0fb6f…`), so its stake is `0` and the v7
registry holds no locked funds; the cleanup card `src/components/panels/V7Cleanup.tsx` stays as the
unverified-contract write path. Goldsky v8 was
abandoned after Starter-plan credit exhaustion (23 Oct 2026). Deployment details and activation
order: `docs/V8_DEPLOYMENT.md` §7.

## Dispute evidence binding (deployed + wired 28 Oct 2026) — ACTIVE

`SLAEvidenceRegistryV2` and `DisputeV4` are deployed on Arc Testnet and **wired**: `zk-constraint`
and `zk-execution` are in `Proof` mode (`modeOf` = `2`) with `bindsResponse` `true`,
`DisputeV4.evidenceKinds()` holds all four kinds, `ServiceRegistryV8.authorizedSlashers(DisputeV4)`
is `true` and `authorizedSlashers(DisputeV3)` is `false`. V3 is closed: `finalize(4)` ran on 28 Oct
(tx `0xbdaf9525…f6167`, block `69473913`, `85048` gas) and released `3.481864 USDC`; `settled(4)` is
`true`, `heldSlash(4)` is `0`, and V3 holds no USDC in either representation. The live zk-execution
fixture is anchored on the new registry.
`tee-attestation` is still `NoVerifier` (`modeOf` = `0`) and will stay there until an enclave
produces a quote; at mode `0` `anchor()` reverts `NoVerifierForKind()`, so its row cannot exist at
all. `witness` used to be in the same state for a different reason — `DisputeV4` binds only mode
`2`, and a signature key reaches mode `1`, which it records as `ModeIsSignature`, so an attestor
key was never enough. It now has a proof adapter and is wired (below). Scope and re-open conditions:
`docs/verification/ATTESTOR_SCOPE.md`. `witness` was wired on 28 Oct 2026 to
`SLAProvenanceAdapter` **`0x046d715D28143e45E38f1a1114A0462898630498`**
(`contracts/zk/SLAProvenanceAdapter.sol`, 11 forge tests; anchor through it costs `206,535` gas).
Wiring tx `0xd5499453…6f81` (block `69494118`, `93,512` gas) ran `setProofVerifier` from the owner,
so `modeOf(witness)` is `2` and `bindsResponse` is `true`. `tee-attestation` stays at `0` for a
missing quote. A wired kind still has no claim until someone anchors one.

Anchoring the first `witness` claim has a dedicated path, because the three hashes must come
from the provenance record and not from a hand-typed sentence:
`bun scripts/witness-anchor.ts --call <callId>` reads `getCall` + `getProvenance`, refuses a call
whose record's `payloadHash` is not its `responseHash`, builds the envelope through
`src/lib/verification/witnessClaim.ts`, and prints the `cast send … anchor(...)` line. `--emit-fixture`
rewrites `src/lib/verification/fixtures/witness.json` (the builder's own output, so the served
hashes cannot drift from the anchored ones); `--send` needs `PRIVATE_KEY` and is opt-in.
`/api/evidence` now bundles two envelopes and looks them up by `(kind, callId)`: `zk-execution`
and `witness` describe the same live call, so a call alone does not name a claim.

The first `witness` claim was anchored on 28 Oct 2026: tx `0x5c4d8deb…ba2d`, block `69497159`,
gas `206,535`, `claimHash` `0x3e1dc967…2514` for call `0x8cfa1821…`, verifier `0x046d715D…0498`.
`getEvidence` returns the row, so `witness` is no longer a wired-but-empty kind.

**`/api/evidence` was answering `500 FUNCTION_INVOCATION_FAILED` for every request**, including
requests that never touch evidence, and `/api/attestation` with it. The cause was module load, not
the handler, and it had **two** causes in a row. First: `api/_evidence.js` pulled its fixtures in with
`createRequire(import.meta.url)`, a bundler leaves that call in place, and the deployed function
directory did not carry the JSON files. Fixing that was not enough — the deployment log then named
the second: `Cannot find module '/var/task/src/lib/verification/schema' imported from
/var/task/src/lib/verification/witnessClaim.js`. Vercel does **not** bundle an ESM function's
import graph; it compiles each file and copies it beside its neighbours, where node's ESM resolver
wants the exact file name. `witnessClaim.ts` imported `./schema` and `./claimHashes` without an
extension, so the function threw while loading. Bun and esbuild both guess the extension, which is
why every local gate stayed green through two failed deploys. Every relative import under
`src/lib/verification/` now states `.js`, and `tests/api-bundle-load.test.ts` fails on an
extensionless specifier there. Verified live after deploy `dpl_…` for `2104de6`:
`/api/attestation?providerId=1` → `200 {score:44, completedCalls:6, slashedCalls:9,
proof.contract: ServiceRegistryV8}`, `/api/evidence?callId=0xf68c0c62…&kind=zk-execution` →
`{anchored:true, match:true, source:"fixture", note:null}`, and the same for `witness` on
`0x8cfa1821…` (`claimHash 0x3e1dc967…2514`).

**On `SLAEvidenceRegistryV2` only `witness` and `zk-execution` hold a claim for that call.** The
`zk-constraint` anchor from B3d (`tx 0xe8f6b0c5…3732`, block `69092517`) is on the **v1** registry
`0x7d643B2b…` — `DisputeV4` reads `V2` (`0x64872c29…11FC`), so its row says `NoAnchor` (mode `2`),
not `NoVerifier`. A snapshot therefore mixes three different sentences and
`test/DisputeV4ForkEvidence.t.sol` asserts all three against the deployed contracts.
**DisputeV4 has two disputes.** Dispute `1` was opened on 28 Oct 2026 for call
`0x5ca2100b…b9ed1` (tx `0x3ce4abe3…aed1`, block `69537552`, gas `775,507`), with bond
`2,000,000` and `heldSlash` `1,283,554` (10% of stake `12,835,548`). It needed a *new* call
because all four earlier completed V8 calls already carry a V3 dispute id and `openDispute`
answers `AlreadyDisputedElsewhere` for them — the double-slash guard working, not a defect.
Its snapshot is four `EvidenceAbsent` events and four unbound rows: `witness`, `zk-constraint`
and `zk-execution` read `NoAnchor` (the anchored claims belong to call `0x8cfa1821…`), and
`tee-attestation` reads `NoVerifier`.

Dispute `2` is the one that binds something. Its call is `0xf68c0c62…b488`, its `zk-execution`
claim was anchored first (tx `0x7ef31f30…2cbcf3`, block `69548388`) because `openDispute`
snapshots the rows in its own transaction, and the dispute followed (tx `0xf607faf0…033b`, block
`69548457`, gas `730,827`, `openedAt` `1793214948`, bond `2,000,000`, `heldSlash` `924,159` —
10% of stake `9,241,596`). `evidenceOf(2)` reads `zk-execution` `mode=2 present=true
bound=true reason=None` (claim `0xd0b03a84…64bc2`), `witness` and `zk-constraint` `NoAnchor`, and
`tee-attestation` `NoVerifier`. Both disputes are `Upheld` (`resolve(id, true)` ran on 28 Oct) and
still `settled = false`, so the pending call is `finalize(id)`, not `reclaimExpiredBond`: it opens
at `resolvedAt + appealWindow` (`1793389671` for `1`, `1793389631` for `2`). Read
`docs/V8_DEPLOYMENT.md` §14.7 before touching either.
`test/DisputeV4ForkEvidence.t.sol` still supplies what no single dispute can show: two bound rows
at once, and a `zk-constraint` claim that lives on the **v1** registry.

| Artifact | Address | Deploy tx |
|---|---|---|
| `SLAEvidenceRegistryV2` | `0x64872c29A19dF8E471103d0708397BAb96A311FC` | `0x2df3be0f…26941` (block 69401608, 765735 gas) |
| `DisputeV4` | `0xECDb019F1E92Ad35324cc7bBDf1D56b9e70B305B` | `0x8ebe9986…2fd8f` (block 69401608, 2752305 gas) |
| `DisputeV3` (retired 28 Oct; dispute #4 finalized, no funds held) | `0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec` | — |

Wiring txs, all signed by the owner wallet: `setProofVerifier(zk-constraint)` `0x19ac4811…f77cd`,
`setProofVerifier(zk-execution)` `0x5b9addae…ed0fad`, `setEvidenceKinds` `0x44b6701e…7bf1e`,
`revokeSlasher(V3)` `0xfc9579c2…729f7cd`, `authorizeSlasher(V4)` `0x5b30dded…bc85507`,
`anchor(zk-execution fixture)` `0x5f57a56e…702a013e` (block 69469682, 450278 gas).

**Anchor packaging gotcha:** `Risc0ExecutionAdapter.verify` takes
`proof = abi.encode(bytes seal, bytes journal)`, not the raw `seal.bin`. A bare seal decodes as a
malformed blob, the adapter returns `false` instead of reverting, and the registry answers
`ProofRejected` — which reads like a bad proof but is a packaging mistake. Build it with
`cast abi-encode 'f(bytes,bytes)' $SEAL $JOURNAL`; `test/fixtures/zk-execution/journal.bin` is the
128-byte journal.

Env: `SLA_EVIDENCE_V2` / `VITE_SLA_EVIDENCE_V2` = the new registry, `VITE_DISPUTE_V4` = DisputeV4.
All three are set in Vercel for production **and** preview (28 Oct 2026).

`/api/evidence` has no function file of its own: the Hobby plan caps a deployment at 12 Serverless
Functions and the API already had 12, so the handler lives in `api/_evidence.js` and
`vercel.json` rewrites `/api/evidence` onto `/api/attestation?evidence=1`, which dispatches to it
before the RPC guard. Adding a 13th `api/*.js` fails the deploy with
`No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan`. The path and
payload are unchanged. Runbook and per-step read-backs: `docs/V8_DEPLOYMENT.md` §14.

## Verification layer (B3c/B3d/B3e, 26 Oct 2026) — additive, no v8 contract changed

| Contract | Address |
|---|---|
| `SLAProvenance` (B3b witness) | `0xa74D1A809184e4A906f11C9EE38fff8C1155aFeb` |
| `SLAEvidenceRegistry` (claim anchoring) | `0x7d643B2bE50F6E7593c09A0fc26246ca06d862dB` |
| `HonkVerifier` (UltraHonk, keccak claim) | `0xC64341aBd4dfC62aCd11E35245D06FCF2B094846` |
| `ZkClaimAdapter` | `0x8bD4fB9F364F9aAd80E4dB275B08a49B88e3664E` |
| `RiscZeroGroth16Verifier` (Groth16, execution claim) | `0x8F0a67be3cB5750e1Ea088ECbfD27DBdB8228f01` |
| `Risc0ExecutionAdapter` (`zk-execution`) | `0xD804F2E0EfB3D8c470d60942643B71Ea5b271a21` |

`zk-constraint` is wired in `Proof` mode to the adapter; `modeOf(kind) = 2` reads back from
chain. Anchor gas `3.8M`, verify gas `2.9M`. Frontend: `VITE_SLA_EVIDENCE` drives the Verify
panel's "Anchored evidence" card. Design: `docs/verification/DESIGN.md`; measurements and the
TEE-vs-zk comparison: `docs/verification/REPORT.md`; runbook: `docs/V8_DEPLOYMENT.md` §11.

Four claim kinds, and none of them is "the answer is correct": `witness` (a key saw the
bytes), `tee-attestation` (an allowlisted image signed `userData`/`report_data` — both the
Nitro and the Intel TDX verifier run against synthetic evidence only, no enclave hardware
was reached, so B3b stays PARTIAL), `zk-constraint` (the committed hash has a private
preimage satisfying a stated predicate), `zk-execution` (a RISC Zero guest with the published
image id ran and committed `(callId, requestHash, responseHash, handlerId)`; the Groth16 seal
verifies on chain at `256,608` gas and `Risc0ExecutionAdapter` binds the journal to the call
by reading `requestHash` from `PayPerCallV8`). The envelope schema rejects a claim with no
statement or no assumption. Live anchor: tx `0x21dbb04b…` (block `69236411`, gas `404,917`),
claim `0xe3baff68…419c`, `isAnchored = true`; runbook `docs/V8_DEPLOYMENT.md` §13.

`zk-execution` gotchas: the guest image id is `[u32; 8]` in **little-endian** byte order —
format it through `risc0_zkvm::Digest` and never by hand, or every artifact agrees with a wrong
id and the chain answers with a bare `VerificationFailed` (this happened; `docs/V8_DEPLOYMENT.md`
§13.4). The Groth16 prover is x86-only, so proving happens in
`.github/workflows/zk-execution.yml`, requested by `[prove]` in a commit message; a plain run
only builds the guest and asserts the pinned `EXPECTED_IMAGE_ID`. Check any new seal with
`forge test --match-contract Risc0ReceiptTest` before deploying: `imageId` is immutable, so a
wrong one costs a new adapter plus a repeatable `setProofVerifier` (the registry allows it).

TDX path: `src/lib/verification/tdx.ts` (quote → Intel root via `@phala/dcap-qvl`, the
32/32 `report_data` split `subjectUserData ‖ nonce`, RTMR3 replay, compose-hash allowlist),
container in `verification/tdx-app/`, capture + verify in `scripts/tdx-attest.ts`
(`--base <cvm> --call <callId> --write` stores `test/fixtures/tdx/`). Runbook:
`docs/V8_DEPLOYMENT.md` §12; **§12.4 records why it stopped**: the image is built and its
digest known, but Phala Cloud refuses to provision on a `$0` balance (`ERR-04-001`), so no
quote was ever captured and `test/fixtures/tdx/` is empty. A TDX quote has no timestamp, so
freshness is the caller's nonce, never a clock.

Verifier gotchas: `bb` needs `-t evm` for both `write_vk` and `prove`, and the generated
Solidity verifier only compiles under `via_ir` after its five `assembly` blocks are
annotated `("memory-safe")`. Regenerate via `scripts/zk-claim-envelope.ts` and the notes in
`docs/verification/DESIGN.md` §4.2.

## Key parameters

- Chain ID `5042002`; RPC `https://rpc.testnet.arc.io`; explorer `https://explorer.testnet.arc.io`.
- Subgraph (v8, live app, The Graph Studio): `https://api.studio.thegraph.com/query/1763627/onur/1.0.0`.
- Subgraph (v7 legacy): `https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/callguard-v7/1.1.0/gn`.
- `SUBMIT_GRACE = 5` seconds. EIP-712 receipt domain is `ArcSLA/2` on v8 (`PayPerCallV8`'s
  `EIP712("ArcSLA", "2")`, with `termsVersion` in the struct) and `ArcSLA/1` on the retired v7
  (`EIP712("ArcSLA", "1")`, four-field `submitReceipt`). Both include `respondedAt`.
- Erc-8004 `ReputationRegistry` `0x8004B663…` and ERC-8183 `AgenticCommerce` `0x0747EEf0…`
  integrations are **best-effort**: a revert there does not fail `submitReceipt`/`agentCall`.

## AgentWallet (v2 active)

Owner `0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da`; agent hot wallet
`0x22099051bbe59117Ebc5219bdDA90D7790758C03`; daily limit 10 USDC; max per call 2 USDC; not paused.

## Deploy / wiring

- Deploy walkthrough: `DEPLOY.md`. Serverless API has its own `vercel.json`
  (`outputDirectory: dist`, `buildCommand: bun run build`, per-route `maxDuration`
  and CORS headers); `/callService`, `/nano/*`, `/providers/:id`, `/sitemap.xml` are
  rewritten to `api/` functions.
- Required deploy env vars and v7 address checks are enumerated by `bun run check-env`
  and `.env.example` — use those, not a duplicated list here.
- Post-deploy (from admin wallet): `ServiceRegistry.setPayPerCall(0x5fb41dd2…)`
  is **one-time/irreversible**; then best-effort `PayPerCall.setReputationRegistry(0x8004B663…)`
  and `AgentWallet.setAgenticCommerce(0x0747EEf0…)`.
- **Required if redeploying `Dispute`:** call `Dispute.setPayPerCall(<PayPerCall>)` once
  (arbiter-only). Without it, `openDispute` reverts — disputes are bound to a verified
  on-chain call to stop fabricated disputes.

## URLs

- App + Landing: `https://arcsla.vercel.app` ·
  Netlify: `https://keen-lamington-f268c2.netlify.app`
- Backup branches: `backup/pre-app-redesign-20260924-2221`,
  `backup/pre-komple-redesign-20260925-1305`, `backup/pre-ux-overhaul-20260927`
