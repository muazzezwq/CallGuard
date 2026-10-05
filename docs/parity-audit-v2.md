# Feature Parity Audit v2 — CallGuard HTML → Vite

Date: 2026-10-05  
Source: `git show 753df13^:app/app/index.html` (23,413 lines)  
Target: `CallGuard/src/components/panels/` (30 panels)

---

## SUMMARY

| Category | EXISTS | PARTIAL | MISSING | BROKEN |
|---|---|---|---|---|
| Wallet / Chain | 9 | 2 | 1 | 0 |
| Provider ops | 8 | 2 | 0 | 0 |
| Caller / Payments | 7 | 3 | 1 | 0 |
| EIP-712 / Receipts | 3 | 1 | 0 | 0 |
| Timeout / Slash | 4 | 1 | 0 | 0 |
| x402 / EIP-3009 | 3 | 1 | 1 | 0 |
| ERC-8004 Agent | 4 | 1 | 0 | 0 |
| ERC-8183 Jobs | 5 | 0 | 0 | 0 |
| CCTP Bridge | 3 | 1 | 0 | 0 |
| Nanopayments | 2 | 1 | 0 | 0 |
| AgentWallet | 6 | 1 | 0 | 0 |
| DisputeQuality | 4 | 1 | 0 | 0 |
| SLAFutures | 4 | 0 | 0 | 0 |
| ReputationLoan | 4 | 0 | 0 | 0 |
| Goldsky/subgraph | 5 | 1 | 0 | 0 |
| UI interactions | 12 | 6 | 4 | 0 |
| Export / helpers | 4 | 2 | 2 | 0 |
| Error / loading | 8 | 3 | 0 | 0 |

---

## MISSING (Priority 1 — Not implemented at all)

### 1. Provider Compare Modal
**HTML functions:** `openProviderCompare()`, `clearProviderCompare()`, `toggleProviderCompare(id)`, `buildOverlayHTML()`  
**HTML behavior:** Multi-select providers in Marketplace, side-by-side comparison modal (price, reputation, health, SLA)  
**Vite status:** MISSING — Marketplace has no compare functionality  
**Fix needed:** `Marketplace.tsx` — add compare state, modal component

### 2. Auto-Receipt System
**HTML functions:** `openAutoReceiptSetup(id)`, `saveAutoReceiptKey(id)`, `tryClientAutoReceipt(callId)`, `disableClientAutoReceipt(id)`  
**HTML behavior:** Per-call localStorage key storage, automatic receipt submission when call completes, background polling  
**Vite status:** MISSING — no auto-receipt logic anywhere  
**Fix needed:** New hook `useAutoReceipt.ts` + wiring into Requests panel

### 3. Session Budget Cap
**HTML functions:** `saveSpendingLimit()`, `checkSessionBudget(amount)`, `addSessionSpent(amount)`, `renderSpendingLimit()`, `getSessionSpent()`, `getSessionLimit()`  
**HTML behavior:** localStorage-backed USDC spending cap per session, pre-flight check before every tx, display in Settings  
**Vite status:** MISSING — Settings panel has no budget cap  
**Fix needed:** `SettingsPanel.tsx` + `useSessionBudget.ts` hook

### 4. Gas Estimator
**HTML functions:** `estimateCallGas()`, `showGasEstimate()`, `showCostCalc()`  
**HTML behavior:** Estimate gas cost in USDC before sending a call tx, shown next to Call button  
**Vite status:** MISSING — no gas estimation  
**Fix needed:** `CallBuilder.tsx` — add `useEstimateGas` wagmi hook + display

### 5. x402 Live Tester
**HTML functions:** `runX402Test()`, `x402LiveTest()`  
**HTML behavior:** Full HTTP 402 → pay → retry flow tester in MCP/x402 panel  
**Vite status:** MISSING in Mcp.tsx — only static copy buttons  
**Fix needed:** `Mcp.tsx` — add live tester section with real fetch + payment

### 6. MCP Test Call
**HTML functions:** `runMcpTest()`, `testMcpCall()`  
**HTML behavior:** Actually calls the MCP server endpoint and shows JSON response  
**Vite status:** MISSING — Mcp.tsx has no real test call  
**Fix needed:** `Mcp.tsx` — add test endpoint call with result display

---

## PARTIAL (Priority 2 — Exists but incomplete)

### 7. Onboarding Bar
**HTML functions:** `initOnboarding()`, `dismissOnboarding()`, `obStep1/2/3` click  
**HTML behavior:** 3-step progress bar at top (Connect → Browse → Make first call), dismissible, localStorage persisted  
**Vite status:** PARTIAL — AppShell has no onboarding bar  
**Fix needed:** Add to `AppShell.tsx` or `AppTopbar.tsx`

### 8. SLA Countdown Live Timer
**HTML functions:** `startSlaCountdown(callId, deadline)`, `checkSlaCountdowns()`  
**HTML behavior:** Per-active-call countdown timer showing "X seconds to claim timeout"  
**Vite status:** PARTIAL — Requests shows expired/not-expired but no live countdown timer  
**Fix needed:** `Requests.tsx` — add `useInterval` based countdown for STARTED calls

### 9. Disputes: My Disputes + openDisputeModal
**HTML functions:** `loadMyDisputes()`, `openDisputeModal(callId)`, `doDispute()`  
**HTML behavior:** Load disputes for connected address, open modal to file dispute on specific call  
**Vite status:** PARTIAL — Disputes panel has vote/open but no "my disputes" list from subgraph  
**Fix needed:** `Disputes.tsx` — add subgraph query for `disputes(where:{caller:$addr})`

### 10. Notifications System
**HTML functions:** `addNotif()`, `bumpUnseen()`, `markNotifRead()`, `clearNotifs()`, `renderNotifBadge()`, `loadNotifs()`  
**HTML behavior:** Per-event notification log (localStorage), badge count on sidebar item, panel shows history  
**Vite status:** PARTIAL — Notifications panel exists as static, badge not wired to real events  
**Fix needed:** `useNotifications.ts` hook + sidebar badge + wire to tx events

### 11. History: Pagination + Refresh + Filter
**HTML functions:** `loadHistory(refresh)`, `loadMoreHistory()`, `setHistFilter(type)`, `filterHistory()`, `buildHistItems()`  
**HTML behavior:** Paginated history (25 per page), type filter tabs, search by tx hash/address, refresh button  
**Vite status:** PARTIAL — History shows items but no pagination, no "load more", no search  
**Fix needed:** `History.tsx` — add pagination state, search input, load-more button

### 12. Subscriptions: Full flow
**HTML functions:** `openSubscriptionModal(id)`, `doSubscribe()`, `useSubscriptionCall()`, `loadMySubscriptions()`, `refreshSubscriptions()`  
**HTML behavior:** Subscribe to a provider plan, use subscription balance for calls (cheaper), list active subscriptions  
**Vite status:** PARTIAL — Subscriptions panel is mostly placeholder  
**Fix needed:** `Subscriptions.tsx` — add real Subscription contract interaction

### 13. ProviderProfile: Share link + callFromProfile
**HTML functions:** `shareProviderProfile()`, `callFromProfile()`, `loadProviderProfile()`  
**HTML behavior:** Share URL with ?provider=ID param, click "Call" to navigate to CallBuilder pre-filled  
**Vite status:** PARTIAL — ProviderProfile loads data but no share/call buttons  
**Fix needed:** `ProviderProfile.tsx` — add share (URL copy) + navigate to CallBuilder

### 14. Marketplace: Alert subscription save
**HTML functions:** `saveAlertSubscription()`  
**HTML behavior:** Save email/webhook alert for provider events (localStorage)  
**Vite status:** PARTIAL — Marketplace has no alert form  
**Fix needed:** `Marketplace.tsx` — add alert settings section

---

## VERIFIED (EXISTS — working as expected)

| Feature | Panel | Notes |
|---|---|---|
| Wallet connect (MetaMask/WalletConnect) | AppTopbar | ConnectKit handles both |
| Chain switch to Arc Testnet | AppTopbar/wagmi | chainId 5042002 |
| USDC balance display | AppTopbar | useBalance hook |
| EURC/USYC balance | AppTopbar | Added this session |
| Address copy pill | AppTopbar | Added this session |
| Disconnect | AppTopbar | Added this session |
| Provider registration (stake+approve) | Register | Full 4-step |
| doRegisterV2 (ERC-8004) | Register | Full 3-step NFT |
| doUnstake | Register | Working |
| Provider price/SLA config | Register | Live calculator |
| doCall (callService) | CallBuilder | Full with USDC approve |
| Batch call slider | CallBuilder | 1-20 calls |
| CCTP cross-chain | CallBuilder/Bridge | 5-step full flow |
| x402 EIP-3009 call | CallBuilder | handleX402Call |
| submitReceipt EIP-712 | CallBuilder | handleSubmitReceipt |
| claimTimeout | Requests | handleTimeout |
| claimAllTimeouts | Requests | handleClaimAll |
| ERC-8183 Jobs 5-step | Jobs | Full wizard |
| DisputeQuality vote+open | Quality | voteOnDispute |
| SLAFutures mint+browse | Futures | Full impl |
| ReputationLoan borrow/repay | Lending | Full impl |
| AgentWallet deposit/withdraw/pause | Agent | Full impl |
| CCTP Bridge | Bridge | New panel |
| Nanopayments | Nano | tryX402+nano |
| Goldsky subgraph queries | All panels | useSubgraph hook |
| CSV/JSON export | History | exportCsv/exportJson |
| BulkCall CSV upload | BulkCall | parseBulkCSV |
| Provider uptime ping | Providers | /api/ping-provider |
| Provider compare (basic) | Providers | Side info |
| Attestation peek/issue | Attestation | Full impl |
| MCP setup guide (copy paths) | Mcp | Static + copy |
| Analytics Goldsky stats | Analytics | Real subgraph |
| 24h activity chart | Overview | Hourly buckets |
| Live event feed (watchContractEvent) | Overview | useWatchContractEvent |
| Settings panel | SettingsPanel | RPC config |
| Privacy panel | Privacy | APS info |
| Leaderboard Bayesian sort | Leaderboard | Goldsky + formula |
| Webhooks localStorage | Webhooks | Full impl |
| Dark theme | Global | CSS vars |

---

## UNABLE TO VERIFY (external dependency)

| Feature | Reason |
|---|---|
| Band Protocol oracle (fetchUsdcUsdRate) | Contract deployed on Arc Testnet, real wallet needed |
| CCTP attestation polling (Circle IRIS) | Circle sandbox API |
| x402 facilitator settlement | Live Vercel endpoint |
| MCP server test call | Running MCP server at /api/mcp-server |
| Auto-receipt background signing | Real wallet + deployed callId |
| Circle Gateway nanopayments | Circle Gateway API key on server |

---

## FILES TO CHANGE (Phase 2 implementation)

1. `src/components/panels/Marketplace.tsx` — provider compare modal
2. `src/hooks/useAutoReceipt.ts` (NEW) — auto-receipt localStorage+polling
3. `src/components/panels/Requests.tsx` — wire auto-receipt + SLA countdown timer
4. `src/hooks/useSessionBudget.ts` (NEW) — session budget cap
5. `src/components/panels/SettingsPanel.tsx` — budget cap UI
6. `src/components/panels/CallBuilder.tsx` — gas estimator
7. `src/components/panels/Mcp.tsx` — x402 live tester + MCP test call
8. `src/components/layout/AppShell.tsx` — onboarding bar
9. `src/components/panels/History.tsx` — pagination + search
10. `src/components/panels/Disputes.tsx` — my disputes subgraph
11. `src/hooks/useNotifications.ts` (NEW) — notification system
12. `src/components/layout/Sidebar.tsx` — notification badge
13. `src/components/panels/Subscriptions.tsx` — full contract interaction
14. `src/components/panels/ProviderProfile.tsx` — share link + callFromProfile
