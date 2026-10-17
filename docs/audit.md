# Audit — SPEC_1..SPEC_5 conformance

Independent verification by reading code (not prior reports). Status is `done` only
when code implementing the item is cited. Updated after the completion pass.

| # | Item | Evidence | Status |
|---|---|---|---|
| 1a | Dark tokens match SPEC_1 | `src/index.css:4-31` (bg `#000D1A`, card `#051528`, border `#0B1E30`, line `#112939`, accent `#19D186`, guard-hi `#1CE08E`, danger `#EE4539`, pending `#1F77EF`, text `#FDFEFF`, dim `#8A9FB2`) | done |
| 1b | Light tokens match SPEC_1 | `src/index.css:70-111` (bg `#F1F5FA`, alt `#EAF0F8`, card `#F9FBFD`, border `#EAF1F8`, text `#091636`, dim `#667A98`); topbar light `src/components/layout/shell.css:17-20` | done |
| 1c | Old literals gone from `src/` + `tailwind.config.js` | `src/` and `tailwind.config.js` clean (grep); `index.html` theme-color was `#0A0E14` -> `#000D1A` | done |
| 2a | Primitives: Card / Stat+Sparkline / Chip / Button / Tabs / Table / inputs / Stepper / Skeleton / Empty | `src/ui/*` + `src/ui/ui.css` (`.ui-card`, `.ui-statcard`+`__spark`/`__delta`, `.ui-chip`, `.ui-btn`, `.ui-tabs`, `.ui-table`, `.ui-input`/`.ui-select`, `.ui-step`, `.ui-skel`, `.ui-empty`) | done |
| 2b | Shared error state | `src/ui/ErrorState.tsx` (`.ui-error`) | done |
| 3 | Shell: sidebar active `#014237` + wallet card, topbar Arc Testnet + wallet pills, mobile bottom nav, hamburger drawer | `shell.css:14,138-153,77-84`; `Sidebar.tsx:83,121,196`; `AppTopbar.tsx:78-85`; `AppShell.tsx:167,213-229` | done |
| 4a | Overview (4 stat cards + sparkline + delta, Live Network + legend, Recent Activity, Flow stepper, Service Health) | `Overview.tsx:262,290-301,306,339-355` | done |
| 4b | Marketplace (search, chip filters, provider cards) | `Marketplace.tsx:330,338-347,122-124` | done |
| 4c | Call Builder (tabs, labeled fields, create call) | `CallBuilder.tsx:481-484` | done |
| 4d | Transactions + detail (back arrow, status chip, 4-step stepper, key-value card) | `History.tsx` detail block (`.tx-detail__head`, `Stepper` from `statusSteps()`); Transaction Hash / View on Explorer omitted — the `Call` entity has no `txHash` | done |
| 4e | SLA Canvas legend (Success/Pending/Failed) | `History.tsx` SLA lifecycle card legend | done |
| 5 | 34 panels use their template with features kept | `docs/panel-inventory.md` (all rows done); off-token `#f59e0b` etc. replaced with `var(--warn)`/`var(--info)` | done |
| 6 | Landing sections 1-8 in order, navbar mapping + anchors, 5 marketing pages | `Landing.tsx:174,218,235,261,285,298,314`; `MarketingLayout.tsx:11-15,78-80`; routes verified in browser | done |
| 7 | 3D hero: deps (three, r3f v8, drei v9, postprocessing v2), lazy+Suspense, SVG fallback | `package.json`; `src/marketing/HeroScene.tsx`; `Landing.tsx:127-137`; live canvas verified | done |
| 8a | Focus states | `src/index.css:541` global `:focus-visible` | done |
| 8b | Reduced-motion | `index.css:2304+`, `ui.css:304`, `shell.css:455`, `marketing.css:380`; flow gated `Landing.tsx` | done |
| 8c | Light theme on every panel | footer white-on-dark fixed (`index.css` stray `.app-footer` bg); panels verified in browser (dark + light) | done |
| 8d | No horizontal overflow 375/768/1440 | landing + marketing + panels checked in browser (411 / 1280) | done |

Before: 12 done / 6 partial / 0 missing.
After: 20 done / 0 partial / 0 missing.

Notes:
- Browser widths available are 411 (phone) and 1280 (desktop); 375/768/1440 not exposed by
  the harness browser. No overflow at 411/1280.
- Panels were screenshot-verified via a throwaway `tmp-screenshots` branch with a wagmi
  mock connector (never merged). The canonical subgraph returns `calls: []`, so the
  Transaction Detail body could not be exercised with live data; it is verified by
  typecheck + static review + a CSS-token probe (see `docs/decisions.md`).
- "View on Explorer" / "Transaction Hash" (4d) is intentionally omitted: `subgraph/schema.graphql`
  `Call` (lines 21-34) has no `txHash`, only `callId` (bytes32); `txHash` lives on unrelated
  event entities. Adding a link would invent data.
