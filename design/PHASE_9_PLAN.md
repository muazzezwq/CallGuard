# Phase 9 — Premium completion of the remaining 19 panels

Status: **PROPOSED — no application code changes until approval.**

Provenance: the brief was delivered in chat. No verbatim `design/PHASE_9.md` exists, so this file
records the scope and decisions; it is not a recovered original prompt. Earlier phases remain in
`design/PHASE_1.md` … `design/PHASE_8.md`.

## 1. Scope

Redesign these 19 panel destinations to the existing premium visual language:

| # | Panel id | File |
|---|---|---|
| 1 | `analytics` | `src/components/panels/Analytics.tsx` |
| 2 | `disputes` | `src/components/panels/Disputes.tsx` |
| 3 | `quality` | `src/components/panels/Quality.tsx` |
| 4 | `lending` | `src/components/panels/Lending.tsx` |
| 5 | `futures` | `src/components/panels/Futures.tsx` |
| 6 | `subscriptions` | `src/components/panels/Subscriptions.tsx` |
| 7 | `jobs` | `src/components/panels/Jobs.tsx` |
| 8 | `attestation` | `src/components/panels/Attestation.tsx` |
| 9 | `agent` | `src/components/panels/Agent.tsx` |
| 10 | `balance` | `src/components/UnifiedBalance.tsx` |
| 11 | `passkey` | `src/components/PasskeyWallet.tsx` |
| 12 | `mcp` | `src/components/panels/Mcp.tsx` |
| 13 | `apidocs` | `src/components/panels/ApiDocs.tsx` |
| 14 | `webhooks` | `src/components/panels/Webhooks.tsx` |
| 15 | `pipelinehook` | `src/components/panels/PipelineHook.tsx` |
| 16 | `nano` | `src/components/panels/Nano.tsx` |
| 17 | `privacy` | `src/components/panels/Privacy.tsx` |
| 18 | `admin` | `src/components/panels/AdminPanel.tsx` |
| 19 | `settings` | `src/components/panels/SettingsPanel.tsx` |

Out of scope:

- the 15 already-complete premium panels and all landing / marketing routes;
- contracts, `api/` logic, hooks, store, `lib/` config, addresses, chain IDs, economic rules;
- new product features, new data sources, fabricated demo data, or new write actions;
- commits, pushes, or deploys without explicit approval.

## 2. Baseline and truth limits

Evidence already gathered in this planning phase:

- Live, wallet-mocked `HEAD` at `http://localhost:5210/app`; worktree `/tmp/opencode/cg-19-mock`.
- Current 1280px captures of all 19 panels in `/tmp/opencode/cg19-shots/`.
- Full source audit of every panel (purpose, copy, data, actions, state, preservation risks,
  responsive/a11y debt).
- `docs/screenshots/` is dated 2026-10-17 and is stale; it is not evidence for this phase.

Environment limits to report honestly in the checklist:

- The mock wallet cannot sign, so signed write flows can be reviewed and typechecked, not executed.
- No screen-reader harness is available; DOM/a11y and axe-style checks are substitutes.
- Only one real provider exists on Arc Testnet, so multi-provider ranking/compare states are limited.
- `regards-art-direction` MCP is unavailable. No external art-direction reference was used.

## 3. Design direction — “Guard Ledger”

This is not a new brand. It is the in-app expression of the existing CallGuard identity: dark ink
surfaces, one emerald signal colour, Geist/Geist Mono, and the current tokens.

The rule for every panel:

> One operational surface, one evidence rail, flat ledger rows, explicit truth states.

- **One dominant work surface per panel.** The primary action or primary reading area gets the only
  elevated surface. Secondary content is a flat ledger or a quiet rail, not another card stack.
- **A data spine, not card soup.** Header → one signal strip (3–4 real values) → primary work area
  → evidence rail → history/ledger. If a panel has no values, it gets no invented metrics.
- **A source line is part of the UI.** Each panel that reads data states its source and freshness
  (for example “Goldsky subgraph · auto-refresh 30s”). A source that is not configured is shown as
  “not configured”, never as a zero.
- **Status is text + icon, never colour alone.** Live, cached, unavailable, retired, preview,
  local-only, and disconnected are named. Errors use `role="alert"`; progress uses a polite live
  region.
- **Mono only for payload.** Addresses, IDs, hashes, code, and amounts use mono. Prose never does.
- **Tabs are compact.** Use the shared `Tabs` primitive, sentence-case labels, Lucide icons where a
  label already has one. No full-width neon pills, no emoji glyphs that render as tofu.
- **Motion is quiet.** One 120–180 ms entrance/state transition; no looping decoration; respect
  `prefers-reduced-motion`.
- **Mobile is a single column.** The evidence rail moves below the work surface. Tables become
  labelled ledger rows or scroll inside a bounded wrapper. No page-level horizontal scroll.

### Signature elements

1. **Signal strip** — one bordered row with 3–4 `Stat` cells separated by hairlines. Values are real
   or an em dash. No sparkline where no series exists.
2. **Ledger** — flat rows with a leading label, optional mono context, and a trailing state/amount.
   Used for calls, loans, batches, webhooks, keys, contract references.
3. **Evidence rail** — compact `KeyValue` blocks: source, contract, endpoint, last read, limits,
   “what this does / does not prove”.
4. **Code surface** — labelled code block with copy action. Used by MCP, API Docs, API snippets,
   Nano, Settings, Attestation.
5. **Status notice** — one component for info / success / warning / danger / retired / preview.
   The title and body are readable without colour.
6. **Stage lane** — the Jobs six-step lane keeps its existing state and click behaviour; only its
   markup and CSS move to the panel kit classes.

### Type and surface rules

- Page title: shared `PageHeader` (clamp 20–26 px, display font).
- Section title: `--fs-lg`, semibold, sentence case.
- Labels: `--fs-sm` / `--fs-xs`; uppercase only for dense table labels or metric eyebrows.
- Radius: `--radius-lg` for the primary surface; `--radius-sm` for controls; no one-off radii.
- Borders: `--border` at rest, `--border-hi` on the active/hover surface.
- Backgrounds: `--surface-1` for sections, `--surface-2` for insets, `--surface-0` for code/output.
- No new raw hex values in TSX. Canvas/JS colours keep the `resolveColor()` bridge.

## 4. Shared panel kit

Create `src/components/panel/` (app-only; never imported by marketing):

| File | Export | Purpose |
|---|---|---|
| `PanelUi.tsx` | `PanelShell` | page padding, max-width, bottom space; one place for the 19 panels |
| `PanelUi.tsx` | `PanelSource` | source + freshness + optional status dot |
| `PanelUi.tsx` | `SignalRow` | single-surface metric strip built on `Stat` |
| `PanelUi.tsx` | `PanelSplit` | `main` + `rail`; one column below 1100 px |
| `PanelUi.tsx` | `Ledger`, `LedgerRow` | flat list/ledger with optional header and empty state |
| `PanelUi.tsx` | `KeyValue` | definition rows for contract/source data |
| `PanelUi.tsx` | `CodeSurface` | labelled `<pre>` + `Copy` |
| `PanelUi.tsx` | `StatusNotice` | status banner with tone, icon, `role=status`/`alert` |
| `panel.css` | — | all kit classes, token-only values, 1100/768/480 breakpoints, reduced motion |

API constraints:

- `PanelShell` accepts `children` and `className`; it does not own the `<h1>`.
- `SignalRow` accepts `children` (usually `Stat` cells) and an optional `label`.
- `PanelSplit` accepts `main`, `rail`, and `className`; no implicit sticky positioning.
- `Ledger` accepts `label`, `action`, `empty`, `children`; `LedgerRow` accepts `lead`, `meta`,
  `trailing`, `tone`, `onClick` (only when the existing row was already clickable).
- `StatusNotice` accepts `tone` (`info | success | warn | danger | retired | preview`), `title`,
  `children`, `live` (`polite | assertive | off`), `icon`, and `action`.
- `CodeSurface` accepts `label`, `code`, `language`, `wrap`, `copyLabel`; it never executes or
  transforms code.
- No new dependency. No new icon package. Use `lucide-react` and existing primitives.

Do not replace `PageHeader`, `SectionCard`, `StatCard`, `Table`, `Tabs`, `Field`, `Button`, `Badge`,
`EmptyState`, `ErrorState`, `Skeleton`, `Stepper`, or `Tooltip` with lookalikes. Use the kit only
where the existing primitive cannot express the composition.

## 5. Panel composition

The table names the dominant surface and its evidence rail. “Preserve” is a hard constraint, not a
suggestion.

| Panel | Dominant surface | Evidence rail | Preserve |
|---|---|---|---|
| Analytics | 4-value signal strip; call-activity figure; recent-calls ledger | Goldsky source, 30 s refresh, 1,000-row caps, 12-row recent limit | direct subgraph POST; query fields; 30 s interval; 1,000 caps; honor thresholds 80/50; `/1e6`; top-8 providers; `+` suffix; `ago()`; Refresh and Retry |
| Disputes | Retired-protocol notice; bond signal strip; tabs; open/vote/history work area | “How it works”, contract state, caller bond, voter bond | `dqEnabled` gate; four tabs; call-id validation; provider-id input default `1`; open dispute; vote; mine; history; all `DISPUTE_QUALITY_ABI` reads/writes |
| Quality | Retired notice; tabbed form-first surface | protocol status and “when to use” | three tabs; open dispute; vote; become arbiter; call-id and evidence fields; retired gate |
| Lending | 3-value signal strip; active tab form/ledger | loan terms, position, contract address | all `approve` → `deposit`/`repay` pairs; `totalAssets`, `totalShares`, `lpPositions`, `loanCount`; `interestRate` stays unavailable (“—”); `0.50`/`0.10` precision rules; `LoanRow` borrower filter; all status messages |
| Futures | tabbed batch ledger / forms | slot mechanics, provider side, claims | `mintCapacity`, `buySlots`, `burnSlot`, `cancelBatch`, `claimProceeds`; `nextBatchId` minus one; `batches`; 10-card cap; all defaults; status tones |
| Subscriptions | range control + provider ledger | honest preview status | `useSubgraph` query; `callsToPreBuy` 1–100; provider price × count; empty/loading branches; `subscribe()` toast “not live on Arc Testnet”; no fake subscription rows |
| Jobs | active stage form + status check | six-stage lane, ERC-8183 lifecycle | `step` 0–5; create/set budget/approve/fund/submit/complete/cancel/check; `doCheckJob`; output; form reset; stage click/keys |
| Attestation | tabbed query/issue/lookup work area | endpoint + trust note | Peek/Issue/Lookup; provider-score vs call-verdict; provider ID/call ID; free query; on-chain issue; result output |
| Agent | position/limit signal strip; tabbed setup/auto-route/settings | wallet address, policy, owner | `cg_agent_wallet`; setup/connect; deposit/withdraw/pause; auto-route fields and score; settings save; all limits and writes |
| Unified Balance | total + chain breakdown | Circle Gateway source, “no Kit key” truth | `/api/unified-balance`; `ok`; `total`; `chains[]`; `toFixed(2)` total vs `toFixed(6)` chains; unavailable flag; four exclusive branches |
| Passkey | register/login/ready work area | `VITE_CLIENT_KEY` status, gasless note | missing-key branch; register/login state machine; username; ready address/UserOp; loading/error branches |
| MCP | tabbed workbench: tools, x402 test, live test, config | install command + endpoint | four tabs; tool list; x402 URL/payload defaults; live test; copy actions; EIP-3009 signing path |
| API Docs | document layout with left TOC and endpoint groups | auth/network legend | every endpoint, method, description, auth badge; REST/MCP/ERC-8004/SDK examples; no new route |
| Webhooks | add form + registered ledger | local-only truth, delivery behaviour | `cg_webhooks_v2`; default events; URL validation; add/remove/test; test result; `lastTest`; no server claim |
| Pipeline Hook | current-hook signal strip + set/disable work area | lifecycle steps, contract address | `pipelineHook` read; `setPipelineHook`; zero-address disable; regex; tx states; toast text; refetch |
| Nano | 3-value signal strip; call + endpoints; multicall work area | Gateway source, gasless truth | `nano_provider` session key; call count/balance/pending; refresh; x402 endpoints; multicall IDs/payload; USDC 6 decimals; all writes |
| Privacy | storage signal strip + preferences/clear area | local-only policy | exact `STORAGE_KEYS`; `cg_privacy_prefs`; four toggles; clear all; session keys; `~KB` calculation |
| Admin | owner/status signal strip; setup and timelock work areas | address reference rail | owner check; `owner`, `payPerCall`, `pendingPayPerCall`, `payPerCallChangeAt`; `setPayPerCall`; `proposePayPerCall`; `executePayPerCall`; timelock copy; copy buttons |
| Settings | settings ledger | session truth, disconnect | `cg_budget`; theme; mode; network addresses; SDK snippet; `disconnect()`; saved/clear behaviour |

### Panel-specific notes

**Analytics.** Replace the canvas 0/1 “activity” line with an accessible figure that keeps the same
recent-call data. A short sequence of outcome ticks plus a visually hidden table is acceptable; do
not invent a time series. Keep the provider-performance bars and recent-call rows. `Refresh` stays
in the header; `Retry` stays in the error state.

**Disputes and Quality.** Both currently title as “Quality Disputes” and both gate on the retired
`DisputeQuality` contract. Keep both destinations and all copy. Differentiate by job: `disputes`
is the ledger-first console (bonds, tabs, history); `quality` is the form-first path (open / vote /
become arbiter). A retired notice above the work area is mandatory; it must not look like an
active warning that can be dismissed.

**Lending and Futures.** The old full-width neon tab bar is a visual bug: it hides the active tab
label against the accent. Use compact `Tabs`. Keep the two-step USDC approvals exactly where they
are. Keep the provider-only copy on mint/claim/cancel. The batch fill bar stays a measured
`soldSlots / totalSlots` value; no default fill when slots are unknown.

**Subscriptions.** This is a preview surface. “Subscribe” must keep showing the existing
“Subscriptions aren't live on Arc Testnet yet — pre-buying calls is coming soon.” toast. Do not
disable the button without approval, and do not render fake active subscriptions. The empty and
loading states must explain that no active providers are indexed, not simply show a large blank card.

**Jobs.** Keep the existing six-step state machine and its click/keyboard behaviour. The redesign
may place the stage lane in the rail, but it must still expose the current step, completed steps,
failed steps, and the step content exactly as today. Keep `Check job status` and the output console.

**Agent, Webhooks, Privacy, Nano.** These carry the highest persistence risk. Do not rename or
remove a storage key, a default, a regex, a test payload rule, or a write. The visual rewrite may
move a control into the rail, but the same element must still exist with the same handler. Add
`aria-live` to result/status regions; do not change the data they report.

**Admin.** Keep the owner-only gate and all three transaction paths. The current copy says
“ServiceRegistry v4” and “PayPerCall v4” although the active contracts are v7. This is stale copy,
not a redesign. It is held for explicit approval in §9; do not silently change it during the wave.

**API Docs and MCP.** These are reference surfaces, not dashboards. API Docs gets a document spine
(left contents, endpoint groups, code examples) and no invented status widgets. MCP keeps every
tool, test, and config string. Code surfaces get copy buttons, not auto-execution.

## 6. Migration waves

Each wave is independently shippable and ends with the same gates. No wave starts until the prior
wave's checklist rows are `PASS` or explicitly `PARTIAL` with a named limitation.

### Wave 0 — Foundation and evidence

1. Create `src/components/panel/PanelUi.tsx` and `src/components/panel/panel.css`.
2. Add `tests/panel-kit.test.ts`: kit exports, token-only type values in `panel.css`, mobile and
   reduced-motion rules present. Do not test React rendering with a new dependency.
3. Create `design/phase-checklists/PHASE_9_CHECKLIST.md` with one row per panel requirement.
4. Capture a DOM inventory of all 19 panels (headings, buttons, labels, input ids, static copy)
   from the mock worktree into `/tmp/opencode/cg19-baseline.json`.
5. Run `bun run check`, `bun run test`, `bun run build` before touching a panel.

### Wave 1 — Read-only and preference surfaces

`analytics`, `balance`, `privacy`, `settings`.

Why first: low write risk, establishes the signal strip, ledger, source rail, and settings pattern.
`settings` also verifies both themes because it controls them.

### Wave 2 — Money surfaces

`lending`, `futures`, `subscriptions`, `nano`.

Why second: they share USDC formatting, two-step approvals, status messages, and preview/empty
states. Reuse the same form rail and status notice. Verify every amount, decimal, default, and
disabled condition against the baseline.

### Wave 3 — Lifecycle and evidence surfaces

`disputes`, `quality`, `jobs`, `attestation`.

Why third: the step/state machines and retired gates need the most preservation care. Do these
after the kit has settled so the diff is mostly markup and CSS, not logic.

### Wave 4 — Agent and integration surfaces

`agent`, `passkey`, `webhooks`, `pipelinehook`.

Why fourth: storage keys, passkey state, and transaction state are high risk. No handler may move
to a different module. Verify every branch in the browser where possible; mark signed paths
`UNVERIFIED` honestly.

### Wave 5 — Reference surfaces

`mcp`, `apidocs`, `admin`.

Why last: MCP/API Docs are long-form and need code surfaces; Admin needs the owner/timelock copy
review. Keep the admin copy correction separate from the visual rewrite.

## 7. Preservation method

Before a panel is edited, export its baseline DOM inventory:

- all visible headings and static text;
- all `button` labels and `aria-label`s;
- all `input`/`select`/`textarea` ids, labels, placeholders, defaults;
- all storage keys and write function names found in the source;
- all conditional branches (loading, empty, error, retired, disconnected).

After the panel is edited, export the same inventory and diff it. Allowed differences:

- leading status emoji replaced by a Lucide icon (the message text remains);
- emoji tab glyphs replaced by Lucide icons (the tab label remains);
- new source/truth labels that do not claim data;
- new `role`, `aria-*`, `id`/`htmlFor` wiring;
- wrapper/class changes.

Not allowed:

- removed or renamed fields, buttons, tabs, copy lines, links;
- changed default values, decimals, thresholds, storage keys, endpoint URLs, contract addresses;
- changed write order (approve → write) or new/removed writes;
- a disabled/retired branch becoming enabled;
- a preview surface looking live.

If a copy line is factually stale (Admin v4), it is recorded in §9 and left unchanged until
approval. The redesign must not silently “fix” product copy.

## 8. Verification gates

Run after every wave, from the repo root:

```bash
bun run check
bun run test
bun run build
git diff --check
git diff --name-only
```

Required outcomes:

- `bun run check` exit 0; no ESLint warnings (`--max-warnings=0`).
- `bun run test` exit 0. Current baseline is 388 pass / 4 skip / 0 fail; the new kit test adds to
  the pass count and no existing test may regress.
- `bun run build` exit 0.
- `git diff --name-only` contains no `src/marketing/`, no landing route, no `dist/`.
- No `git grep -n "MOCK_ENABLED\\|mock(\\|AutoConnect" -- src` in the main tree.

Browser checks (mock wallet worktree, port 5210):

| Check | 1280 dark | 1280 light | 411 dark | 411 light |
|---|---|---|---|---|
| No console errors | required | spot-check | required | spot-check |
| No failed requests introduced | required | spot-check | required | spot-check |
| No page horizontal scroll | required | spot-check | required | required |
| Header/action visible without scroll | required | spot-check | required | spot-check |
| Tabs reachable and switch | required | — | required | — |
| Empty/loading/error state honest | required | — | required | — |
| Focus visible on controls | required | — | required | — |

Capture evidence to `/tmp/opencode/cg19-wave-<n>/`; do not add new stale screenshots to
`docs/screenshots/`.

Signed writes: the mock wallet cannot sign. For every write flow, verify the handler is still
wired, the button still exists with the same disabled logic, and the code path still calls the same
contract/function. Mark the execution row `UNVERIFIED` with the reason; do not claim a successful
signature.

Accessibility: add labels, live regions, and native controls where missing. No screen reader is
available, so screen-reader announcements remain `UNVERIFIED`; DOM checks and keyboard checks are
the evidence.

## 9. Copy corrections held for explicit approval

These are factual corrections, not redesign. They are **not** part of the visual rewrite unless
approved separately:

1. `AdminPanel.tsx` “ServiceRegistry v4 admin operations” → v7.
2. `AdminPanel.tsx` “v4 address not set” → v7.
3. `AdminPanel.tsx` “Wires the PayPerCall v4 address into the newly deployed ServiceRegistry v4” →
   v7.
4. Any other panel copy that names v4 while `src/lib/config.ts` points at v7.

Recommended: approve items 1–4 so the app does not ship a false contract version. If not approved,
the strings stay exactly as they are and the checklist marks the copy debt as `PARTIAL`.

## 10. Cross-panel follow-ups for the other 15 (not in scope)

Do not implement these in Phase 9. Record them for a later conservation pass:

- normalize page gutters and first-fold rhythm across the premium panels; Marketplace and Overview
  currently use different root paddings;
- use the same compact tab treatment wherever a panel still uses full-width accent pills;
- add the source/freshness line to any panel that reads Goldsky or an API but does not say so;
- audit mobile tables in History, Receipts, Payments, Requests, Providers for page-level overflow;
- apply the same `CodeSurface` to Register and any SDK example that currently uses a bare `<pre>`;
- consider a shared “truth state” legend for live / cached / unavailable / retired / preview;
- keep the 15 completed panels visually unchanged unless one of the above is a measured defect.

## 11. Risks

| Risk | Mitigation |
|---|---|
| A visual rewrite drops a field or branch | baseline DOM inventory + source preservation matrix + per-wave diff |
| The 19-panel scope turns into a second app-wide redesign | kit is small; no new product features; no marketing files |
| Retired Disputes/Quality look active | mandatory retired notice; buttons stay disabled/gated; no “live” badge |
| Subscriptions starts looking live | preview notice; existing toast stays; no fake rows |
| Stale Admin v4 copy ships | explicit copy approval; otherwise marked `PARTIAL` |
| Signed flows appear verified without a signer | mock limitation recorded as `UNVERIFIED`; code review + compile only |
| Mobile tables overflow | ledger-row fallback or bounded scroll wrapper; 411 check |
| Light theme regressions | token-only styles + light spot-checks |
| Build/test gate drift | one gate run per wave; no wave marked complete without evidence |

## 12. Approval checklist

Before any application edit, confirm:

- [ ] The “Guard Ledger” direction and the five waves are approved.
- [ ] The shared kit scope is approved (no new dependency).
- [ ] Emoji-to-Lucide tab/status normalization is approved.
- [ ] Admin v4 → v7 copy correction is approved or explicitly deferred.
- [ ] Commit policy is explicit: no commit / one commit per wave / all at the end.
- [ ] Any panel-specific copy or behaviour change beyond the matrix is named first.

No application code, commit, push, or deploy has been made in this planning phase.
