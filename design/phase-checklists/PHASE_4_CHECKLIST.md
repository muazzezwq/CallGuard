# Phase 4 completion checklist

Prompt: `design/PHASE_4.md` (sha256 of the verbatim body: `b673e11c9251b12c…`)
Phase commits: `f250e33` (feat(sla-canvas): interactive, accessible, responsive SLA workspace),
`ebe694a` (fix(sla-canvas): expose stage controls to assistive tech and steady the inspect line)
Filled: 2026-10-18 · **Overall: NOT COMPLETE** (rows 2, 4, 5, 6, 7, 13 were not `PASS`;
rows 9 and 10 were measured and moved to `PASS` later the same day, and rows 4, 5, 6, 7 and 13 on
2026-10-19 — see the two addenda at the end of this file. Only row 2 remains not `PASS`, and it is a
historical fact about the phase that no later work can change)

**Current-tree re-verification (2026-10-21): found a 64.7 px label collision, then fixed it.**
The desktop/tablet Canvas labels rendered as `EscrowService callReceiptSettlement`; they are now a
four-column legend with no overlaps, and the responsive part of row 12 passes on the current tree.
Before/after evidence is in the final two addenda.

Scope note: this checklist was written **after** Phase 4 finished, from the phase prompt and from
verified evidence (file contents, commit diffs, command output, browser measurements recorded in
`docs/progress.md`). It is a retrospective record, not a claim that the process was followed.
Rows marked `UNVERIFIED` were not measurable in this environment, which has no screen reader, no
tablet viewport (`termfold-browser viewport` accepts only `phone|desktop|fit`), and no headless
browser (no puppeteer/playwright/chromium binaries). That limitation was lifted later the same day:
a Debian `chromium` binary driven over CDP by the `agent-browser` CLI made the accessibility tree,
axe-core audits and arbitrary viewport widths measurable. Rows 9 and 10 were re-measured and closed
that way; the measurements are recorded in the addendum at the end of this file.

| # | Requirement (phase prompt) | Implementation evidence | Verification method | Actual result | Status | Limitation / blocker |
|---|---|---|---|---|---|---|
| 1 | §1 Mandatory repository and documentation review before changing anything | Pre-edit inspection recorded in `docs/progress.md` Phase 17 (History.tsx, shell.css, config reads) | `rg`/`read` of the callers; single caller `src/components/panels/History.tsx` confirmed | Caller map written down before editing | PASS | — |
| 2 | §2 Discover and use all relevant installed skills | none | Session storage scanned (`opencode.db`, `part`/`message`) for `skill` tool calls and skill file reads | Last `skill` tool load `safe-refactor` 2026-10-17 21:49; last skill file reads 2026-10-18 18:15 — all **before** this phase's brief (20:10). No skill was loaded or read during Phase 4 | FAIL (closed as a record) | Requirement not met, and it cannot be met retroactively: no skill was loaded or read while Phase 4 ran. The 2026-10-19 completion pass used `writing-plans` for its plan of record, which is evidence about *that* pass, not about the phase. Carried forward as a process finding, not as work |
| 3 | §3–§4 Define the Canvas experience; visualize the SLA flow (7 listed steps) with the existing renderer | `src/components/viz/SLACanvas.tsx` (isometric plates, rails, state words), `shell.css` | `bun run typecheck`, `bun run lint`, browser render of COMPLETED / STARTED / SLASHED | Rendered and inspected; 4 stages shown (escrow, call, receipt, settlement); no new graph library added | PASS | The prompt's 7 flow items collapse into 4 visible stages; the extra outcomes (timeout, refund) appear as stage states, not separate stages |
| 4 | §4 All 7 flow items communicated distinctly | `slaStages()` state mapping (COMPLETED / SLASHED / REFUNDED / STARTED / OPEN) | Browser render of COMPLETED, STARTED, SLASHED | Only 3 of the listed outcomes were rendered in a browser | PASS (2026-10-19) | All seven items are now printed for the selected call in a "Terms and outcome" list, each from a real field, with the gaps named in words ("not indexed — the subgraph does not record the response time", "not registered on the registry (provider #N)"). Timeout is distinguished from a failed receipt by settlement timestamp. Rendered: COMPLETED and SLASHED with all seven rows read back. **Not exercised in a browser:** the REFUNDED stage variant (no such mock record; the refund/slash *row* was exercised) |
| 5 | §5 Interaction design: select a node, highlight related nodes, contextual info, zoom and pan, return-from-zoom, empty states, obvious next action; every visible control must work | Plate selection, keyboard selection, `.sla-rail.is-near` highlight, `role="status"` inspect line | Real keyboard (`Tab`, `Shift+Tab`, `Enter`) and real mouse clicks in the browser; computed-style measurements; **addendum**: real CDP pointer click on a label twin with a `document.activeElement` read | Selection, highlight, contextual inspect line, and keyboard path verified. **Zoom and pan were not implemented** (zero recorded mentions). Empty state exists. Inert control found: in the props-less (static) mode `.sla-canvas__stack` renders `<button type="button">` with no `onClick`. Addendum: a real pointer click on a label twin moves the selection and the inspect line but leaves `document.activeElement` on `BODY` — focus does not follow to the corresponding plate | PASS (2026-10-19) | Zoom (1→2.5, `aria-disabled` limits), pan (real pointer drag measured at −130 px of a −130 px gesture, plus arrow keys while the board has focus), return-from-zoom (`Fit`, focus retained), reduced-motion guard (0s), ≤640px tools/board hidden with no overflow. Label twins hand focus to the plate (real CDP pointer click → `activeElement` = `g`/`role=button`). The static mode now renders four `div` rows instead of inert buttons (props-less render: 0 plate buttons, 3 focusables, all live controls; axe 0) |
| 6 | §6 Inspect the existing configuration forms and their connection to contract writes; improve validation, required-field indicators, USDC formatting, tx review and pending/success/rejection/failure states | none in this phase | `git show --stat` of both phase commits | Only the Canvas panel files changed (`SLACanvas.tsx`, `History.tsx`, `shell.css`, `docs/*`); no configuration form was inspected or changed | PASS for the form layer (2026-10-19); tx outcomes partly `UNVERIFIED` | `Register.tsx` now validates every field against bounds read from the contract (`minStake`, `MIN_RESPONSE_TIME` 5, `MAX_SLASH_BPS` 10 000), marks every field `aria-required` with a visible marker, ties each message to its input with `aria-describedby`/`aria-invalid`, rejects >6-dp USDC instead of rounding, names the two wallet prompts on a review step that owns the submit button, and releases the in-flight guard on failure. Measured: invalid signer → message + Review blocked; review step content; submit failure announced in a `role="status"` region with no false success. **Not executed (the mock wallet cannot sign):** user rejection (4001), on-chain revert, confirmed success — code-read only |
| 7 | §7 Real protocol state and visual feedback; handle the listed cases distinctly; never invent nodes | `slaStages()` derives every stage from the call record; no fabricated nodes | Browser render; source read | COMPLETED, STARTED and SLASHED rendered truthfully. Disconnected wallet, wrong network, RPC unavailable, pending/rejected tx, and stale data were **not** rendered | PASS for the panel states (2026-10-19) | Rendered and read back: loading (6 skeletons), populated (6 rows + live `_meta` freshness line), subgraph failure (real `Failed to fetch` → `ErrorState` + Retry), wrong network (real chain-1 connection → withheld counts/filters/list + a working "Switch to Arc Testnet"), stale/indexing errors (90-minute-behind `_meta` fixture + the indexer's own error flag), no selection (detail hint). axe 0 violations in each. **`UNVERIFIED` by design:** the panel's own "wallet disconnected" state is unreachable — `App.tsx` gates the shell on a connected wallet, so the landing screen is that state; recorded instead of claimed |
| 8 | §8 Connection/animation quality; do not run an infinite animation across every edge | `shell.css` pulse limited to the `active` stage; `[data-motion="reduced"]` + `prefers-reduced-motion` rules | Computed scan under `[data-motion="reduced"]` (0 non-`none` animations under `.sla-canvas`) | Pulse on the active plate only; no movement on other edges | PASS | — |
| 9 | §9 Layout across desktop, tablet and mobile; dark **and** light | `@media (max-width:640px)` board→stack switch; `shell.css` theme overrides | Browser at 1280 and 411, dark and light; **addendum**: `agent-browser set viewport` at 820×1180, 641×900 and 640×900 with computed-style and overflow reads | Desktop and phone verified in both themes, no horizontal overflow. Addendum: at 820 and 641 the board is `display:block` while the stack is the sr-only pattern (`position:absolute`, 1×1 px, `clip-path:inset(50%)`, `visibility:hidden` — so its buttons are not tabbable); at 640 the board is `display:none` and the stack is `display:flex`; `scrollWidth == innerWidth` at all three widths, so no horizontal overflow | PASS | — |
| 10 | §10 Accessibility and usability (semantic controls, keyboard, focus, contrast, status not colour-only, labels, reduced motion, async announcements, focus management) | `role`, `aria-pressed`, `aria-label`, `tabIndex`, `aria-live`, `onKeyDown`, `onMouseDown` guard in `SLACanvas.tsx`; `role={interactive?"group":"img"}` | Real `Tab`/`Shift+Tab`/`Enter`, `:focus-visible` reads, contrast/token reads, MutationObserver on the live region; **addendum**: real accessibility-tree snapshot and an axe-core 4.12.1 audit over `.sla-canvas` | Keyboard order, single tab stop per stage, focus ring, state words, and live-region updates verified. Addendum: the AX tree exposes `group "SLA lifecycle"` with exactly four `button` nodes whose names carry label + state word + sub (`"Escrow — Done. 0.5 USDC"`), and no node for the pointer labels; the live region surfaces as `status`. axe-core: 0 violations, 14 passes, and its single `incomplete` (color-contrast) resolves by direct measurement to 9.18 / 6.71 / 6.71 / 9.18, all above the 4.5 AA threshold for their sizes | PASS | The axe color-contrast rule stays `incomplete` (text over the canvas), so that check remains a manual measurement, not an automated pass |
| 11 | §11 Reuse and engineering quality (no parallel primitives, no new deps, no fake data, no TS suppression) | Reuse of the existing isometric renderer; no new dependency | `git show --stat`; `package.json` diff empty for the phase | No new dependency, no `@ts-ignore`, no fabricated data | PASS | — |
| 12 | §12 Testing and verification: typecheck, lint, production build, canvas render and core interactions, node selection, navigation + responsive, dark/light, keyboard + reduced motion, console errors, overflow | `docs/progress.md` Phase 17 verification list | `bun run typecheck` exit 0 · `bun run lint` (`--max-warnings=0`) exit 0 · `bun run build` `✓ built in 2m 5s` · browser matrix · `console --errors` clean at every checkpoint | All executed checks passed | PASS | Rows 9 and 10 were closed by the 2026-10-18 addendum measurements; the §12 sub-item for form validation stays unrun (see row 6) |
| 13 | §13 Documentation and project continuity (progress.md, decisions.md, audit.md, panel-inventory.md; keep unfinished work unfinished) | `docs/progress.md` Phase 17, `docs/decisions.md` Phase-4 entries in commit `f250e33` | `git show --stat f250e33`; file timestamps | Main phase commit documented. The follow-up a11y commit `ebe694a` changed **no** documentation file | PASS (2026-10-19) | `ebe694a` is documented (`docs/progress.md`, the Phase 17 entry), and the completion pass is recorded in `docs/progress.md`, `docs/decisions.md` (16 entries) and `docs/audit.md` (5 findings). `docs/panel-inventory.md` needed no change: both panels keep their route, key and loader, so their `done` status and column are unaffected |
| 14 | §14 Git and safety (status before/after, preserve unrelated changes, no reset/clean, no push or deploy, commit only when authorised) | `git status`/`git log` recorded; unrelated `.agents/` and `skills-lock.json` left uncommitted | `git status --short`, `git log --oneline` before and after | Unrelated work preserved; no push, no deploy; commit created only after the explicit instruction "commit et" | PASS | — |
| 15 | §15 Final report (7 items) + definition of done | Report delivered in chat | Cross-checked against the phase prompt's 7 items | Item 4 (skills) was corrected after an honesty audit: no skill was used in this phase | PASS | — |

## Carried into the next phase

State at the end of the 2026-10-19 completion pass (see the last addendum):

- §2 skill usage for Phase 4 (and, per the earlier investigation, Phase 2 v2 and Phase 3): `FAIL`,
  **still open and unfixable** — it is a historical fact, recorded rather than repaired.
- §5 zoom/pan, return-from-focus, the static-mode inert control and the label-twin focus hand-off:
  closed on 2026-10-19.
- §6 configuration validation: implemented and measured on 2026-10-19; the user-rejection, revert
  and confirmed-success transaction branches remain `UNVERIFIED` (the mock wallet cannot sign).
- §13 documentation of commit `ebe694a` and of this pass: closed on 2026-10-19.
- §7 protocol states: six measured, and the seventh (the panel's own disconnected state) is
  unreachable by design — `App.tsx` gates the shell on a connected wallet, so the landing screen is
  that state. Recorded, not claimed.

Deliberately left open and recorded: the light-theme palette decision (10 nodes below AA), the
`--motion-fast` misuse outside the `.sla-canvas*` block (`docs/audit.md`), and a real screen reader,
which this environment does not have.

`§9` and `§10` left this list on 2026-10-18 when they were measured; see the first addendum.

## Addendum — 2026-10-18: rows 9 and 10 measured

The two rows above that could not be measured when this checklist was written were measured later
the same day, after the limitation itself was removed. Environment used, all outside the repository:

- Debian `chromium` **150.0.7871.181** (aarch64) launched headless by hand with
  `--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --remote-debugging-port=9371`.
  `chromium` 155 from Debian 13's security pocket traps (`SIGTRAP`, exit 133) in this container
  seconds after `DevTools listening`; 150 does not. `agent-browser install` cannot be used here, as
  it refuses Linux ARM64 Chrome-for-Testing downloads and needs a browser supplied explicitly.
- `agent-browser` 0.39.1, attached over CDP (`--cdp 9371`).
- The app was served by `vite dev` on port **5201** from a throwaway worktree at commit `ebe694a`
  with the mock-wallet shim from the `onur-mock` worktree applied on top; the working repository
  `/root/projects/onur` and its committed state were not touched.

**Row 9 — layout across desktop, tablet and mobile.** `agent-browser set viewport` plus computed-style
and `scrollWidth` reads, with a transaction selected so the canvas was mounted:

| viewport | `.sla-canvas__board` | `.sla-canvas__stack` | horizontal overflow |
|---|---|---|---|
| 820×1180 | `display: block` | sr-only: `position: absolute`, 1×1 px, `clip-path: inset(50%)`, `visibility: hidden` | none (`scrollWidth == innerWidth`) |
| 641×900 | `display: block` | sr-only, as above | none |
| 640×900 | `display: none` | `display: flex` | none |

The 640/641 px boundary is exact, and because the stack is `visibility: hidden` above the
breakpoint its buttons are not tabbable, so there is no duplicate tab order per stage (the four
plates remain the only stage controls on desktop).

**Row 10 — accessibility tree.** `agent-browser snapshot` (real accessibility tree) over the canvas:

```
group "SLA lifecycle"
  button "Escrow — Done. 0.5 USDC"
  button "Service call — Done. provider notified"
  button "Receipt — Done. signature verified"
  button "Settlement — Done. paid to provider"
status
  strong "Escrow"   +   " · Done · 0.5 USDC"
```

Exactly four `button` nodes, one per stage, each carrying label + state word + sub; the visible
pointer labels produce no node of their own despite being in the DOM; the inspect line surfaces as
`status`. Keyboard path re-verified over CDP: focus a plate, press `Enter` →
`aria-pressed` becomes `[false, true, false, false]` and the live region reads
`"Service call · Done · provider notified"`.

axe-core 4.12.1 (embedded in the CLI) over `.sla-canvas`: **0 violations, 14 passes, 1 incomplete**.
The single `incomplete` is `color-contrast`, which axe cannot resolve over the canvas; measured
directly instead — name 9.18, sub 6.71, inspect 6.71, state 9.18 against the effective surface,
all above the 4.5 threshold for their font sizes.

Not closed by this addendum: row 5's focus hand-off. A real pointer click at the label twin's box
(777,786) changed the selection and the inspect line (`"Escrow · Done · 0.5 USDC"`) but left
`document.activeElement` on `BODY`. Rows 2, 4, 5, 6, 7 and 13 still stand as written above.

## Addendum — 2026-10-19: cross-cutting a11y sweep over all 34 panels

Not one of the 15 rows above. Recorded here because the sweep ran while this phase was being
re-verified through the `agent-browser` **MCP** server (axe-core 4.12.1), so the canvas rows keep
their status and this addendum adds no row.

Dark theme (the default), all **34** sidebar entries, tags `wcag2a,wcag2aa,wcag21a,wcag21aa`:
**34/34 panels report 0 violations** after the fixes below. Before them, the same sweep reported:

- `.live-meta` (`Arc Testnet`) at **2.8:1** on **every** panel — it is one `<span>` in `LiveBar`
  whose inline `color: var(--text-faint)` overrode the class's `--text-dim`;
- six `label` violations (a control with no accessible name) on four panels — Provider details
  (read-only share link), Call Builder (batch range), Bulk Call (Provider ID, Payload, call-count
  range), Subscriptions (pre-buy range). All six sit next to a visual `<div style={S.label}>`, which
  is why nothing named them.

Fixes (6 files): `src/index.css` — dark `--text-low` `#4D5F76` → `#72849A` (computed 4.86:1 on
`--bg-1`; the 219-use `--text-faint` tier was deliberately left alone) and `.tb-mode-btn`
`var(--text-faint)` → `var(--text-low)`, which is what the inactive `Pro` label renders in;
`src/components/layout/LiveBar.tsx` — the inline colour override removed; and an `aria-label` on the
six controls in `src/components/panels/{BulkCall,CallBuilder,Subscriptions,ProviderProfile}.tsx`.
Gates: `bun run typecheck` clean, `bun run lint` (`--max-warnings=0`) clean.

Method note for whoever re-runs this: the first-run onboarding dialog renders over the panel and
darkens the page behind it, and axe reports the dimmed-under-it elements as **4 false contrast
violations** (7 nodes on a screen whose real count is 3). Dismiss `Skip for now` and the tour first.

Measured and left open: the **light theme** still has 10 contrast nodes below AA across the shell —
`--text-dim`-based chrome at 4.14–4.36 (`Pro` label, `USDC` label, breadcrumb panel, sidebar
labels), `.tb-wallet__addr` 3.81, `kbd` 3.6, `.net-pill` 1.84, active sidebar label 1.79. This is
the same gap `docs/progress.md` already records for Phase 3/16. It needs light-theme palette values,
so it is a colour decision rather than a sweep; the light `--text-low` was deliberately left at
`#8A9BAE` so this pass changed no light-theme pixel. Candidate values are in `docs/decisions.md`.

Also unchanged by this sweep: row 5's pointer focus hand-off. The keyboard path keeps focus on the
plate (`activeElement = g:Escrow` after `Enter`); a real pointer click on a label twin still leaves
it on `BODY`.

## Addendum — 2026-10-19: rows 4, 5, 6, 7 and 13 closed

Environment: the mock worktree (its own vite server, port **5202**) carrying the real repository's
changed files, driven over the `agent-browser` MCP server (Chromium 150, engine `chrome`) with
axe-core 4.12.1, tags `wcag2a,wcag2aa,wcag21a,wcag21aa`. `/root/projects/onur` was the only tree
edited; the worktree exists to give a browser a wallet. Full narrative and measurements:
`docs/progress.md` (Phase 4 completion pass); the reasons behind each choice: `docs/decisions.md`.

| # | Requirement | Implementation evidence | Verification method | Actual result | Status |
|---|---|---|---|---|---|
| 4 | §4 all 7 flow items distinctly | `History.tsx` "Terms and outcome" list + on-chain `getProvider` read + `slaStages(status, { timedOut })` | Browser render of COMPLETED and SLASHED calls; every row read back; a zero-hash defect found and re-measured after the fix | 7 rows, each from a real field, gaps named in words; timeout ≠ failed receipt; `0x000…0` no longer reads as "verified" | PASS |
| 5 | §5 select / highlight / contextual info / zoom + pan / return-from-zoom / empty states / no inert control | `SLACanvas.tsx` tools group, stage transform, `atRest` label anchoring, `aria-disabled` limits, `plateRefs` focus hand-off; `shell.css` `.sla-canvas__stage/__tools`, `.sla-tool` | Label-centre vs plate-centre delta at 100/160/250% = `0,0,0,0`; real CDP mouse drag (−130 px gesture → −130 px of translate); arrow keys while the board has focus; focus retained at the limit and after `Fit`; props-less render (0 plate buttons, 3 live focusables); `data-motion="reduced"` → 0s; 411 px → tools + board `display: none`, stack visible, no overflow; axe 0 violations / 13 passes / 1 `incomplete` (color-contrast, measured 6.71:1) | All eight sub-requirements executed; the only inert control left is a real button with a live handler | PASS |
| 6 | §6 configuration form: validation, required fields, USDC formatting, tx review, pending/success/rejection/failure | `Register.tsx` (contract-read bounds, `aria-required` + `aria-describedby`, review step, `TxState` union, in-flight guard); `friendlyError` reuse in `Requests/Verify/BulkCall/Payments` | Invalid signer on blur → 1 `aria-invalid` + message, Review blocked; review step content read back; axe 0 violations on the panel; **addendum**: the three wallet branches executed against a scripted provider double (see the 2026-10-19 final addendum) | Validation, required indicators, 6-dp rejection, review and the failure path verified by execution. Rejection 4001, contract revert and confirmed success were executed later against a test double, not a real signer | PASS |
| 7 | §7 real protocol state, distinct cases, no invented nodes | `History.tsx` state machine + `_meta` query; `StatCard` counts withheld off-chain | loading, populated, fetch failure (dead endpoint), wrong network (chain-1 connection + working switch), stale/indexing errors (`_meta` fixture), no selection — each rendered, read back, axe-run | Six states distinct and measured; the seventh (wallet disconnected) is the app-level landing gate, not a panel state, and is recorded as such | PASS (6 measured) / UNVERIFIED (1, by design) |
| 13 | §13 documentation and continuity | `docs/progress.md`, `docs/decisions.md`, `docs/audit.md`; `docs/panel-inventory.md` reviewed, unchanged | Fresh reads of all four files; `git status` | `ebe694a` documented; the completion pass documented in three files with its limits; no unfinished work presented as finished | PASS |

**Row 2 stays `FAIL`.** No skill was used during Phase 4, and no later work can make that untrue.
It is recorded here and in `docs/progress.md` as a process finding for the phases that follow.

**Gates at the close of this pass:** `bun run typecheck` clean · `bun run lint`
(`eslint src --max-warnings=0`) clean · `bun run build` ✓ built in 1m 34s · axe-core across the
changed surfaces 0 violations (1 `incomplete` per surface, the known `color-contrast` rule, measured
by hand) · no console errors in any state. Dark theme only: the light-theme contrast gap is
unchanged and still needs the palette decision recorded in `docs/decisions.md`.

**Left open on purpose**

- Light-theme palette (10 nodes below AA, candidates in `docs/decisions.md`) — a colour decision. **Closed by the final addendum below.**
- `--motion-fast` misuse outside the `.sla-canvas*` block — recorded in `docs/audit.md`, not swept.
- A real screen reader — unavailable here; the accessibility tree and axe stand in.
- Rejection / revert / confirmed-success tx branches — the mock wallet cannot sign. **Closed by the final addendum below (executed against a scripted provider double).**

## Addendum — 2026-10-19: final AA pass, corrected axe baseline, tx branches executed

### Correction to the record above

The "dark theme, **34/34 panels 0 violations**" line in the previous addendum is **wrong as a
statement about the final tree**. It was measured with the axe-core **4.12.1** build embedded in the
CLI. The same sweep re-run with axe-core **4.14.0** (fetched into the page from the worktree's
`node_modules`) reported **109 dark-theme contrast nodes** and **18 light-theme contrast nodes**
(plus one `label-content-name-mismatch`) on that tree, with the same rule tags
(`wcag2a,wcag2aa,wcag21a,wcag21aa`). Two measurement faults also inflated the earlier numbers in the
other direction: the first-run onboarding dialog must be dismissed (it dims the page and axe reports
the dimmed elements), and the shell's theme-transition animations must be disabled while measuring
(a colour mid-transition is read as a real value — one pass reported `2.35:1` on a button that
measures clean at rest).

### What was measured and fixed

Dark theme (5 token values; **the only dark-theme visual change in this phase** — everything else
in dark is pixel-identical):

| Token | Before | Ratio before (worst surface) | After | Ratio after |
|---|---|---|---|---|
| `--text-faint` | `#4D5F76` | 2.30:1 (`--bg-2`) — 101 nodes | `#7C90A9` | 4.60:1 |
| `--info` / `--pending` | `#1F77EF` | 3.66:1 (`--bg-2`) | `#3E8AF1` | 4.52:1 |
| `--danger` / `--slash` | `#EE4539` | 4.30:1 (`--bg-2`) | `#EF4E43` | 4.52:1 |
| `--on-danger` (new) | — | white on `--danger` 3.79:1 | `#06110D` | 5.34:1 |
| `--on-warn` (new) | — | `#000` on `--warn` | `#06110D` | keeps the admin button AA |

Light theme (token values corrected to clear 4.5:1 on their own tinted backgrounds, not only on
white): `--danger`/`--slash` `#CE1E12` → `#BC1B10` (4.59:1 worst), `--warn` `#AA4E08` → `#A24A08`
(4.57:1), `--info`/`--pending` `#0F64D7` → `#0E5CC7` (4.55:1), plus `--on-danger`/`--on-warn` =
`#FFFFFF`.

Seventeen hardcoded-colour sites were repointed at tokens so they follow the theme:
`ProviderCard.tsx` (reputation + honour colours), `Marketplace.tsx`, `Leaderboard.tsx`
(rate text split from the bar fill), `ProviderProfile.tsx`, `Agent.tsx`, `Futures.tsx`, `Jobs.tsx`,
`Providers.tsx`, `Requests.tsx`, `Notifications.tsx` (active filter chip), `Bridge.tsx`,
`Privacy.tsx`, `BulkCall.tsx`, `RoleModal.tsx` ("→ Simple mode" `#1F77EF`), and the CSS rules
`.admin-btn-*`, `.sla-flow-tab.active.red`, `.cg-feed-dot.red`, `.mp-tier-risk`, `.mp-val-red`,
`.mp-risk`, `.admin-alert`. Accent- and danger-filled controls take their text from
`--on-accent` / `--on-danger`.

`label-content-name-mismatch` (WCAG 2.5.3): the BulkCall CSV dropzone carried
`aria-label="Select CSV file to upload"` while its visible text reads "Click to select CSV file /
or drag & drop • columns: provider_id, payload". The `aria-label` was removed so the accessible name
derives from the contents and therefore contains the visible text.

### Result on the final tree

Both themes, all 34 sidebar entries, two consecutive passes: **34/34 panels, 0 violations**.
**49 dark / 54 light `color-contrast` nodes stay `incomplete`** across the 34 panels (0–19 per panel): axe cannot
resolve text over gradient/translucent backgrounds. Those remain a manual measurement, not an
automated pass, exactly as row 5 already records for the canvas.

Two further corrections belong to this result:

- **The onboarding overlay needed its own run.** Dismissing `.cg-onboard` is right for the panels and
  wrong for the wizard it *is*: its `Get started →` button was white on `--accent` at **1.99:1**.
  It now uses `var(--on-accent)`, and the wizard was audited **open** in both themes: 0 violations.
- **Copy scope, resolved.** `design/RULES.md:7` requires existing copy to be kept; `design/PHASE_4.md`
  §6 authorises the review step and the transaction states, not a copy rewrite. Every original
  string whose state survives is restored verbatim (unstake lines, both NFT step lines, approval
  line, final `✅ Registered with NFT #…! TX: …`, the mint errors, the completion paragraph,
  `USDC approved. Ready to register.`, `Approve ${stake} USDC`, `Register as Provider`,
  `Approving…`/`Registering…`, and the section title `REGISTER (basic — no NFT)`). New copy exists
  only for states that had none. The sole exception is the pair of `toast.error` fallbacks
  (`Approval failed` / `Registration failed`), unreachable because `friendlyError()` never returns
  empty; the flow now always states the real reason.

**Not executed here, and not counted as passing:** the 49/54 gradient `incomplete` nodes; the three
`--motion-*` declarations that concatenate two timing functions (`shell.css:479` dead rule,
`shell.css:806` mobile drawer, `index.css:677` `.app-shell` — measured `transition: all 0s`), left
for a separate change; and a real screen reader, which this environment does not have — the
accessibility tree and axe-core stand in.

### Row 6 — the three wallet branches, executed

In the throwaway worktree the mock connector's provider was scripted (4001 rejection, contract
revert, or a hash whose receipt is served as `status: "0x1"`), reached through
`connector.getWalletClient` because wagmi's mock connector has none and `useWalletClient()` was
otherwise `undefined`. Executed, in the browser:

- **Rejection** (V1 and NFT paths): `role="status"` reads "Rejected in your wallet — nothing was
  submitted."; all three review controls stay enabled; no NFT id written.
- **Contract revert**: "Execution reverted with reason: MinStakeNotMet()." (NFT path) and
  "Transaction reverted on-chain: …" (V1 path).
- **Confirmed success**: V1 → the completion screen; NFT path → "⏳ Step 1/3 — minting the
  ERC-8004 identity NFT…" → "⏳ Step 2/3 — NFT #1 confirmed. Approving USDC…" → completion screen
  with `localStorage.cgAgentNftId = "1"`, i.e. success is taken from a receipt, not from a hash.

This is a **test double**, not a real signer: it proves the panel's own branching and copy, not
wallet interop.

### Gates at the close of this pass

`bun run typecheck` clean · `bun run lint` (`eslint src --max-warnings=0`) clean, after deleting six
imports the rules extraction left unused · `bun test tests/` **22 pass / 0 fail** (the script is
scoped to `tests/`; bare `bun test` also picks up `lib/openzeppelin-contracts/test/*.js`) ·
`bun run build` ✓ · axe as recorded above · no console errors in any state.

## Addendum — 2026-10-21: current-tree re-verification finds a Canvas label collision

This pass was requested as a verification only. No product code, contract, API, dependency or
navigation was changed. The findings below are evidence about the current tree, not a retrospective
change to the 2026-10-18/19 record.

**Environment.** The mock-wallet worktree at `/tmp/opencode/cg-phase2-mock` (its own Vite server on
port 5183) was synchronised with the current `src/components/viz/SLACanvas.tsx`,
`src/components/panels/History.tsx`, `src/components/layout/shell.css`, `src/index.css` and
`src/lib/utils.ts`. A test-only GraphQL fixture on `127.0.0.1:5199` supplied one COMPLETED, one
SLASHED and one STARTED call for the mock wallet `0x9adE…4ba5`; the fixture and its URL override
live only in `/tmp`, and the main tree was not pointed at it. Browser: `agent-browser` Chromium with
axe-core 4.12.1, real accessibility tree, keyboard input, CDP pointer drag and viewport overrides.

### FAIL — desktop/tablet label row collides

At **1280×900**, **1440×960** and **834×1112**, the board is `display:block` and the four
`.sla-canvas__labels` buttons are 112 px wide while their centres are only **47.3 px** apart. Every
adjacent pair overlaps by **64.7 px**:

```
overlaps: [64.7, 64.7, 64.7]  (1280, 1440 and 834)
visible text: "EscrowService callReceiptSettlement"
              "1 USDCprovider notifiedEIP-712 signedpayout or slash"
```

The screenshots show the same collision in both themes:
`/tmp/opencode/cg-phase4-canvas-1280-light.png`,
`/tmp/opencode/cg-phase4-canvas-1280-dark.png`,
`/tmp/opencode/cg-phase4-canvas-834-light.png`.

This contradicts row 9's "labels neither collide nor clip" claim and the responsive sub-check in
row 12. The cause is structural, not a one-off width: four fixed 112 px labels cannot fit over a
board whose plate spacing is about 47 px at rest. Shrinking the board further does not fix it.

**Not a failure at phone width.** At **411×891** and **375×812** the board is `display:none`, the
stack is `display:flex`, and the four stage buttons are readable. Pressing `Enter` on
`Settlement — Waiting. payout or slash` set `aria-pressed=true` and announced
`Settlement · Waiting · payout or slash`; no page-level horizontal scroll (`scrollWidth === 375`
and `411`).

**Secondary, pre-existing shell limit.** At 375 px `.main-content` is **391.3 px** wide (16.3 px
wider than the viewport), so the topbar title is clipped; the Canvas itself sits at 31–360 px and
is not clipped. At **320 px** the shell shifts left (`x=-36`) and the Canvas occupies **-5…324 px**
(4.3 px clipped on both sides). This is the same shell min-content issue recorded in Phase 3, not a
new Canvas layout rule.

### Checks that passed on this tree

- **Stage controls and states.** COMPLETED: `Escrow — Done. 1 USDC`,
  `Service call — Done. provider notified`, `Receipt — Done. signature verified`,
  `Settlement — Done. paid to provider`. SLASHED: Receipt and Settlement are `Failed`
  (`no valid receipt`, `stake slashed`). STARTED: Service call is `In progress`; Receipt and
  Settlement are `Waiting`. No invented stage.
- **Keyboard and live region.** Focus + `Enter` on a plate selected it, kept focus on the
  `role=button` group, set `aria-pressed`, and updated the mounted `role=status` line.
- **Zoom, pan, return.** 100% → 125% → 250% changed the transform; `ArrowRight` on the focused
  board moved the transform from `translate(7.90189%, 0%)` to `translate(3.90189%, 0%)`; a real
  pointer drag moved it to `translate(12.5%, 10.5263%)`; `Fit` returned `scale(1)` and left the
  board's `tabindex` at `-1`. At 250% `Zoom in` had `aria-disabled=true` while `disabled=false`,
  and focus stayed on it.
- **Accessibility.** Axe over `.sla-canvas`, both themes, tags
  `wcag2a,wcag2aa,wcag21a,wcag21aa`: **0 violations, 1 incomplete** (color-contrast, 11 nodes).
  Direct measurement against the effective surface: dark **6.71:1** for `--text-dim` and
  **9.18:1** for `--accent-ink`; light **8.00:1** and **5.75:1**. All above 4.5:1 at their sizes.
  Focus-visible on a plate produced `stroke-width: 2.5px` and `stroke-dasharray: 3px, 2px`.
- **Reduced motion.** With `prefers-reduced-motion: reduce`, the plate animation was `none`, and
  stage/stack/outline transition durations were `0s`; normal motion restored `0.12s`.
- **Console.** No page errors. The only console output was Vite/React DevTools and pre-existing
  `THREE.WebGLRenderer` context-lost/restored messages from the shell background.

### Unverified / blocked

- A real screen reader is unavailable; the accessibility tree, keyboard run and axe stand in.
- The mock wallet cannot sign; this pass made no transaction.
- The label collision was reported in the verification pass; it is repaired in the next addendum.

## Addendum — 2026-10-21: label collision repaired

The request after the verification pass was "düzelt" (fix). Only two product files changed:
`src/components/viz/SLACanvas.tsx` (removed the absolute `left` anchors and the unused
`labelLeft`) and `src/components/layout/shell.css` (the label row is a four-column grid; the
captions are static, shrinkable cells; the row is hidden while the board is zoomed).

Why this shape: four fixed 112 px captions cannot fit over plate centres 47.3 px apart. Shrinking
the captions below the word "Settlement" would clip the copy, and widening the board past the
detail column would break the two-column layout. A four-column legend keeps each stage readable
and leaves the plates as the visual diagram; hiding it while zoomed avoids pretending the columns
still line up with the transformed plates, and the existing live inspect line names the selected
stage.

Measured after the fix:

| Viewport | Label cells | Adjacent overlaps | Board / stack |
|---|---|---|---|
| 1440×960 | 107.6 px | none | board |
| 1280×900 | 90.5 px | none | board |
| 1024×900 | 170.5 px | none | board |
| 834×1112 | 123.0 px | none | board |
| 641×900 | 138.2 px | none | board |
| 411×891 | — | — | stack, no page overflow |
| 375×812 | — | — | stack, no page overflow |

- The four labels are `position: static` in the grid; no pair overlaps at 641–1440 px.
- Zoom 100→125% changes the label row to `display:none`; `Fit` restores `display:grid`. The board
  keeps its arrow-key pan and `tabindex=0` while zoomed.
- A real pointer click on the Receipt caption selected it and moved focus to
  `Receipt — Done. signature verified`; the stack `Enter` path still announced
  `Settlement · Done · paid to provider`.
- Axe over `.sla-canvas` in both themes: **0 violations**, 1 `color-contrast` incomplete (11
  nodes, manual ratios unchanged: dark 6.71–9.18:1, light 5.75–8.00:1).
- No page errors. `bun run typecheck` and `bun run lint` (`--max-warnings=0`) exit 0;
  `bun run build` exit 0; `bun test tests/` **387 pass / 4 skip / 0 fail / 1506 expect() calls /
  32 files**. A source regression guard, `tests/sla-canvas-layout.test.ts`, asserts the four-column
  grid, the non-absolute caption, and the zoom-hide rule.
- Fixed screenshots: `/tmp/opencode/cg-phase4-fix-1280-light.png`,
  `/tmp/opencode/cg-phase4-fix-1280-light-theme.png`,
  `/tmp/opencode/cg-phase4-fix-834-light.png`, `/tmp/opencode/cg-phase4-fix-375-light.png`.

The earlier failure remains recorded above as the before state. With the repaired label row, the
current tree passes row 9's layout check and the responsive part of row 12; the historical row 2
skill-usage `FAIL` is unchanged. The 320 px shell clip and 375 px topbar clipping remain the
pre-existing shell min-content limits, not Canvas rules.
