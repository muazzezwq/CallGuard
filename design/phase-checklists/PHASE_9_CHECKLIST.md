# Phase 9 completion checklist

Plan: `design/PHASE_9_PLAN.md` (brief delivered in chat; no verbatim prompt file exists)
Filled: 2026-10-22 · Overall: NOT COMPLETE (see rows)

| # | Requirement | Implementation evidence | Verification method | Actual result | Status | Limitation / blocker |
|---|---|---|---|---|---|---|
| 1 | Shared panel kit (`PanelShell`, `PanelSource`, `SignalRow`, `PanelSplit`, `Ledger`, `LedgerRow`, `KeyValue`, `CodeSurface`, `StatusNotice`) | `src/components/panel/PanelUi.tsx`, `src/components/panel/panel.css` | `bun run check`, browser inspect | typecheck + ESLint exit 0 | PASS | visual use starts in Wave 1 |
| 2 | Kit test and token discipline | `tests/panel-kit.test.ts` | `bun test tests/panel-kit.test.ts` | 4 pass / 0 fail; 20 expect() calls | PASS | — |
| 3 | Baseline DOM inventory for all 19 panels | `/tmp/opencode/cg19-baseline.json` | `node` key/count check | 19 keys present; 28,786 bytes | PASS | visible initial tab only; source audit covers other tabs |
| 4 | `analytics` redesigned without data loss | — | browser + DOM diff | not started | UNVERIFIED | — |
| 5 | `disputes` redesigned; retired gate preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 6 | `quality` redesigned; retired gate preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 7 | `lending` redesigned; approvals and 6-decimal rules preserved | — | browser + DOM diff | not started | UNVERIFIED | signed writes cannot be executed with mock wallet |
| 8 | `futures` redesigned; all batch actions preserved | — | browser + DOM diff | not started | UNVERIFIED | signed writes cannot be executed with mock wallet |
| 9 | `subscriptions` redesigned; preview truth preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 10 | `jobs` redesigned; six-stage state preserved | — | browser + DOM diff | not started | UNVERIFIED | signed writes cannot be executed with mock wallet |
| 11 | `attestation` redesigned; all tabs preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 12 | `agent` redesigned; storage keys and writes preserved | — | browser + source diff | not started | UNVERIFIED | signed writes cannot be executed with mock wallet |
| 13 | `balance` redesigned; four branches preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 14 | `passkey` redesigned; state machine preserved | — | browser + DOM diff | not started | UNVERIFIED | no passkey credential harness |
| 15 | `mcp` redesigned; tools/tests/config preserved | — | browser + DOM diff | not started | UNVERIFIED | EIP-3009 signing cannot be executed |
| 16 | `apidocs` redesigned; endpoint reference preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 17 | `webhooks` redesigned; local-only truth preserved | — | browser + source diff | not started | UNVERIFIED | test POST target is external |
| 18 | `pipelinehook` redesigned; tx states preserved | — | browser + DOM diff | not started | UNVERIFIED | signed writes cannot be executed |
| 19 | `nano` redesigned; x402/multicall preserved | — | browser + source diff | not started | UNVERIFIED | signed writes cannot be executed |
| 20 | `privacy` redesigned; storage keys preserved | — | browser + source diff | not started | UNVERIFIED | — |
| 21 | `admin` redesigned; owner/timelock paths preserved | — | browser + DOM diff | not started | UNVERIFIED | signed writes cannot be executed |
| 22 | `settings` redesigned; preferences preserved | — | browser + DOM diff | not started | UNVERIFIED | — |
| 23 | Admin v4 → v7 copy correction (approved) | — | source grep | not started | UNVERIFIED | held until Admin wave |
| 24 | No landing/marketing or contract/API changes | — | `git diff --name-only` | not run after panel work | UNVERIFIED | — |
| 25 | `bun run check`, `bun run test`, `bun run build` after Wave 0 | — | commands | check exit 0; test 392 pass / 4 skip / 0 fail; build exit 0 | PASS | build retains pre-existing chunk-size warning |
| 26 | 1280 / 411 dark and light browser checks | — | browser screenshots / DOM | not started | UNVERIFIED | no screen reader; mock wallet cannot sign |

## Wave 0 log

- Created `src/components/panel/PanelUi.tsx`.
- Created `src/components/panel/panel.css`.
- Created `tests/panel-kit.test.ts`; targeted run 4 pass / 0 fail.
- Captured baseline DOM for all 19 panels at `/tmp/opencode/cg19-baseline.json`.
- First `bun run check` failed with one `jsx-a11y/no-noninteractive-tabindex` warning on
  `CodeSurface`; removed the non-interactive `tabIndex`.
- Re-run: `bun run check` exit 0; `bun run test` 392 pass / 4 skip / 0 fail; `bun run build` exit 0.
- The kit is not imported by any panel yet, so no panel visuals changed in Wave 0.
