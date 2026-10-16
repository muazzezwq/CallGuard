# Panel inventory

Every panel/page found in the repo. Status is `todo` for all rows (this is a planning document).

**Route column:** in-app panels are **not** URL routes. They are switched by the zustand store's `activePanel` (`PanelId`) and rendered from a lazy map in `src/components/layout/AppShell.tsx`. The value below is that `activePanel` id. The whole app lives under the single `/app` route. `x402` is an alias of `calls` (`src/store/useAppStore.ts`), not a separate panel.

**Data source column:** `useOnchain` = wagmi/viem contract reads; `useSubgraph`/`lib/subgraph.ts` = Goldsky subgraph; `fetch`/`/api` = facilitator + Vercel functions; `lib/config.ts` = addresses/ABIs used directly; `usePasskeyWallet` = Circle modular wallets; `useBudgetCap` = local cap hook.

## Panels (34)

| # | panel | route (activePanel) | file | data source | status |
|---|---|---|---|---|---|
| 1 | Overview | `overview` | `src/components/panels/Overview.tsx` | useSubgraph + fetch + lib/config | done |
| 2 | Marketplace | `marketplace` | `src/components/panels/Marketplace.tsx` | useSubgraph + lib/subgraph | done |
| 3 | Call Builder | `calls` (`x402` alias) | `src/components/panels/CallBuilder.tsx` | useSubgraph + useBudgetCap + lib/cctp + fetch `/api` | done |
| 4 | Transactions | `history` | `src/components/panels/History.tsx` | useSubgraph + fetch | done |
| 5 | Receipts | `receipts` | `src/components/panels/Receipts.tsx` | useSubgraph + fetch | todo |
| 6 | Providers | `providers` | `src/components/panels/Providers.tsx` | fetch `/api` + lib/config | done |
| 7 | Rankings | `leaderboard` | `src/components/panels/Leaderboard.tsx` | useSubgraph | todo |
| 8 | Provider details | `provprofile` | `src/components/panels/ProviderProfile.tsx` | lib/config | todo |
| 9 | API / MCP | `mcp` | `src/components/panels/Mcp.tsx` | useSubgraph + fetch `/api` + lib/config | todo |
| 10 | API Docs | `apidocs` | `src/components/panels/ApiDocs.tsx` | fetch `/api` | todo |
| 11 | Webhooks | `webhooks` | `src/components/panels/Webhooks.tsx` | fetch | todo |
| 12 | Pipeline Hook | `pipelinehook` | `src/components/panels/PipelineHook.tsx` | fetch + lib/config | todo |
| 13 | Nanopayments | `nano` | `src/components/panels/Nano.tsx` | fetch `/api` + lib/config | todo |
| 14 | Bridge | `bridge` | `src/components/panels/Bridge.tsx` | fetch `/api` + lib/config | todo |
| 15 | Unified Balance | `balance` | `src/components/UnifiedBalance.tsx` | fetch `/api` (unified-balance) | done |
| 16 | Agent Wallet | `agent` | `src/components/panels/Agent.tsx` | useSubgraph + fetch + lib/config | todo |
| 17 | Passkey Wallet | `passkey` | `src/components/PasskeyWallet.tsx` | usePasskeyWallet + lib/config | todo |
| 18 | My Requests | `requests` | `src/components/panels/Requests.tsx` | useSubgraph + fetch + lib/config | todo |
| 19 | Payments | `payments` | `src/components/panels/Payments.tsx` | useSubgraph + lib/config | todo |
| 20 | Disputes | `disputes` | `src/components/panels/Disputes.tsx` | useSubgraph + lib/config | todo |
| 21 | Quality Disputes | `quality` | `src/components/panels/Quality.tsx` | lib/config | todo |
| 22 | RepFi Lending | `lending` | `src/components/panels/Lending.tsx` | lib/config | todo |
| 23 | SLA Futures | `futures` | `src/components/panels/Futures.tsx` | lib/config | todo |
| 24 | SLA Bridge | `attestation` | `src/components/panels/Attestation.tsx` | fetch `/api` + lib/config | todo |
| 25 | Subscriptions | `subscriptions` | `src/components/panels/Subscriptions.tsx` | useSubgraph | done |
| 26 | Jobs | `jobs` | `src/components/panels/Jobs.tsx` | lib/config | done |
| 27 | Bulk Call | `bulkcall` | `src/components/panels/BulkCall.tsx` | lib/config | todo |
| 28 | Verify Receipt | `verify` | `src/components/panels/Verify.tsx` | fetch `/api` + lib/config | todo |
| 29 | Register | `register` | `src/components/panels/Register.tsx` | lib/config | todo |
| 30 | Privacy | `privacy` | `src/components/panels/Privacy.tsx` | static / local | todo |
| 31 | Admin Panel | `admin` | `src/components/panels/AdminPanel.tsx` | lib/config | todo |
| 32 | Analytics | `analytics` | `src/components/panels/Analytics.tsx` | fetch + lib/config | done |
| 33 | Logs | `notifications` | `src/components/panels/Notifications.tsx` | lib/config | todo |
| 34 | Settings | `settings` | `src/components/panels/SettingsPanel.tsx` | lib/config + store | todo |

> Rows marked `lib/config` only also use wagmi (`useOnchain`) indirectly through shared UI/child components; the direct data source per file is what is listed.

## Marketing pages

Public pages rendered by `MarketingLayout` under URL routes (real router routes, unlike the in-app panels).

| panel | route | file | status |
|---|---|---|---|
| Landing | `/` | `src/marketing/Landing.tsx` | todo |
| How It Works | `/how-it-works` | `src/marketing/HowItWorks.tsx` | todo |
| Docs | `/docs` | `src/marketing/Docs.tsx` | todo |
| Providers | `/providers` | `src/marketing/Providers.tsx` | todo |
| Security | `/security` | `src/marketing/Security.tsx` | todo |
| About | `/about` | `src/marketing/About.tsx` | todo |

## Notes

- **All 34 expected panels were found.**
- **`x402`** (`src/store/useAppStore.ts`) is an alias of `calls` (Call Builder) via `normalizePanel`, not a 35th panel.
- **Extra pages not on the original list:** the six Marketing pages above. No other in-app panel was found beyond the 34.
- Panel label differences: `history` renders as "Transactions", `notifications` as "Logs", `leaderboard` as "Rankings"/"Reputation", `quality` as "Quality Disputes", `attestation` as "SLA Bridge", `admin` as "Admin Panel", `register` as "Register"/"Become a Provider", `verify` as "Verify Receipt".
