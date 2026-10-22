# Phase 9 completion checklist

Plan: `design/PHASE_9_PLAN.md` (brief delivered in chat; no verbatim prompt file exists)
Filled: 2026-10-22 · Overall: NOT COMPLETE (see rows)

| # | Requirement | Implementation evidence | Verification method | Actual result | Status | Limitation / blocker |
|---|---|---|---|---|---|---|
| 1 | Shared panel kit (`PanelShell`, `PanelSource`, `SignalRow`, `PanelSplit`, `Ledger`, `LedgerRow`, `KeyValue`, `CodeSurface`, `StatusNotice`) | `src/components/panel/PanelUi.tsx`, `src/components/panel/panel.css` | `bun run check`, browser inspect | typecheck + ESLint exit 0 | PASS | visual use starts in Wave 1 |
| 2 | Kit test and token discipline | `tests/panel-kit.test.ts` | `bun test tests/panel-kit.test.ts` | 4 pass / 0 fail; 20 expect() calls | PASS | — |
| 3 | Baseline DOM inventory for all 19 panels | `/tmp/opencode/cg19-baseline.json` | `node` key/count check | 19 keys present; 28,786 bytes | PASS | visible initial tab only; source audit covers other tabs |
| 4 | `analytics` redesigned without data loss | `src/components/panels/Analytics.tsx`, `src/components/panel/panel.css` | browser + DOM diff | 12 mocked calls → 12 outcome ticks, 75% honor, 2 provider rows, 12-row hidden table; empty live state honest; canvas removed | PASS | populated state uses mocked Goldsky payload; live subgraph currently returns 0 calls |
| 5 | `disputes` redesigned; retired gate preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 6 | `quality` redesigned; retired gate preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 7 | `lending` redesigned; approvals and 6-decimal rules preserved | — | browser + DOM diff | not started | UNVERIFIED | signed writes cannot be executed with mock wallet |
| 8 | `futures` redesigned; all batch actions preserved | — | browser + DOM diff | not started | UNVERIFIED | signed writes cannot be executed with mock wallet |
| 9 | `subscriptions` redesigned; preview truth preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 10 | `jobs` redesigned; six-stage state preserved | — | browser + DOM diff | not started | UNVERIFIED | signed writes cannot be executed with mock wallet |
| 11 | `attestation` redesigned; all tabs preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 12 | `agent` redesigned; storage keys and writes preserved | — | browser + source diff | not started | UNVERIFIED | signed writes cannot be executed with mock wallet |
| 13 | `balance` redesigned; four branches preserved | `src/components/UnifiedBalance.tsx` | browser + DOM diff | loading, error, empty, and success executed; success mock showed `123.46 USDC`, `100.500000` and `22.956789` chain precision; disconnected branch source-verified only | PARTIAL | mock wallet cannot disconnect without leaving the app; success response mocked because Vite serves `/api/unified-balance` as HTML |
| 14 | `passkey` redesigned; state machine preserved | — | browser + DOM diff | not started | UNVERIFIED | no passkey credential harness |
| 15 | `mcp` redesigned; tools/tests/config preserved | — | browser + DOM diff | not started | UNVERIFIED | EIP-3009 signing cannot be executed |
| 16 | `apidocs` redesigned; endpoint reference preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 17 | `webhooks` redesigned; local-only truth preserved | — | browser + source diff | not started | UNVERIFIED | test POST target is external |
| 18 | `pipelinehook` redesigned; tx states preserved | — | browser + DOM diff | not started | UNVERIFIED | signed writes cannot be executed |
| 19 | `nano` redesigned; x402/multicall preserved | — | browser + source diff | not started | UNVERIFIED | signed writes cannot be executed |
| 20 | `privacy` redesigned; storage keys preserved | `src/components/panels/Privacy.tsx` | browser + source diff | 13 storage keys and 3 session keys unchanged; toggle persisted `cg_privacy_prefs`; clear removed test keys and showed `Cleared!` | PASS | manual DOM/keyboard checks only; no screen reader |
| 21 | `admin` redesigned; owner/timelock paths preserved | — | browser + DOM diff | not started | UNVERIFIED | signed writes cannot be executed |
| 22 | `settings` redesigned; preferences preserved | `src/components/panels/SettingsPanel.tsx` | browser + DOM diff | Light/Dark applied; budget saved to `cg_budget` and cleared; contract address, disconnect, and SDK surface retained | PASS | manual DOM/keyboard checks only; no screen reader |
| 23 | Admin v4 → v7 copy correction (approved) | — | source grep | not started | UNVERIFIED | held until Admin wave |
| 24 | No landing/marketing or contract/API changes | — | `git diff --name-only` | Wave 1 diff limited to 4 panels plus panel kit CSS | PASS | recheck after every later wave |
| 25 | `bun run check`, `bun run test`, `bun run build` after Wave 1 | — | commands | check exit 0; test 392 pass / 4 skip / 0 fail; build exit 0 | PASS | build retains pre-existing chunk-size warning |
| 26 | 1280 / 411 dark and light browser checks | `/tmp/opencode/cg19-wave1/` | browser screenshots / DOM | 1280 dark for all 4; 1280 light settings; 411 dark/light for all 4; no page horizontal scroll; console errors none | PASS | no screen reader; mock wallet cannot sign |

## Wave 0 log

- Created `src/components/panel/PanelUi.tsx`.
- Created `src/components/panel/panel.css`.
- Created `tests/panel-kit.test.ts`; targeted run 4 pass / 0 fail.
- Captured baseline DOM for all 19 panels at `/tmp/opencode/cg19-baseline.json`.
- First `bun run check` failed with one `jsx-a11y/no-noninteractive-tabindex` warning on
  `CodeSurface`; removed the non-interactive `tabIndex`.
- Re-run: `bun run check` exit 0; `bun run test` 392 pass / 4 skip / 0 fail; `bun run build` exit 0.
- The kit is not imported by any panel yet, so no panel visuals changed in Wave 0.

## Wave 1 log

- Redesigned `Analytics`, `UnifiedBalance`, `Privacy`, and `SettingsPanel` against the shared kit.
- Analytics: removed the canvas entirely; 12 recent calls render as outcome ticks plus a visually hidden
  table with the same provider, status, amount, and relative-time data. The live subgraph returned
  0 calls, so the populated state was verified with a mocked GraphQL payload.
- Unified Balance: preserved the four exclusive branches. The success branch was verified with a
  mocked `/api/unified-balance` response because Vite serves that path as HTML and injects a
  `vite-error-overlay`; the overlay was removed before screenshots.
- Privacy: preserved the exact 13 `STORAGE_KEYS`, the 3 session keys, `cg_privacy_prefs`, and the
  `Cleared!` reset. Toggle persistence and clearing were executed in the browser.
- Settings: Light/Dark and Simple/Pro controls applied; budget saved to and cleared from
  `cg_budget`; `ArcScan` link, wallet disconnect, and SDK code surface retained.
- Responsive: 1280×720 dark for all four panels; 1280×720 light for Settings; 411×915 dark and
  light for all four. No page-level horizontal scroll and no console errors.
- Keyboard: Tab from panel navigation reached the Settings theme control with
  `:focus-visible` true and the shared focus ring visible.
- Evidence: `/tmp/opencode/cg19-wave1/analytics-desktop.png`,
  `analytics-mock-desktop.png`, `balance-desktop.png`, `balance-mobile.png`,
  `privacy-desktop.png`, `privacy-mobile.png`, `settings-desktop.png`,
  `settings-mobile.png`, `settings-light-desktop.png`, `settings-light-411.png`.
- Gates after Wave 1: `bun run check` exit 0; `bun run test` 392 pass / 4 skip / 0 fail;
  `bun run build` exit 0.
- Still unverified: screen-reader announcements, signed writes (none in Wave 1), and the
  `UnifiedBalance` disconnected branch in a real browser.
