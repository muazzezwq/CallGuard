# Phase 9 completion checklist

Plan: `design/PHASE_9_PLAN.md` (brief delivered in chat; no verbatim prompt file exists)
Filled: 2026-10-22 · Overall: NOT COMPLETE (see rows)

| # | Requirement | Implementation evidence | Verification method | Actual result | Status | Limitation / blocker |
|---|---|---|---|---|---|---|
| 1 | Shared panel kit (`PanelShell`, `PanelSource`, `SignalRow`, `PanelSplit`, `Ledger`, `LedgerRow`, `KeyValue`, `CodeSurface`, `StatusNotice`) | `src/components/panel/PanelUi.tsx`, `src/components/panel/panel.css` | `bun run check`, browser inspect | typecheck + ESLint exit 0 | PASS | visual use starts in Wave 1 |
| 2 | Kit test and token discipline | `tests/panel-kit.test.ts` | `bun test tests/panel-kit.test.ts` | 4 pass / 0 fail; 20 expect() calls | PASS | — |
| 3 | Baseline DOM inventory for all 19 panels | `/tmp/opencode/cg19-baseline.json` | `node` key/count check | 19 keys present; 28,786 bytes | PASS | visible initial tab only; source audit covers other tabs |
| 4 | `analytics` redesigned without data loss | `src/components/panels/Analytics.tsx`, `src/components/panel/panel.css` | browser + DOM diff | 12 mocked calls → 12 outcome ticks, 75% honor, 2 provider rows, 12-row hidden table; empty live state honest; canvas removed | PASS | populated state uses mocked Goldsky payload; live subgraph currently returns 0 calls |
| 5 | `disputes` redesigned; retired gate preserved | `src/components/panels/Disputes.tsx` | browser + DOM diff | all four tabs render; retired notice and gated history visible; bond reads 0.50/0.10/1/12h; `openDispute(callId, providerId, now-1, evidence)`, `vote(id, 1|2)`, `withdrawPayout`, and `pendingWithdrawals` retained; 1280/411 dark and light clean | PASS | signed writes not executed; mock wallet cannot sign |
| 6 | `quality` redesigned; retired gate preserved | `src/components/panels/Quality.tsx` | browser + DOM diff | Open/Vote/Become Arbiter render; retired notice visible; call ID guard and exact arbiter toast confirmed; stake control stays enabled while retired; `openDispute(...BigInt(1)...)` and `vote(id, 1|2)` retained | PASS | signed writes not executed; mock wallet cannot sign |
| 7 | `lending` redesigned; approvals and 6-decimal rules preserved | `src/components/panels/Lending.tsx` | browser + DOM diff | Lend/Borrow/My Loans executed; empty-loan state honest; source rail, 6-decimal pool/shares, and approve→deposit/repay order retained | PASS | signed writes cannot be executed with mock wallet; 6-decimal args verified by source diff |
| 8 | `futures` redesigned; all batch actions preserved | `src/components/panels/Futures.tsx` | browser + DOM diff | Browse/My Slots/Mint executed; batch empty state, mint/buy/burn/claim/cancel controls, `nextBatchId - 1` count and 10-card cap retained; mobile inline forms stack | PASS | signed writes cannot be executed with mock wallet |
| 9 | `subscriptions` redesigned; preview truth preserved | `src/components/panels/Subscriptions.tsx` | browser + DOM diff | preview notice rendered; exact toast confirmed; 1 indexed provider, 10-call range, 10.00 USDC total; no fake active subscriptions | PASS | protocol is not live; no real subscription write exists |
| 10 | `jobs` redesigned; six-stage state preserved | `src/components/panels/Jobs.tsx` | browser + source diff | step 0 renders; six stage buttons, current marker, disabled future steps, create form, status lookup, and stage-lane internal scroll at 411; all six handlers and `parseUnits`/allowance order unchanged | PASS | signed step transitions 1–5 not reachable in browser with mock wallet; only source-verified |
| 11 | `attestation` redesigned; all tabs preserved | `src/components/panels/Attestation.tsx` | browser + DOM diff | Peek/Issue/Lookup render; mocked `/api/attestation` success showed JSON; `attestProviderScore(providerId, 50)` and lookup guard retained; REST endpoint and code example visible | PASS | attestation write not executed; peek success mocked because Vite serves `/api/*` as non-JSON |
| 12 | `agent` redesigned; storage keys and writes preserved | `src/components/panels/Agent.tsx`, `src/components/panel/panel.css` | browser + source diff | Setup/Auto-Route/Settings render; invalid-address and valid-reconnect statuses; five-stat signal strip; owner, daily limit, and max-per-call reads; `cg_agent_wallet`, approve→deposit, `agentCall`, pause, limits, whitelist handlers, and auto-route scoring retained; 1280/411 dark and light clean | PASS | signed writes not executed; mock wallet cannot sign |
| 13 | `balance` redesigned; four branches preserved | `src/components/UnifiedBalance.tsx` | browser + DOM diff | loading, error, empty, and success executed; success mock showed `123.46 USDC`, `100.500000` and `22.956789` chain precision; disconnected branch source-verified only | PARTIAL | mock wallet cannot disconnect without leaving the app; success response mocked because Vite serves `/api/unified-balance` as HTML |
| 14 | `passkey` redesigned; state machine preserved | `src/components/PasskeyWallet.tsx`, `src/components/panel/panel.css` | browser + DOM/source diff | idle and missing-key branches render; Register stays disabled without a key; status badge, `register`/`login`/`sendGaslessCall`/`reset`, smart-account address, and UserOp surfaces retained; 1280/411 dark and light clean | PASS | no passkey credential harness; ready/error/loading and gasless paths source-diffed only |
| 15 | `mcp` redesigned; tools/tests/config preserved | `src/components/panels/Mcp.tsx`, `src/components/panel/panel.css` | browser + DOM diff + clipboard probe | Tools/x402/Live Test/Config render; 6 tools with exact names/params; install, Claude config, REST base, and SSE copied exactly (compact Claude JSON kept); x402 defaults and `How it works` visible; Live Providers + Test render; 1280/411 dark and light clean | PASS | EIP-3009 signing not executed (mock wallet cannot sign; x402 guard returned `Connect wallet first` because `walletClient` was unavailable); live API test not run |
| 16 | `apidocs` redesigned; endpoint reference preserved | `src/components/panels/ApiDocs.tsx`, `src/components/panel/panel.css` | browser + DOM diff + clipboard probe | 9 endpoints with exact methods/paths/descriptions; GET/POST/Auth/x402 badges are text-visible; left contents rail anchors to `#api-mcp`; Quick Integration, Embed Widget, and MCP JSON copied exactly; no new route | PASS | Live endpoint calls not made; copy actions verified through a clipboard probe |
| 17 | `webhooks` redesigned; local-only truth preserved | `src/components/panels/Webhooks.tsx`, `src/components/panel/panel.css` | browser + source diff | invalid URL, add, event toggle, test failure, same-origin 200 success, `lastTest`, remove, empty state, and `cg_webhooks_v2` persistence exercised; sample payload and no-server-relay notice visible; 1280/411 dark and light clean | PASS | external test POST hit CORS; success path used a same-origin stubbed 200 |
| 18 | `pipelinehook` redesigned; tx states preserved | `src/components/panels/PipelineHook.tsx`, `src/components/panel/panel.css` | browser + source diff | reading/disabled states, invalid-address toast `Enter a valid address`, current hook, set/disable forms, pending/mining/success/error branches, regex, zero-address disable, `setPipelineHook`, refetch, interface code, and best-effort notice retained; 1280/411 dark and light clean | PASS | signed writes not executed; mock wallet cannot sign |
| 19 | `nano` redesigned; x402/multicall preserved | `src/components/panels/Nano.tsx` | browser + source diff | balance/call error states honest; 2 x402 endpoints; Multicall3 2→3→2 add/remove cap; snippet scrolls inside its surface; no fabricated success | PASS | signed calls cannot be executed; Vite serves `/api/*` as non-JSON so live success is unavailable |
| 20 | `privacy` redesigned; storage keys preserved | `src/components/panels/Privacy.tsx` | browser + source diff | 13 storage keys and 3 session keys unchanged; toggle persisted `cg_privacy_prefs`; clear removed test keys and showed `Cleared!` | PASS | manual DOM/keyboard checks only; no screen reader |
| 21 | `admin` redesigned; owner/timelock paths preserved | `src/components/panels/AdminPanel.tsx`, `src/components/panel/panel.css` | browser + DOM diff + source diff | Owner gate and `Please connect your wallet.` branch retained; `owner`, `payPerCall`, `pendingPayPerCall`, `payPerCallChangeAt` reads; Call/Propose/Apply and Waiting.../Writing to chain.../Success!/error labels; timelock notice; 6 address rows copied exactly; `bad` input showed `Invalid address`; current PPC uses a case-insensitive match and shows `Correct address`; 1280/411 dark and light clean | PASS | Signed writes not executed; mock RPC left owner undefined, so the owner-only alert was source-verified only |
| 22 | `settings` redesigned; preferences preserved | `src/components/panels/SettingsPanel.tsx` | browser + DOM diff | Light/Dark applied; budget saved to `cg_budget` and cleared; contract address, disconnect, and SDK surface retained | PASS | manual DOM/keyboard checks only; no screen reader |
| 23 | Admin v4 → v7 copy correction (approved) | `src/components/panels/AdminPanel.tsx` | source grep | v4 strings absent; copy uses `ServiceRegistry v7 admin operations`, `v7 address not set`, and `PayPerCall v7.1 … ServiceRegistry v7` | PASS | — |
| 24 | No landing/marketing or contract/API changes | — | `git diff --name-only` | Wave 5 diff limited to `Mcp.tsx`, `ApiDocs.tsx`, `AdminPanel.tsx`, `PanelUi.tsx` (optional `copyValue`/`copyLabel`), `panel.css`, and this checklist; no landing, contract, or `api/` change | PASS | recheck after every later wave |
| 25 | `bun run check`, `bun run test`, `bun run build` after Wave 5 | — | commands | check exit 0; test 392 pass / 4 skip / 0 fail; build exit 0 | PASS | build retains pre-existing chunk-size warning |
| 26 | 1280 / 411 dark and light browser checks | `/tmp/opencode/cg19-wave5/` | browser screenshots / DOM | 1280 and 411 dark and light for MCP, API Docs, and Admin; 411 document/main/panel scroll widths all 411; console errors none; TOC anchor, 13 copy actions, x402 guard, and Admin invalid-address branch exercised | PASS | no screen reader; mock wallet cannot sign; owner read unavailable in the mock |

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

## Wave 2 log

- Redesigned `Lending`, `Futures`, `Subscriptions`, and `Nano` on the shared kit. The diff is limited
  to those four panels, `panel.css` additions, and this checklist; no contract, API, storage, or
  landing change.
- Lending: Lend/Borrow/My Loans render; the empty-loan branch is honest. Pool/shares still use
  6-decimal formatting, `approve` still precedes `deposit`/`repay`, and the source rail names
  `ReputationLoan v3`, `totalAssets`, and `lpPositions`.
- Futures: Browse/My Slots/Mint render. The empty batch ledger, buy, burn, mint, claim, cancel,
  `nextBatchId - 1` count, and 10-card cap are retained. Mobile inline forms now stack at ≤768px
  so the field and action do not share a line.
- Subscriptions: the preview notice is visible, the exact toast text was confirmed in the DOM, and
  the one indexed provider shows `1 USDC/call · 0 calls completed` and `10.00 USDC total`. No active
  subscriptions are fabricated.
- Nano: Gateway balance is shown as unavailable when `/api/nano-balance` is not a JSON API. The
  main call and first x402 attempt both surface the real parse error instead of a success state.
  Multicall went 2→3→2; the add control hides at the 3-provider cap. The Node snippet scrolls
  inside its own surface, not the page.
- Responsive: 1280×720 dark for all four; 411×915 dark and light for all four. At 411 the document,
  `.main-content`, and `.pg-root` scroll widths all equal 411. Console errors: none.
- Evidence: `/tmp/opencode/cg19-wave2/lending-mobile-dark.png`,
  `lending-borrow-mobile-dark-lower.png`, `lending-loans-mobile-light.png`,
  `lending-mobile-light.png`, `futures-mobile-dark.png`, `futures-mobile-light.png`,
  `futures-mint-mobile-dark-lower2.png`, `futures-claim-mobile-dark.png`,
  `futures-cancel-mobile-dark.png`, `subscriptions-desktop-fresh.png`,
  `subscriptions-toast-desktop-final.png`, `subscriptions-mobile-dark.png`,
  `subscriptions-mobile-light.png`, `nano-desktop.png`, `nano-desktop-mid.png`,
  `nano-mobile-dark.png`, `nano-mobile-light.png`, `nano-x402-mobile-dark.png`,
  `nano-multicall-mobile-dark.png`, `nano-code-mobile-dark.png`.
- Gates after Wave 2: `bun run check` exit 0; `bun run test` 392 pass / 4 skip / 0 fail;
  `bun run build` exit 0 (pre-existing chunk-size warning).
- Still unverified: signed Lending/Futures/Nano writes; Nano success and live Gateway balance;
  screen-reader announcements. Full-viewport 411 screenshots showed a Chrome text-highlight overlay
  that is absent from computed styles and element captures, so the content surface was captured.

## Wave 3 log

- Redesigned `Disputes`, `Quality`, `Jobs`, and `Attestation` on the shared kit. The diff is limited
  to those four panels, `panel.css` additions, and this checklist; no contract, API, storage, or
  landing change.
- Disputes: all four tabs render. The retired notice is visible and history queries stay gated.
  Bond reads show `0.50`, `0.10`, `1`, and `12h`. My Disputes and History show honest empty states.
  `openDispute(callId, providerId, now-1, evidence)`, `vote(id, 1|2)`, `withdrawPayout`, and
  `pendingWithdrawals` are unchanged.
- Quality: Open/Vote/Become Arbiter render. The retired notice is visible. Source retains the invalid
  call ID guard, the stake control stays enabled, and the exact informational toast was confirmed.
  `openDispute(...BigInt(1)...)` and `vote(id, 1|2)` are unchanged.
- Jobs: the six stages render as native buttons; the current stage has `aria-current="step"` and
  future stages are disabled. Step 0 renders the create form, and Check Job Status renders. At 411
  the stage lane scrolls inside its own surface (`385` client vs `528` scroll) with no page overflow.
  All six handlers, `parseUnits` budget parsing, and the allowance→approve→fund order are unchanged.
  Steps 1–5 cannot be reached without a real signed transaction.
- Attestation: Peek/Issue/Lookup render. A mocked `/api/attestation` response showed the JSON output.
  The REST endpoint, integration example, `attestProviderScore(providerId, 50)`, and lookup guard are
  retained. The on-chain write was not executed.
- Responsive: 1280×720 and 411×915, dark and light, for all four panels. At 411 the document,
  `.main-content`, and `.pg-root` scroll widths all equal 411. Console errors: none.
- Evidence: `/tmp/opencode/cg19-wave3/disputes-1280-dark.png`,
  `disputes-vote-1280-dark.png`, `disputes-411-dark.png`, `disputes-1280-light.png`,
  `disputes-411-light.png`, `quality-1280-dark.png`, `quality-411-dark.png`,
  `quality-1280-light.png`, `quality-411-light.png`, `jobs-1280-dark.png`, `jobs-411-dark.png`,
  `jobs-1280-light.png`, `jobs-411-light.png`, `attestation-peek-1280-dark.png`,
  `attestation-peek-411-dark.png`, `attestation-peek-1280-light.png`,
  `attestation-peek-411-light.png`.
- Gates after Wave 3: `bun run check` exit 0; `bun run test` 392 pass / 4 skip / 0 fail;
  `bun run build` exit 0 (pre-existing chunk-size warning).
- Still unverified: signed Disputes/Quality/Jobs/Attestation writes; Jobs steps 1–5 in the browser;
  Attestation on-chain issue success; screen-reader announcements.

## Wave 4 log

- Redesigned `Agent`, `Passkey`, `Webhooks`, and `PipelineHook` on the shared kit. The diff is
  limited to those four panels, `panel.css` additions, and this checklist; no contract, API,
  storage, or landing change.
- Agent: Setup/Auto-Route/Settings render. Invalid address shows `Invalid address`; a valid
  reconnect shows `Agent Wallet connected`. Reads still cover `getStats`, `paused`, `dailyLimit`,
  `maxPerCall`, and now `owner`. `cg_agent_wallet` remains the storage key; `approve` still precedes
  `deposit`, and `agentCall`, pause/unpause, limit setters, whitelist writes, and auto-route scoring
  are unchanged. The five-value signal strip pairs at 411 with the last value full width so the tabs
  stay near the fold.
- Passkey: the missing-key branch renders `VITE_CLIENT_KEY is not set`; Register Passkey is disabled
  without a key and Log In is disabled. The status badge, `register`, `login`, `sendGaslessCall`,
  `reset`, smart-account address, and UserOp hash surfaces are retained. Ready, error, and loading
  branches were source-diffed only; no credential harness exists.
- Webhooks: invalid URL, add, event toggle, test failure, test success, `lastTest`, remove, empty
  state, and `cg_webhooks_v2` persistence were exercised. The test POST to an external URL failed
  on CORS; the success path used a same-origin stubbed 200. The empty-state bug was fixed:
  `webhooks.map()` returns a truthy empty array, so the ledger now guards with
  `webhooks.length > 0`.
- Webhooks copy correction: removed the unbacked line
  `Failed deliveries are retried 3 times automatically.` Added a local-only rail notice:
  webhooks are stored in this browser, there is no server relay, and only the Test button sends a
  POST. The sample payload and all event names are unchanged.
- PipelineHook: reading, disabled, and active states are explicit; `Reading…` replaces the old false
  `Disabled` while `pipelineHook` is undefined. The invalid-address toast is still
  `Enter a valid address`. The `setPipelineHook` call, zero-address disable, regex, pending/mining/
  success/error branches, refetch, interface code, and best-effort notice are retained.
- Responsive: 1280×720 and 411×915, dark and light, for all four panels. At 411 the document,
  `.main-content`, and `.pg-root` scroll widths all equal 411. Console errors: none.
- Evidence: `/tmp/opencode/cg19-wave4/agent-dark-1280.png`,
  `agent-light-1280.png`, `agent-dark-411.png`, `agent-light-411b.png`,
  `agent-autoroute-dark-1280.png`, `agent-settings-dark-1280.png`,
  `agent-settings-final-light-1280.png`, `passkey-light-1280.png`, `passkey-dark-1280.png`, `passkey-dark-411.png`,
  `passkey-light-411.png`, `webhooks-dark-1280.png`, `webhooks-light-1280.png`,
  `webhooks-dark-411.png`, `webhooks-light-411.png`, `webhooks-empty-fixed-dark-411.png`,
  `webhooks-invalid-dark-1280.png`, `webhooks-added-dark-1280.png`, `webhooks-tested-local-dark-1280.png`,
  `pipeline-light-1280b.png`, `pipeline-dark-1280.png`, `pipeline-dark-411.png`,
  `pipeline-light-411-final.png`, `pipeline-invalid-light-1280.png`.
- Gates after Wave 4: `bun run check` exit 0; `bun run test` 392 pass / 4 skip / 0 fail;
  `bun run build` exit 0 (pre-existing chunk-size warning).
- Still unverified: signed Agent/PipelineHook writes; Passkey ready/gasless execution; external
  webhook delivery; screen-reader announcements.

## Wave 5 log

- Redesigned `MCP`, `API Docs`, and `Admin` on the shared kit. The diff is limited to
  `Mcp.tsx`, `ApiDocs.tsx`, `AdminPanel.tsx`, the optional `CodeSurface` copy props in
  `PanelUi.tsx`, `panel.css`, and this checklist; no landing, contract, or `api/` change.
- MCP: Tools, x402 Tester, Live Test, and Config render. All 6 tool names, descriptions, and
  parameter strings are visible. Install, Claude Desktop config, REST base, and remote SSE
  copy actions returned the exact strings; the Claude config copy keeps the compact JSON while
  the surface shows the indented form. The x402 defaults and the three-step `How it works`
  text remain. Live Providers and `Test: get_attestation (Provider #1)` render. The EIP-3009
  signing path is unchanged in source; it was not executed because the mock cannot sign.
- API Docs: 9 endpoints keep their exact methods, paths, and descriptions. GET/POST/Auth/x402
  badges remain text-visible. The contents rail sits left on desktop and after the document at
  411; the `MCP Server` link resolved to `#api-mcp`. Quick Integration, Embed Widget, and MCP
  JSON copy actions returned the exact examples. No new route was added.
- Admin: the owner gate and disconnected `Please connect your wallet.` branch remain. The page
  keeps `owner`, `payPerCall`, `pendingPayPerCall`, and `payPerCallChangeAt` reads; the
  `setPayPerCall`/Call, `proposePayPerCall`/Propose, and `executePayPerCall`/Apply paths;
  `Waiting...`, `Writing to chain...`, `Success!`, and error text; and the timelock notice.
  Six address rows copy exact addresses. A `bad` address produced `Invalid address`. The
  current PPC comparison is now case-insensitive, so the mock's checksummed address reports
  `Correct address` instead of a false `v7 address not set`.
- Admin copy correction: `ServiceRegistry v7 admin operations`, `v7 address not set`, and
  `PayPerCall v7.1 … ServiceRegistry v7`. No `v4` copy remains.
- Shared kit: `CodeSurface` accepts optional `copyValue` and `copyLabel`; existing callers and
  defaults are unchanged.
- Responsive: 1280×720 and 411×915, dark and light, for all three panels. At 411 the document,
  `.main-content`, and `.pg-root` scroll widths all equal 411. Console errors: none.
- Interaction evidence: `/tmp/opencode/cg19-wave5/interactions.json` records 4 MCP copies,
  3 API Docs copies, 6 Admin copies, the `#api-mcp` anchor, and the Admin validation error.
- Evidence: `/tmp/opencode/cg19-wave5/mcp-dark-1280.png`, `mcp-light-1280.png`,
  `mcp-dark-411.png`, `mcp-light-411.png`, `mcp-x402-dark-1280.png`,
  `mcp-test-dark-1280.png`, `mcp-config-dark-1280.png`, `apidocs-dark-1280.png`,
  `apidocs-light-1280.png`, `apidocs-dark-411.png`, `apidocs-light-411.png`,
  `admin-dark-1280.png`, `admin-light-1280.png`, `admin-dark-411.png`,
  `admin-light-411.png`, `admin-invalid-dark-1280.png`.
- Gates after Wave 5: `bun run check` exit 0; `bun run test` 392 pass / 4 skip / 0 fail;
  `bun run build` exit 0 (pre-existing chunk-size warning).
- Still unverified: signed Admin writes; MCP EIP-3009 signing and live API test; owner-only
  alert with a returned owner; screen-reader announcements.
- Phase status: Wave 5 is complete. Phase 9 remains `NOT COMPLETE` because row 13 (`balance`)
  is still `PARTIAL`; all Wave 5 rows are `PASS`.
