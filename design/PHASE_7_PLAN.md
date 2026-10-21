# Phase 7 plan — call history, activity, notifications

Prompt delivered in chat on 2026-10-20. `design/PHASE_7.md` does not exist; requirements are
restated here instead of inventing a prompt file.

## Verified starting point

- `History.tsx` (panel id `history`, title "Transactions") reads the Goldsky `calls` entity for
  the connected wallet, shows indexer freshness (`_meta`), wrong-network and RPC-error states,
  status filters, a detail pane with an SLA canvas, and CSV/JSON exports.
- `Notifications.tsx` (panel id `notifications`) watches `CallStarted`, `ReceiptSubmitted` and
  `CallSlashed` on `PayPerCall` and stores the last 50 entries in `localStorage`.
- `Requests.tsx` (panel id `requests`) reads the same `calls` entity with a 15 s poll, offers
  status tabs, a timeout-claim form and CSV/JSON export.
- `Receipts.tsx` (panel id `receipts`) reads `COMPLETED`/`SLASHED` calls and renders them as
  receipt cards.
- `Overview.tsx` has a session-only live event strip from the same three contract events.
- Subgraph `Call` entity fields: `id providerId caller amount requestHash responseHash status
  refunded slashed createdAt completedAt`. **There is no transaction hash field**, so call rows
  cannot link to an explorer transaction; the limitation is shown, not invented.

## Defects found before editing

1. History export writes `"0"` when `amount` is missing (fabricated value) and does not escape
   inner quotes in CSV cells.
2. History compares `refunded`/`slashed` with `Number(...) > 0` although both are 6-decimal
   `BigInt` fields; the "Refunded" filter matches a status the mapping never writes.
3. History does not clamp `page` when a filter shrinks the result, so the list can read empty
   while records exist. It does not dedupe records by id or define a deterministic order.
4. History detail has no transaction-hash row and therefore no explorer link, without saying so.
5. Notifications ids are random, so a re-subscription, reconnect or repeated log delivery creates
   duplicate entries. Entries are stored globally, so records from one wallet appear under
   another. Amounts use `Number(x) / 1e6`; the "Dispute" filter has no event source; the
   "Listening…" banner stays green when the event stream errors; no `chainId` is pinned.
6. Requests formats a missing `amount` as `0`, formats a missing `createdAt` as 1970, exports
   `formatUnits(BigInt(amount ?? 0))`, joins CSV without escaping, invents a 120 s SLA deadline
   and the claim "Claimable now", and prints "✅ Timeout claimed — provider slashed" from the
   receipt status without decoding `CallSlashed`.
7. Receipts lists `SLASHED` calls as "receipts" although no receipt exists for them, prints
   `0 USDC` when `amount` is missing, and renders a data-source failure as an empty list.
8. Overview's live strip uses `Number(x) / 1e6`, has no duplicate guard and does not pin `chainId`.

## Implemented scope

- New `src/lib/activity.ts`: exact USDC formatting (no zero fallback), positive-amount check,
  call dedupe + deterministic ordering, page clamp, CSV escaping, notification identity, storage
  key per account, notification sanitising/merging.
- `History.tsx`: use the module; clamp page; exact refund/slash flags; remove the unreachable
  "Refunded" filter; export no fabricated amount and escaped cells; state that the transaction
  hash is not indexed; empty/filtered copy distinguishes indexer delay.
- `Notifications.tsx`: per-account `cg_notifs_v3:<address>` storage, dedupe by
  `txHash:logIndex:event`, sanitising on load, `chainId: arcTestnet.id`, event-stream error state,
  remove the unsourced Dispute filter, exact amounts, explorer links from real hashes,
  `role="status"` for stream state, accessible filter buttons (`aria-pressed`).
- `Requests.tsx`: normalise/dedupe, no fabricated amount or timestamp, escaped export, remove the
  invented deadline/countdown, honest claim copy and `CONFIG.explorerTx`.
- `Receipts.tsx`: only `COMPLETED` (a receipt exists), missing amount says unavailable, read error
  is an error state.
- `Overview.tsx`: pinned chain, dedupe by log identity, exact USDC amounts.
- Tests: `tests/activity.test.ts` covering dedupe/order/clamp/CSV/absent values/notification keys.
- Docs: this plan, `design/phase-checklists/PHASE_7_CHECKLIST.md`, `docs/progress.md`,
  `docs/decisions.md`, `docs/audit.md`, `docs/panel-inventory.md`.

## Out of scope (recorded, not changed)

- Adding `transactionHash` to the subgraph requires a schema/mapping change and a Goldsky deploy;
  not authorised here. Until then no history row can link to a transaction.
- Contract reads per provider for `maxResponseTime` in My Requests would replace the removed
  countdown; the removal is the honest fix in this phase.
- No commits, pushes, deployments, new dependencies, contract or address changes.
