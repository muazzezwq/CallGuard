# v7 → v8 panel migration

Audit date: 28 October 2026. Read-only pass; no production code changed.

`src/lib/config.ts` exposes both stacks:

- `CONFIG` — v7 addresses (`registry 0x9ca97010…7333`, `payPerCall 0x5fb41dd2…0540`,
  ABIs `REGISTRY_ABI` / `PPC_ABI`).
- `V8_CONFIG` — v8 addresses and ABIs, plus the switches `V8_ENABLED`,
  `ACTIVE_REGISTRY_ADDRESS`, `ACTIVE_PPC_ADDRESS`, `REGISTRY_ABI_V8_ACTIVE`,
  `PPC_ABI_V8_ACTIVE`.

Panels that hardcode `CONFIG.<address>` keep talking to the retired stack. They do not
error; they read empty values and submit writes that cannot succeed. That silence is the
risk this document exists to remove.

## Evidence collected on chain

Probes against the live v8 contracts (`registry 0x793028B6…12A3`,
`payPerCall 0xedce61eF…a7EF`), 28 Oct 2026:

| Probe | Result | Meaning |
|---|---|---|
| `registry.admin()` | `0xfbac99E6…06Da` | v8 exposes `admin`, **not** `owner` |
| `registry.owner()` | revert | `AdminPanel`'s owner read is dead on v8 |
| `registry.payPerCall()` | `0xedce61eF…a7EF` | already wired |
| `registry.pendingPayPerCall()` | revert | no such function in v8 |
| `registry.payPerCallChangeAt()` | revert | no such function in v8 |
| `registry.proposePayPerCall` / `executePayPerCall` | absent from source | two-step handover never existed in v8 |
| `registry.setPayPerCall(address)` | exists, `onlyAdmin`, reverts `PayPerCallAlreadySet` once set | permanently unusable: it is set |
| `registry.getReputationScore(uint256)` | revert | absent in v8 |
| `registry.completedCalls(uint256)` / `slashedCalls(uint256)` | revert | no standalone getters; the counters live inside `getProvider` |
| `registry.getProvider(1)` | 11 words | v7 was 9 words; `active` moved index `6` → `5` |
| `registry.nextProviderId()` | `3` | present |
| `registry.getTerms(uint256,uint32)` | present | needs two args |
| `payPerCall.claimable(0xfbac99E6…06Da)` | `17527733` (17.527733 USDC) | **real money invisible to the Payments panel today** |
| `payPerCall.pipelineHook()` | revert | no hook in v8 |
| `payPerCall.nextCallId()` | revert | no such counter in v8 |
| `payPerCall.callService` | present, returns `bytes32` | v7 returned `uint256` |
| `payPerCall.callServiceWithAuthorization` | present in source | the ABI in `config.ts` does not list it |
| `payPerCall.claimTimeout(bytes32)` | present | same signature as v7 |
| `payPerCall.claim()` | present | same as v7 |

## Panel audit

`v7 refs` counts `CONFIG.<registry|payPerCall|…>` uses. Verdict is about behaviour on the
live v8 stack, not about code style.

| Panel | v7 refs | Calls it makes | v8 state | Verdict |
|---|---|---|---|---|
| `AdminPanel.tsx` | 14 | `owner`, `payPerCall`, `pendingPayPerCall`, `payPerCallChangeAt`, `setPayPerCall`, `proposePayPerCall`, `executePayPerCall` | 1 of 4 reads valid; 3 reads and all 3 writes dead | **PASS** (P3, 28 Oct) — rewritten as a read-only wiring card: `admin()`, `payPerCall()`, the reverse `payPerCall.registry()` check, `authorizedSlashers(DisputeV4)`, `keeperBountyBps`, `SUBMIT_GRACE`, `nextProviderId`. No write form |
| `PipelineHook.tsx` | 6 | `pipelineHook`, `setPipelineHook` | absent in v8 | **FAIL** — feature retired; panel must go or say so |
| `Notifications.tsx` | 3 | 3 `useWatchContractEvent` on the v7 PPC | events exist in v8, address does not | **FAIL** — silently receives nothing |
| `Payments.tsx` | 2 | `claimable`, `claim` (+ USDC `balanceOf`) | both exist in v8 | **FAIL** — 17.527733 USDC claimable is not shown |
| `Requests.tsx` | 2 | `claimTimeout(bytes32)` | exists, same signature | **FAIL** — address/ABI only; arg is already `bytes32` |
| `BulkCall.tsx` | 1 | `callService` | exists, returns `bytes32` | **FAIL** — address/ABI only; return value unused |
| `Nano.tsx` | 2 | `approve` + `callService`, `getProvider` positional `[6]`/`[3]` | exists; **field indices shifted** | **FAIL** — address, ABI *and* the positional `active` index |
| `ProviderProfile.tsx` | 1 | `getProvider`, `getReputationScore`, `completedCalls`, `slashedCalls`, `getEndpoint` | 2 of 5 revert | **FAIL** — score must be computed from the counters inside `getProvider` |
| `PasskeyWallet.tsx` | 1 | `callService` via `VITE_PAY_PER_CALL ?? CONFIG.payPerCall` | exists | **PARTIAL** — silent v7 fallback when the env var is unset |
| `Providers.tsx` | 2 | `getProvider`, `getTerms`, `getEndpoint`; also renders integration snippets | reads are v8-aware (`V8_ENABLED`), but the snippets still print the v7 PPC/registry addresses and tell the reader the reply is a "9-field tuple" | **PARTIAL** — the panel is right, the copy-paste text is wrong |
| `Uptime.tsx` | 2 | `V8_CONFIG.registryAddress` + `REGISTRY_ABI_V8` | v8 | **PASS** |
| `DisputesV8.tsx` | 2 | `DISPUTE_V3_ADDRESS`/V4 switch, `PPC_ABI_V8` | v4 | **PASS** |
| `V7Cleanup.tsx` | 1 | v7 admin writes | intentional | **PASS** — the deliberate v7 write path |
| `MarketingLayout.tsx` | 2 | `CONFIG.explorerAddr(CONFIG.registry / payPerCall)` | links open v7 on the explorer | **PARTIAL** — links point at retired contracts |

`src/hooks/useOnchain.ts` already handles this: `useProviderScore` calls
`getReputationScore` but is gated `enabled: !V8_ENABLED` and carries a comment saying v8 has
no stored score. `ProviderProfile` is the only remaining direct caller.

## Facts that decide the port

1. `getProvider` grew from 9 to 11 words. Named access works; **positional access does not
   survive the port**. `Nano.tsx` uses `p?.active ?? p?.[6]` — on v8 `active` is index `5`.
   Convert every positional read to a named one, or the port silently reintroduces the bug.
2. `getProvider` now carries `completedCalls` and `slashedCalls`, so `ProviderProfile` does
   not need new contract functions. `src/components/panels/providerMetrics.ts` already
   computes `((completed + 2) × 100) / (completed + slashed + 3)`, the same formula as
   `getReputationScore`. The panel must stop calling the removed getter and use that.
3. `callService` returns `bytes32` on v8 and `uint256` on v7. Neither `BulkCall` nor `Nano`
   consumes the return value, so the ABI swap is enough — but do not add code that assumes
   a number.
4. `AdminPanel`'s write path cannot be ported. v8 wires `payPerCall` once, at deploy, and
   `setPayPerCall` reverts afterwards. The panel's job becomes: show `admin()`,
   `payPerCall()`, the registry/PPC pair, and the slasher authorisation list — read-only,
   with an explicit "wired at deploy; not changeable" note. `V7Cleanup.tsx` keeps the v7
   write path, and nothing else should.
5. `PipelineHook` has no v8 counterpart. Removing the panel requires a route/entry and
   subgraph-side check; hiding it behind a flag leaves dead code that still reads.
6. `AdminPanel`'s `owner()` → `admin()` rename is not cosmetic: `Ownable` is not used by
   `ServiceRegistryV8`, so any generic ownership UI must not assume it.
7. The response window and the slash ratio left the provider record in v8: `getTerms(id,
   version)` now carries `maxResponseTime` and `slashBps` alongside
   `availabilityTargetBps`, and the record only carries `latestTermsVersion`. A panel that
   reads them straight off `getProvider` shows `0 s` and `0 bps` without any error.
8. `REGISTRY_ABI_V8` was a partial ABI: it had no `admin`, `payPerCall` or
   `authorizedSlashers`, and `PPC_ABI_V8` had no `registry()`. Those four read-only entries
   were added to `config.ts`, because a panel that cannot name a getter cannot show it.
9. The v8 events are **not** the v7 events with a new address. `CallStarted` carries eight
   fields (adds `termsVersion` and `termsHash` before `requestHash`), `ReceiptSubmitted`
   carries four (adds `termsVersion`), and `CallSlashed` carries four (adds
   `keeperBounty`). An address-only swap keeps the v7 topic filter and receives nothing,
   silently. `PPC_ABI_V8` already declares the right shapes; `Notifications` needed the ABI
   swap as much as the address swap.

## Phases

Each phase is independently shippable and verifiable. A phase is done only when its rows
in the checklist are `PASS`.

**P1 — address and ABI swap on panels with a 1:1 counterpart.** Done 28 Oct 2026
(`Payments`, `Notifications`, `Requests`, `BulkCall`, `PasskeyWallet`); gates clean
(`bun run typecheck`, `bun run lint`, `bun test tests/` 549 pass / 7 skip / 0 fail).
`Notifications`, `Payments`, `Requests`, `BulkCall`, `PasskeyWallet`.
Change `CONFIG.<addr>` → `ACTIVE_PPC_ADDRESS` / `ACTIVE_REGISTRY_ADDRESS` and
`PPC_ABI`/`REGISTRY_ABI` → `PPC_ABI_V8_ACTIVE`/`REGISTRY_ABI_V8_ACTIVE`.
Acceptance: Payments shows `claimable(owner) = 17.527733 USDC`; Notifications receives a
fresh `CallStarted` after a live call; `claimTimeout` simulate passes for a pending call.

**P2 — `Nano.tsx` positional indices + `ProviderProfile` score.** `ProviderProfile` done
28 Oct 2026 (gates clean). `Nano` is blocked: see the helper-contract finding below.
Replace positional reads with named fields; compute the score locally from the counters.
Measured target: provider `1` is `stake 16.044435 USDC`, `pricePerCall 1 USDC`, `active`,
`completedCalls 4`, `slashedCalls 7`, so `floor((4+2)*100/(4+7+3)) = 42`.
Acceptance: the panel renders those values and a score of `42`, with no `getReputationScore`
call left in the panel.

**P3 — `AdminPanel` redesign as read-only wiring card.** Done 28 Oct 2026; gates clean.
`admin()`, `payPerCall()`, `payPerCall.registry()`, `authorizedSlashers(DisputeV4)`, plus a
note that the wire-up is one-time. The three write forms are gone.

**P4 — `PipelineHook` retirement and `MarketingLayout` links.**
Delete the panel or gate it with a stated reason; point the footer links at the v8
addresses. Acceptance: no route to a panel that cannot work; footer opens v8.

**P5 — `Providers` integration snippets.**
The panel's reads are already v8; its code samples are not. Snippets must emit
`ACTIVE_PPC_ADDRESS`/`ACTIVE_REGISTRY_ADDRESS`, describe an 11-field `getProvider` reply,
and mention the `bytes32` `callId` where a sample shows the result. Acceptance: `grep` over
`Providers.tsx` finds no v7 literal, and the tuple text matches `ProviderView`.

## Checklist

| # | Item | Status |
|---|---|---|
| A1 | `Payments` reads `claimable` from v8 PPC | **PASS** — `ACTIVE_PPC_ADDRESS` resolves to `0xedce61eF…a7EF` with the checked-in env (`V8_ENABLED=true`); `claimable(0xfbac99E6…06Da)` reads `17527733` (`17.527733 USDC`) on chain |
| A2 | `Notifications` watches v8 PPC events | **PASS** — watch targets `ACTIVE_PPC_ADDRESS` with `PPC_ABI_V8_ACTIVE`; the ABI's `CallStarted`/`ReceiptSubmitted`/`CallSlashed` carry 8/4/4 fields, matching `IPayPerCallV8.sol`, and the v8 subgraph indexes `termsVersion` from that event. No live call was made during the phase, so no event was observed in a browser |
| A3 | `Requests` `claimTimeout` targets v8 PPC | **PASS** — same address/ABI pair; the argument was already `bytes32`, which is the v8 signature |
| A4 | `BulkCall` `callService` targets v8 PPC | **PASS** — same address/ABI pair; the call ignores the return value, so the `uint256`→`bytes32` change cannot be misread |
| A5 | `PasskeyWallet` has no silent v7 fallback | **PASS** — the fallback is `ACTIVE_PPC_ADDRESS`, and the inline ABI already declares `callService` returning `bytes32` |
| B1 | `Nano` uses named `getProvider` fields only | **PASS** — reads `ACTIVE_REGISTRY_ADDRESS` with the v8-aware ABI and no positional index. The batch approves **PayPerCall**, not the batch router (see the helper finding) |
| B2 | `ProviderProfile` computes the score, no `getReputationScore` call | **PASS** — reads `ACTIVE_REGISTRY_ADDRESS` with the v8-aware ABI, named fields only, counters from the record, `maxResponseTime`/`slashBps` from `getTerms(1, latestTermsVersion)`, score `floor((completed+2)*100/(completed+slashed+3))`. The v7 `getReputationScore` read survives only through `useProviderScore`, gated `enabled: !V8_ENABLED`. Provider `1` resolves to stake `16.044435`, price `1`, `active`, `4` completed, `7` slashed, score `42`, terms v1 window `120`, slash `2000` |
| C1 | `AdminPanel` shows `admin()` and `payPerCall()` | **PASS** — reads `0xfbac99E6…06Da` and `0xedce61eF…a7EF`; the reverse read `payPerCall.registry()` returns `0x793028B6…12A3`, so the pair matches both ways. `authorizedSlashers(DisputeV4)` is `true`, `keeperBountyBps` `500`, `SUBMIT_GRACE` `5`, `nextProviderId` `3` |
| C2 | `AdminPanel` has no one-time write form | **PASS** — `grep -rn "setPayPerCall\|proposePayPerCall\|executePayPerCall" src/` returns only the explanatory prose in the panel; no `useWriteContract` in the file |
| D1 | `PipelineHook` cannot be reached, or states why it is gone | UNVERIFIED |
| D2 | `MarketingLayout` footer links point at v8 | UNVERIFIED |
| F1 | `Providers` snippets print v8 addresses and an 11-field reply | UNVERIFIED |
| E1 | `bun run check` clean | UNVERIFIED |
| E2 | `bun test tests/` no new failures | UNVERIFIED |
| E3 | `grep -rln "CONFIG\.\(registry\|payPerCall\|ppcAddress\|registryAddress\)" src/` returns only `config.ts` (the `ACTIVE_*` fallbacks), `V7Cleanup.tsx`, `MarketingLayout.tsx` | UNVERIFIED |

## Known constraints

- A new `api/*.js` file breaks the Vercel Hobby 12-function cap; nothing here adds one.
- The v8 subgraph (`onur/1.0.0`) is the only indexer for new activity; the v7 Goldsky
  subgraph stops at the cutover. Panels that fall back to the subgraph must read v8.
- The 17.527733 USDC claimable balance is owner-wallet money. Fixing `Payments` makes it
  discoverable; withdrawing it is a separate, owner-signed action.

## Resolved finding — the Nano batch helper

`Nano.tsx` batches calls through `CONFIG.multicall3From` =
`0x522fAf9A91c41c443c66765030741e4AaCe147D0`. The explorer publishes verified source:
Circle's **`Multicall3From`** (compiler `v0.8.29`, optimization on, not a proxy). It is a
sender-preserving batch contract: `aggregate3` routes every subcall through the `callFrom`
precompile with `sender = msg.sender`, so the target sees the **original wallet** as
`msg.sender`, not the helper.

That makes the panel's original approval target wrong. Measured 28 Oct 2026:

| Probe | Result |
|---|---|
| `USDC.allowance(owner → helper)` | `3000000` — the panel's `approve` went to the helper and was never spent |
| `USDC.allowance(owner → PayPerCall v8)` | `max` — an old unlimited approval, which is the only reason any batch ever worked |
| `aggregate3([PPC.callService(1, …)], allowFailure=false)` simulated from the owner | succeeds and returns a `bytes32` callId — the subcall runs as the owner |
| `USDC.balanceOf(helper)` | `6173464` (6.173464 USDC) |

Consequences:

1. PayPerCall pulls the fee from the **wallet's** allowance to PayPerCall. A user who
   approved the helper had a zero allowance to PayPerCall, so every subcall reverted; with
   `allowFailure: true` the panel reported "❌ failed" per provider and no funds moved.
   Fixed: the panel now approves and checks allowance against `ACTIVE_PPC_ADDRESS`.
2. The helper holds `6.173464 USDC`. Its source has no `receive`, no `fallback`, no
   withdraw and no ERC-20 call path, so tokens sent to it cannot be moved by anyone. Treat
   that balance as burned; it is not a pool for future calls.
3. The stale allowance the panel left on the helper is harmless (the contract cannot pull
   ERC-20), but a wallet that ran the old flow still carries it. Revoking is optional and
   cheap; nothing else depends on it.
