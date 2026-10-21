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

## Phase 7 — 3D hero scene
- Added pins (React 18 compatible): `three@0.169.0`, `@react-three/fiber@8.17.10`, `@react-three/drei@9.114.3`, `@react-three/postprocessing@2.16.3`, dev `@types/three@0.169.0`. `bun.lock` + `package-lock.json` synced.
- New `src/marketing/HeroScene.tsx` (own chunk, lazy): emissive green hexagonal-prism core + translucent hex ring; 40-60 instanced hex-prism nodes (green/blue, split into two InstancedMeshes); edge `lineSegments`; 7 travelling light pulses; 260-point particle shell; drei `Html` chips (AI Agents / Providers / Callers); Bloom via EffectComposer. Motion: slow auto-rotation, eased mouse parallax, slight zoom-out on scroll, dpr [1,1.5].
- `Landing.tsx` `HeroArt`: `React.lazy` + `Suspense`, chooses scene only when WebGL exists, not reduced-motion, and not low-end (`hardwareConcurrency<=4 || deviceMemory<=4`); otherwise the `NetworkGraph` SVG fallback. 24 nodes on <700px, 48 otherwise. IntersectionObserver pauses the canvas (`frameloop "never"`) when off-screen. One canvas on the page.
- typecheck + build pass. Next: Phase 8 final pass.

## Phase 8 — Final pass
- Reduced-motion: broadened the global `prefers-reduced-motion` block in `src/index.css` to neutralize decorative motion (shimmers, pulsing dots, tickers, entrances, transitions) while keeping loading spinners animating; gated the landing Transaction Flow framer-motion sequence on `useReducedMotion`.
- Light theme: tokenized three white-alpha surfaces that were invisible on light (`ProviderCard` + `Marketplace` ring tracks -> `var(--border)`, `CallBuilder` row divider -> `var(--border)`).
- Verified in the browser: landing + all 5 marketing routes render with no console errors and no horizontal overflow at desktop (1280) and phone (411); dark + light both correct. Screenshots in `docs/screenshots/` (landing 1280/411, dark+light).
- App panels sit behind the wallet gate; no injected wallet in the harness, so panels were verified by static review (no fixed-width overflow, no `outline:none` without a focus style, no raw dark palette literals) rather than by screenshot.
- typecheck + build pass; `dist/` rebuilt. Phase 8 done — task complete.

## Phase 9 — Independent audit + completion
- Wrote `docs/audit.md`: scored every PART-1..5 requirement against the code. Before: 12 done / 6 partial / 0 missing. After the three batches: 20 done / 0 partial / 0 missing (all PART-5 DoD items hold).
- **Batch A (tokens / contrast / footer)** — commit `ec85dc9`. Replaced off-token literals across 19 files: `#f59e0b`/`#fbbf24` -> `var(--warn)`, `#93c5fd`/`#60a5fa` -> `var(--info)`, `var(--amber,#f59e0b)`/`var(--amber)`/`var(--warn,#f59e0b)` -> `var(--warn)`, `#f59e0b15`/`#f59e0b40` -> `var(--warn-bg)`. Fixed the stray `.app-footer { background: var(--surface,#fff) }` that painted the footer white on dark (`src/index.css`); `index.html` theme-color -> `#000D1A`. Canvas 2d literals (`Marketplace` sparkline `rgba(...)`) left untouched; `Analytics` `resolveColor()` already resolves `var()` for canvas.
- **Batch B (Transaction Detail + SLA legend)** — commit `0b62cf8`. Added a back arrow, "Transaction Details" eyebrow + status chip, a 4-step `Stepper` (Payment/SLA/Receipt/Settlement) derived from `slaStages()`, and a SLA Canvas legend (Success/Pending/Failed). Data flow unchanged.
- **Batch C (error state)** — commit `4735b9c`. Added `src/ui/ErrorState.tsx` (`.ui-error`) exported from `src/ui`; `ErrorBoundary` now renders it instead of inline styles.
- Verified in the browser (mock wallet via a throwaway `tmp-screenshots` branch, never merged): app panels render, no console errors; footer computes `rgb(5,21,40)` (= `--bg-1`) on dark, not white; light-theme `--warn` = `#B45309`, `--info` = `#1F77EF`; injected `.ui-error` / `.sla-legend` / `.ui-step` probes resolve the real tokens (icon `rgb(238,69,57)`, done `rgb(25,209,134)`, pending `rgb(51,65,90)`). Screenshots refreshed in `docs/screenshots/`.
- **Limitation:** the canonical subgraph returns `calls: []` and the mock wallet has no calls, so the Transaction Detail body (stepper with live states) could not be exercised with real data; it was verified by typecheck + static review + the CSS-token probe. Decision logged in `docs/decisions.md`.
- typecheck + build pass; `dist/` rebuilt in each commit. Phase 9 done.

## Phase D — Landing (SPEC_6)
- 1280 + 411, dark + light: nav anchors (`#product`/`#developers`/`#ecosystem`) present, section order 1:1 with SPEC_4, no horizontal overflow at any of the four combos. Screenshots `docs/screenshots/landing-{1280,411}-{dark,light}.png`.
- **Fixed a real WebGL bug.** `.mk-hero__art` had no height, so the r3f `<Canvas style="height:100%">` collapsed to ~150px and the whole 3D hero rendered into a sliver. Set `.mk-hero__art { height: 420px }` (matches the SVG fallback's `height={420}`).
- WebGL scene confirmed live by GPU readback (`gl.readPixels`): 13 draw calls / 2280 tris, bright green core (`max` sum 506) over a soft bloom haze; corners `(0,26,13)`. The harness screenshot does **not** composite the WebGL surface (DOM chips show, canvas pixels do not), so visual proof uses the readback plus the SVG fallback capture.
- Reduced-motion / low-end fallback verified by forcing the fallback branch: `NetworkGraph` SVG renders the "C" core + nodes (capturable). Screenshot `docs/screenshots/landing-fallback-1280-dark.png`.
- Decisions logged; typecheck + build pass; `dist/` rebuilt. Next: delete `tmp-screenshots`, finalize.

## Phase E — Finalize (SPEC_6)
- `git grep -n "mock(\|AutoConnect\|autoConnect\|MOCK" -- src` -> no matches; `main` has no mock-wallet code.
- `git branch --list tmp-screenshots` and the remote list -> none; the throwaway branch is gone.
- `bun run typecheck` -> exit 0; `bun run build` -> exit 0; `dist/` byte-identical (no rebuild needed, already current).
- Inventory final: **34/34 panels done** + 6/6 marketing pages done; `docs/audit.md` 20 done / 0 partial / 0 missing.
- Task complete. No unfinished items.

## Phase 10 — Landing redesign (premium, full page)
- Rewrote `src/marketing/Landing.tsx` as a connected narrative: hero (new H1 "Trust Every Call. Enforce Every Promise.") → problem → primitives → lifecycle stepper → two outcomes → live evidence → developers → connected stack → trust → FAQ → CTA. All copy follows the real contracts (EIP-712 ArcSLA/1, 5s submit grace, `forge test`); the fabricated "Trusted by developers" logo row was removed.
- `HeroScene.tsx` polished: signals now illuminate the nodes they pass (per-instance `setColorAt` + brightness-scaled instance matrices), a slow entrance ease, a rotating tick ring + pulsing rim on the hex shield, and eased pointer parallax. Still one lazy canvas, `dpr [1,1.5]`, IntersectionObserver pause, WebGL/reduced-motion/low-end fallback to `NetworkGraph`.
- `marketing.css` gained the new section styles + hero staggered entrance; `MarketingLayout.tsx` NAV adds `/#faq`. Verified: typecheck + eslint clean; desktop 1280 + phone 411 no horizontal overflow; FAQ aria correct; outcomes switch works; light theme shows a transparent canvas; `bun run build` ✓ (HeroScene stays a lazy 834 kB chunk). Next: human review of the copy.

## Phase 11 — Design system foundation (premium redesign, Phase 1)
- Added a semantic token layer to the dark `:root` in `src/index.css`, with matching overrides under `[data-theme="light"]`: space (`--sp-1..--sp-10`, `--gap`, `--field-gap`, `--card-pad`, `--page-pad`, `--section-gap`, `--gutter`), shape (`--radius-xs/sm/pill/xl` alongside the existing `--radius/lg`), elevation (`--elev-1..--elev-4`, `--overlay`, `--overlay-blur`), focus (`--focus-ring`, `--focus-ring-strong`), ink (`--on-accent`), motion (`--dur-fast/base/slow/slower`, `--ease-out`, `--ease-in-out`, `--motion-fast/base/slow`), z-index (`--z-base/sticky/nav/overlay/modal/toast`) and data-viz (`--viz-1..--viz-5`, `--viz-grid`).
- Removed the global `!important` transition override: the `*` transition and the interactive-element transition are now token-driven, so component transitions are no longer silently overwritten. The global focus ring now uses `var(--focus-ring)` and the `.stat-card-*` series uses the `--viz-*` scale.
- `src/ui/ui.css`: tokenized every remaining literal (radii, paddings, transitions, `z-index`, overlay colour/blur) so all primitives share one shape and motion scale. Added `:focus-visible` rings to `.ui-btn/.ui-iconbtn/.ui-chip/.ui-tabs__tab/.ui-copy`.
- New primitives (only where nothing existed; existing component APIs unchanged): `Textarea` (`src/ui/Field.tsx`), `Switch.tsx` (checkbox-based, `role="switch"`), `Tooltip.tsx` (hover + `:focus-within`, `aria-describedby`), `TextLink.tsx`; all exported from `src/ui/index.ts`. `Modal.tsx` now moves focus into the dialog on open, restores it on close and sets `aria-labelledby` from its title (Escape + backdrop close kept).
- Verified: `bun run typecheck` + `bun run lint` (`--max-warnings=0`, 0 warnings) + `bun run build` clean (8451 modules, eager gzip floor unchanged at `vendor-web3` 496.33 kB). Browser check on the mock-wallet worktree (port 5201): dark Overview and Marketplace, light Call Builder and the new modal — no console errors, no failed requests, no horizontal overflow.
- Skills: `frontend-design` read and applied directly. `regards-art-direction` used only through its documented fallback — the regards.design MCP is unavailable in this session and no Chrome/Chromium is installed, so its `inspect.mjs`/`lint.mjs` cannot run. Panels beyond the sampled ones were not restyled; this phase only establishes the foundation they can be migrated onto.

## Phase 12 — Shell chrome: grouped navigation, topbar, responsive + motion (Phase 2)
- Added `src/components/layout/navConfig.ts` as the single source of truth for the sidebar: 8 groups (DISCOVER / OPERATE / FINANCIALS / TRUST & QUALITY / INTELLIGENCE / BUILD & INTEGRATE / WALLETS & AGENTS / SYSTEM), each with a label, icon and panel keys; a `NAV_KEY_TO_PANEL` map and a `findNavKeyForPanel` helper resolve the active item from the current panel id.
- `Sidebar.tsx` now renders groups from that config (group label + rule, items with icon + label, active item = emerald inset indicator + accent label), collapses to a 52px rail that shows icons only (with native `title` + `aria-label` for each item, plus the brand mark), and keeps the `COLLAPSE`/`EXPAND` control at the bottom. The previous duplicated active-nav style (a second `!important` gradient) was removed, so one rule owns the indicator.
- `AppShell.tsx` owns `activeNavKey` (derived via `findNavKeyForPanel`), the tablet-default collapse seed (`localStorage['cg_sb_collapsed']`, seeded collapsed at ≤1024px for a first-time visitor), the notifications control (`Logs and notifications` → the Logs panel), the mobile drawer open/close with Escape handling, focus-into-drawer on open and focus restore to the hamburger on close, and calls `useApplyMotionPreference()` so `document.documentElement.dataset.motion` is finally live.
- `AppTopbar.tsx`: breadcrumb from the active nav group + panel, Simple/Pro toggle, a real network pill (green only when the wallet is actually on Arc Testnet, otherwise a neutral/pending state), wallet chip, notifications bell, theme toggle, command hint.
- The mobile drawer overlay is a real `<button aria-label="Close navigation">` (a dismiss control), not a clickable `<div>`; the drawer slides over the page, locks body scroll (`nav-open`) and dims/blurs the content behind it.
- `src/index.css`: new `--sidebar-w-collapsed: 52px` token; `.app-shell` gained `transition: grid-template-columns`; new `.app-shell.sb-collapsed { grid-template-columns: var(--sidebar-w-collapsed) 1fr }` so the collapsed rail reclaims its grid track; `.app-sidebar.collapsed` uses the token.
- `src/components/layout/shell.css`: appended a `@media (max-width: 768px)` drawer block. It must load after the base `.sidebar { position: relative }` rule — same specificity, `shell.css` is imported last in `src/main.tsx`, so without this the drawer stayed in flow and was laid out as a stray grid row instead of a fixed overlay.
- Verified: `bun run typecheck` + `bun run lint` (`--max-warnings=0`) clean; `bun run build` ✓ (`AppShell` chunk 63.38 kB / gzip 19.29 kB; the eager `vendor-web3` floor unchanged). Browser (TermFold, mock worktree, port 5202): desktop dark/light render correct; collapse measured to 52px with the main column moving to `left: 52` and expand back to 232px with the preference persisted; notifications bell switches to the Logs panel with `aria-current` on the item and breadcrumb `System › Logs`; phone 411px — hamburger visible, drawer opens as a 260px fixed overlay with body scroll locked, Escape closes it and restores focus to the hamburger, backdrop click and nav-item click also close it and navigate (`Discover › Marketplace`); no console errors, no failed requests, no horizontal overflow (`scrollW === innerW === 411`); `data-motion="full"` present; theme toggle flips `html` + `body` in both directions.
- The mock-wallet worktree was restored to its own baseline after the checks and the port-5202 dev server stopped. No commit or push was made.

## Phase 13 — Landing readability: contrast + type sizes (art-direction gate)
- Ran the art-direction gate on the production landing with the new host-browser driver: `node .agents/skills/regards-art-direction/scripts/inspect-tf.mjs http://localhost:5204/ --out /tmp/artcheck4 --json` (dev server on 5204). Baseline: **11 FAIL / 5 WARN**, body text **13px**, **34** blocks under 13px, and `lowContrast` naming the `#problem` note at **2.8:1**.
- Root cause: `html { font-size: 14px }` (`src/index.css:612`) with no body-copy step in `marketing.css`, and the muted token `--text-faint: #4D5F76` used for prose (≈2.9:1 on the dark grounds).
- Fixed in `src/marketing/marketing.css` only (24 lines): raised `.mk-note` 13.5→16, `.mk-cell__d` 13→15, `.mk-outcome__d` 13.5→15, `.mk-devcard__d` 12.5→14, `.mk-faq__a p` 14→16, and the sub-13px family (`.mk-track__s`, `.mk-switch__btn`, `.mk-pill`, `.mk-pill__s`, `.mk-contract__role`, `.mk-contract__addr`, `.mk-chip`, `.mk-tag`, `.mk-fact dt`, `.mk-flow__t small`, `.mk-footer__bottom`, `.mk-footer__col h4`) to 13–14px; `.mk-mono` 0.92em→0.95em. Swapped `--text-faint` → `--text-dim` on readable copy (12 selectors) and made `.mk-tag--opt` use `color-mix(in srgb, var(--info) 62%, white)` (the plain `--info` was 4.3:1 at 11px).
- After: desktop **body 16px, contrast 6.7:1, `smallText` 1, `lowContrast` empty**; phone body 16px, `smallText` 0, `lowContrast` empty. `contrast`, `body-size` and `small-text` all clear. No horizontal overflow at either width; `typecheck` + `lint --max-warnings=0` clean; `bun run build` ✓ (1m 38s).
- Remaining findings are deliberate Phase-10 design voice (`mono`, `gradient`, `shadow`, `hairline`, `outlined-box`, `icon-cards`, `focal-point`, `glass`, `size-count`, `grey-body`, `no-footage`) plus `few-pictures`. Recorded, not silently ignored — see `docs/decisions.md`.
- `few-pictures` accepted with the user (landing has 0 raster images by design). Not added to the gate's `direction.json` allow-list: `few-pictures` is not in the skill's liftable set, and lifting any rule requires a regards reference section, which needs a Pro plan the user declined.

## Phase 14 — Premium design system foundation (redesign Phase 1)
- Audited the token layer, the `src/ui/` kit, the theme mechanism and the app shell before editing. Found **no genuine undefined tokens** apart from six real defects: `--text-primary`, `--text-muted`, `--surface` (used ~45× across the legacy admin/marketplace CSS but never defined, so those declarations were invalid and the surfaces rendered transparent), `--input-bg`, `--red` (5 uses in 4 panels) and `--font-body` (`CommandPalette`). The other flagged names (`--d`, `--dur`, `--step-color`, `--x`, …) are runtime/inline or have fallbacks.
- `src/index.css`: added a commented **Compat aliases** block inside `:root` (`--surface: var(--surface-1)`, `--input-bg: var(--surface-3)`, `--text-primary: var(--text)`, `--text-muted: var(--text-dim)`) instead of renaming ~45 legacy call sites; removed the `var(--input-bg, rgba(255,255,255,.04))` fallback (that literal only existed for the dark theme).
- `src/ui/ui.css`: reworked the `.ui-table` block — token borders, `--text-dim` headers (was `--text-faint`, ≈2.6:1), sticky head, `[aria-sort]` arrows, tabular `.num`, `.mono`, `.trunc`, `.ui-table--dense`, an `.ui-table__scroll` frame, and a **hover that works in both themes** (`color-mix(in srgb, var(--text) 4%, transparent)` — the old `--surface-2` equals `--surface-1` in dark, so nothing happened). Added the `.ui-check*` block and extended the reduced-motion list with `.ui-check__box, .ui-table tbody tr`.
- New primitives: `src/ui/Checkbox.tsx` (controlled, mirrors `Switch`: label/hint/error/disabled, native input for keyboard + `:focus-visible` on the box) and `src/ui/Table.tsx` (`TableWrap`, `Table`, `Tr`, `Th`, `Td`, `TableEmpty`). Exported from `src/ui/index.ts`. Both were the only genuinely missing primitives; everything else in the brief already existed.
- `src/App.tsx`: the sonner `Toaster` now follows the app theme (`theme={theme}` from the Zustand store, `richColors` dropped) and its surface is mapped to semantic tokens through an inline `TOAST_VARS` style object — inline wins over sonner's own stylesheet, which defines these vars at `[data-sonner-toaster][data-sonner-theme=…]` (specificity 0,2,0) and may load after `index.css`.
- Adoption where the app really had the pattern, not for novelty: `Webhooks`' inline 12px checkbox pills became `Chip`/`ChipRow` (the app's existing `<button aria-pressed>` multi-select, inside `role="group" aria-labelledby="wh-events-label"`), and `Marketplace`'s comparison modal now renders the `ui-table` classes (its `mp-*` CSS keeps only alignment/label styling) — that table was the only real `<table>` in the app and it was light-theme-broken (hardcoded `rgba(255,255,255,.05)` borders, `font-family: monospace`).
- Token call-site fixes: `var(--red)` → `var(--danger)` in `Receipts`, `Payments` (×2), `SettingsPanel`, `ApiDocs`; `var(--font-body)` → `var(--font-sans)` in `CommandPalette`.
- Checks **actually run**: `bun run typecheck` clean; `bun run lint` (`eslint src --max-warnings=0`) clean; `bun run build` ✓ `built in 1m 24s` (`/tmp/build-p1ds.log`). Re-ran the undefined-token scan → only the benign runtime/fallback names remain.
- Browser verification (mock-wallet worktree on port 5205, its own dev server; the main repo tree was not disturbed and no other session's server was touched): dark **and** light via the store's toggle (`data-theme` on both `html` and `body`); Marketplace comparison table = `table.ui-table.mp-cmp`, header `rgb(138,159,178)` dark / `rgb(102,122,152)` light (`--text-dim`), borders `rgb(17,41,57)` dark / `rgb(234,241,248)` light (`--line` — no hardcoded rgba left), `td.mono` → Geist Mono (was `monospace`), 7 rows, **no horizontal overflow** at 1280; Webhooks event chips = 5 `Chip` buttons with working `aria-pressed`, 0 raw checkboxes; a real error toast showed `data-sonner-theme` following the theme with `--surface-3`/`--text`/`--border-hi` backgrounds in dark and the light equivalents in light; the Pipeline Hook input rendered `--input-bg` correctly in both themes (proves the compat alias); `Checkbox` was verified by a temporary render in the mock's Webhooks panel — reached by **real Tab presses** (`:focus-visible` true, box ring `rgba(14,159,110,.3)` + accent border), plus checked/disabled(`opacity .5`)/error(`--danger`) states, then reverted. The mock worktree was restored to its exact baseline afterwards (only its own shim edits remain).
- Known limitations recorded in `docs/decisions.md`: the TermFold harness `click` command did not reach React handlers in this session (navigated with `element.click()` via `eval` instead), and table rows are not exposed to its `hover`, so the row hover was verified through the CSSOM rule plus a live `color-mix` resolution probe rather than a real pointer; `Checkbox` has no adoption site yet.

## Phase 15 — Premium application shell, navigation & responsive UX (redesign Phase 2)
- Inspected first: git state clean (only untracked `.agents/`, `skills-lock.json`), latest spec `design/SPEC_9_FIXES.md`, `docs/{progress,decisions,audit,panel-inventory}.md`, the current shell (`components/layout/{AppShell,AppTopbar,Sidebar}.tsx`, `navConfig.ts`, `shell.css`), the panel registry (34 lazy entries) and `store/useAppStore.ts` (`PanelId` union, `persist` partialize). Phase 12/14 already delivered the grouped navigation, topbar and mobile drawer, so this phase verified that work and fixed what it found, instead of rebuilding it.
- **Navigation coverage verified, not changed.** `navConfig.ts` has 8 groups + the home item = 34 entries. The store's `PanelId` union has 35 members; the one not in the nav is `x402`, which `normalizePanel()` maps to `calls`. So every panel stays reachable and no dead destination was added.
- **Re-render fix (measured).** `AppShell`, `AppTopbar` and `Sidebar` each subscribed with `useAppStore()` (whole store), so every unrelated slice change re-rendered the shell *and* the mounted panel. All three now use field-level selectors. Measured in the mock worktree by instrumenting render counters: three unrelated writes (`markHintSeen`) → shell re-renders **6 before / 0 after**; a relevant write (`setMode`) still re-renders, so reactivity is intact.
- **Panel entrance motion.** New `.app-panel` wrapper keyed by `activePanel` with `@keyframes app-panel-in` (opacity + 4px rise, `var(--dur-slow)`/`var(--ease-out)`, transform/opacity only so it cannot delay a click or reflow). Covered by both reduced-motion guards (`prefers-reduced-motion` and `[data-motion="reduced"]`), plus `.app-shell` is now in that list too so the grid collapse is instant when motion is off.
- **Focus management.** A panel change moves focus into `.main-content` (`tabIndex={-1}` + `focus({ preventScroll: true })`), skipped on first paint; `.main-content:focus { outline: none }` so the programmatic focus paints no ring. The drawer's focus restore is now guarded by `aside.contains(document.activeElement)` so it cannot fight the panel handler. Measured: after a nav click `document.activeElement` is `MAIN.main-content`.
- **Drawer semantics.** When open the `<aside>` is `role="dialog" aria-modal="true" aria-label="Navigation"` (focus is trapped, scroll locked, so the modal claim is true); the backdrop stays a real `<button aria-label="Close navigation">`; the hamburger already had `aria-expanded`/`aria-controls`. The mobile bottom nav gained `aria-label="Primary"` and `aria-current="page"` on the active item.
- **Real network state in the sidebar chip.** It claimed `Connected • Arc Testnet` whenever a wallet was connected, regardless of chain. Now `useChainId()` decides: `Connected • Arc Testnet` only on `arcTestnet.id`, otherwise `Wrong network` with a warn dot (`.sb-foot-dot.warn`). The topbar already did this.
- **Shell-chrome contrast.** Group labels, `.sb-net`, `.sb-foot-state`, `.sb-chev`, the `⌘K` kbd and the collapse button used `--text-low`/`--text-faint` (#4D5F76, ≈2.9:1) at 9.5–11.5px; the same defect Phase 14 fixed on the landing. All moved to `--text-dim` (6.7:1), as were the footer group titles, footer copy and the contract-address chips. Decorative dots keep the faint token.
- **Collapse control icon.** The `‹` text glyph became a lucide `ChevronLeft` (the existing `.collapsed` rule rotates it), so the control matches the icon language of the navigation.
- Checks: `bun run typecheck` clean, `bun run lint` (`--max-warnings=0`) clean, `bun run build` ✓ 1m 46s. Browser checks on the mock worktree (`/app`, port 5206, own server): desktop 1280 — 8 group labels, 34 items, `aria-current="page"` on the active item, `.app-panel` animation `app-panel-in 0.3s`, collapse 232px→52px with the panel growing 1048px→1228px and the 3 SVGs intact, no horizontal overflow, **no console errors**; phone 411 — hamburger visible, drawer opens as a fixed 260px overlay with `role=dialog`/`aria-modal`, focus trapped on the first nav item, Escape and backdrop click both close it, body scroll unlocked, bottom nav shows `aria-current` on Home; reduced motion — panel animation `none` and shell transition `0s`; contrast measured `rgb(138,159,178)` for all four chrome samples.
- Limitations: the harness exposes only two viewports (1280 desktop, 411 phone), so the tablet breakpoints (≤1024 collapse seed, ≤768 drawer) were verified by code/CSS inspection, not measured at 1024/820. `termfold-browser click` still does not reach React handlers in this session, so every interaction was driven with `eval "…click()"`. The Analytics panel rendered no `<canvas>` during the check, so "collapse does not break canvases" was verified through panel-width reflow and SVG integrity instead.
- Not committed and not pushed (brief §12: no push/deploy without explicit approval).

## Phase 16 — Premium Overview dashboard, live protocol intelligence & data visualization (redesign Phase 3)
- Inspected before rewriting: `git status`/`log`, `docs/{progress,decisions,audit,panel-inventory}.md`, the 704-line `Overview.tsx`, its hooks (`useSubgraph`, `useReadContract`, `useWatchContractEvent`), `src/ui` primitives, `src/lib/config.ts` (CONFIG + `explorerTx`/`explorerAddr`), `src/lib/subgraph.ts` and the live subgraph. Verified the indexer's `_meta { block { number timestamp } hasIndexingErrors deployment }` really answers on the canonical Goldsky endpoint, so indexer health is available as real data.
- **Removed a fabrication.** The old "Live Network" card rendered `src/components/viz/NetworkGraph.tsx` — `buildNodes(26, seed)` from a `mulberry32` PRNG inside `aria-hidden`, i.e. invented topology behind a `Live` badge. It is no longer used in Overview (the component itself is untouched for its other users) and the card is now a real **Provider Network** summary aggregated from indexed provider records (count, active, completed, slashed, stake locked, price-per-call range).
- **Status strip (new).** A four-item strip distinguishes what the old dashboard conflated: wallet (`useAccount().status` → connected address / Connecting… / Reconnecting… / Not connected), network (`useChainId()` vs `arcTestnet.id`, guarded by `isConnected`, so it never names a chain the wallet is not on), RPC (`useBlockNumber({ watch: true })`, with `isError` → Unreachable), and indexer (`_meta` → block, `hasIndexingErrors`, lag = RPC head − indexer block). It lives in its own component so the block subscription re-renders the strip and nothing else. State is carried by icon + label + value, never colour alone.
- **Metrics now say what they are.** `Total Calls` (indexed calls, with the 1000-row query cap surfaced in the hint and in the truncation badge), `Providers` (`nextProviderId − 1`, id 0 reserved; falls back to the indexed count only when the registry read is unavailable), `Escrowed USDC` (sum of open-call amounts, hint names the open-call count), `SLA Success Rate` (**redefined over settled calls**: `completed / (completed + slashed)`, hint `N completed of M settled calls`, and "unknown, not zero" when nothing has settled). Each card carries an honest `hint` (new optional prop on `StatCard`, rendered as `.ui-statcard__hint`), and the real 7d-vs-prior-7d delta is kept only when a prior window exists.
- **Zero vs unknown.** `indexerAnswered = !error && payload present`; a failed read renders `—` plus an ErrorState with a Retry, a genuine zero renders `0`. Escrow and the settled rate are `null` (unknown) until the indexer answers. The old `unavailable={!loading && calls === 0}` (which showed "—" for a true zero) is gone.
- **Charts.** `Call Activity (24h)` is 24 real hourly buckets from indexed timestamps with a `role="img"` + full aria-label, per-bar `title`, a 3px floor for empty hours and a visible one-sentence summary ("3 calls in the last 24 hours · busiest 7h ago with 1 call"). `SLA Outcomes` shows Completed / Slashed / Open (+ `Other` only when a status outside those groups exists) as horizontal bars with counts and percentages and a summary that states the settled-call rate or that it is unknown. Both have honest empty states; the old sparkline-only "24h Activity" card and its mislabelled `[0,6,12,18,23]h` axis are gone (the helper's `hour` field was a reversed index, not a clock hour).
- **Recent Activity.** Real indexed records only, newest first: status label + `Provider #id`, amount in USDC, relative time (ISO in `title`), the truncated `callId` **plus** a `Copy` button for the full value, and a status badge. **No explorer transaction link**, because the indexed `calls.id` is the bytes32 callId and `explorerTx(callId)` would mint a URL that does not exist — the previous implementation did exactly that. Empty state (`No calls indexed yet`) and error state (ErrorState + Retry) are distinct. Moving the provider label into a `<span>` also removed the nested `<span>` hydration warning.
- **On-chain Events.** The old "Live Activity" card (a CSS-pulsing `live` dot plus a second copy of the same activity list) became an honest log-subscription card: the subscription status is text (`Listening` / `N this session`), and the empty state explains that silence means no emissions rather than implying activity. Explorer links in Service Health, Deployed Contracts and the multi-call results now use `CONFIG.explorerAddr` / `CONFIG.explorerTx` (the hardcoded `ARCSCAN` const is gone).
- **Shell-wide honesty fix.** `LiveBar` (the strip above every panel) hardcoded `Arc Testnet` next to a pulsing dot; it now derives the network from the wallet/chain and its dot is steady (`animation: none`), because the strip marks a running clock, not arriving data.
- **Preserved unchanged**: welcome card, role-aware CTA, USDC balance, My Activity, the Actions card with the auto-router and multi-provider call flows, the transaction-flow stepper, Service Health, Top Providers ranking (now reusing one `repPct` helper instead of three copies of the Bayesian formula), and the Deployed Contracts grid.
- Checks: `bun run typecheck` clean, `bun run lint` (`--max-warnings=0`) clean, `bun run build` ✓ 2m 59s (`/tmp/build-p3ov2.log`). Browser (mock worktree, `/app`, port 5207): status strip live (`Wallet 0x9adE…4ba5`, `Arc Testnet / chain 5042002`, `Block 67,870,109`, indexer `Block 67,870,098 · lag 11 blocks · indexed 6s ago`); metrics `6` calls / `1` provider / `1.20` escrowed / `80%` with their hints; `.viz-net` and `.ov-legend` counts are 0; `a[href*=tx]` is 0; all three `.ov-2col` pairs measured equal heights (333/333, 143/143, 319/319); no horizontal overflow; **no console errors**.
- **Found and fixed a real layout bug at phone width (411px).** The shell grid stayed `52px 359px` while the sidebar is out of flow (`position: fixed` in the ≤768px drawer block), so `.main-content` fell into the 52px track and `.ov-page` measured **47px** wide. Fixed in the same media query with `.app-shell, .app-shell.sb-collapsed { grid-template-columns: 1fr; }`. This was a Phase 2 regression (the drawer was measured there, the content width was not). Confirmed after the fix at 411px: shell grid `411.429px` (single column), `.main-content` 411px, `.ov-page` 406px (was 47px), sparkline 290px, 24h bars 345px, status strip stacked (`376.95px`), 4 status items, metrics `6 / 1 / 1.20 / 80%` with their hints, 24 bars, 3 outcome rows, `scrollWidth === innerWidth === 411` (no overflow), light theme renders with `--text-dim` text on `rgb(241,245,250)` and still no overflow, `[data-motion="reduced"]` gives the SLA bars `transition-duration: 0s`, and the console was clean. Phone screenshot shows the status strip stacked with the indexer row in its warn tone at `lag 91 blocks` (the >50-block threshold working).
- Remaining, documented not hidden: the LiveBar `Honor N%` gauge still uses Bayesian smoothing over all calls (a different definition than the Overview's settled-call rate); `Popover`/`Checkbox`/`TableWrap`/`TableEmpty` still have no adoption site; the tablet breakpoint (≤1024) and reduced-motion state were verified by CSS inspection rather than measured, because the harness exposes only 1280 and 411; `termfold-browser click` does not reach React handlers in this session (interactions were driven with `eval "…click()"`); and the new 12px hints/summaries inherit the light-theme `--text-dim` (#667A98 ≈ 4:1 on `#F1F5FA`), which is app-wide and slightly under AA for small text — raising that token is a global change and was left out of this phase.


## Phase 17 — Premium SLA Canvas, interactive protocol visualization & workflow UX (redesign Phase 4)
- Inspected first: `git status`/`log` (HEAD `841d180`, clean but the untracked `.agents/`, `skills-lock.json`), `design/{RULES.md,SPEC_2_SCREENS.md,SPEC_9_FIXES.md}`, the 172-line `components/viz/SLACanvas.tsx`, its only caller `components/panels/History.tsx` (a caller-scoped `useSubgraph` query whose call record has id/providerId/amount/status/createdAt/completedAt/requestHash/responseHash/refunded/slashed — no `respondedAt`), the canvas CSS (`shell.css:587-603`) and the `src/ui` primitives. Nothing was rewritten from scratch: the isometric engine, the four stages, the `slaStages()` status mapping, the geometry and the existing copy are all untouched.
- **The board became an interactive surface, without a second control set.** `SLACanvas` gained optional `selected` / `onSelect`; pass them and each plate becomes a real control (`<g tabindex="0" role="button" aria-pressed aria-label>`, `<title>`, Enter/Space). Only the plates are focusable — the labels below them are the same interaction for pointers (`tabIndex={-1}` + `aria-hidden="true"`), so a stage is one tab stop, not two. With neither prop the component renders exactly as before, so other future callers keep the static board.
- **Selection is visible on the plate itself.** The rail segments adjacent to the picked stage thicken (`.sla-rail.is-near`), the label for it takes the accent colour, and the plate edge carries the state: a state-coloured 1px edge by default, a bright heavy edge when selected, and the same edge dashed on keyboard focus. An inspect line under the board (`role="status" aria-live="polite"`) names the picked stage, its state *in words* and its sub-line — contextual detail without navigating away, and without duplicating the Details card.
- **State is never colour alone.** Every stage now carries a state word (`Done` / `In progress` / `Waiting` / `Failed` / `Info`), the plate and label carry it in their accessible name (`"Receipt — Done. signature verified"`), and the list below the board prints it beside each stage. The existing probability/colour legend is preserved unchanged.
- **A stacked stage list solves two problems at once.** `.sla-canvas__stack` is the same four stages as an ordered list of buttons. Above 640px it is visually hidden (the board already carries the stages for assistive tech, so it is not a duplicate tab order); at ≤640px the isometric board is hidden and the list takes its place, because the absolute-positioned labels collide well before phone width. Verified at 411px: board `display: none`, list visible at 355px wide, four state words, no horizontal overflow.
- **Reduced motion now covers the in-app switch.** The canvas was only guarded by `prefers-reduced-motion`; `[data-motion="reduced"]` (the app's own toggle) now also kills the plate entrance, the active pulse and the new edge/rail transitions. Measured with the attribute set: **0** elements under `.sla-canvas` with an animation.
- **Two real defects found by measuring, not looking.** (1) `--focus-ring-strong` is a **box-shadow value** (`0 0 0 3px rgba(...)`), not a colour, so using it as `stroke`/`outline` colour produced `stroke: none` — an invisible focus ring that would have shipped as "looks fine". Fixed by using `--focus` (the same token the global `:focus-visible` rule uses) and by deleting a redundant per-button outline rule that the global rule already covers. (2) A selection ring drawn in the state colour is invisible on a plate already filled with that colour (the completed board is all accent), so the ring was replaced by an edge treatment that brightens to `--text` — measured `rgb(253,254,255)` at 2.5px on the selected plate against `rgb(25,209,134)` at 1px on the others.
- **`History.tsx` only gained the wiring** (`stageKey` state, `selected`/`onSelect` props); the legend, the `Stepper`, the Details card, the filters, the pager and the export buttons are untouched, and the canvas still unmounts when no call is selected.
- Checks: `bun run typecheck` clean, `bun run lint` (`--max-warnings=0`) clean, `bun run build` ✓ 1m 57s. Browser (mock worktree `/app`, port 5208, own server, dark + light + `data-motion="reduced"`): COMPLETED (four `Done`, four accent edges), STARTED (words `Done / In progress / Waiting / Waiting`, cyan active plate, rails solid-emerald then dashed-grey, inspect `Service call · In progress · provider notified`), SLASHED (2 failed plates, `rgb(238,69,57)` edges, words `Done / Done / Failed / Failed`); click, keyboard `Enter` (dispatched keydown → selection moved to the plate) and `:focus-visible` (matched, edge went dashed `2.5px`) all confirmed; deselect unmounts the canvas; no horizontal overflow at 1280 or 411; **no console errors** in the whole session.
- Limitations: the harness exposes only two viewports (1280 desktop, 411 phone), so the 640px stack/board switch was verified by code and CSS inspection at the midpoint rather than measured at 641/639px; `termfold-browser click` still does not reach React handlers in this session, so every interaction went through `eval "…click()"` / a dispatched `KeyboardEvent`; `respondedMs` is still supported by `slaStages()` but no caller passes it (the subgraph call entity has no `respondedAt`), so the board keeps showing `provider notified` for a completed call.
- **Follow-up commit `ebe694a` (the a11y repair of the canvas, previously undocumented here).** It changed `src/components/viz/SLACanvas.tsx` (26 lines) and `src/components/layout/shell.css` (+5) and nothing else: the interactive board was wrapped in `role="img"`, a leaf role that hides every node inside it, so the stage buttons shipped invisible to assistive tech — it is now `role="group"` with `aria-label="SLA lifecycle"` when the plates are controls, and stays `role="img"` for the static, props-less call. The polite live region is rendered before it has text (a region that arrives already holding its content is not announced) and reserves its line so selecting a stage cannot shift the legend below. A pointer press on the label twin — which is `aria-hidden` — no longer moves focus into that node, because the plate owns keyboard focus. Reason it was split out of `f250e33`: the phase commit was already reviewed, and this was a behaviour fix found while measuring the accessibility tree.
- Not committed and not pushed (brief: no push/deploy without explicit approval).

## Phase 17 — addendum (2026-10-19): cross-cutting a11y sweep over all 34 panels
- **Why:** the phase was re-verified through a different tool path. `agent-browser` 0.39.1 is now installed globally and wired into OpenCode as an **MCP server** (`agent-browser mcp --tools core,debug`, `AGENT_BROWSER_EXECUTABLE_PATH=/usr/local/bin/chromium-150`), which exposes `open`/`snapshot`/`a11y`/`console`/`errors`/`eval`/`press`/`screenshot` as first-class tools instead of shell calls. Verification ran against the mock worktree (`66e9eae` + the wallet shim) on its own port 5202, so the working tree was never modified for measurement. `bun run typecheck` clean in that worktree.
- **Sweep:** every one of the **34** sidebar entries was clicked and axe-core 4.12.1 run page-wide with tags `wcag2a,wcag2aa,wcag21a,wcag21aa`.
  - *Before:* every panel carried `.live-meta` (`Arc Testnet`) at **2.8:1**, and four panels carried six `label` violations (controls with no accessible name): Provider details (read-only share link), Call Builder (batch range), Bulk Call (Provider ID, Payload, call-count range), Subscriptions (pre-buy range).
  - *After:* **34/34 panels, 0 violations** (passes 19–27 per panel).
- **Fixes (6 files, dark theme only):** dark `--text-low` `#4D5F76` → `#72849A` (computed 4.86:1 on `--bg-1`; the 219-use `--text-faint` tier untouched — the remaining `--text-faint` uses are dots, separators and axes, and axe reports no violation for them); `.tb-mode-btn` moved off `--text-faint` onto `--text-low`; `LiveBar`'s inline `color: var(--text-faint)` on `.live-meta` **deleted** (the class already sets `--text-dim`, 6.8:1 — this one inline style was the single worst offender, present on all 34 panels); `aria-label` added to the six controls in `src/components/panels/{BulkCall,CallBuilder,Subscriptions,ProviderProfile}.tsx`. No copy, layout, data flow or feature was touched.
- **Re-verified through the new tool path as well:** the canvas AX tree (`group "SLA lifecycle"`, exactly four `button` nodes named `Escrow — Done. 0.5 USDC` …), keyboard `Enter` on a focused plate → `aria-pressed` flips and the live region reads `"Escrow · Done · 0.5 USDC"` with `document.activeElement` still on the plate, `.sla-canvas`-scoped axe **0 violations / 12 passes / 1 incomplete**, and no console errors or warnings (`errors: []`) on the Transactions panel.
- **Light theme measured and left open:** flipping the theme toggle and re-running the same tags gives **10 nodes below AA** (`.tb-mode-btn` 4.14, `.tb-balance-label` 4.14, `.tb-breadcrumb-panel` 4.36, `.sb-net` 4.21, `button[data-nav] > .sb-label` 4.21, `.tb-wallet__addr` 3.81, `kbd` 3.6, `.net-pill > .tb-hide-sm` 1.84, `.on > .sb-label` 1.79). This is the gap already recorded for Phases 3/16, now with numbers; closing it means new light-theme palette values (candidates in `docs/decisions.md`), and the light `--text-low` was reverted so this pass changed no light-theme pixel.
- **Method note:** the first-run onboarding dialog renders over the panel and darkens it, so axe scores the dimmed-under text — the same screen reports 7 contrast nodes with the dialog open and 3 with it closed. Audit after dismissing it.
- **Still open, unchanged:** row 5's pointer focus hand-off (the keyboard path keeps focus on the plate; a real pointer click on a label twin leaves `document.activeElement` on `BODY`), and rows 2, 4, 6, 7, 13 of the Phase 4 checklist. `dist/` is gitignored and untracked, so no build output was regenerated for these changes.
- Gates: `bun run typecheck` clean, `bun run lint` (`--max-warnings=0`) clean. Not committed and not pushed.

## Phase 4 — completion pass (2026-10-19): rows 4, 5, 6, 7, 13

Carried into this pass from `design/phase-checklists/PHASE_4_CHECKLIST.md`: row 5 (zoom/pan,
return-from-zoom, the inert static-mode control, the label-twin focus hand-off), row 4 (the three
unexercised outcomes and provider configuration as a *stated* fact), row 6 (configuration form
validation and tx states, never attempted), row 7 (the unrendered protocol states), row 13
(`ebe694a` was undocumented). Row 2 (no skill used during Phase 4) is a historical fact about the
phase, so this pass records it rather than pretending it can be repaired.

Files changed: `src/components/viz/SLACanvas.tsx`, `src/components/layout/shell.css`,
`src/components/panels/History.tsx`, `src/components/panels/Register.tsx`, and rejection copy in
`src/components/panels/{Requests,Verify,BulkCall,Payments}.tsx`. No store, no `src/lib/*` module and
no other panel was touched. Plan of record: `docs/superpowers/plans/2026-10-19-phase4-completion.md`.

### Row 5 — the canvas became navigable and the board stopped lying about its controls

- **Zoom and pan.** `.sla-canvas__board` gained a tools group (`−`, the zoom readout, `+`, `Fit`):
  steps `1 → 1.25 → 1.6 → 2 → 2.5`; the stage translates in whole percentages of its own box and
  scales about its centre; the pan is clamped to half the growth, so the stage can never be dragged
  clear of the frame. Only the SVG scales — **the label row is anchored outside the scaled stage and
  re-positioned through the same "meet" fit the SVG uses**, so a label stays at its plate at a
  constant, readable size instead of scaling out of the frame. Measured label-centre minus
  plate-centre at 100 / 160 / 250%: **0, 0, 0, 0** for all four stages.
- **Zoom targets what is in hand.** With a stage selected, the zoom re-centres on it and clamps
  (measured: the selected Escrow plate lands centred at x = 1044). `Fit` returns to the full board.
- **Pointer pan measured with a real mouse** (CDP `mouse move/down/up`): a net −130 px drag moved the
  stage from `matrix(2.5,0,0,2.5,177.4,0)` to `…,47.4,0` — exactly −130 px, and the whole time
  inside the clamp. Arrow keys pan the same way **while the board has focus** (`x` 177.4 → 185.3 →
  180.1 → 163.6 across three presses); the board only becomes a tab stop while it is zoomed
  (`tabindex` −1 at rest), so the default view gains no extra stop.
- **The limits no longer cost the reader their place.** In the first implementation the tools used
  `disabled`, and a control that becomes disabled while focused throws focus to `<body>` — measured
  after `Fit` at 250%: `document.activeElement` = `BODY`. They now use `aria-disabled` with a no-op
  guard and the same styling: at 250% the focus stays on `Zoom in`, and after `Fit` it stays on
  `Reset view`.
- **The label twin hands focus to the plate** (the row-5 defect). A real CDP pointer click on
  `.sla-canvas__labels > .sla-canvas__label--btn:nth-child(3)` gives `document.activeElement` = `g`
  with `role="button"` and name `"Receipt — Done. signature verified"`, `aria-pressed`
  `[false,false,true,false]`, and the inspect line `"Receipt · Done · signature verified"`.
- **The static mode stopped shipping an inert control.** With no `selected`/`onSelect` the stack
  renders `div.sla-canvas__stack-btn` (cursor default, no hover border) instead of four
  `<button>`s with no handler; measured in a props-less render: `svg role="img"`, 0 plate buttons,
  4 static rows, and the only focusables on the board are the three view controls, which still work
  on a static board (zoom → `matrix(1.25,0,0,1.25,0,0)`). axe on the static board: 0 violations.
- **Motion.** `[data-motion="reduced"] .sla-canvas__stage` and the `prefers-reduced-motion` rule both
  set `transition: none`; measured with the attribute set: `transition-duration` **0s**. The default
  path now genuinely animates — see the token defect below.
- **A token defect found while measuring this.** `--motion-fast` is itself
  `var(--dur-fast) var(--ease-out)`, so every rule that wrote
  `transition: X var(--motion-fast) var(--ease-out)` produced two timing functions, an invalid
  declaration, and **no transition at all** — computed `transition: all 0s`. Five declarations in the
  `.sla-canvas*` block were in that state (`.sla-canvas__stage`, `.sla-canvas__label--btn`,
  `.sla-plate__outline`, `.sla-rail`, `.sla-canvas__stack-btn`). They now use `var(--motion-fast)`
  alone; measured after: `0.12s cubic-bezier(0.22, 1, 0.36, 1)`. The rest of the repository was not
  swept (recorded in `docs/audit.md`).
- **axe, dark, all four states:** `.sla-canvas` **0 violations / 13 passes / 1 incomplete**; the
  single `incomplete` is `color-contrast` on `.sla-canvas__zoom`, measured directly at **6.71:1**
  (11 px, `--text-dim` on `--bg-1`) — above AA for its size. At 411 px the tools and the board are
  `display: none`, the stack is visible and the page has no horizontal overflow; 0 violations.

### Row 4 — the seven flow items, each one from a real field

`History.tsx` now renders a **"Terms and outcome"** list inside the SLA Canvas card, one row per
brief item: provider configuration, stake and pricing, caller request and payment, request
execution, receipt, settlement or timeout, refund or slash. Every value comes from the call record
or from a live `getProvider` read against the registry — the provider's `active` flag, concurrency
cap, stake, price per call, slash bps and SLA window are read on-chain, not hardcoded. Where the
product cannot answer, the row **says so in words**: request execution reads "not indexed — the
subgraph does not record the response time" (the `calls` entity has no response timestamp), and a
provider the registry does not know reads "not registered on the registry (provider #N)". A failed
registry read is a third, distinct state ("the registry read failed, so the terms are unknown"), so
an RPC hiccup cannot masquerade as a missing provider.

- **Timeout is distinguished from a failed receipt.** A `SLASHED` call with no settlement timestamp
  is a window that closed (`claimTimeout`); one that carries a settlement timestamp is a receipt
  that did not verify. `slaStages(status, { timedOut })` carries that through to the plate sub-line
  ("no receipt in the SLA window") and the stepper.
- **A defect the rendering found.** The receipt row tested `responseHash` for truthiness, and the
  zero hash is truthy: a SLASHED call whose stage said "no valid receipt" printed
  "verified · 0x2c3d4e5f… → 0x00000000…". It now tests `/^0x0+$/`; re-measured on the same call:
  "no receipt recorded · request 0x2c3d4e5f…", with the COMPLETED call still reading
  "verified · 0x7a3f9e2b… → 0x7a3f9e2b…". Renders inspected: COMPLETED (four Done plates, all seven
  rows populated) and SLASHED (two Failed plates, "no valid receipt" / "stake slashed").
- Not exercised in a browser: the REFUNDED stage variant (the seed has no refunded call; the
  "Refund or slash" row itself was exercised and reads "neither refunded nor slashed" / "escrow
  refunded to the caller" / "provider stake slashed" by field). Recorded, not claimed.

### Row 7 — the panel's protocol states are now distinct

Measured on the mock worktree (own port 5202, its own server), each state rendered and read back:

| state | what renders | how it was produced |
|---|---|---|
| loading | 6 skeletons in the list column | first paint after the panel opens |
| populated | 6 rows, `Last indexed block 67917107 at 2:19:50 AM` | a live `_meta` read from the subgraph |
| subgraph/RPC failure | `ErrorState` "Call history is unavailable" + "This is a read failure, not an empty history." + detail `Failed to fetch` + **Retry** | the worktree's `subgraphUrl` pointed at a dead port, so the fetch really failed |
| wrong network | `ErrorState` "Wrong network" naming both chains + **Switch to Arc Testnet**; counts, filters and list withheld | a second chain configured in the throwaway worktree, then connecting the mock wallet on chain 1 |
| stale / indexing errors | "The indexer reports indexing errors, so these figures may be incomplete. Last indexed block 1 at 12:56:24 AM — 90 minutes behind, values may be stale" | a throwaway `_meta` fixture (90 min old + error flag) — a rendering fixture, not a claim about the indexer |
| no selection | detail column: "Select a transaction — Pick a row to trace its SLA lifecycle, hashes and settlement." | panel opens with nothing selected |
| wallet disconnected | not reachable from this panel: `App.tsx` gates the whole shell on a connected wallet, so the landing screen *is* that state. The branch is kept as a defensive state and is recorded as unreachable rather than claimed as verified | — |

The wrong-network action was exercised for real: pressing **Switch to Arc Testnet** moved the wallet
to Arc, cleared the state and loaded the 6 rows with the freshness line. axe on `.tx-split` in the
populated and SLASHED states: **0 violations / 17 passes / 1 incomplete**; the panel page in the
error, stale, phone and wrong-network states: **0 violations** each. No console errors in any of them.

### Row 6 — the registration form: validation, review, tx states

`Register.tsx` (the SLA-relevant configuration form — stake, price, SLA window, slash bps, max
concurrent, endpoint, signer) now validates each field against **the contract's own bounds**, read
on-chain rather than written into the UI: `ServiceRegistry.minStake` (public immutable, read with
`useReadContract` and shown next to the field), `MIN_RESPONSE_TIME = 5` (`contracts/ServiceRegistry.sol:56`)
and `MAX_SLASH_BPS = 10_000` (`:57`), which are the exact conditions the contract enforces at
`:252-253` and `:310-311`. USDC inputs are parsed with 6 decimals and a value with more than 6
decimals is **rejected rather than rounded**. Every field carries `aria-required`, a visible
required marker, and its error in a stable element referenced by `aria-describedby` with
`aria-invalid` on the input.

Measured in the browser: an invalid signer (`0x123`) on blur gives one `aria-invalid` control whose
message reads "Enter a valid EVM address (0x + 40 hex chars).", and **Review does not advance while a
field is invalid**. The review step names both wallet prompts ("This flow asks your wallet twice:
(1) approve 10 USDC, then (2) register the provider"), prints every parameter with its base units,
shows the computed allowance ("Required USDC allowance (computed) 10 USDC — Needs approval"), and
offers "← Back to editing". Submitting drives a real failure path in the mock (the mock wallet
cannot send a transaction) and the panel says so in a polite live region — "Transaction failed: The
method \"eth_sendTransaction\" does not exist / is not available." — with the submit buttons
released, and **no success is claimed**. axe over the panel: 0 violations.

Not executed **at the time of that pass** with the mock wallet: the user-rejection (4001) and
on-chain-revert branches, and a confirmed success (the mock transport cannot sign). They were
code-read only then; **all three were executed later against a scripted provider double — see
"Phase 4 — final pass" at the end of this file.** Rejection and revert copy was normalised through
the existing `friendlyError` helper in `Requests.tsx`, `Verify.tsx`, `BulkCall.tsx` and
`Payments.tsx`.

### Gates

`bun run typecheck` clean · `bun run lint` (`eslint src --max-warnings=0`) clean · `bun run build`
✓ built in 1m 34s. Dark theme only; the light theme's measured contrast gap was left untouched, as
before, pending the palette decision recorded in `docs/decisions.md`. **The final pass below closes
that gap in both themes.**

### Limits of this verification

- No real screen reader exists in this environment; the accessibility tree (`agent-browser
  snapshot`) and axe-core stand in for it (4.12.1 at the time of this pass, 4.14.0 in the final
  pass — the difference mattered, see below).
- The mock wallet cannot sign, so the rejection/revert/confirmed-success tx branches are code-read
  only (above) **— executed against a scripted double in the final pass**.
- The stale freshness line and the REFUNDED stage variant were rendered from throwaway fixtures in
  the mock worktree; both are named as fixtures here rather than as indexer behaviour.
- `--motion-fast` misuse outside the `.sla-canvas*` block was not swept.

## Phase 4 — final pass (2026-10-19): AA in both themes, corrected axe baseline, tx branches executed

### The earlier sweep was measured with the wrong axe

The "34/34 panels, 0 violations, dark theme" result recorded above came from the axe-core **4.12.1**
build embedded in the CLI. Re-running the identical sweep (same worktree, same rule tags
`wcag2a,wcag2aa,wcag21a,wcag21aa`, same 34 sidebar entries) with axe-core **4.14.0** fetched into the
page reported **109 dark-theme contrast nodes** and **18 light-theme contrast nodes** plus one
`label-content-name-mismatch` on that tree. The old number was an artefact of the tool version, not
a property of the app. Two other measurement faults were fixed at the same time:

- the first-run onboarding dialog renders over the panel and dims the page behind it, and axe
  reports the dimmed elements as contrast failures — it must be dismissed (`Skip tour`) before the
  sweep;
- the shell animates colour on theme switch (`transition: color 0.15s`), and axe reads a
  mid-transition colour as a real value: one pass measured `2.35:1` on a button that is clean at
  rest. With `transition: none` injected for the sweep, both themes report the same, stable result
  on two consecutive passes.

Final measurement: **all 34 panels, both themes, 0 violations**, with **49 dark / 54 light `color-contrast` nodes
`incomplete`** across the 34 panels (0–19 per panel) — text over gradient or translucent
backgrounds, which axe cannot resolve and which therefore stay a manual measurement.

### What changed

Dark theme — the only dark-theme visual change in this phase:

| Token | Before | Worst measured ratio | After | Worst measured ratio |
|---|---|---|---|---|
| `--text-faint` | `#4D5F76` | 2.30:1 (`--bg-2`), 101 nodes | `#7C90A9` | 4.60:1 |
| `--info` / `--pending` | `#1F77EF` | 3.66:1 (`--bg-2`) | `#3E8AF1` | 4.52:1 |
| `--danger` / `--slash` | `#EE4539` | 4.30:1 (`--bg-2`) | `#EF4E43` | 4.52:1 |
| `--on-danger` (new) | — | white on `--danger` 3.79:1 | `#06110D` | 5.34:1 |
| `--on-warn` (new) | — | `#000` on `--warn` | `#06110D` | admin button stays AA |

Light theme — every semantic ink re-measured against **its own tinted background**, not only
against white: `--danger`/`--slash` `#CE1E12` → `#BC1B10` (4.59:1 worst), `--warn` `#AA4E08` →
`#A24A08` (4.57:1), `--info`/`--pending` `#0F64D7` → `#0E5CC7` (4.55:1), plus `--on-danger` and
`--on-warn` fixed to `#FFFFFF`. Earlier light passes had cleared these tokens against white only,
which is why a tinted chip or alert still failed.

The light text ladder moved too: `--text-dim`/`--text-mid` `#667A98` → `#424F63` (worst before:
3.61:1, a kbd on `--bg-3`) and `--text-faint`/`--text-low` `#8A9BAE` → `#576A7E` (2.48:1 on `--bg-2`
before), keeping the `--text` > `--text-dim` > `--text-faint` order; `--accent-ink` `#19D186` →
`#0E7249` (1.74:1 on `--bg-2` before), while `--accent` stays bright because it is a fill, not ink.
This is a deliberate, visible light-theme change — the one the previous pass had only recorded as a
gap with candidate values.

Seventeen hardcoded colours were repointed at tokens so they follow the theme: `ProviderCard.tsx`
(reputation, honour), `Marketplace.tsx`, `Leaderboard.tsx` (the rate *text* split from the bar
*fill*), `ProviderProfile.tsx`, `Agent.tsx`, `Futures.tsx`, `Jobs.tsx`, `Providers.tsx`,
`Requests.tsx`, `Notifications.tsx` (active filter chip), `Bridge.tsx`, `Privacy.tsx`,
`BulkCall.tsx`, `RoleModal.tsx`, and the CSS rules `.admin-btn-green/-orange/-red`,
`.sla-flow-tab.active.red`, `.cg-feed-dot.red`, `.mp-tier-risk`, `.mp-val-red`, `.mp-risk`,
`.admin-alert`. Text on accent- and danger-filled controls now comes from `--on-accent` /
`--on-danger` instead of `#fff`, which also removes the one dark-theme difference the earlier pass
flagged.

`label-content-name-mismatch` (WCAG 2.5.3): the BulkCall CSV dropzone's `aria-label` ("Select CSV
file to upload") did not contain its visible text ("Click to select CSV file / or drag & drop •
columns: provider_id, payload"). The `aria-label` was removed, so the accessible name is derived
from the contents and therefore contains the visible label.

### Row 6 — the three transaction branches, executed

The mock worktree's connector was scripted at the provider level: 4001 rejection, a contract revert,
or a hash whose receipt is served as `status: "0x1"` with empty logs. wagmi's mock connector has no
`getWalletClient`, which is why `useWalletClient()` stayed `undefined` and the NFT path reported
"Connect wallet first"; the fixture supplies one built from the scripted provider, exactly as an
injected wallet would. Executed in the browser:

- **Rejection**, both entry points: `role="status"` reads "Rejected in your wallet — nothing was
  submitted."; all three review controls stay enabled; no NFT id is written.
- **Contract revert**: "Execution reverted with reason: MinStakeNotMet()." (NFT path) and
  "Transaction reverted on-chain: …" (V1 path).
- **Confirmed success**: V1 reaches the completion screen; the NFT path shows
  "⏳ Step 1/3 — minting the ERC-8004 identity NFT…", then
  "⏳ Step 2/3 — NFT #1 confirmed. Approving USDC…", then the completion screen, and writes
  `localStorage.cgAgentNftId = "1"` — success comes from the receipt, never from the hash alone.

This is a **test double**, not a real signer: it proves the panel's branching, copy and control
state, not wallet interop.

### Gates at the close of this pass

`bun run typecheck` clean · `bun run lint` (`eslint src --max-warnings=0`) clean after deleting six
imports that the rules extraction had left unused in `Register.tsx` · `bun test tests/` **22 pass /
0 fail** (the script is scoped to `tests/`, because bare `bun test` also collects
`lib/openzeppelin-contracts/test/*.js`, which need hardhat) · `bun run build` ✓ · axe as above · no
console errors in any state.

### Copy scope — resolved by restoring the original wording

`design/RULES.md:7` requires every existing field, button and copy line to be kept, and `design/PHASE_4.md`
§6 authorises a review step and the pending/success/rejection/failure states but says nothing about
rewriting copy. The first cut of this pass had rewritten the status strings. It no longer does: the
unstake lines, both NFT-path step lines, the approval line, the final `✅ Registered with NFT #…! TX: …`
line, the mint timeout/`tokenId`/missing-registry errors, the completion paragraph, the review step's
`USDC approved. Ready to register.`, the `Approve ${stake} USDC` / `Register as Provider` labels,
the `Approving…` / `Registering…` busy labels and the section title `REGISTER (basic — no NFT)` are
all verbatim again. New copy exists only for states that had no text before. The two
`toast.error` fallbacks (`Approval failed`, `Registration failed`) are the exception: they were only
reached when the error string was empty, and `friendlyError()` never returns empty, so the new flow
always states the actual reason instead. The section title keeps its original "no NFT" wording
because the default action behind that section is still the basic register; the NFT path is opt-in
on the review step.

### Re-run after the copy restore

The scripted provider was replayed on the final code, in the browser:

- **V1, rejection**: `Rejected in your wallet — nothing was submitted. Edit the form and try again.
  (User rejected the request.)`, button back to `Approve 10 USDC`, no NFT id written.
- **V1, revert**: `Transaction reverted on-chain: Execution reverted with reason: MinStakeNotMet().`,
  same button state, no NFT id.
- **V1, success**: completion screen reading `Registration complete!` / "You are now a provider on
  Arc Testnet. Start listening for call events." / `View transaction ↗` / `Register another`.
- **NFT path, success (slow provider)**: `⏳ Step 1/3 — Minting ERC-8004 identity NFT…` → `✅ NFT minted
  #1 — Step 2/3 Approving USDC…` → `✅ USDC approved — Step 3/3 Registering provider with NFT…` →
  completion screen, `localStorage.cgAgentNftId = "1"`.
- **NFT path, rejection / revert**: `❌ Rejected in your wallet — nothing was submitted.` /
  `❌ Execution reverted with reason: MinStakeNotMet().`; the NFT button stays enabled and no id is
  written.

Still a **scripted provider double**, not a real signer.

### The overlay had its own contrast failure

Dismissing `.cg-onboard` before a sweep is right for the panels and wrong for the wizard: its
`Get started →` button was white on `--accent`, **1.99:1**. It now uses `var(--on-accent)`. Audited
with the wizard open, both themes: 0 violations.

### Motion tokens — found, measured, left for a separate change

Three declarations still append a second timing function to a token that already carries one, so
they are dropped: `.ov-bars-h__track i` (`shell.css:479`, and no TSX uses that class — dead rule),
the mobile `.sidebar { transition: left … }` rule (`shell.css:806`, the drawer snaps), and `.app-shell`
`grid-template-columns` (`index.css:677`, measured `transition: all 0s` — the sidebar collapse
snaps). Not fixed here: the canvas block was in scope, the shell motion layer is not.

Still open: the 49 dark / 54 light gradient `incomplete` nodes, the three `--motion-*` declarations
above, and a real screen reader.

## Phase 5 — provider surfaces on real data (2026-10-19)

Brief: `design/PHASE_5.md` (verbatim, sha256 `96ead39f…f7345`). Checklist:
`design/phase-checklists/PHASE_5_CHECKLIST.md`. Scope: `Marketplace`, `Providers`,
`Provider details` (`provprofile`), `Rankings` (`leaderboard`); `Register` preserved untouched.

### What changed

- **One metrics module** (`src/components/panels/providerMetrics.ts`) now owns the score, the
  honor rate, USDC formatting/parsing, counting and sorting. The score is the registry's own
  formula (`contracts/ServiceRegistry.sol:572-580`): `floor(((completed + 2) * 100) / (completed +
  slashed + 3))`. An empty record scores 66 and can never reach 100. The honor rate is a separate
  metric that returns `null` when there is no denominator, so no screen prints a percentage it
  cannot support. Covered by `tests/provider-metrics.test.ts` (47 tests).
- **Marketplace** reads the registry SLA fields (`maxResponseTime`, `slashBps`) the subgraph does
  not index, with one batched `useReadContracts` call for the visible providers. The random
  "reputation trend" sparkline is gone; cards show a completed/slashed bar built from counters.
  Filters act on numbers parsed from the 6-decimal strings, sorting compares BigInt, direction
  resets per key, and loading, RPC error, no-provider and no-match are four different states.
  "Call this provider" writes `sessionStorage["callbuilder_provider"]` and opens the builder.
- **Provider details** reads one record with one multicall (`getProvider`, `getReputationScore`,
  `completedCalls`, `slashedCalls`), separates an unregistered id from a failed read, states the
  source of every value (registry / indexed / computed / unavailable), and shows the last ten
  indexed calls while failing softly if the indexer is down. Endpoint is reported unavailable,
  because `getProvider` does not return one.
- **Rankings** now ranks one fetched dataset by one of three stated rules: registry score,
  active-provider price (BigInt ascending), or slashed count. No 100 fallback, no `#000` ink, and
  the compare strip no longer reads whichever list was fetched last.
- **Providers** shows all nine registry fields with their source, distinguishes invalid id,
  unregistered id, loading, failed read and idle, and links to Provider details. The old "Ping
  endpoint" button is removed: it called `/api/ping-provider` with `?id=`, while the route requires
  `?url=` and the registry stores no endpoint, so every provider reported "Offline". The setup guide
  and snippets now use the shared card/tabs/copy/disclosure, approve USDC before `callService`
  (the contract pulls with `transferFrom`), return the `bytes32` callId from `CallStarted`, and the
  curl example carries the real `getProvider` selector `0x5c42d079`.
- **Shell fix required by the phone viewport:** at 411 px the topbar's fixed chips plus the
  hamburger, logo and breadcrumb needed 429 px, so `.app-shell { overflow: hidden }` clipped 18 px
  off the right edge of every panel. The logo now drops below 430 px (`src/index.css`); the
  hamburger still opens navigation.
- Shared primitive fix: an `AddressPill` with a link wrapped its address (`src/ui/ui.css`); the
  anchor now truncates and the copy control keeps its size.
- Marketplace hint copy (`ContextualHint.tsx:23`) no longer names an honor-rate filter that does
  not exist.

### Verification (exact commands)

```
bun run typecheck      # clean, run before each commit
bun run lint           # eslint src --max-warnings=0, clean
bun run build          # vite build, ~1m50s, dist/ is gitignored
bun test tests/        # 47 pass, 0 fail, 125 expect() calls
```

Browser: vite on port **5204** in `/tmp/opencode/wt-p5` (the repo's 5173 was left alone), with a
mock-wallet fixture in that worktree only. Real data: provider #1, price 1 USDC, response window
120 s, slash 2000 bps (2 USDC per slashed call), stake 10 USDC, score 66, NFT #897335, 0 calls.

| Check | Result |
|---|---|
| Marketplace filters (price, stake, score, response, callable, NFT), reset, invalid amount | filter counts change, `aria-invalid` + inline error on a negative/NaN price, reset clears all |
| Sorting | `Lowest price` sorts 1 USDC first with `↑`; direction flips per key |
| Unregistered id `#999` vs RPC error | empty state "No provider is registered under #999"; failed read is a separate error state with Retry |
| Cross-panel navigation | card → Provider details; Call → Call builder prefilled from `sessionStorage` |
| Rankings tabs | score / price / slashed each render their stated rule; "Most slashed" shows its own empty state |
| Providers lookup | #1 renders nine fields + sources; `0` shows the inline field error and disables the actions; #999 renders the unregistered state |
| Viewports | 1280×900, 834×1000, 411×900: no element extends past the viewport in any of the four panels |
| Themes | dark and light both rendered and audited |
| Keyboard | Tab from the id field through actions, address links, copy buttons, disclosure, tabs: every stop has a visible ring (`2px` outline or `3px` focus shadow) |
| Reduced motion | global `@media (prefers-reduced-motion: reduce)` block (`index.css:2450-2462`) neutralises every transition this phase added; nothing new animates |
| Console | 0 window errors, 0 unhandled rejections and 0 `console.error` calls across a fresh-tab navigation of all four panels (in-page hook, because the CLI console buffer is global across tabs and still held 12 earlier Vite HMR artifacts from copying files into the worktree) |

axe-core 4.14.0, tags `wcag2a,wcag2aa,wcag21a,wcag21aa`, transitions/animations disabled before
the sweep:

| Panel | Dark | Light |
|---|---|---|
| Marketplace | 0 violations (411 px) | 0 violations (1280 px) |
| Provider details | 0 violations (1280 px, 411 px) | 0 violations (1280 px) |
| Rankings | 0 violations (411 px) | 0 violations (1280 px) |
| Providers | 0 violations (1280 px) | 0 violations (1280 px, 411 px) |

`color-contrast` nodes axe leaves `incomplete` on the Marketplace controls (3 selects with a
background-image arrow, 3 glyph buttons, 2 decorative `·`) were measured by hand: 15.53:1, 15.53:1,
5.45:1, 7.24:1 for the text/glyph pairs. One real failure was found and fixed this way:
`scrollable-region-focusable` on the horizontally scrolling snippet `<pre>` at 411 px.

### Limits recorded, not hidden

- Only one provider exists on Arc Testnet, so multi-provider states (the compare modal, ranking
  order beyond one row, pagination past 20) cannot be exercised against real data.
- No real screen reader in this environment; the accessibility tree and axe stand in.
- The subgraph indexes neither `maxResponseTime`, `slashBps` nor `endpoint`; the first two come
  from the registry, the third does not exist anywhere.
- Out of scope and still unsupported: `CallBuilder.tsx:32` ("High chance of timeout" from an honor
  rate), the RepFi hint's "> 90% honor rate" loan claim, `Agent.tsx:290` ("scores providers by
  honor rate") and the marketing page's "ranked by on-chain honor rate". Recorded in `docs/audit.md`.

## Phase 6 — Call Builder and transaction UX (2026-10-20)

Prompt delivered in chat; `design/PHASE_6.md` does not exist (recorded in the checklist, not
invented). Plan: `design/PHASE_6_PLAN.md`. Evidence: `design/phase-checklists/PHASE_6_CHECKLIST.md`.

| Requirement | Status | Evidence |
|---|---|---|
| Provider → builder identity, endpoint, record states | PASS | `getEndpoint` read gated on the loaded record; unknown id, RPC failure, inactive and unstaked providers block submission with the contract's own reason |
| Cost transparency, exact integers, estimate vs charge | PASS | `lib/callCosts.ts` (BigInt only); escrow = `pricePerCall`, no protocol fee; fee shown as an estimate or "unavailable" |
| Wallet/network/balance preconditions | PASS | allowance, USDC balance, native balance, open-call cap and chain read live; `wrong-network` blocks |
| Transaction lifecycle (hash ≠ confirmation) | PASS | `lib/txLifecycle.ts`; rejection, submitted, confirmed, reverted, unreadable-receipt each have their own state; explorer link only after a hash exists |
| Timeout/refund/slash labels | PASS | Claim waits for its receipt and prints the decoded `CallSlashed` amounts, or says they are unverified |
| Duplicate submissions | PASS | `submittingRef` + `checkNoPendingTx` + disabled controls while any stage is active |
| Tests | PASS | `bun test tests/` → 82 pass, 0 fail (24 new: `call-costs`, `tx-lifecycle`) |
| Gates | PASS | `bun run check` exit 0; `bun run build` exit 0 |
| Responsive | PARTIAL | 411 px (dark + light) and 1280 px (light) checked, no horizontal overflow; 834 px not re-measured this phase |
| Keyboard / screen reader | PARTIAL | labels, `aria-invalid`, `aria-describedby`, `role="status"` verified in the DOM; no screen reader available; keyboard traversal not exhaustively exercised |

Fixed here: the invented 100 % honor rate and its causal claim; "No gas required" / "Gas-free ·
EIP-3009" copy on the on-chain path; "✅ Receipt submitted — escrow released" before confirmation;
`claimTimeout` never waiting for a receipt; the 1 USDC batch fallback; float cost maths.

Disabled here: the CCTP path. `CrossChainReceiver.handleReceiveFinalizedTransfer` requires 96 bytes
of `hookData`, which the panel's `depositForBurn` does not send, so the bridge could never create a
call. The selector and the action remain, the CTA is disabled and explains why. Fixing it is a
separate change (hook-encoded burn) and was not authorised.

## Phase 7 — Call history, activity and notifications (2026-10-20)

Prompt delivered in chat; `design/PHASE_7.md` does not exist (recorded in the checklist, not
invented). Plan: `design/PHASE_7_PLAN.md`. Evidence: `design/phase-checklists/PHASE_7_CHECKLIST.md`.

| Requirement | Status | Evidence |
|---|---|---|
| History uses only indexed fields | PASS | `calls` entity: `id providerId amount status createdAt completedAt requestHash responseHash refunded slashed`; a missing amount renders `—`, never `0` |
| Transaction hash / explorer link | PARTIAL | The subgraph `Call` has no transaction hash, so the detail pane says "not indexed" and no link is invented; notifications can link because event logs carry the hash |
| Submitted vs confirmed vs completed | PASS | Call rows show indexer status; detail says a receipt makes escrow *claimable*, not withdrawn; notifications are mined logs, labelled as such |
| Dedupe and deterministic order | PASS | `normalizeCalls` + tests; ties break by call id; repeated refresh does not add a row |
| Filters, search, pagination, export | PASS | Status filters, call-id/provider search, clamped pages, CSV escaping, no zero fallback; the unreachable `REFUNDED` filter was removed |
| Notification identity and persistence | PASS | Dedupe key `txHash:logIndex:event`, per-account `cg_notifs_v3:<address>`, sanitised on load, capped at 50 |
| Notification truthfulness | PASS | Global logs labelled network-wide with caller; "Listening while this panel is open"; stream errors shown; no success claim from a request |
| Refresh / polling / account change | PARTIAL | Existing 15–30 s polling and `useQuery` keys per wallet; no explicit invalidation after a confirmed transaction (next poll), indexer lag is stated in History |
| Loading / empty / error distinction | PASS | History (empty vs filter-empty vs RPC error vs stale), Requests (error vs empty), Receipts (error vs empty), Notifications (no alerts vs filter-empty vs stream error) |
| Accessibility / responsive | PARTIAL | 411 px and 1280 px, no horizontal overflow; `aria-pressed`, `role="status"`, labels, 44 px filter targets; keyboard traversal and screen reader not exhaustively tested |
| Tests / gates | PASS | `bun run check` exit 0; `bun test tests/` 97 pass, 0 fail; `bun run build` exit 0 |
| Docs | PASS | This file, `decisions.md`, `audit.md`, `panel-inventory.md` |

Data sources: Goldsky `calls` entity (History, Requests, Receipts, Overview list) and direct
`useWatchContractEvent` logs on `PayPerCall` (Notifications, Overview live strip). No new store,
dependency, contract or address change; nothing committed, pushed or deployed.

## Phase 8 — Reliability, recovery and verification (2026-10-20)

Scope/acceptance: `design/PHASE_8.md` (new). Evidence: `design/phase-checklists/PHASE_8_CHECKLIST.md`.
Starts from the pre-Phase 8 audit; Phase 6/7 work is preserved, not rewritten.

| Requirement | Status | Evidence |
|---|---|---|
| Unknown transaction outcome keeps the pending marker | PASS | Call/x402/approval/batch paths no longer clear the marker on an unread receipt; `readPendingTx()` reads it on mount; the recovery check is read-only |
| Pending recovery UI | PASS | "Check receipt" reads the stored hash only; browser-run against real Arc transactions (confirmed, reverted, unknown) |
| Native gas readiness | PASS | `assessCall` adds a native-balance input, a `native-gas` blocker and a low-gas warning; `tests/call-costs.test.ts` |
| Claim/receipt simulated before writing | PASS | `claimTimeout` and `submitReceipt` are simulated first, so a would-revert claim is reported before gas is spent |
| Verify uses the real verdict | PASS | `classifyVerdict` maps `HONORED`/`COMPLETED`/`PENDING`/`VIOLATED`/`SLASHED`/unknown; API `UNKNOWN` and non-JSON bodies fall through to the RPC/tx fallback; `tests/tx-lifecycle.test.ts` |
| Transaction lookup ≠ receipt verification | PASS | "Transaction Confirmed" with explicit copy; explorer link is `/tx/<hash>` only |
| x402 fallback is gated per provider + request | PARTIAL | Fallback only on a `PRE_SETTLEMENT` response whose nonce state was checked and whose error is allowlisted (for example `Provider not active`). A valid hash is never overridden by `demo:true`/`settled:false`; contradictory or malformed responses stay uncertain and keep the guard. The guard now blocks the direct call, batch and CCTP paths for the same attempt, not only the x402 button. It is tab-scoped and is not a global no-duplicate-payment guarantee; see the limitations below. |
| Targeted invalidation after confirmed writes | PASS | `refreshAfterSettlement` invalidates balances/allowance/open calls/subgraph/providers/activity/network stats |
| Requests claim consistency | PASS | Chain guard, claim simulation, pending guard, receipt-status classification, invalidation, no fabricated refund/slash amounts |
| Accessibility / responsive | PASS | Live regions and `aria-busy`; SLA labels re-associated; light-theme SLA label contrast 16.26:1; 834 px and 411 px show no horizontal overflow |
| Tests / gates | PASS | `bun run typecheck`, `bun run lint`, `bun test tests/` (101 pass at that stage; 138 after the review fixes), `bun run build` all exit 0 |
| Live E2E (happy path, timeout) | BLOCKED | `ARC_RPC_URL`, `CALLER_PK`, `PROVIDER_PK` absent; no `.env`; `scripts/e2e-lifecycle.js` not wired into `package.json` |
| Screen reader / keyboard-only run | UNVERIFIED | Not available in this harness |
| Wallet-signed browser writes | BLOCKED | No browser wallet; write paths covered by code/unit tests and the read-only recovery UI |

Browser verification used Chromium via the agent-browser MCP. Wallet-gated panels were reached
with a temporary, read-only `?audit=1` bypass in `src/App.tsx`; it was reverted, and
`git diff -- src/App.tsx` is empty. No contract, address or dependency change; nothing committed,
pushed or deployed.

### Phase 8 post-review fixes (2026-10-20)

An independent review found four issues; all four were fixed. `Verify` receipt submission now
preflights with `simulateContract`; a facilitator settlement guard
(`src/lib/facilitatorGuard.ts`, key `cg_facilitator_unsettled`) blocks only that
provider + request attempt until the user acknowledges it; a dropped/replaced pending marker has
an explicit, confirmed recovery action that sends nothing; and the Phase 8 docs were corrected.

A second read-only review found fail-open storage handling. The follow-up hardening makes the
guard fail closed: a `prepared` marker is persisted and read back *before* the facilitator
request, unreadable or corrupt storage blocks payments instead of looking like "no unresolved
payment", and only an explicitly allowlisted pre-settlement 402 error, demo/no-settlement, or a
confirmed/reverted transaction clears the marker. `beginGuardedFacilitatorRequest` starts the
request only after that read-back, and tests prove its callback is skipped when storage cannot be
read, written or verified. `src/lib/facilitatorOutcome.ts` owns the fallback decision. If the
facilitator returns a hash but pending-marker storage fails, the hash is still shown with an
explorer link and the durable x402 marker keeps the retry blocked; `setPendingTx`/`clearPendingTx`
report verified success, and `Verify`/`Requests` surface a failed write instead of claiming
success.

A third read-only review found that HTTP 402 was treated as unconditionally pre-settlement even
for `Nonce already used`, which is returned after the authorization nonce has been consumed. The
fix permits fallback only for an explicit allowlist of errors emitted before
`callServiceWithAuthorization`; `Nonce already used`, unknown 402 errors, and 402 responses that
claim success or a hash stay uncertain. `CallBuilder` keeps the guard, sends no fallback, shows
the reason, and offers a read-only transaction-history check and explicit acknowledgment. The
decision and guard-retention rules have unit tests; the UI remains code-inspected.

A fourth review found two payment-safety gaps: the guard only disabled the x402 button, so the
direct call and batch paths could still start a payment, and a facilitator response with a valid
hash plus `demo:true`/`settled:false` could clear the guard. The follow-up adds one
`checkFacilitatorGuard` decision used by every payment handler immediately before its write,
disables all payment CTAs while the guard is active or unreadable, and keeps a valid hash as
uncertain when the response contradicts it. `api/call-service.js` now checks the authorization
nonce before signature, validity, target, provider and value validation, and returns structured
`PRE_SETTLEMENT` or `AUTHORIZATION_ALREADY_USED` codes. A malformed payment request returns
`PAYMENT_REQUIRED`, which is never fallback-eligible. Replayed authorizations therefore cannot
receive a pre-settlement result through a later validation failure.

Tests grew to 168 pass / 0 fail / 481 expect() calls / 10 files. `bun run typecheck` and
`bun run lint` are clean; `bun run build` passed in 1m42s with only the existing large-chunk
warnings. Limits unchanged: live E2E, wallet-signed writes, keyboard-only and screen-reader runs
remain unverified; no component-level test runner exists, so the handler wiring is inspected and
the shared pure gate, classifier and API ordering are unit-tested. `sessionStorage` is per tab,
and when it is unavailable all payment starts are blocked rather than allowed. At that stage no
server-side idempotency store was wired; Stage 1/2 now exist in the working tree but production is
still inactive (see the Idempotency Stage 1/2 section), so the shipped guarantee remains scoped to
the current tab's guarded provider + request attempt, not a global "pay at most once" guarantee.

A fifth review found the remaining P0 gaps. `src/lib/paymentGate.ts` is now the single
fail-closed start decision: it combines the durable `cg_pending_tx` marker, an in-memory record of
a hash whose marker write or read-back failed, a per-tab operation lock, the CCTP operation marker
and the facilitator guard. Every payment-starting handler calls it immediately before its write
(Call Builder call/x402/batch/CCTP/claim/receipt, the Verify/Receipt claim paths, both Bulk Call
loops, Overview multi-call, the Bridge and the Payments transfer); each loop re-checks before
every item and stops if the marker cannot be persisted. A failed marker write keeps the hash in memory and blocks further
payments, including programmatic ones, until a verified clear; the UI states that a reload will
forget it.

The Bridge panel uses the same CCTP marker, verifies the relay's hash on Arc before claiming a
mint, and keeps the marker when the relay returns no hash.

CCTP now has its own durable stage marker (`cg_cctp_operation`): `started`, `approval-pending`,
`approval-confirmed`, `burn-pending`, `burn-confirmed`, `mint-pending`, `mint-confirmed`. Each
stage is written and byte-verified before its write, hashes are preserved, and only forward
transitions are accepted. A reverted approval/burn/mint may clear the marker because that stage
provably did nothing; an unknown receipt, a storage failure or an attestation error keeps it, so a
second burn or mint is refused and manual recovery is required.

The client no longer trusts facilitator claims. `facilitatorOutcome` has two outcomes: `settled`
(a hash, which the client still verifies by reading the receipt itself) and `uncertain`. A
`PRE_SETTLEMENT` code, `demo:true` or `settled:false` no longer clears the guard or starts an
automatic on-chain fallback; `permitsOnChainFallback` always returns false. The guard is cleared
only by independent receipt evidence or an explicit user acknowledgment. As a consequence, demo
mode now leaves a warning that must be acknowledged before the next x402 attempt.

Guard writes also refuse a same-attempt downgrade (`prepared`/`uncertain` after `submitted`) and
never drop an existing transaction hash. Acknowledgment and discard controls refuse while a write,
facilitator request or receipt wait is running.

Tests grew to 207 pass / 0 fail / 640 expect() calls / 12 files. `bun run typecheck` and
`bun run lint` are clean; `git diff --check` is clean. The build was not rerun in this round.

Limits unchanged and still material: no server-side idempotency store was wired at that stage;
Stage 1/2 now exist but are inactive (see below), and there is no authenticated facilitator
outcome, so the shipped guarantee is per tab and per `providerId + requestHash`, not global
at-most-once settlement; a reload loses an unpersisted hash (the UI says so); a single
nonce read is never treated as proof; cross-tab, cleared-storage and direct contract calls are not
covered. The Agent wallet writes and the Lending deposit still have no pending marker. CCTP remains disabled in the UI. No component-level test runner exists, so handler wiring
is inspected and the pure rules are unit-tested; keyboard-only and screen-reader behaviour remain
unverified.

## Idempotency Stage 1/2 — prepared, not active (2026-10-21)

Stage 1 (`api/_idempotency.js`, `api/_idempotency_state.js`) and Stage 2
(`api/_upstash_idempotency_store.js`) are present in the working tree but are not committed,
deployed, or wired into the production default handler. `defaultHandler` still calls `handler`
without an `idempotencyStore`; production idempotency remains off.

Stage 1 is a pure state machine for operation and nonce-reservation records: forward-only
transitions, explicit revisions, recovery leases, and versioned records. Legacy v1 `prepared`
records stay read-only because they may already own a signed transaction. Stage 2 is an opt-in
Upstash REST `EVAL` adapter with create-if-absent and state + revision compare-and-set; it never
uses `/pipeline`, never falls back to memory, and fails closed on transport, HTTP, or payload
errors. It does not allocate sender nonces, sign transactions, persist raw signed transactions,
claim recovery leases, or activate production idempotency.

The opt-in real integration test exists at
`tests/upstash-idempotency-store.integration.test.ts`. It is skipped unless
`UPSTASH_IDEMPOTENCY_INTEGRATION=isolated-test-db`; it reads only dedicated
`UPSTASH_TEST_REST_URL` / `UPSTASH_TEST_REST_TOKEN`, requires an HTTPS URL whose hostname exactly
matches `UPSTASH_TEST_EXPECTED_HOST`, and verifies a SHA-256 of the database marker at
`callguard:test:db-identity` before creating clients. A missing or mismatched marker stops after
one read-only `GET`; no write, `SCAN`, or `DEL` runs. Cleanup is limited to the generated
`callguard:test:idempotency:<uuid>:` prefix, and the marker is outside that prefix. The real
isolated database has not been provisioned or contacted, so only fake-fetch tests have run.

Current local evidence (2026-10-21): `bun test tests/` → **377 pass / 4 skip / 0 fail / 1444
expect() calls / 30 files**; `forge test -vv` → **300 pass / 0 fail / 11 suites**; `bun run check`
and `bun run build` exit 0. The four skipped tests are the opt-in real Upstash integration suite.
No commit, push, deploy, wallet operation, or real Upstash request was performed. Local `.env` is
absent, so `bun run check-env` was not run; deploy variable names are listed in `.env.example` and
`check.js`. CCTP remains disabled in the UI because the panel's burn has no 96-byte hook data for
`CrossChainReceiver`.

Remaining blockers before activation: sender/nonce strategy, durable raw signed-transaction
persistence, recovery-worker host/scheduler, bounded receipt wait, and replacement policy. Stage 3
and cross-endpoint idempotency remain unauthorised.

## Production v7 alignment — prepared, not deployed (2026-10-21)

Read-only inspection of deployment `3d858a2ffed9d73a086fc89a34490508e2a37b26` found a split
configuration. The deployed client bundle contains the v7 addresses, but the deployed server
routes still read `VITE_SERVICE_REGISTRY` / `VITE_PAY_PER_CALL` from the Vercel runtime
environment, which carries retired values (`0xdb73903c904f83251bc345e591a769e0a4ca32d9` and
`0xcdbfb84aabd49785862c5ccb981e9af8f96efd0a`). `/api/marketplace` therefore advertised the old
contracts, and `/providers/1` read the old registry. The basic demo is **not verified** on this
deployment.

The smallest code fix is `api/_contracts.js`, the server-side v7 source of truth, used by
`marketplace`, `call-service`, `provider-page`, `auto-receipt`, `notify-provider`, `attestation`,
and `energy-data`. These routes no longer let retired server env values choose the contracts. No
Vercel environment setting was changed.

`VITE_*` variables are build-time inputs. Vite inlines them into the browser bundle during
`bun run build`; they are not read by Vercel Functions at request time, and changing them does not
change an already-built bundle. The current client does not read these address variables at all:
`src/lib/config.ts` hardcodes the v7 registry and PayPerCall addresses. Server routes read runtime
environment variables at invocation time. After this fix, the changed routes use canonical v7
addresses and ignore `SERVICE_REGISTRY`, `PAY_PER_CALL`, `USDC_ADDRESS`, `CHAIN_ID`,
`VITE_SERVICE_REGISTRY`, `VITE_PAY_PER_CALL`, `VITE_USDC_ADDRESS`, and `VITE_CHAIN_ID` for those
values. Runtime configuration still includes `ARC_RPC_URL`, `FACILITATOR_ADDRESS`,
`SELLER_ADDRESS`, `FACILITATOR_PRIVATE_KEY`, `PROVIDER_<id>_KEY`, `PROVIDER_WEBHOOK_SECRET`,
`CIRCLE_API_KEY`, and the E2E-only `CALLER_PK` / `PROVIDER_PK`.

`/api/marketplace/health` returned the SPA because `vercel.json` had no route for it and the
catch-all `/(.*) -> /index.html` won. The fix adds
`/api/marketplace/health -> /api/marketplace?health=1` before the catch-all and teaches the
marketplace handler to accept that query. This is prepared locally; the live deployment still
returns HTML until a redeploy.

Auto-receipt no longer falls back to `SELLER_PRIVATE_KEY`. It requires
`PROVIDER_<id>_KEY`, reads the active v7 provider from `ServiceRegistry`, and refuses to submit
unless the wallet address equals the registered `signer`. The deployed provider 1 signer is
`0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da`; the deployed seller is
`0x9adEDa85604C205791B98B4C239b5625688a4ba5`, so the old fallback was the wrong signer.
`PROVIDER_1_KEY` and `PROVIDER_WEBHOOK_SECRET` are still absent, and POST remains gated by the
missing webhook secret.

`scripts/e2e-lifecycle.js` now uses the canonical v7 PayPerCall and USDC addresses, its `getCall`
tuple matches the v7 eight-field `Call` struct, it preflights the active provider signer against
`PROVIDER_PK`, and it prints only the RPC origin rather than a URL that could contain a token. It
was syntax-checked, not executed; no wallet or network operation ran.

Local evidence for this change (2026-10-21): `bun test tests/` → **382 pass / 4 skip / 0 fail /
1460 expect() calls / 30 files**; `bun run typecheck` and `bun run lint` exit 0. The four skipped
tests are the opt-in isolated Upstash suite. The prior `forge test -vv` result remains **300 pass /
0 fail / 11 suites**; Foundry was not rerun for this change. `bun run build` was not rerun. No
commit, push, deploy, Vercel environment change, wallet signature, USDC spend, secret read, CCTP
change, idempotency activation, or `/root/projects/onur-mock` sync was performed.

Remaining live-demo blockers: the above changes are not deployed; `PROVIDER_1_KEY` must be
provisioned for signer `0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da` before auto-receipt can work;
`PROVIDER_WEBHOOK_SECRET` must be set before POST is accepted; and a live `callService` plus
provider-signed `submitReceipt` still needs an explicit approval to sign and spend USDC. Until
then, use a direct on-chain `callService` and a manual provider receipt, not x402 or auto-receipt.

## Phase 1.1 — semantic type and interaction layer (2026-10-21)

Phase 1.1 closed the remaining Phase 1 foundation gaps without changing panel behaviour or
transaction/API semantics:

- `src/index.css`: nine-step type scale (`--fs-2xs` … `--fs-3xl`), line-height, weight, tracking
  and tabular-numeric tokens; `--text-disabled` in both themes; `--accent-hover` and
  `--accent-pressed`; `--control-h-sm` / `--control-h` / `--control-h-lg`.
- `src/ui/ui.css`: every `font-size`, `line-height`, `font-weight`, `letter-spacing` and
  `font-variant-numeric` declaration now uses the token layer; matched padding/gap values moved to
  `--sp-*`, card/field dimensions use `--card-pad` / `--control-h*`. Added pressed states for every
  button variant, disabled text for inputs/selects/textareas/switches/checkboxes, and moved primary
  hover/link hover to `--accent-hover`.
- `src/ui/Popover.tsx` + `src/ui/index.ts`: non-modal disclosure primitive. The trigger is a native
  button with `aria-expanded`, `aria-controls` and `aria-haspopup="dialog"`; Escape and outside
  pointer close it; opening focuses the first focusable child; the panel animation is disabled by
  `prefers-reduced-motion`.
- `tests/design-tokens.test.ts`: contract test for the token set, both theme state overrides, the
  absence of raw type values in `ui.css`, and the Popover export.

Verification (2026-10-21): `bun run typecheck` exit 0; `bun run lint` exit 0; `bun test tests/` →
**385 pass / 4 skip / 0 fail / 1500 expect() calls / 31 files**; `bun run build` exit 0 (Vite
chunk-size warnings only). Browser at `http://localhost:5174`, phone viewport: landing rendered in
dark and light; computed `--fs-base` 13px, `--lh-base` 1.5, `--text-disabled` `#5C6F86` (dark) /
`#8A9BAE` (light), `--accent-pressed` `#14B874`; `.ui-popover__panel` and the reduced-motion rule
were present; console errors none. Application panels remain wallet-gated, so the Popover was not
exercised inside a mounted panel. No commit, push, deploy, contract/API/wallet change, or CCTP
activation was performed.

## Phase 2 — premium application shell and navigation (2026-10-21)

Phase 2 was an audit-and-close pass over the existing shell, not a rebuild. The shell already
existed in commits `22eda23`, `0fa1ba6` and `3581ac6`; this pass verified it and closed the
remaining gaps in shell chrome, focus handling, mobile state and command-palette semantics.

- `AppShell.tsx`: added a keyboard `Skip to main content` link targeting `#main-content`; the
  drawer focus trap now filters zero-rect/hidden elements, so the mobile-only hidden
  `.sidebar-collapse-btn` can no longer become the wrap target.
- `AppTopbar.tsx`: the wrong-chain pill performs a real `switchChain({ chainId: arcTestnet.id })`
  with a pending label and the ConnectKit modal as fallback; Connect uses the shared `Button`;
  Simple/Pro expose `aria-pressed`; theme labels state the destination; the command-palette
  trigger has an accessible name; network and copy changes are announced; the wallet menu moves
  focus to `Copy address`, supports Arrow/Home/End/Escape, restores the trigger, and closes on
  Tab into the next topbar control. `aria-controls` is emitted only while the menu exists.
- `CommandPalette.tsx`: the panel is now `role="dialog"` with `aria-modal` and an accessible name;
  Tab/Shift+Tab wrap inside the dialog; closing restores the previous focus target.
- `shell.css`: shell chrome typography, spacing, radii, elevation and motion use the Phase 1
  tokens; `#06110d` became `--on-accent`; `touch-action: manipulation` and
  `overscroll-behavior: contain` were added; the mobile bottom-nav active item gained an 18×2px
  accent bar in addition to colour; the closed offscreen drawer is `visibility: hidden` with a
  delayed transition; the skip link participates in both reduced-motion guards.

Browser evidence on the mock-wallet worktree at `http://localhost:5179`:

- **34/34** sidebar destinations clicked at 1280×900 with **34 unique ids, 0 mismatches** between
  the clicked id, `aria-current`, breadcrumb and `.app-panel`.
- No horizontal overflow at **1280, 834 or 411** (`scrollWidth === innerWidth`). Tablet expanded
  rail measured `232px / 602px`; phone grid measured `411px`; mobile nav 63px.
- Drawer at 411×900: `body { overflow: hidden }`, overlay active, sidebar `left: 0`; Escape closed
  it to `left: -260`, `visibility: hidden` after 260ms and returned focus to the hamburger.
- Skip link exposed at `top: 6.8px` with a 2px accent ring; Enter focused `MAIN#main-content`.
- Drawer trap: first `Overview`, last visible `Privacy`, Shift+Tab wrapped to `Privacy`.
- Command palette: `role="dialog"`, `aria-modal="true"`, input focused, Tab wrap both directions,
  `Ctrl+K` → `privacy` → Enter activated the Privacy panel, Escape restored the trigger.
- Wallet menu: open focused `Copy address`, ArrowDown moved to `Disconnect`, Escape restored
  `.tb-wallet`, Tab moved to `.tb-cmd`.
- Theme: light and dark tokens measured (`--bg-0` `#F1F5FA` / `#000D1A`).
- OS reduced motion: `data-motion="reduced"` and computed `transition: none` on shell, panel,
  mobile nav and skip link. In-app pref set through the store produced the same result and
  returned to `data-motion="full"` when cleared.
- Wrong chain: a test-only chain 1 was added to the mock worktree; the topbar showed
  `Wrong network`, clicking the pill switched back to Arc and it became `net-pill ok` /
  `Arc Testnet`.
- Axe 4.12.1: **0 violations**; 1 unresolved `color-contrast` group (51 nodes) on translucent or
  gradient surfaces. Console had no app errors. Four `429` responses came from
  `https://rpc.testnet.arc.io/` during the repeated sweep; this is an external RPC rate limit.

Gates: `bun run typecheck` exit 0; `bun run lint` exit 0; `bun test tests/` → **385 pass / 4 skip /
0 fail / 1500 expect() calls / 31 files**; `bun run build` exit 0 (existing chunk-size warnings
only); `git diff --check` exit 0. Phase 1.1 changes and every unrelated working-tree change remain
uncommitted and preserved. No commit, push, deploy, contract/API/wallet change, or CCTP activation
was performed. Screen-reader and live-signature verification remain out of scope for this
environment; the mock harness never signed or sent a transaction.

## Phase 3 — premium Overview dashboard (2026-10-21)

Phase 3 replaced the Overview panel body with a metric-led operations dashboard. It did not
change contracts, API routes, settlement logic, wallet connection, panel ids or navigation.
The existing 30-second subgraph query, the `useWatchContractEvent` subscriptions, the payment
guard and the auto-router / multi-call handlers were kept.

### Implementation

- New `src/components/overview/` modules: `types.ts` (subgraph shapes), `format.ts` (USDC,
  count, id, timestamp and status helpers), `OverviewUi.tsx` (metric, chart, Live Network and
  Recent Activity components) and `overview.css` (all `ovd-` styles). The shared `.ov-` classes
  remain because other panels still use them.
- `src/components/panels/Overview.tsx` now renders the status strip, four metric cards, 24-hour
  activity and SLA-outcome charts, Live Network, Recent Activity, Next actions, Operations,
  Transaction flow, Contract endpoints, wallet balance, welcome steps and the existing role CTA
  and event stream.
- `src/ui/SectionCard.tsx` accepts an optional `titleAs`; Overview uses `h2` section headings
  while every other panel keeps the existing default.
- The network query is bounded to `first: 1000` for calls and providers. The panel discloses
  that cap, says when a count is only the indexed count, and does not claim a percentage change
  when the call window is truncated.
- No dependency was added. No contract, API, subgraph mapping, facilitator or transaction
  semantics were changed.

### Data audit

Live Goldsky query on `callguard-v7/1.1.0`, 2026-10-21:

- calls: `[]`; `_meta.block.number` `68313689`; `_meta.block.timestamp` `null`;
  `hasIndexingErrors` `false`; deployment `QmP26iyD1my5ib1rVyu1oM3XaFV39Brf32PgX9hzgRDk99`.
- providers: `[{"id":"1","active":true,"pricePerCall":"1000000","stake":"10000000",
  "completedCalls":0,"slashedCalls":0}]`.
- `ServiceRegistry.nextProviderId()` returned `2`, so the displayed provider count is `1`.

Every Overview figure maps to one of these sources:

| Figure | Source | Live result |
|---|---|---|
| Calls indexed | length of `calls(first: 1000)` | `0` |
| Providers | on-chain `nextProviderId() - 1` | `1` |
| Escrowed | sum of `amount` on `STARTED` / `OPEN` / `PENDING` calls | `0.00` USDC |
| SLA success | `COMPLETED / (COMPLETED + SLASHED)` | unknown (`—`); no settled calls |
| 7-day sparkline / change | `createdAt` daily buckets from the same call list | no series and no percentage claim |
| Call activity | hourly `createdAt` buckets, last 24 hours | measured zero |
| SLA outcomes | current `status` on every indexed call | empty indexed set |
| Live Network | active / price / stake / completed / slashed provider fields | 1 of 1 active; 1.00 USDC; 10.00 USDC stake |
| Recent Activity | newest indexed calls, exact id | empty indexed set |
| On-chain Events | wagmi watchers for `CallStarted`, `ReceiptSubmitted`, `CallSlashed` | no events this session |
| Contract endpoints | the configured v7 addresses | explorer links only; no health probe is implied |

The subgraph does not index a transaction hash for a call, so Recent Activity shows the call id
and the existing Verify destination. Rows in the live event stream link to the real transaction
hash when the log has one. The `Indexer` status item omits the "indexed … ago" suffix when
`_meta.block.timestamp` is `null`; it still shows the indexed block and measured lag.

### Verification

Browser checks used the mock-wallet worktree at `/tmp/opencode/cg-phase2-mock` with the real
Goldsky endpoint restored after each test. Populated states used a test-only CORS fixture served
at `127.0.0.1:5199`; no fixture is in the repository and no production data was altered.

- Empty real state at **1280×900**, **834×1000**, **411×900** and **375×812**: zero calls, one
  provider, `0.00` escrow, unknown SLA success, empty chart/outcome/activity states and the
  "indexer timestamp unavailable" note. `scrollWidth === innerWidth` at each width.
- Populated fixture: metric values, 24-hour bars, Refunded outcome row, one active provider,
  recent rows with long call ids, Copy and Verify actions, and stale badges. The 5-second
  delayed fixture showed skeleton loading, then the populated cards.
- Failure states: stopping the fixture and refreshing kept the old data and marked it cached;
  reloading with the fixture down showed error cards and `—` values, not zeros. Empty and
  populated states were checked in light and dark themes; the failure states were checked in
  light.
- Headings: one `h1` (`Overview`), `h2` for every section and `h3` inside Live Network.
- Axe 4.14.0 (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, scoped to `.ovd-page`): **0
  violations** in light and dark; 3 unresolved `color-contrast` nodes in the final empty state
  and 5 in the earlier populated run, where axe could not read the background (metric values
  and ring text on pseudo/overlapping surfaces). The bundled CLI axe 4.12.1 also reported 0
  violations (59 incomplete nodes).
- Visible controls at desktop: 102; unnamed controls: 0; images without `alt`: 0. Keyboard
  focus on Refresh, Call Builder, View providers, View all, Copy call id and Verify produced a
  2px accent outline or a 3px accent ring.
- Reduced motion: `prefers-reduced-motion: reduce` and `[data-motion="reduced"]` both computed
  `animation-name: none` and `transition-duration: 0s` for the metric value and chart bars.
- Console: no application errors. The mock harness still emits its existing Vite
  `createRoot()` hot-reload warning; it is a harness artifact, not an Overview error.

### Gates and limits

`bun run typecheck` exit 0; `bun run lint` exit 0; `bun test tests/` → **385 pass / 4 skip /
0 fail / 1500 expect() calls / 31 files**; `bun run build` exit 0 (existing chunk-size warnings
only); `git diff --check` exit 0.

Honest limits: there is no screen-reader harness; the mock connector cannot sign, so no live
wallet-signed transaction was performed; the event stream stayed empty because the contracts
did not emit during the session. A 320px viewport is clipped by the existing shell topbar
min-content width (363px), not by an Overview rule; 375px and 411px are clean. No push, deploy,
contract/API change or CCTP activation was performed.

Committed as `feat(overview): rebuild as live protocol operations dashboard`.
`Overview.tsx` carries the pre-existing payment-gate, live-event and USDC-balance edits plus the
four lib modules they import (`activity.ts`, `paymentGate.ts`, `facilitatorGuard.ts`,
`cctpOperation.ts`); separating those from the Phase 3 rewrite would change the behaviour that
was tested, so they are included in the same commit and named in its body. Other uncommitted
working-tree changes remain untouched. No push or deploy was performed.

## Phase 4 — current-tree re-verification and label fix (2026-10-21)

The first pass was verification-only; it found the label collision below. The follow-up fix
changes `SLACanvas.tsx` and `shell.css` only. The mock-wallet worktree was synchronised with the
current `SLACanvas.tsx`, `History.tsx`, `shell.css`, `index.css` and `utils.ts`, and a test-only
GraphQL fixture supplied COMPLETED, SLASHED and STARTED calls. Browser measurements used
`agent-browser` Chromium, real keyboard/CDP input and axe-core 4.12.1.

**Found: the desktop and tablet Canvas label row collided.** At 1280×900, 1440×960 and 834×1112
the four 112 px labels sat 47.3 px apart and overlapped every neighbour by **64.7 px**, rendering
as `EscrowService callReceiptSettlement`. The cause was structural: four fixed-width labels cannot
fit over the board's resting plate spacing. Before screenshots:
`/tmp/opencode/cg-phase4-canvas-1280-{light,dark}.png` and
`/tmp/opencode/cg-phase4-canvas-834-light.png`.

**Fix:** `.sla-canvas__labels` is now a four-column grid; each label is a static, shrinkable cell
(90.5 px at 1280, 107.6 px at 1440, 123 px at 834, 138.2 px at 641) and no adjacent pair overlaps.
The pointer twins still select a stage and hand focus to its plate. The label row is hidden while
zoomed, because the columns no longer sit under the transformed plates; the existing
`role="status"` line carries the selected stage and the board keeps its arrow-key pan. The phone
stack is unchanged.

Measured after the fix: overlaps **[]** at 641, 834, 1024, 1280 and 1440; labels `display:none` at
125% and `display:grid` after `Fit`; real click on the Receipt label set `aria-pressed` and focus to
`Receipt — Done. signature verified`; stack `Enter` still announced
`Settlement · Done · paid to provider`. Axe over `.sla-canvas` in both themes: **0 violations**
with the same single `color-contrast` incomplete (manual ratios unchanged: dark 6.71–9.18:1, light
5.75–8.00:1). Fixed screenshots:
`/tmp/opencode/cg-phase4-fix-1280-light.png`,
`/tmp/opencode/cg-phase4-fix-1280-light-theme.png`,
`/tmp/opencode/cg-phase4-fix-834-light.png`, `/tmp/opencode/cg-phase4-fix-375-light.png`.

The phone layout is sound: at 411×891 and 375×812 the board is hidden, the four stack buttons are
readable, and `Enter` on Settlement set `aria-pressed=true` and announced the live-region text.
The 320 px shell shift and the 375 px topbar clipping remain the pre-existing shell min-content
issue recorded under Phase 3; the Canvas itself fits at 375.

Other passing checks: real COMPLETED / SLASHED / STARTED stage words, keyboard selection with
focus retained, zoom 100→250%, pointer and arrow-key pan, `Fit`, `aria-disabled` without
`disabled` at the limit, focus-visible 2.5 px plate outline, reduced-motion `0s`, no page errors,
and `bun run typecheck` / `bun run lint` clean after the fix. Gates: `bun run build` exit 0;
`bun test tests/` **387 pass / 4 skip / 0 fail / 1506 expect() calls / 32 files**, including the
new `tests/sla-canvas-layout.test.ts` guard.

Details and exact numbers: `design/phase-checklists/PHASE_4_CHECKLIST.md`, final addendum.
