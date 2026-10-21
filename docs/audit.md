# Audit — SPEC_1..SPEC_5 conformance

Independent verification by reading code (not prior reports). Status is `done` only
when code implementing the item is cited. Updated after the completion pass.

| # | Item | Evidence | Status |
|---|---|---|---|
| 1a | Dark tokens match SPEC_1, **except the three SPEC_1 values that fail WCAG AA** — `--danger`/`--slash` `#EE4539` → `#EF4E43`, `--info`/`--pending` `#1F77EF` → `#3E8AF1`, `--text-faint` `#4D5F76` → `#7C90A9` (see the final-pass addendum at the end of this file, and `docs/decisions.md`) | `src/index.css:4-31` (bg `#000D1A`, card `#051528`, border `#0B1E30`, line `#112939`, accent `#19D186`, guard-hi `#1CE08E`, text `#FDFEFF`, dim `#8A9FB2`) | done |
| 1b | Light tokens match SPEC_1 | `src/index.css:70-111` (bg `#F1F5FA`, alt `#EAF0F8`, card `#F9FBFD`, border `#EAF1F8`, text `#091636`, dim `#667A98`); topbar light `src/components/layout/shell.css:17-20` | done |
| 1c | Old literals gone from `src/` + `tailwind.config.js` | `src/` and `tailwind.config.js` clean (grep); `index.html` theme-color was `#0A0E14` -> `#000D1A` | done |
| 2a | Primitives: Card / Stat+Sparkline / Chip / Button / Tabs / Table / inputs / Stepper / Skeleton / Empty | `src/ui/*` + `src/ui/ui.css` (`.ui-card`, `.ui-statcard`+`__spark`/`__delta`, `.ui-chip`, `.ui-btn`, `.ui-tabs`, `.ui-table`, `.ui-input`/`.ui-select`, `.ui-step`, `.ui-skel`, `.ui-empty`) | done |
| 2b | Shared error state | `src/ui/ErrorState.tsx` (`.ui-error`) | done |
| 3 | Shell: sidebar active `#014237` + wallet card, topbar Arc Testnet + wallet pills, mobile bottom nav, hamburger drawer | `shell.css:14,138-153,77-84`; `Sidebar.tsx:83,121,196`; `AppTopbar.tsx:78-85`; `AppShell.tsx:167,213-229` | done |
| 4a | Overview (4 stat cards + sparkline + delta, Live Network + legend, Recent Activity, Flow stepper, Service Health) | `Overview.tsx:262,290-301,306,339-355` | done |
| 4b | Marketplace (search, chip filters, provider cards) | `Marketplace.tsx:330,338-347,122-124` | done |
| 4c | Call Builder (tabs, labeled fields, create call) | `CallBuilder.tsx:481-484` | done |
| 4d | Transactions + detail (back arrow, status chip, 4-step stepper, key-value card) | `History.tsx` detail block (`.tx-detail__head`, `Stepper` from `statusSteps()`); Transaction Hash / View on Explorer omitted — the `Call` entity has no `txHash` | done |
| 4e | SLA Canvas legend (Success/Pending/Failed) | `History.tsx` SLA lifecycle card legend | done |
| 5 | 34 panels use their template with features kept | `docs/panel-inventory.md` (all rows done); off-token `#f59e0b` etc. replaced with `var(--warn)`/`var(--info)` | done |
| 6 | Landing sections 1-8 in order, navbar mapping + anchors, 5 marketing pages | `Landing.tsx:174,218,235,261,285,298,314`; `MarketingLayout.tsx:11-15,78-80`; routes verified in browser | done |
| 7 | 3D hero: deps (three, r3f v8, drei v9, postprocessing v2), lazy+Suspense, SVG fallback | `package.json`; `src/marketing/HeroScene.tsx`; `Landing.tsx:127-137`; live canvas verified | done |
| 8a | Focus states | `src/index.css:541` global `:focus-visible` | done |
| 8b | Reduced-motion | `index.css:2304+`, `ui.css:304`, `shell.css:455`, `marketing.css:380`; flow gated `Landing.tsx` | done |
| 8c | Light theme on every panel | footer white-on-dark fixed (`index.css` stray `.app-footer` bg); panels verified in browser (dark + light) | done |
| 8d | No horizontal overflow 375/768/1440 | landing + marketing + panels checked in browser (411 / 1280) | done |

Before: 12 done / 6 partial / 0 missing.
After: 20 done / 0 partial / 0 missing.

Notes:
- Browser widths available are 411 (phone) and 1280 (desktop); 375/768/1440 not exposed by
  the harness browser. No overflow at 411/1280.
- Panels were screenshot-verified via a throwaway `tmp-screenshots` branch with a wagmi
  mock connector (never merged). The canonical subgraph returns `calls: []`, so the
  Transaction Detail body could not be exercised with live data; it is verified by
  typecheck + static review + a CSS-token probe (see `docs/decisions.md`).
- "View on Explorer" / "Transaction Hash" (4d) is intentionally omitted: `subgraph/schema.graphql`
  `Call` (lines 21-34) has no `txHash`, only `callId` (bytes32); `txHash` lives on unrelated
  event entities. Adding a link would invent data.

## Phase B — shared `<ErrorState>` adoption

Replaced ad-hoc fetch-error markup (custom red banners/cards) with the shared
`src/ui/ErrorState.tsx`, keeping the existing message text and adding a Retry
action where the query exposes `refetch`/a loader:

| Panel | Before | After |
|---|---|---|
| `Analytics.tsx` | inline red banner `⚠ {error} — showing cached data…` | `<ErrorState>` with same message + Retry (`loadAnalytics`) |
| `ProviderProfile.tsx` | red-bordered card "Provider #N not found or inactive." | `<ErrorState>` with same title + Retry (`refetch()`) |
| `Providers.tsx` | inline red text "Provider #N not found." | `<ErrorState>` with same title + Retry (`refetchProv()`) |

Not converted (not panel-load failures — they are results of a user action/form
state, so a full-surface ErrorState would be wrong): `CallBuilder` provider
"not found" form notice + facilitator fallback notice, `Agent`/`BulkCall`/
`Bridge` per-action result lines, `AdminPanel` tx `StatusBadge`, `Jobs`/
`Disputes` lookup-result rows, `Nano`/`Attestation`/`Verify` toast+output.

## Phase C — per-panel screenshot sweep (throwaway `tmp-screenshots`)

Method: a wagmi `mock` connector (never merged) autoconnected a real address, and a
`window.__setPanel` hook drove all 34 panels. For each panel: title asserted, then
screenshots `dark 1280`, `dark 411`, `light 1280`. Programmatic overflow + console-error
probes ran for every panel at 1280 and 411. Artefacts under `docs/screenshots/panels/`
(34×3) plus `history-detail-1280-dark.png` (seeded call).

Result: **34 pass / 0 blocked.**

| # | panel | title rendered | verdict |
|---|---|---|---|
| 1 | overview | Overview | pass |
| 2 | marketplace | Marketplace | fixed (mobile list card wrapped) |
| 3 | calls | Create your custom SLA call. | pass |
| 4 | history | Transactions | fixed (refunded/slashed flags) |
| 5 | receipts | Receipts | pass |
| 6 | providers | Providers | pass |
| 7 | leaderboard | Leaderboard | pass |
| 8 | provprofile | Provider Profile | pass |
| 9 | mcp | MCP / API | pass |
| 10 | apidocs | API & Integration Docs | pass |
| 11 | webhooks | Webhooks | pass |
| 12 | pipelinehook | ERC-8183 Pipeline Hook | pass |
| 13 | nano | Nanopayment | pass |
| 14 | bridge | CCTP Bridge | pass |
| 15 | balance | Unified Balance | pass |
| 16 | agent | Agent Wallet | pass |
| 17 | passkey | Passkey Wallet | pass |
| 18 | requests | My Requests | pass |
| 19 | payments | Payments | pass |
| 20 | disputes | Quality Disputes | pass |
| 21 | quality | Quality Disputes | pass |
| 22 | lending | Reputation-Backed Lending | pass |
| 23 | futures | SLA Futures | pass |
| 24 | attestation | SLA Attestation Bridge | pass |
| 25 | subscriptions | Subscriptions | pass |
| 26 | jobs | ERC-8183 Agentic Commerce | pass (5-step rail is horizontally scrollable by design) |
| 27 | bulkcall | Bulk Call | pass |
| 28 | verify | Verify Receipt | pass |
| 29 | register | Become a Provider | pass |
| 30 | privacy | Privacy | pass |
| 31 | admin | Admin Panel | fixed (`panel-head` light) |
| 32 | analytics | Network Analytics | pass |
| 33 | notifications | On-Chain Alerts | pass |
| 34 | settings | Settings | fixed (`panel-head` light) |

Shared fixes applied (benefit more than one panel): `.panel-head` background
`rgba(13,20,33,.6)` -> `var(--surface-1)` (was a dark band on light: Settings, Admin,
Quality, and every `.panel-head` panel); `[data-theme="light"] .mobile-bottom-nav`
override (dark bottom bar on light); marketplace list card wraps on ≤768px.
Task-specific fix: `History.tsx` refunded/slashed badges used string truthiness
(`"0"` is truthy) — now numeric. Overflow: none at 1280; none at 411 after the
marketplace fix. Console errors: none on any panel.

## Phase D — Landing verification (SPEC_6)
| Viewport | Theme | Overflow | 3D/fallback | Anchors |
| --- | --- | --- | --- | --- |
| 1280 | dark | none | 3D (readback 13 calls / 2280 tris, bright core) | `#product`/`#developers`/`#ecosystem` present |
| 1280 | light | none | 3D | present |
| 411 | dark | none | 3D (scene active) | present |
| 411 | light | none | 3D | present |
| 1280 | dark | none | forced SVG fallback renders "C" core + nodes | n/a |

Section order matches SPEC_4: hero -> trust row -> Product -> Developers -> Ecosystem -> CTA -> footer.
Fix: `.mk-hero__art` `height: 420px` (was collapsed; the WebGL canvas rendered into ~150px).
Note: harness screenshots do not composite the WebGL surface, so the 3D hero is proven by
`gl.readPixels`; the fallback and page chrome are screenshot-verified.

## SPEC_8 item 1 — ESLint baseline (real lint)
`package.json` `lint` now runs `eslint src` against a flat config (`eslint.config.js`):
typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-jsx-a11y. Existing violations are
warnings; only `react-hooks/rules-of-hooks` and a curated correctness set (no-unreachable,
no-dupe-keys, no-dupe-else-if, no-constant-condition, use-isnan, valid-typeof, ...) are errors.
Baseline: **0 errors, 386 warnings** across 96 files. `bun run check` passes.

Top 8 warning rules (by count):
| # | rule | warnings |
| --- | --- | --- |
| 1 | @typescript-eslint/no-explicit-any | 113 |
| 2 | no-unused-vars | 90 |
| 3 | @typescript-eslint/no-unused-vars | 58 |
| 4 | jsx-a11y/label-has-associated-control | 57 |
| 5 | no-undef | 21 |
| 6 | jsx-a11y/click-events-have-key-events | 13 |
| 7 | jsx-a11y/no-static-element-interactions | 12 |
| 8 | react-hooks/exhaustive-deps | 11 |

Trivial UI fixes made: empty `catch {}` blocks given explanatory comments in `Privacy.tsx`,
`Register.tsx`, `Verify.tsx` (2). Hook/lib violations (e.g. `usePasskeyWallet.ts`) left untouched.

## Addendum — 2026-10-19: findings from the Phase 4 completion pass

Recorded here rather than fixed silently, because each one outlives the change that exposed it.

- **`--motion-fast` carries its own easing, so `transition: X var(--motion-fast) var(--ease-out)`
  is an invalid declaration and runs no transition.** The token is
  `--motion-fast: var(--dur-fast) var(--ease-out)` (`src/index.css:121`), so that pattern expands to
  `X 120ms <easing> <easing>` — two timing functions — and the declaration is dropped: computed
  `transition: all 0s`. **Five** declarations in the `.sla-canvas*` block of
  `src/components/layout/shell.css` were in that state at the start of this pass
  (`.sla-canvas__stage`, `.sla-canvas__label--btn`, `.sla-plate__outline`, `.sla-rail`,
  `.sla-canvas__stack-btn`), which is why every canvas transition looked "instant" rather than
  broken. Those five now use `var(--motion-fast)` alone (measured: `0.12s cubic-bezier(0.22, 1,
  0.36, 1)`). **The same pattern was not swept across the rest of the stylesheet** — anyone auditing
  the motion layer should grep for `var(--motion-fast) var(--ease-out)` and expect a silent no-op
  wherever it appears.
- **Absence encoded as `0x000…0` is truthy and will be reported as presence.** The new receipt row in
  `History.tsx` first asked whether `responseHash` was truthy; the zero hash satisfied it, so a
  SLASHED call whose own stage read "no valid receipt" printed "verified · … → 0x00000000…". Fixed
  with an explicit non-zero test and re-measured on the same call. Worth checking wherever this
  codebase renders a hash, an address or a signature from the subgraph.
- **axe-core's `color-contrast` rule stays `incomplete` on the canvas and on the transactions
  split** — it cannot resolve text over the SVG/composite backgrounds. The `.sla-canvas__zoom`
  readout is the node it flags; measured directly it is **6.71:1** (11 px `--text-dim` on `--bg-1`),
  above AA for its size. The canvas was previously measured at 9.18 / 6.71 / 6.71 / 9.18. This check
  therefore remains a manual measurement, not an automated pass, on every run.
- **`ServiceRegistry` publishes the bounds the UI validates against**, so no limit needs to be
  written into the frontend: `minStake` (public immutable, constructor-set), `MIN_RESPONSE_TIME = 5`
  (`contracts/ServiceRegistry.sol:56`) and `MAX_SLASH_BPS = 10_000` (`:57`), enforced at `:252-253`
  and `:310-311`. Any future form that hardcodes one of these numbers is duplicating a contract
  constant that can change with a deployment.
- **The mock-seed call records do not cover every lifecycle outcome.** The seed has four
  `COMPLETED`, one `STARTED` and one `SLASHED` (with a settlement timestamp, i.e. a failed receipt
  rather than a `claimTimeout`), and no `REFUNDED` call, so the refunded stage variant and the
  timeout plate copy can only be rendered from a fixture today. Recorded so the next pass does not
  read "unverified" as "broken".

## Addendum — 2026-10-19 (final pass): the axe version, the real baseline, and what was fixed

### The earlier 0-violation result was an artefact of axe-core 4.12.1

Item 8c above and the Phase 4 addendum both record "dark theme, all 34 panels, 0 contrast
violations". That number came from the axe-core **4.12.1** build embedded in the CLI. The same sweep
(same worktree, same 34 sidebar entries, same rule tags `wcag2a,wcag2aa,wcag21a,wcag21aa`) run with
axe-core **4.14.0**, fetched into the page from the worktree's `node_modules`, reported on that tree:

| Theme | `color-contrast` nodes | Other |
|---|---|---|
| dark | 109 | 0 |
| light | 18 | 1 `label-content-name-mismatch` (BulkCall dropzone) |

Two harness faults also distorted the numbers in both directions and are now part of the procedure:

- the first-run onboarding dialog renders over the panel and dims everything behind it — axe scores
  the dimmed-under text. It must be dismissed before a page-level run (the same finding as the
  Phase 4 addendum, restated because the sweep was repeated without it and produced 2 extra nodes on
  every panel);
- the shell animates colour on theme switch, so axe can sample an interpolated value: one pass
  reported `2.35:1` on a `.ui-btn--ghost` that measures clean at rest, and two consecutive passes
  disagreed on which node failed. `transition: none; animation: none` must be injected for the run.

### Result on the final tree

**34/34 panels, both themes, 0 violations**, stable across two consecutive passes each. **54
`color-contrast` nodes remain `incomplete`** across the 34 panels (0–19 per panel) — text on
gradient/translucent backgrounds, including the canvas and the transactions split already recorded
above. `incomplete` is not `pass`; this check stays partly manual.

### What actually failed, and what it cost to fix

- `--text-faint` (dark) `#4D5F76`, **101 nodes**, 2.30:1 on `--bg-2` → `#7C90A9`, 4.60:1.
- `--info`/`--pending` (dark) `#1F77EF`, 3.66:1 on `--bg-2` → `#3E8AF1`, 4.52:1.
- `--danger`/`--slash` (dark) `#EE4539`, 4.30:1 on `--bg-2` → `#EF4E43`, 4.52:1.
- `--danger`/`--warn`/`--info` (light) failed on their own `*-bg` tints at 4.1–4.4:1 → `#BC1B10`
  (4.59:1), `#A24A08` (4.57:1), `#0E5CC7` (4.55:1).
- white ink on the dark `--danger` fill, 3.79:1 → `--on-danger` `#06110D` (5.34:1); the same for
  `--on-warn`. New tokens, in both theme blocks.
- 17 hardcoded hexes that ignored the theme, in 14 components and 6 CSS rules, now reference tokens.
- `label-content-name-mismatch`: the BulkCall CSV dropzone's `aria-label` did not contain its
  visible text; the attribute was removed rather than reworded.

The dark theme therefore no longer matches SPEC_1's `--danger`/`--pending`/`--text-faint` hexes
(item 1a above). That deviation is deliberate and recorded in `docs/decisions.md`: those three
SPEC_1 values are themselves sub-AA.

### Follow-up addendum — 2026-10-19: overlay contrast, motion tokens, and the numbers on the final tree

- **The onboarding overlay's own button failed AA and was invisible to the sweep, because the sweep
  dismissed the overlay.** White on `--accent` (`#19D186`) measured **1.99:1** on
  `.cg-onboard`'s first-run "Get started →" button. It now uses `var(--on-accent)`. Measured with
  the wizard **open**, both themes, tags `wcag2a,wcag2aa,wcag21a,wcag21aa`: **0 violations**.
  Procedure change: audit the overlay with it open, the panels with it dismissed.
- **Three `--motion-*` declarations still concatenate two timing functions and are dropped.** Both
  `--motion-fast` and `--motion-base` already contain `var(--ease-out)`, so appending another timing
  function is invalid CSS:

  | Site | Declaration | State |
  |---|---|---|
  | `src/components/layout/shell.css:479` | `.ov-bars-h__track i { transition: width var(--motion-base) var(--ease-out) }` | **dead rule** — no TSX references `.ov-bars-h` |
  | `src/components/layout/shell.css:806` | mobile `.sidebar { transition: left var(--motion-base) var(--ease-out) }` | live: the ≤768 px drawer snaps open |
  | `src/index.css:677` | `.app-shell { transition: grid-template-columns var(--motion-base) var(--ease-in-out) }` | live: measured `getComputedStyle(.app-shell).transition` = `all 0s`; the sidebar collapse snaps |

  These are **not fixed in this pass**. The canvas block was in scope; the shell's motion layer is
  not, and fixing it changes visible behaviour in two live places. Recommended: one separate commit
  that drops the trailing easing from all three (and decides whether the dead rule is deleted).
- **Final numbers on the final tree:** 34/34 panels, **0 violations**, both themes. `incomplete`
  `color-contrast` nodes: **49 dark / 54 light** (text over gradient or translucent grounds, plus the
  canvas), uncountable as passes.

## Phase 5 addendum — 2026-10-19: provider surfaces

### Fabricated or unsupported data removed

- `Marketplace.tsx` drew a reputation sparkline with `Array.from({length: 20}, () => Math.random())`
  under the label "Reputation trend". Removed; the card shows a completed/slashed bar from the two
  indexed counters, and prints "no calls yet" when both are zero.
- "Low honor rate — high timeout risk" and "Provider has missed recent calls. Consider another
  provider." asserted a causal link and a recency the data does not carry. The Marketplace card now
  states counts and the registry score; no causal copy.
- `Leaderboard` and `ProviderProfile` computed a raw honor rate with a no-data fallback of `100` and
  `0` respectively. Both now return `null` and print "no settled calls" (see `providerMetrics.ts`).
- The Marketplace "At Risk" / "Elite" wording was replaced with the bare registry score and its
  formula. No tier names are attached to a small-sample number.

### Broken wiring found while reading

- `Providers.tsx` called `/api/ping-provider?id=<n>`; `api/ping-provider.js:67` requires `?url=`.
  Every check returned `HTTP 400` and rendered "Offline". The registry has no endpoint field
  (`getProvider` returns nine fields, none of them a URL) and the subgraph does not index one, so
  the feature had no valid input. The control is removed and the panel states why.
- `Providers.tsx` treated any `useReadContract` error as "Provider #N not found", so an RPC failure
  read as a missing provider. Now: failed read → error state with Retry; zero owner → unregistered.
- `Providers.tsx` computed `BigInt(lookupId || "1")` inside the render, so a non-numeric id threw
  before the query was disabled. The id is parsed and validated first.
- The Browser JS and Node samples omitted the USDC `approve` that `_callServiceFor` requires
  (`contracts/PayPerCall.sol:449`); the curl sample contained the literal string
  `"0x...getProvider(1)"`, which is not calldata. Both corrected (selector `0x5c42d079`).
- The Python sample used `os.environ` without importing `os` and ended in `build_transaction({...})`.

### Layout and CSS

- **Topbar overflow at ≤429 px.** The shell grid column grew to 429.297 px at a 411 px viewport
  because the topbar's fixed chips plus hamburger, logo and breadcrumb exceeded the width; the
  panel body inherited the wider column and `.app-shell { overflow: hidden }` clipped 18 px. Hiding
  any single topbar item restored 411, which is how the boundary was found. Fixed with
  `@media (max-width: 430px) { .tb-brand { display: none } }`.
- **Dead `.lb-*` CSS blocked the new Rankings.** `index.css` still had `Leaderboard bars` rules
  from an earlier design, including `.lb-owner { width: 90px; overflow: hidden }`; the new owner
  pill measured 90 px and truncated `0xfbac…06Da` to `0x…`. No TSX references those classes; the
  block is deleted.
- **`AddressPill` link variant wrapped.** `.ui-addr__val` carried `nowrap` + ellipsis but
  `.ui-addr a` did not, so any linked pill broke onto two lines (visible in Rankings and in the
  Providers table). Both now truncate; `.ui-addr .ui-copy` keeps its intrinsic width.
- **`<pre>` overflow at 411 px.** axe reported `scrollable-region-focusable` on the snippet block
  once it scrolled horizontally; the region is now a tab stop with `aria-label`. 0 violations
  after.

### Verified facts that contradict the repository notes

- `AGENTS.md` states that `dist/` and `app/` are committed build output. Neither is tracked:
  `git ls-files dist app` is empty and `.gitignore:25` ignores `dist/`. Rebuilding does not produce
  a diff.
- `docs/progress.md` (Phase 3) referenced an "honor-rate filter" in the Marketplace hint
  (`ContextualHint.tsx:23`); the Marketplace has never had one. The hint now names the filters that
  exist (price, stake, registry score, response time).

### Still unsupported, out of this phase's four panels

- `CallBuilder.tsx:32` prints "This provider has a N% honor rate. High chance of timeout." from a
  raw rate that renders as `null%` when there are no settled calls, plus a causal claim.
- `ContextualHint.tsx:28` states that providers with honor rate > 90 % can borrow from the
  reputation pool. `ReputationLoan` eligibility was not verified in this phase.
- `Agent.tsx:290` and `src/marketing/Providers.tsx:24` describe ranking by honor rate; no surface
  ranks by that metric after this phase.
- The subgraph's `Provider` type declares `maxResponseTime`, `slashBps` and `endpoint` as optional
  but never selects them (`src/lib/subgraph.ts:76-83`); consumers must not assume they are present.

## Phase 6 — Call Builder findings (2026-10-20)

Verified against `contracts/PayPerCall.sol`, `contracts/CrossChainReceiver.sol` and the live Arc
registry, then fixed in `src/components/panels/CallBuilder.tsx`:

- `useWaitForTransactionReceipt({ hash: txHash })` was bound to the shared `writeContractAsync`
  hash. Approving USDC and then calling produced two hashes on the same hook, so the approval's
  receipt could render "✅ Confirmed" for the call.
- `submitReceipt` printed "✅ Receipt submitted — escrow released." from the returned hash alone.
- `claimTimeout` never awaited a receipt and left `isLoading` true on success.
- The primary button read "⚡ Gas-free call" and the banner "No gas required" while it called the
  on-chain `callService`, which needs native gas; the "Gas-free" claim describes only the x402 path.
- `RiskBadge` printed a 100 % honour rate for a provider with no settled calls and turned it into
  "High chance of timeout"; the underfunded branch said "Slash may be partial" where the contract
  reverts with `InsufficientProviderStake` unless `stake * slashBps / 10_000 >= pricePerCall`
  (`PayPerCall.sol:348`).
- Batch pricing fell back to 1 USDC when the price read failed.
- The x402 fallback called `callService` without the approval the direct path performs, so it would
  revert on `transferFrom`, and reported "Fallback call sent" from the hash.
- **`CrossChainReceiver.handleReceiveFinalizedTransfer` requires `hookData.length == 96` and
  `depositor == address(this)`** (`CrossChainReceiver.sol:62-95`). The panel's `depositForBurn`
  call sends no hook, so the CCTP path could not create a call. The path is now disabled with that
  explanation; implementing hook-encoded burning is a separate, protocol-facing change.
- `PayPerCall.openCallsPerCaller` is a public mapping capped by `maxConcurrentCalls || 10`
  (doubled at zk tier 2, `PayPerCall.sol:352-354`); the panel now reads it and blocks at the cap
  instead of letting `TooManyConcurrentCalls` surprise the caller.

Fixed in this pass and no longer matching the "still unsupported" list above: the CallBuilder honour
rate / "High chance of timeout" string.

## Phase 7 — history and notification findings (2026-10-20)

Inspected: `History.tsx`, `Notifications.tsx`, `Requests.tsx`, `Receipts.tsx`, `Overview.tsx` live
strip, `hooks/useSubgraph.ts`, `lib/subgraph.ts`, `subgraph/schema.graphql`,
`subgraph/src/mapping.ts`, `contracts/PayPerCall.sol`.

Verified data model: `Call` is keyed by call id and written by `handleCallStarted`
(`STARTED`), `handleReceiptSubmitted` (`COMPLETED`) and `handleCallSlashed` (`SLASHED`); the
`REFUNDED` enum value is never written. `submitReceipt` credits `claimable[p.owner]` and does not
transfer, so a receipt is not a withdrawal.

Fixed this phase:

- History CSV wrote `"0"` for a missing amount and did not double inner quotes.
- History compared 6-decimal `refunded`/`slashed` with `Number(...) > 0`; flags now use a BigInt
  positivity test.
- History did not dedupe or define a deterministic order, and could show an empty page after a
  filter shrank the list; both are fixed in `lib/activity.ts` with tests.
- History detail had no transaction-hash row and therefore no explanation for the missing link; it
  now states that the subgraph does not index the hash. Adding the field is a subgraph deploy, not
  a UI change.
- Notifications used random ids, one global list, `Number(x)/1e6` amounts, an unused Dispute
  filter/filter tab, no `chainId`, and a green "Listening" banner even after a stream error.
- Requests rendered a missing amount as `0`, a missing timestamp as 1970, exported
  `formatUnits(BigInt(amount ?? 0))`, joined CSV unescaped, invented a 120 s deadline with
  "Claimable now", and printed "✅ Timeout claimed" from the receipt alone.
- Receipts listed `SLASHED` calls as receipts, rendered `0 USDC` for an unread amount, and showed a
  read failure as an empty list.

Recorded, not changed (out of scope):

- `lib/subgraph.ts:fetchRecentActivity` is unused. It maps status to an event type
  (`COMPLETED` → `ReceiptSubmitted`) and returns `txHash: ""`; if it is ever wired up, it must be
  rewritten in the same terms as this phase.
- No transaction hash, block timestamp or provider address exists on the `Call` entity, so history
  cannot support transaction search or per-provider-address search without a subgraph change.
- Notifications only observe events while the panel is mounted and have no push/email channel; the
  code does not claim otherwise.
- The event subscription is network-wide; receipt and slash events do not carry a caller, so
  wallet-scoped filtering of those two events is not possible from the log alone.
