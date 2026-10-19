# Phase 5 completion checklist

Prompt: `design/PHASE_5.md` (verbatim body sha256
`96ead39ffabe5f47160d0e343e86916128230b90679b8e3fc1ab867e1e4f7345`, delivered
2026-10-19T15:41:01 local / 12:41:01Z, session `ses_eb4f80b11ffenLQxHoNHeXii07`,
message `msg_1542df7dc001OPZ46XRH35F95L`; provenance header in the file).
Started: 2026-10-19. Phase commits (local only, never pushed):

| Commit | Scope |
|---|---|
| `68c64f5` | `providerMetrics.ts` + 47 unit tests |
| `75b3f75` | Marketplace rewrite |
| `9f97a58` | Provider details rewrite |
| `ae68d0a` | topbar/viewport fix, Marketplace header gutter, plural copy |
| `3db98f5` | Rankings rewrite + shared compare modal |
| `9c721e1` | Providers rewrite |
| (this commit) | `design/PHASE_5.md`, this checklist, `docs/*` |

Legend: `OPEN` = not started · `UNVERIFIED` = not measurable in this environment ·
`PASS` / `PARTIAL` / `FAIL` as in the Phase 4 checklist. A row may only move off `OPEN`
with evidence recorded in this file or in `docs/progress.md`.

Phase 5 scope of record (confirmed by the user before editing): the provider-facing surfaces —
`Marketplace`, `Providers`, `Provider details` (`provprofile`), `Rankings` (`leaderboard`)
— plus the provider-management surface already built in Phase 4 (`Register`), preserved
rather than rebuilt. Other panels are out of scope unless the brief names them.

| # | Requirement (phase prompt) | Implementation evidence | Verification method | Actual result | Status | Limitation / blocker |
|---|---|---|---|---|---|---|
| 1 | §1 Inspect the repository first; verify what is really implemented before changing anything | Pre-edit reads of `Marketplace.tsx`, `ProviderProfile.tsx`, `Leaderboard.tsx`, `Providers.tsx`, `src/lib/config.ts`, `src/lib/subgraph.ts`, `contracts/ServiceRegistry.sol:572-580`, `contracts/PayPerCall.sol:303-470`, `api/ping-provider.js`; findings listed under "Known data limits" | `git status`/`git log`, file reads, `docs/progress.md`/`decisions.md`/`audit.md` | Real state differed from the summaries in four places: the honor-rate fallbacks, the `Math.random()` sparkline, the `?id=` ping call against a `?url=` route, and the dead `.lb-*` CSS. All recorded in `docs/audit.md` | PASS | — |
| 2 | §2 Discover and apply relevant installed skills; record which were actually used | No `skill` tool invocation is recorded in this session's transcript for Phase 5 | Session transcript; tool-call log | Browser work followed the `agent-browser` MCP tool contract and the TermFold section of `AGENTS.md`; no Superpowers skill was loaded for this phase | PARTIAL | Recorded rather than claimed: the phase did not run a skill workflow, so §2 is only partly satisfied |
| 3 | §3 Design direction: reuse existing tokens/primitives; no second visual system; no oversized cards, decorative metrics or excessive glow | `grep -n "#[0-9A-Fa-f]\{3,6\}"` over the five panel files returns nothing; all colour comes from tokens. Panels are built from `PageHeader`, `SectionCard`, `Table`, `Tabs`, `Badge`, `AddressPill`, `Copy`, `EmptyState`, `ErrorState`, `Skeleton`, `Modal` | source diff; browser render vs Overview | One visual system; the only new classes are layout (`.mp-*`, `.pp-*`, `.lb-*`, `.pv-*`, `.cmp-*`) | PASS | — |
| 4 | §4 Marketplace provider discovery: real fields only, identity, price/SLA hierarchy, status, contextual action, clear cards-vs-table roles | `Marketplace.tsx`; real data for provider #1 (1 USDC, 120 s, 2000 bps, 10 USDC stake, score 66, NFT #897335, 0 calls); SLA fields merged from one batched `useReadContracts` | source read + browser render with real provider data | Cards show id, status, NFT, owner, price, response window, stake, calls, score; grid/list is a density toggle over the same card, not a second table | PASS | Subgraph has no endpoint/description field, and no SLA window until the multicall returns — shown as "not readable", never as zero |
| 5 | §5 Search/filters/sorting: filters affect results, sorting uses underlying values, decimals/units correct, combined filters, reset, loading/empty/error distinct | `providerMetrics.ts` (`filterProviders`, `isFilterActive`, `sortProviders`); `tests/provider-metrics.test.ts` | `bun test tests/` (47 pass) + browser interaction | Price/stake filters parse 6-decimal strings; sort compares `bigint`; direction resets per key; combined filters, reset, invalid-amount error and four distinct states verified | PASS | — |
| 6 | §6 Provider details: hierarchy, truncation + copy/inspect, explorer links only where valid, and verified / configured / calculated / unavailable kept distinct | `ProviderProfile.tsx`; every stat carries a source line ("Registry", "Subgraph total", "Read from getReputationScore", "No denominator yet") | source read + browser render + address copy | Unregistered id, failed read, loading and success are separate; endpoint reported unavailable with the reason | PASS | — |
| 7 | §7 Provider management: preserve current capabilities; do not expose unauthorised controls; validate writes, review, no false success, no duplicate submit | `Register` untouched (`git diff --stat 68c64f5^ HEAD -- src/components/panels/Register.tsx` is empty); no write workflow was added to the four panels | source read; `git show --stat` per commit | No write path was added or changed; the shipped ABIs still expose only `register`, `registerV2`, `unstake` | PASS | No price/SLA update or deactivate function exists in the shipped ABIs, so none is exposed |
| 8 | §8 Price/stake/SLA presentation: USDC 6-decimal correctness, no float arithmetic for financial maths, units stated, unavailable shown explicitly | `usdcExact`, `usdcCompact`, `usdcFromInput` (BigInt); every amount prints "USDC"; slash prints "20.00% of stake · 2 USDC per slashed call" | executed unit tests + source read | Money never passes through `Number()`; `Number()` is used only for counts and seconds | PASS | — |
| 9 | §9 Reputation/performance: audit each metric's source, definition, denominator, staleness; never combine scores into a new formula; no fake sparklines or trends | `providerMetrics.ts` is the only definition; `docs/audit.md` lists every removed claim; `ProviderProfile` prints "no settled calls" with no denominator | source read of every score site + browser render | One score (registry formula, empty record 66), one honor rate that can be `null`, no sparkline, no trend arrow, no tier names | PASS | — |
| 10 | §10 Loading, empty, error, stale, unavailable, and transaction states all deliberate and visually distinct; errors never look like empty results | Four panels; `Providers` adds invalid-id; `Marketplace` footer prints source + freshness; `ProviderProfile` keeps the record readable when the indexer fails | browser states with real fetches and, for errors, a failing read | Verified: loading skeleton, RPC error + Retry, unregistered id, no-match, invalid input, and indexer-down-with-cached-record are visually different | PASS | No transaction is initiated by these four panels, so the pending/confirmed/rejected path is unchanged from Phase 4 |
| 11 | §11 Meaningful motion only; no infinite card animation, fake live indicators or artificial counters; reduced-motion respected | No animation added; transitions are `.15s` colour/border only; global reduced-motion block `index.css:2450-2462` covers every transition this phase added | computed-style scan under reduced motion + source read | Reduced-motion honours the OS preference for every new rule; nothing new loops | PASS | The shell's existing LiveBar/spinner animations are untouched and are outside the four panels |
| 12 | §12 Responsive desktop/tablet/mobile, both themes, no layout break on long addresses/names/endpoints | `@media` blocks for `.mp-*`, `.pp-*`, `.lb-*`, `.pv-*`; `AddressPill` truncation fix; topbar fix | browser at 1280×900, 834×1000, 411×900, dark + light | Zero elements extend past the viewport in any panel at any of the three widths; the 18 px shell overflow found at 411 px is fixed | PASS | The fix for that overflow is one shell media query (`index.css`, `.tb-brand` below 430 px), documented in `docs/decisions.md` |
| 13 | §13 Accessibility: labels, keyboard path through search/filters/results/actions, focus states, contrast, status not colour-only, dialogs, touch targets | Labelled inputs, `aria-pressed` on compare toggles, live `role="status"` regions, `aria-invalid` + describedby on the id field, text-bearing badges | axe-core 4.14.0 both themes + real keyboard walk | 0 violations per panel per theme (table in `docs/progress.md`); keyboard walk shows a visible ring on every stop; the one real axe failure (`scrollable-region-focusable`) was fixed | PASS | `color-contrast` nodes over tinted fills remain `incomplete`; measured by hand (15.53:1, 15.53:1, 5.45:1, 7.24:1). No real screen reader available |
| 14 | §14 Performance/architecture: reuse existing hooks/cache/polling, no new state layer, no duplicate fetches, no new dependencies, no contract/API changes | `package.json` unchanged; `useSubgraph` + `useReadContracts` reused; one query per panel; `git diff --stat 68c64f5^ HEAD -- src/lib src/store` is empty | `package.json` diff; source read of hook usage; build output | No dependency, contract, ABI, API or store change; Marketplace adds exactly one batched multicall | PASS | — |
| 15 | §15 Verification: typecheck, lint, build, tests, real-data render, filters/sorting/reset, states, navigation, copy/explorer, permissions, tx lifecycle, formatting, viewports, themes, keyboard, reduced motion, console errors | Commands and results below | as listed | All gates green; the matrix in `docs/progress.md` records each interaction | PASS | Transaction lifecycle not exercised: these panels submit nothing |
| 16 | §16 Documentation and Git safety: progress/decisions/audit (+panel-inventory if the inventory changes); preserve unrelated changes; no push/deploy | `docs/progress.md`, `docs/decisions.md`, `docs/audit.md` appended; this checklist filled | `git status`/`git show --stat` before and after | Only phase files and panel sources staged; `.agents/`, `skills-lock.json`, `docs/superpowers/` never staged; nothing pushed or deployed | PASS | — |
| 17 | §17 Final report, all 8 items, and the definition of done | Delivered in the session reply after this checklist | cross-check against the phase prompt | Report lists what changed per panel, the verified data, the gates, the axe matrix, and every limit | PASS | — |

## Verification commands (run on this tree)

```
bun run typecheck   # tsc -p tsconfig.json --noEmit — clean
bun run lint        # eslint src --max-warnings=0 — clean
bun run build       # vite build — built in ~1m50s; dist/ is gitignored, so no diff
bun test tests/     # 47 pass, 0 fail, 125 expect() calls
```

## Known data limits (verified before editing)

These are facts about the current implementation, gathered while reading the repo. They
bound what the phase may display.

- `src/lib/subgraph.ts:4-26` — the indexed `Provider` has `id`, `owner`, `signer`,
  `stake`, `pricePerCall`, `active`, `deactivatedAt`, `completedCalls`, `slashedCalls`,
  `totalSlashed`, `totalUnstaked`, `nftTokenId`, `nftBound`, `createdAt`, `updatedAt`.
  `maxResponseTime`, `slashBps` and `endpoint` are declared optional in the type but are
  **not** in the GraphQL selection (`src/lib/subgraph.ts:76-83`), so they are `undefined`
  for every provider the Marketplace lists.
- `src/lib/config.ts` `REGISTRY_ABI` — `getProvider(id)` returns a 9-field tuple
  (`owner, signer, stake, pricePerCall, maxResponseTime, slashBps, active,
  maxConcurrentCalls, zkTier`). `getReputationScore(id)`, `completedCalls(id)`,
  `slashedCalls(id)`, `providerIdOf(owner)`, `nextProviderId()` are available views.
  No `updatePrice` / `deactivate` / `addStake` function exists in the shipped ABI.
- `multicall3` is configured (`src/lib/config.ts:46-47`) and `useReadContracts` is already
  used in the app (`src/components/panels/Disputes.tsx:2,96`).
- Scores in the wild: `fetchProviders` computes the Bayesian score matching the contract
  (`src/lib/subgraph.ts:88-91`, "never a free 100"); `Leaderboard.tsx:23-26` computed a raw
  honor rate and returned `100` when there were no calls; `ProviderProfile.tsx:74` computed
  the same raw rate and returned `0`. Three different answers for one concept.
- Fabricated data: `Marketplace.tsx:32` (`Math.random()` reputation bars, labelled
  "Reputation trend") and `Marketplace.tsx:160-162` ("Low honor rate — high timeout risk",
  a causal claim the data does not carry).
- `Marketplace.tsx:297-300` sorts with `Number()` on 6-decimal `bigint`-as-string fields
  and forces `sortDir = "desc"` whenever the sort key changes (`Marketplace.tsx:343`), so
  the "Lowest price" option sorts highest price first.
- Provider-details is not a route: `Marketplace.tsx:407` hands off through
  `sessionStorage["provprofile_id"]`, read back at `ProviderProfile.tsx:31`.

## Open decisions — resolved before implementation

1. Panel scope — confirmed: the four provider panels, `Register` preserved.
2. On-chain SLA read — confirmed: one batched `useReadContracts` on the Marketplace.
3. Fabricated data and the honor-rate fallbacks — confirmed: removed, replaced with real data
   and explicit unavailable states; "At Risk"/"Elite" replaced by the bare registry score.
4. Commit policy — confirmed by the user: commit per task after typecheck, lint and build,
   and report each commit. No push, deploy or publish was authorised or performed.
5. Compare surface — one shared `ProviderCompare.tsx` used by Marketplace and Rankings, moved
   onto the `Modal` primitive; grid/list stays a density toggle, no new table layout.
6. Search scope — id, owner and signer only, because no endpoint or description field exists.

## Deliberately carried forward from Phase 4

- Row 2 of the Phase 4 checklist (no skill used during Phase 4) stays `FAIL`; it is a
  historical fact. Phase 5 records its own skill usage in row 2 above.
- The 49 dark / 54 light axe `color-contrast` `incomplete` nodes stay unresolved as an
  automated result; the manual contrast measurements stand.
- The three `--motion-*` double-easing sites (`shell.css:479`, `shell.css:806`,
  `index.css:677`) are still unfixed by instruction; they are outside this phase.
- No real screen reader is available in this environment.
