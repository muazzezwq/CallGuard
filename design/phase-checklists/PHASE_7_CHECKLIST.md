# Phase 7 completion checklist

Prompt delivered in chat on 2026-10-20. `design/PHASE_7.md` does not exist; the requirements are
restated in `design/PHASE_7_PLAN.md` and were not presented as a verbatim phase file.
Commits: none (no commit authorised).
Legend: `PASS` verified with the evidence named · `PARTIAL` implemented but part unverified ·
`FAIL` not done or broken · `UNVERIFIED` not measured.

| # | Requirement | Implementation | Verification | Result | Status | Limitation |
|---|---|---|---|---|---|---|
| 1 | Preflight: instructions, Git state, phase docs, real panels and data sources | read `AGENTS.md`, git state, `docs/*`, `PHASE_1`–`PHASE_6`, panels, hooks, subgraph schema/mapping, `PayPerCall.sol` | transcript commands | HEAD `3d858a2`; existing Phase 6/endpoint changes preserved | PASS | `design/PHASE_7.md` absent |
| 2 | Skills actually used are reported | `writing-plans` (loaded earlier this session) used for `design/PHASE_7_PLAN.md` | transcript | plan follows the skill's template | PASS | no other skill applied |
| 3 | Existing functionality verified before edits | History, Notifications, Requests, Receipts, Overview strip, `useSubgraph`, `lib/subgraph`, subgraph mapping | file reads + browser | History already had freshness, wrong-network, filters, pager, exports; Notifications already watched three events | PASS | — |
| 4 | Records use only authoritative fields | `id providerId amount status createdAt completedAt requestHash responseHash refunded slashed` | query + browser | `1 USDC`, provider #1, timestamps; missing amount rendered `—` | PASS | provider address, tx hash, block time absent |
| 5 | Transaction hash shown only when real | detail row explains "not indexed"; notifications link real log hashes | browser detail + notification card | `href="https://explorer.testnet.arc.io/tx/0xaaaa…"` from a fixture log; History states no link | PARTIAL | no tx hash in the `Call` entity; adding it needs a subgraph deploy |
| 6 | Distinguish tx vs call; submitted ≠ confirmed ≠ completed | status from events; detail says receipt makes escrow claimable | detail text + event mapping audit | "receipt indexed … escrow became claimable; withdrawal is separate" | PASS | — |
| 7 | No fabricated timestamps, ids, payments or results | `usdcAmount`/`positiveUsdc`; missing time renders "time unavailable" | unit tests + Requests/Receipts code | missing amount is null, not `0`; Requests no longer shows 1970 | PASS | — |
| 8 | Unavailable fields explicit, no misleading zero | History `—`, Requests/Receipts "amount unavailable", "not indexed" | unit tests + browser | STARTED fixture with no amount rendered `—`; totals included it as a call but no money | PASS | — |
| 9 | One call not duplicated; stable deterministic order | `normalizeCalls` dedupe + createdAt/id sort | 4 unit tests + refresh in browser | repeated query kept 3 rows; duplicate id collapsed to one | PASS | — |
| 10 | Status/lifecycle mapping matches protocol | `callStatusLabel`: STARTED→Open, COMPLETED→Completed, SLASHED→Timeout claimed; `REFUNDED` filter removed as unwritten | mapping file + browser rows | 3 fixture rows showed Open / Completed / Timeout claimed; slash amounts 0.7/0.3 USDC | PASS | `REFUNDED` remains in the schema enum but has no writer |
| 11 | Detail view: identifiers, SLA, hashes, outcome, explorer | call id, provider, amount, status, timestamps, request/response hash, SLA canvas + terms, refund/slash flags | browser, injected `fetch` fixture for rendering | terms showed "no receipt recorded", "0.3 USDC slashed", flags "Refunded to caller"/"Stake slashed"; no explorer link | PARTIAL | no transaction hash/link exists in the source |
| 12 | Notifications identify event, state and link; dedupe; account scoped | `cg_notifs_v3:<address>`, key `txHash:logIndex:event`, stream error, `chainId` pinned, explorer link | unit tests + browser injected store | duplicate log id rendered one card (`All (1)`), malformed entry dropped, `0x…` hash link present | PASS | live events only while panel mounted; no push channel |
| 13 | Notifications do not claim unsupported success | copy "the contract accepted the provider signature"; Timeout claimed from `CallSlashed`; network-wide scope + caller | code + browser | no "success" text from a request; caller shown; wrong-network note present | PASS | receipt/slash logs do not carry a caller, so wallet filtering is impossible |
| 14 | Refresh, polling, account/network change, cleanup | existing `useSubgraph` 15–30 s polling, `useWatchContractEvent`, per-wallet query keys and store key | code + browser wallet already connected | history freshness line: "Last indexed block 68093802 at 3:14:39 AM"; no duplicate timers introduced | PARTIAL | no explicit query invalidation after a confirmed transaction; next poll (≤30 s) refreshes |
| 15 | Loading / empty / no-match / error / stale states | History freshness + stale + RPC error, Requests/Receipts error, notification stream error | browser (empty + fixture) | empty History copy distinguishes indexer delay; Requests hint present; Receipts showed "0 on-chain receipts" with empty state | PASS | indexer lag cannot be produced on demand |
| 16 | Filters, search, pagination, export | status chips, id/provider search, `clampPage`, `csvCell`, no zero fallback | unit tests + browser | "Open" chip returned 1 row; pager clamp covered by tests; exports keep column order | PASS | no tx-hash or provider-address search (not in the entity) |
| 17 | Accessibility and responsive behaviour | `aria-pressed` filters, `role="status"` stream state, labels, 44 px filter targets, wrapping hashes | DOM at 1280 and 411; light screenshot | 4 filter buttons with `aria-pressed`; status region text; `scrollWidth == clientWidth` at 411 and 1280 | PARTIAL | keyboard traversal, focus-visible and a screen reader were not exhaustively tested; 834 px not measured (no tablet preset) |
| 18 | Tests and gates | `tests/activity.test.ts` (15 cases); existing suites | commands | `bun run check` exit 0; `bun test tests/` 97 pass / 0 fail / 249 expect / 6 files; `bun run build` exit 0 (1m45s) | PASS | no component-level test runner exists |
| 19 | Docs updated with sources, limits and evidence | progress, decisions, audit, panel-inventory + this file | diff | sources named; defects and limits recorded | PASS | — |
| 20 | Scope: no contract/address/chain/economic change, no commit/push/deploy | only frontend, tests, docs | `git status`, `git diff` | no contract or address edit; no commit, push or deploy | PASS | Phase 6/endpoint work still uncommitted, preserved |

## Browser scenarios actually run

- 1280 px, dark: Transactions empty state, freshness line, filter chips, injected three-call
  fixture (COMPLETED, SLASHED, STARTED without amount), detail pane for COMPLETED and SLASHED,
  export buttons present, no horizontal overflow.
- 1280 px: Notifications with no events, four `aria-pressed` filters, "Listening…" status, injected
  duplicate + malformed stored alerts → one card, explorer hash link, "Open Transactions" for the
  matching caller.
- 411 px, light: Notifications filter row, no horizontal overflow; History no horizontal overflow.
- My Requests and Receipts rendered after the edits (empty/real indexer responses), no console
  errors in any checked panel.

The three-call History fixture and the stored notification fixture were injected through
`window.fetch` / `localStorage` in the test browser only. They exercised rendering; the production
source remains the Goldsky subgraph and live contract logs.
