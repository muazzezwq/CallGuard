# Feature Parity Audit — CallGuard HTML → Vite

Audit date: 2026-10-04  
Source: `git show v1.1-pre-redesign:app/app/index.html` (21 385 lines)  
Target: `CallGuard/src/components/panels/` (29 panels)

---

## Summary

| Status | Count |
|---|---|
| EXISTS (fully working) | 34 |
| PARTIAL (UI present, logic incomplete) | 18 |
| MISSING (completely absent) | 11 |
| BROKEN (present but wrong/crash) | 3 |

**Priority 1 (blocking UX):** Agent deposit/withdraw/pause/autoRoute, Analytics real data, doRegisterV2 (ERC-8004), Lending pool stats, real-time event feed (subscribeToEvents), Futures browse/my tabs.

**Priority 2 (important):** doNanoCall session budget, x402 EIP-3009 standalone flow, subgraph Webhooks, Quality openDispute full bond flow, Subscriptions renew/cancel.

**Priority 3 (cosmetic/utility):** Band oracle USD price, gas estimator, onboarding wizard step persistence, `cg_mode` localStorage, `cgTheme` localStorage.

---

## Detailed Findings

### CallBuilder — `CallBuilder.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Standard call (approve + callService) | `doCall()` | `handleCall()` | **PARTIAL** — missing USDC allowance check & approve step before callService; just calls callService directly which will revert if no allowance |
| CCTP cross-chain call | `doCCTPCall()` | `handleCCTPCall()` | **EXISTS** |
| x402 EIP-3009 gasless | `doX402Call()` | Gas-free button calls `handleCall()` | **BROKEN** — button says "Gas-free / EIP-3009" but calls standard callService (needs approve) instead of the actual EIP-3009 `callServiceWithAuthorization` |
| Submit receipt EIP-712 | `doReceipt()` | `handleSubmitReceipt()` | **EXISTS** |
| Claim timeout | `doTimeout()` | `handleClaimTimeout()` | **EXISTS** |
| Batch call | inline loop | `handleBatch()` | **EXISTS** |
| Post-call notify provider webhook | `fetch('/api/notify-provider')` | Missing | **MISSING** |
| Auto-fill callId after call | `$("rcpCallId").value = callId` | `setCallIdInput(hash)` sets TX hash not callId | **PARTIAL** — sets TX hash, should parse CallStarted event log for callId |
| Risk badge (high risk / underfunded) | inline HTML | `RiskBadge` component | **EXISTS** |
| Confirm TX modal before call | `window.confirmTx()` | Missing | **MISSING** |

### Register — `Register.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Register provider (stake + register) | `doRegister()` | `handleRegister()` | **EXISTS** |
| Already-registered guard | `state.providerInfo.id` check | present | **EXISTS** |
| Balance check before stake | `regBal < stakeNum` | present | **EXISTS** |
| doRegisterV2 (ERC-8004 + NFT) | `doRegisterV2()` | Not found | **MISSING** |
| Deactivate provider | `doDeactivate()` | present | **EXISTS** |
| Unstake | `doUnstake()` | present | **EXISTS** |
| Fill defaults button | inline onclick | present | **EXISTS** |
| Live economics calculator | `updateCalculator()` | present | **EXISTS** |

### Agent — `Agent.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Connect/load agent wallet | `connectAgentWallet()` / `loadAgentPanel()` | addr input saves to sessionStorage | **PARTIAL** — reads balance/owner but NOT getStats() (balance, spentToday, remainingToday, totalCalls) |
| Deposit USDC | `showAgentDeposit()` | Missing | **MISSING** |
| Withdraw USDC | `showAgentWithdraw()` | Missing | **MISSING** |
| Pause / Unpause | `pauseAgentWallet()` | Missing | **MISSING** |
| Auto Route & Call | `doAgentAutoRoute()` | Missing | **MISSING** |
| Update daily limit | `updateAgentDailyLimit()` | Missing | **MISSING** |
| Update max per call | `updateAgentMaxPerCall()` | Missing | **MISSING** |
| Update whitelist | `updateAgentWhitelist()` | Missing | **MISSING** |
| Tab: setup / autoroute / settings / mcp | `switchAgentTab()` | 3 tabs (wallet/deploy/mcp) — autoroute/settings missing | **PARTIAL** |
| localStorage `cg_agent_wallet` | present | sessionStorage only | **PARTIAL** |

### Analytics — `Analytics.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Real subgraph data | `loadAnalytics()` | Static dummy numbers | **MISSING** |
| Provider bar chart | inline HTML bars | Missing | **MISSING** |
| Recent calls list | inline HTML list | Missing | **MISSING** |
| Honor rate calculation | present | Missing | **MISSING** |
| Band oracle USDC/USD | `fetchUsdcUsdRate()` | Missing | **MISSING** |

### Lending — `Lending.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Borrow stake | `doLendBorrow()` | `borrow()` | **EXISTS** |
| Deposit to pool | `doLendDeposit()` | `deposit()` | **EXISTS** |
| Withdraw from pool | `doLendWithdraw()` | Missing | **PARTIAL** — no withdraw tab/button |
| Repay loan | `repay()` | `repay()` | **EXISTS** |
| Pool stats (TVL, utilization, APY) | `loadLending()` / getPoolStats() | Missing | **MISSING** |
| Loan list with liquidate | `loadLending()` | Missing | **MISSING** |
| USDC approve before deposit/borrow | present in HTML | Missing in Vite | **PARTIAL** |

### Futures — `Futures.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Mint capacity batch | `doMintCapacity()` | `mintBatch()` | **EXISTS** |
| Redeem token | present | `redeemToken()` | **EXISTS** |
| Browse batches tab | `showFuturesTab('browse')` | No browse tab | **MISSING** |
| My slots tab | `showFuturesTab('my')` | No my-slots tab | **MISSING** |
| Load futures data | `loadFutures()` | No data loading | **MISSING** |

### Attestation — `Attestation.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Check verdict (peek call) | `attPeekCall()` | `peek()` via /api/attestation | **EXISTS** |
| Check score (peek score) | `attPeekScore()` | `peek()` via /api/attestation | **EXISTS** |
| Issue attestation | `attIssue()` | `issueAttestation()` | **EXISTS** |
| Fetch attestation | `attLookup()` | present | **EXISTS** |
| Issue type changed (attTypeChanged) | `onchange` | present | **EXISTS** |

### Quality — `Quality.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Open quality dispute (0.5 USDC bond) | `doOpenQualityDispute()` | present | **EXISTS** |
| Load disputes | `loadQualityDisputes()` | present | **EXISTS** |
| Vote on dispute | present | present | **EXISTS** |

### Requests — `Requests.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Subgraph data load | `loadMyCalls()` | useSubgraph hook | **EXISTS** |
| Claim timeout | `doTimeout()` | `handleClaimTimeout()` | **EXISTS** |
| Export CSV/JSON | present | present | **EXISTS** |
| SLA countdown timer | present in calls render | Missing in Vite | **MISSING** |

### Overview — live event feed
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Real-time feed (CallStarted, ReceiptSubmitted, CallSlashed, ProviderRegistered) | `subscribeToEvents()` + `addFeed()` | No event subscription | **MISSING** |
| Session budget tracking | `checkBudget()` / `recordSpend()` | No budget tracking | **MISSING** |
| doRouter (auto-route) | `doRouter()` | `runAutoRouter()` | **EXISTS** |
| doMultiCall | `doMultiCall()` | `runMultiCall()` | **EXISTS** |

### Nano — `Nano.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Nano balance | `fetchNanoBalance()` | present | **EXISTS** |
| Nano call | `doNanoCall()` | present | **EXISTS** |
| Session budget (in-memory) | `checkBudget()` / `recordSpend()` | Missing | **PARTIAL** |

### Webhooks — `Webhooks.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Save webhook URL to localStorage | `localStorage.setItem("webhookUrl")` | Missing | **MISSING** |
| Test webhook | `fetch(webhookUrl)` | Missing | **MISSING** |
| Remove webhook | `localStorage.removeItem` | Missing | **MISSING** |

### Settings — `SettingsPanel.tsx`
| Feature | HTML fn | Vite | Status |
|---|---|---|---|
| Theme toggle (dark/light) | `localStorage.setItem("cgTheme")` | useAppStore | **EXISTS** |
| Mode toggle (simple/pro) | `localStorage.setItem('cg_mode')` | useAppStore | **PARTIAL** — not persisted to localStorage |
| RPC override | present | Missing | **MISSING** |

---

## Files to Change

Priority 1:
- `src/components/panels/Agent.tsx` — add deposit/withdraw/pause/autoRoute/limits/whitelist
- `src/components/panels/Analytics.tsx` — replace static with real subgraph data  
- `src/components/panels/Lending.tsx` — add pool stats, withdraw tab, approve step
- `src/components/panels/Futures.tsx` — add browse + my-slots tabs with data
- `src/components/panels/Webhooks.tsx` — full localStorage + test + remove
- `src/components/panels/Register.tsx` — add doRegisterV2 (ERC-8004) tab
- `src/components/panels/Overview.tsx` — add subscribeToEvents real-time feed (viem watchContractEvent)
- `src/components/panels/CallBuilder.tsx` — fix x402 button to use callServiceWithAuthorization

Priority 2:
- `src/components/panels/Nano.tsx` — add session budget
- `src/components/panels/Requests.tsx` — add SLA countdown per row
- `src/store/useAppStore.ts` — persist mode/theme to localStorage
