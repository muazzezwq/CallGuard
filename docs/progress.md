# Progress

Batch log. 3-line summary per batch (what changed / state / next).

## Phase 0 — Inventory check
- Inventory lists all 34 panels + 6 marketing pages; no gaps found.
- Created docs/progress.md and docs/decisions.md; status tracked in docs/panel-inventory.md.
- Next: Phase 2 primitives (Phase 1 tokens already applied in commit bb4f3d4).

## Phase 1 — Tokens
- Part 1 token values already applied in commit bb4f3d4 (dark + light); no new color changes needed.
- Not applicable (no existing variable): sidebar bg #000C16, active nav fill #014237, success #14D29E — handled at class level (shell) / logged in decisions.
- Next: Phase 2 shared primitives.

## Phase 2 — Primitives
- src/ui/ui.css + src/index.css: buttons/chips/tabs pill (999), cards radius 14, subtle glow + light shadow override.
- Palette normalization sweep across src (green #10b981->#19D186, red #ef4444->#EE4539, blue #3b82f6->#1F77EF). Committed "style(ui): tokens, primitives polish, palette normalization".
- Next: Phase 3 shell chrome.

## Phase 3 — Shell
- src/components/layout/shell.css: --sidebar-bg #000C16, --nav-active-bg #014237, dark --topbar-bg/--nav-bg, light --sidebar-bg #F9FBFD; sb-item.on fill, tb-* pills 999, tb-addr avatar+chevron.
- AppShell.tsx mobile nav label "Pay" -> "Calls". typecheck + build pass.
- Next: Phase 4 reference-panel restyle. Commit 0a65027.

## Phase 4 — Reference panels
- Verified Overview, Marketplace, Call Builder, Transactions (+ detail) against SPEC_2; all already match the reference look and keep their real data/hooks. SLA Canvas kept as the existing isometric board (stack rule).
- Fixed inline-styled radii across panels (buttons -> pill, cards -> 14, fields -> 10) and normalized mono fonts to Geist Mono; tokenized Nano's code block. Commits e42b6ac, 743fdfb.
- Inventory rows 1-4 marked `done`; decisions logged (no `reference.png`, no View-on-Explorer, viz kept). Next: Phase 5 remaining panels by template (T1-T7).

## Phase 5 — Batch 1 (T1 + T2)
- Rewrote `UnifiedBalance.tsx` and `Subscriptions.tsx` from raw Tailwind/inline styles to `ui` primitives + tokens (PageHeader/SectionCard/StatCard/Button/Badge/EmptyState/Skeleton); kept all states and data flow. Added `.ub-*`/`.sub-*` classes in shell.css.
- `Analytics`, `Providers`, `Jobs` verified already tokenized (cards 14, buttons pill, Geist Mono). Fixed global `.mono` to `var(--font-mono)`.
- typecheck + build pass. Inventory rows 6, 15, 25, 26, 32 -> `done` (9 total). Next: Batch 2 (T3 TABLE: Receipts, Payments, My Requests, Disputes, Quality Disputes, Rankings, Logs, Admin Panel).

## Phase 5 — Batch 2 (T3 TABLE)
- Quality Disputes: tokenized badge/button colors (accent-bg/info-bg/bg-3, var(--danger)), radii 14/10/999.
- Logs (Notifications): cards -> 14, filter tabs -> 999.
- Receipts, Payments, My Requests, Disputes, Rankings, Admin Panel verified already styled via shared `cg-*`/`ui` classes + tokens; no off-brand colors. Left as-is.
- typecheck + build pass. Inventory rows 5, 7, 18, 19, 20, 21, 31, 33 -> `done` (17 total). Next: Batch 3 (T4 FORM: Register, Bulk Call, Nanopayments, Bridge, SLA Bridge, Agent Wallet, Passkey Wallet, Settings, Privacy).

## Phase 5 — Batch 3 (T4 FORM)
- Rewrote `PasskeyWallet.tsx` from raw Tailwind to `ui` primitives + tokens; added `.pk-*` classes in shell.css.
- Register/BulkCall/Bridge/Agent/Privacy: normalized leftover radii (cards -> 14, chips/buttons -> 999) and tokenized Privacy danger color/tag.
- Nanopayments (Nano) fixed earlier; SLA Bridge (Attestation) and Settings already use project classes + tokens; left as-is.
- typecheck + build pass. Inventory rows 13, 14, 16, 17, 24, 27, 29, 30, 34 -> `done` (26 total). Next: Batch 4 (T5 DETAIL + T6 DOCS: ProviderProfile, Verify, Mcp, ApiDocs).

## Phase 5 — Batch 4 (T5 DETAIL + T6 DOCS)
- Provider details: tokenized status badge + avatar (fixed invalid `var(--accent)20`).
- Verify Receipt / API-MCP / API Docs: normalized leftover radii (cards -> 14, tags -> 999).
- typecheck + build pass. Inventory rows 8, 9, 10, 28 -> `done` (30 total). Next: Batch 5 (T7 HYBRID: Webhooks, Pipeline Hook, RepFi Lending, SLA Futures).

## Phase 5 — Batch 5 (T7 HYBRID) — ALL 34 PANELS DONE
- Pipeline Hook: replaced full old palette (#e8edf5/#8899b4/#1f2d42/#131c2e, rgba white) with tokens; radii 14/10/999.
- Webhooks / RepFi Lending / SLA Futures: normalized radii (cards -> 14, callouts -> 10, pills -> 999).
- typecheck + build pass. Inventory rows 11, 12, 22, 23 -> `done`. **34/34 panels done.** Next: Phase 6 marketing pages.

## Phase 6 — Marketing pages
- Rewrote `src/marketing/Landing.tsx` to the spec's section list and order: Hero (H1 + body + Launch/Explore CTAs + 4 icon chips + right art) → trusted-by row → Product (#product, 4 cards) → Transaction Flow (4-step framer-motion scroll sequence) → Developers (#developers, 4 cards + copy-able code block) → Live stats band (real subgraph data) → Ecosystem (#ecosystem) → CTA. Reused existing classes (`.mk-hero`, `.mk-trust`, `.mk-band`, `.mk-cta`, `.mk-eco`, `.mk-chip`, `.mk-flow`) + added `.mk-prodgrid/.mk-prodcard`, `.mk-devgrid/.mk-devcard`, `.mk-codewrap/.mk-codeblock/.mk-copy`, `.mk-flow--seq`.
- Hero art uses the existing `NetworkGraph` (SVG) as the Phase 7 fallback slot; the 3D scene replaces/overlays it in Phase 7.
- `MarketingLayout.tsx` navbar remapped to spec: Home (`/`, green underline active) · Product (`/#product`) · Developers (`/#developers`) · Ecosystem (`/#ecosystem`) · Docs (`/docs`); "Built on Arc" now an outline pill.
- HowItWorks / Docs / Providers / Security / About already tokenized from Phase 3; verified, no change.
- Verified: typecheck + build pass; landing + all marketing routes render, console clean; dark + light both correct; #product/#developers/#ecosystem anchors present; 4 product cards, 4 dev cards, 4 stat cells. Next: Phase 7 (3D hero), then Phase 8 (final pass + dist rebuild).
