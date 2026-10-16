# PART 3 OF 5

Save this text as `design/SPEC_3_TEMPLATES.md`. Do NOT start any work. Parts 1-5 are one task.

## PANEL TEMPLATES for panels that have no reference screen

Reuse the shared components built from the Part 2 screens (Card, Stat, Chip, Button, Stepper, Table, Form, Tabs). Do NOT invent new visual components, colors, or fonts.

- T1 STAT (Overview layout: stat cards with sparkline + chart card): Overview, Analytics, Unified Balance
- T2 LIST (Marketplace layout: search + chip filters + card list): Marketplace, Providers, Jobs, Subscriptions
- T3 TABLE (card with table, search, chip filters, status chips, mono hashes, pagination): Transactions, Receipts, Payments, My Requests, Disputes, Quality Disputes, Rankings, Logs, Admin Panel
- T4 FORM (Call Builder layout: tabs, labeled dark inputs, full-width green button): Call Builder, Register, Bulk Call, Nanopayments, Bridge, SLA Bridge, Agent Wallet, Passkey Wallet, Settings, Privacy
- T5 DETAIL (Transaction Detail layout: back arrow, status chip, stepper, key-value card, outline button): Provider details, Verify Receipt (result), Receipt/Dispute details
- T6 DOCS (left table of contents + content, mono code blocks, copy button): API / MCP, API Docs
- T7 HYBRID (T3 table/list left, T4 action card right): RepFi Lending, SLA Futures, Webhooks, Pipeline Hook

All 34 panels: Overview, Marketplace, Call Builder, Transactions, Receipts, Providers, Rankings, Provider details, API / MCP, API Docs, Webhooks, Pipeline Hook, Nanopayments, Bridge, Unified Balance, Agent Wallet, Passkey Wallet, My Requests, Payments, Disputes, Quality Disputes, RepFi Lending, SLA Futures, SLA Bridge, Subscriptions, Jobs, Bulk Call, Verify Receipt, Register, Privacy, Admin Panel, Analytics, Logs, Settings. (x402 is an alias of calls, not a separate panel.)

## RULES

- Every panel keeps all its existing features, fields, buttons, copy, and data flow. Only layout/visual treatment changes.
- Same empty / loading (skeleton) / error states on every panel. Status chips: Success green, Pending blue, Failed/Slashed red.
- Prefer fixing shared primitives (src/components/ui, src/ui, src/index.css) over per-panel overrides: it restyles many panels at once.
- If a panel does not fit a template, keep its layout, apply only tokens/cards/chips/buttons, and log it in docs/decisions.md.

END OF PART 3.
