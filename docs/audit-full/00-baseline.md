# Audit baseline and evidence index

**Audit:** CallGuard full security audit  
**Baseline date:** 7 November 2026  
**Commit:** `3e279bd3001c8ffe760232ef46a7f9bff919a547` (`fix(api): fail closed when settlement or idempotency is unconfigured`)

## Working tree

At baseline, `git status --short` showed only the new audit directory:

```
?? docs/audit-full/
```

No production code was modified for this audit.

## Toolchain

| Tool | Version |
|---|---|
| Bun | `1.4.3` |
| Forge | `1.8.5` |
| Node | `v24.22.0` |

## Gate results at baseline

| Gate | Command | Result |
|---|---|---|
| Typecheck + lint | `bun run check` | exit `0`; `tsc --noEmit` + `eslint src --max-warnings=0` clean |
| Frontend/API tests | `bun test tests/` | `651` tests across `59` files: `644 pass`, `7 skip`, `0 fail` |
| Contracts | `forge test` | `632` tests across `31` suites: `632 pass`, `0 fail`, `0 skip` |

These gates are a baseline, not a safety proof. They show the repository is self-consistent at this commit.

## Active deployment addresses (source of truth)

| Item | Address | Source |
|---|---|---|
| Chain ID | `5042002` | `src/lib/config.ts` |
| USDC (ERC-20 facade) | `0x3600000000000000000000000000000000000000` | `api/_contracts.js:8`, `.env.example` |
| `ServiceRegistryV8` | `0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3` | `.env.example:22` |
| `PayPerCallV8` | `0xedce61eF5be31DC22cEfE342692622A26919a7EF` | `.env.example:23` |
| `SLAKeeper` | `0xBe897043e4c21cFe9A6532e43542CA48EaD83CB7` | `.env.example:24` |
| `DisputeV4` | `0xECDb019F1E92Ad35324cc7bBDf1D56b9e70B305B` | `.env.example:26` (API variable name is `DISPUTE_V2`) |
| `SLAEvidenceRegistryV2` | `0x64872c29A19dF8E471103d0708397BAb96A311FC` | `.env.example:27` |
| Facilitator | `0x0E515aEd287a7b3d2D9F7911321d99826653Fbd8` | `.env.example:40` |
| v1 evidence registry (legacy) | `0x7d643B2bE50F6E7593c09A0fc26246ca06d862dB` | `AGENTS.md` |
| `DisputeV3` (retired) | `0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec` | `src/lib/config.ts:110` |

The API reads `DISPUTE_V2` but the value is `DisputeV4`. This is documented, and is itself a configuration-fragility item to re-check in the operations pass.

## Previous audit reconciliation (`docs/audit-mainnet`)

| ID | Previous severity | Status at this baseline | Evidence |
|---|---|---|---|
| AM-01 | Blocker | **Open** — one owner EOA still holds registry admin and dispute roles | `contracts/ServiceRegistryV8.sol:151-169`; `contracts/DisputeV4.sol:415-433`; deployment docs |
| AM-02 | Critical | **Open** — dispute parameters remain arbiter-controlled | `contracts/DisputeV4.sol:436-457`, `:585-587` |
| AM-03 | High | **Fixed locally, not deployed** — missing facilitator key now returns `503 SETTLEMENT_UNCONFIGURED` | `api/call-service.js` (commit `3e279bd`); `tests/api-call-service.test.ts` |
| AM-04 | High | **Fixed locally, not deployed** — production defaults idempotency on and fails closed without Upstash | `api/call-service.js` (commit `3e279bd`); `tests/call-service-default-handler.test.ts` |
| AM-05 | High | **Fixed locally, not deployed** — approvals bounded to the requested amount | `src/components/panels/CallBuilder.tsx` (commit `77850f0`); `tests/approval-scope.test.ts` |
| AM-06 | Medium | **Open** — `callServiceFor` can still fill a third party's per-caller cap | `contracts/PayPerCallV8.sol:124-147`, `:333-378` |
| AM-07 | Medium/High | **Open** — registry admin can authorize any slasher | `contracts/ServiceRegistryV8.sol:158-172` |
| AM-08 | Medium | **Open** — zero slash / zero price provider remains possible | `contracts/ServiceRegistryV8.sol:461-464`; `contracts/PayPerCallV8.sol:333-378` |
| AM-09 | Low/Medium | **Open** — pending terms proposal can be overwritten | `contracts/ServiceRegistryV8.sol:272-287` |
| AM-10 | Medium/Low | **Not re-checked** — explicit settlement receipt status | `api/_settle.js` |
| AM-11 | Low | **Not re-checked** — public API surface and CSP | `vercel.json` |
| AM-12 | Low | **Not re-checked** — dead client private-key path | `src/lib/utils.ts:112-125` |
| AM-13 | Low | **Not re-checked** — client examples display server-secret names | `src/components/panels/Nano.tsx`, `Providers.tsx` |
| AM-14 | Info | **Open by design** — availability target is stored, not enforced | `contracts/ServiceRegistryV8.sol`, `contracts/PayPerCallV8.sol` |
| AM-15 | Info | **Open by design** — Arc-specific USDC assumptions | Arc native asset + ERC-20 facade |

## File inventory used for citation

| Area | Files | Approximate size |
|---|---|---|
| Core contracts | `PayPerCallV8.sol` 385 lines, `ServiceRegistryV8.sol` 466, `DisputeV4.sol` 613, `SLAEvidenceRegistryV2.sol` 267, `SLAKeeper.sol` 116 | ~1,850 lines |
| ZK/provenance | `contracts/zk/` 4 files + `SLAProvenance.sol` | ~2,900 lines including generated verifier |
| Legacy contracts | 23 `contracts/*.sol` plus interfaces | ~8,000 lines |
| API | 21 files in `api/` | ~5,400 lines |
| Frontend | `src/` panels, hooks, config, utilities | 60+ panels and shared modules |
| Operations | `script/` 16 scripts, `.github/workflows/`, `scripts/`, `vercel.json` | — |
| Indexing / facilitator | `subgraph/`, `x402-facilitator/` | — |

## Evidence rules for this audit

- A claim without a file and line is not a finding; it is an open question.
- `UNVERIFIED` means no read-only evidence exists at baseline.
- Existing tests support only what they assert. They do not prove the absence of a bug.
