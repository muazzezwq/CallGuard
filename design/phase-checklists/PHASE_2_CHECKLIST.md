# Phase 2 — Evidence Checklist

Statuses: `PASS` (implemented and exercised), `PARTIAL` (implemented, evidence incomplete),
`FAIL` (defect demonstrated), `BLOCKED` (environment/external dependency), `UNVERIFIED`
(not exercised yet). This file records only evidence gathered for this phase; earlier phase
reports are not reused as proof.

## Baseline (before current Phase 2 verification)

| Item | Status | Evidence |
|---|---|---|
| Prompt archived verbatim | PASS | `design/PHASE_2.md`; header records sha256 `1b4a7691130b58e4ec897f777d33c0724c4a4f3e8accfdb30eb8818d7ca1012b`. |
| Existing Phase 2 implementation present | PASS | Commits `22eda23` (token layer, grouped nav), `0fa1ba6` (premium shell, field subscriptions, real chain state, panel motion), `3581ac6` (shell motion timing). |
| Current HEAD | PASS | `3581ac6d5059e9c3ebbeb687eff436ffe84b9f12` (`fix(ui): correct shell motion timing`). |
| Working tree preserved | PASS | `git status --short` shows many unrelated modified/untracked entries from earlier phases; nothing staged, no reset/clean/commit/push/deploy. |
| Phase 1.1 integration present in working tree | PASS | `src/index.css` type/spacing/motion tokens, `src/ui/ui.css` token adoption, `src/ui/Popover.tsx`, `tests/design-tokens.test.ts`; uncommitted. |
| Prior Phase 2 checklist | PASS | This file now exists; the earlier absence was the process gap this pass closes. |

## A. Information architecture and navigation

| Item | Status | Evidence |
|---|---|---|
| Single navigation source of truth | PASS | `src/components/layout/navConfig.ts` owns `HOME_NAV`, `NAV_GROUPS`, `PANEL_LABELS`, `MOBILE_NAV`, `groupOfPanel`; `Sidebar.tsx` renders from it. |
| Sidebar hierarchy is accurate | PASS | One home item plus eight labelled groups; group labels and item order come from `NAV_GROUPS`, not JSX order. |
| Every panel is reachable from navigation | PASS | Browser loop over `.sb-item[data-nav]` at 1280×900: **34 clicked, 34 unique ids, 0 mismatches**; each click produced the matching `aria-current="page"`, a breadcrumb, and an `.app-panel`. |
| Active navigation is accurate | PASS | `Sidebar` marks `aria-current="page"` and `.on` from `activePanel`; `AppTopbar` breadcrumb uses the same store value. The 34-click loop compared both. |
| Simple / Pro labels are correct | PASS | `label()` picks `item.simple` or `item.pro`; measured buttons report `aria-pressed="false"` / `"true"`. |
| Mobile primary navigation is real | PASS | `MOBILE_NAV` has four destinations; at 411×900 the bar renders 63px high and `HOME` carries `aria-current="page"`. |
| Deep links still work | PASS | `/ ?provider=<id>` still calls `setPanel("provprofile")`; the `x402` alias is normalized by the store. |
| Command palette still navigates | PASS | Opened with `Ctrl+K`, typed `privacy`, pressed Enter: active sidebar id became `privacy` and the breadcrumb became `Privacy`. Existing `setPanel` path unchanged. |

## B. Application shell and topbar

| Item | Status | Evidence |
|---|---|---|
| Shell grid and panel rhythm | PASS | At 1280×900: `.app-shell` grid `232px 1048px`; `.main-content` owns the panel scroll; `.app-panel` is keyed by `activePanel`. |
| Topbar brand and breadcrumb | PASS | Brand visible on desktop; breadcrumb showed the current group and panel label through all 34 destinations. |
| Network status is real | PASS | `AppTopbar` derives `connected` / `connecting` / `disconnected` / `wrong-chain` from wagmi state and `chainId`; mock harness measured `net-pill ok` on Arc and `net-pill is-warn` with text `Wrong network` on chain 1. |
| Wallet state is real | PASS | Address, short address, balance, copy, disconnect and ConnectKit open/close all use existing wagmi/ConnectKit hooks. Browser showed `0x9adE…4ba5` and the live balance chip. |
| Notifications entry is honest | PASS | Bell opens the real `notifications` panel; no fabricated unread count. |
| Theme toggle is functional | PASS | Clicking `Switch to light theme` changed `data-theme` to `light`, `--bg-0` to `#F1F5FA`, the body to `rgb(241, 245, 250)`, and the control label to `Switch to dark theme`; clicking back restored `dark`. |
| Live bar and footer remain shell-level | PASS | `LiveBar`, `UsdcBanner`, `AppFooter` stay outside the keyed panel, so they are not remounted on navigation. |
| Existing overlays preserved | PASS | `OnboardingWizard`, `RoleModal`, `ContextualHint` and `CommandPalette` remain mounted in the shell. Command palette semantics were strengthened without changing navigation. |

## C. Responsive behaviour

| Item | Status | Evidence |
|---|---|---|
| Desktop layout | PASS | 1280×900: grid `232px 1048px`, sidebar 232, main 1048, topbar 52px, document width 1280. |
| Tablet layout | PASS | 834×1000: initial rail `52px 782px`; expanding the rail produced `232px 602px` after the transition. Document width 834. |
| Phone layout | PASS | 411×900: grid `411px`, main 411, document width 411, mobile nav 63px, hamburger `display:flex`. |
| Drawer overlay and scroll lock | PASS | At 411×900 opening the drawer gave `body { overflow: hidden }`, `.sidebar-overlay.active`, sidebar `left: 0`, width 260; Escape closed it and after 260ms it was `left: -260`, `visibility: hidden`. |
| No horizontal overflow | PASS | `document.documentElement.scrollWidth === innerWidth` at 1280, 834 and 411 (`1280/1280`, `834/834`, `411/411`). |
| Mobile active destination is not colour-only | PASS | `.mbn-item.active::before` measured 18×2px, `rgb(25, 209, 134)`, top-centred above the icon; active item also carries `aria-current="page"`. |

## D. Keyboard and focus

| Item | Status | Evidence |
|---|---|---|
| Hamburger state is exposed | PASS | `aria-label="Open navigation"`, `aria-expanded` toggles `false`/`true`, `aria-controls="appSidebar"` on the trigger. |
| Skip link works | PASS | First Tab from focused body exposed `Skip to main content` at `top: 6.8px` with a 2px accent outline; Enter set `#main-content` as `document.activeElement`. |
| Drawer focus trap | PASS | At 411×900 the first drawer control is `Overview`, the last visible control is `Privacy`; Shift+Tab from first wrapped to `Privacy`. The hidden `.sidebar-collapse-btn` is now excluded, fixing the previous stuck-focus target. |
| Escape closes drawer and palette | PASS | Drawer Escape closed the drawer and returned focus to `.tb-hamburger`; command palette Escape closed the dialog and returned focus to `.tb-cmd`. Global key handler closes both. |
| Panel change moves focus to content | PASS | After choosing `Privacy` in the command palette, `document.activeElement` was `MAIN#main-content`. Existing `mainRef.current.focus({ preventScroll: true })` path. |
| Focus remains visible | PASS | Skip link outline measured `rgb(25, 209, 134) solid 2px`; wallet trigger uses its explicit focus ring. |
| Wallet menu opens and dismisses | PASS | Opening focused `Copy address` (`role="menuitem"`); ArrowDown moved to `Disconnect`; Escape closed and returned focus to `.tb-wallet`; Tab closed the menu and moved focus to `.tb-cmd`. |
| Shell keyboard traversal | PASS | Exercised skip link, hamburger, drawer wrap, Escape, panel focus, command palette open/arrow/Enter/trap/Escape, wallet menu arrows/Escape/Tab. Panel-body tab order was not exhaustively walked (recorded in limitations). |

## E. Motion and reduced motion

| Item | Status | Evidence |
|---|---|---|
| Panel entrance uses transform/opacity only | PASS | `.app-panel` animates opacity and `translateY(4px)`; no layout property. |
| Collapse and drawer use one timing curve | PASS | `3581ac6` corrected double-easing; computed shell transition is `grid-template-columns 0.18s cubic-bezier(0.22, 1, 0.36, 1)`. |
| OS reduced motion | PASS | `set media reduced-motion`: `matchMedia` true, `html[data-motion="reduced"]`, computed `transition: none` on shell, panel, mobile nav and skip link. |
| In-app reduced motion | PASS | With OS set to no-preference, `useAppStore.getState().setReducedMotion(true)` produced `data-motion="reduced"` and `transition: none` on shell/panel/mobile nav/skip link; setting it false restored `data-motion="full"` and transitions. |
| Motion tokens adopted in shell chrome | PASS | `shell.css` chrome now uses `--motion-fast` / `--motion-base`, `--radius-*`, `--control-h-*`, `--elev-4`, `--fs-*`, `--fw-*`, `--tracking-*`; raw `0.15s ease`, `12.5px`, `#06110d`, and `999px` values are gone from the touched rules. |

## F. Performance and lazy loading

| Item | Status | Evidence |
|---|---|---|
| Panels remain lazy | PASS | All 34 panel entries use `React.lazy`; no eager import was introduced. |
| Shell subscriptions are field-level | PASS | `AppShell`, `AppTopbar` and `Sidebar` select individual store fields. |
| Panel is not remounted by unrelated store writes | PASS | No broad `useAppStore()` subscription remains in the three shell components; keyed panel only changes on `activePanel`. |
| Chunk splitting preserved | PASS | Production build emitted separate `AppShell`, `Overview`, `Landing`, and 30+ panel chunks; only the existing large vendor warnings remain. |

## G. Phase 2 changes in this pass

| Item | Status | Evidence |
|---|---|---|
| Shell chrome typography uses Phase 1 scale | PASS | Touched shell rules use `--fs-2xs` … `--fs-sm`, `--fw-medium`/`--fw-bold`, `--tracking-snug`, `--tracking-wide`. |
| Shell chrome spacing/shape uses existing tokens where exact | PASS | Touched rules use `--sp-*`, `--field-gap`, `--card-pad`, `--radius*`, `--elev-4`, `--control-h-sm`; unmatched legacy values were left literal. |
| Shell transitions use motion tokens | PASS | Topbar chips, wallet, menu items, sidebar chevron, mobile nav and skip link use motion tokens; computed durations are `0.18s` / `0.12s`. |
| Topbar Connect uses the shared `Button` primitive | PASS | `AppTopbar` imports `Button` from `../../ui` and renders `<Button variant="primary" size="sm" className="tb-connect">`; obsolete `!important` overrides removed. Connected state was measured, disconnected Connect was code-checked only. |
| Wrong-network control performs a real switch | PASS | Mock harness (test-only chain 1 added to the worktree): topbar showed `Wrong network`; clicking `.net-pill.is-warn` invoked `switchChain({ chainId: arcTestnet.id })` and the pill became `net-pill ok` with text `Arc Testnet`. |
| Mobile active destination has a non-colour indicator | PASS | 18×2px accent bar plus `aria-current="page"` measured at 411×900. |
| Command palette is a real dialog | PASS | `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`; input receives focus; Shift+Tab from input wraps to the last result, Tab from the last result wraps back to input; Escape restores the trigger. |
| Wallet menu ARIA is valid when closed | PASS | `aria-controls` is emitted only while the menu exists; axe 4.12.1 reported 0 violations after the change. |
| Drawer focus excludes hidden controls | PASS | `.sidebar-collapse-btn` is `display:none` on mobile; the focus trap now filters zero-rect/hidden elements, so the wrap target is `Privacy`, not the invisible collapse button. |
| No panel-specific redesign | PASS | Scope is limited to shell chrome; panel bodies and contracts are untouched. |

## H. Gates and verification

| Check | Status | Evidence |
|---|---|---|
| `bun run typecheck` | PASS | Exit 0 after final edits. |
| `bun run lint` | PASS | `eslint src --max-warnings=0`, exit 0 after final edits. |
| `bun test tests/` | PASS | **385 pass / 4 skip / 0 fail / 1500 expect() calls / 31 files**. |
| `bun run build` | PASS | Exit 0; Vite chunk-size warnings only. Separate lazy chunks preserved. |
| `git diff --check` | PASS | Exit 0. |
| Browser desktop / tablet / phone | PASS | Mock-wallet worktree, `http://localhost:5179`; screenshots at `/tmp/opencode/cg-phase2-desktop.png`, `cg-phase2-tablet.png`, `cg-phase2-phone-drawer.png`, `cg-phase2-light.png`. |
| Browser keyboard / focus / reduced motion | PASS | Measurements recorded in sections D and E. |
| Browser console and failed requests | PASS | No console errors and no app-origin failed requests. The request log showed four `429` responses from `https://rpc.testnet.arc.io/` for USDC `eth_call` during the repeated panel sweep; this is an external RPC rate limit, not a shell request failure. Axe 4.12.1: **0 violations**, 1 unresolved `color-contrast` group (51 nodes) due translucent/gradient backgrounds. |

## I. Skills actually loaded in this phase

| Skill | Status | Evidence |
|---|---|---|
| `frontend-design` | PASS | Loaded before visual shell work. |
| `web-design-guidelines` | PASS | Loaded; current Web Interface Guidelines fetched from `raw.githubusercontent.com/vercel-labs/web-interface-guidelines`. |
| `vercel-react-best-practices` | PASS | Loaded before the shell performance/lazy-loading check. |
| `webapp-testing` | PASS | Loaded before browser verification; Playwright was unavailable, so verification used the installed `agent-browser` and `termfold-browser` harnesses instead. |

## J. Documentation and limitations

| Item | Status | Evidence |
|---|---|---|
| `docs/progress.md` updated for this pass | PASS | Phase 2 entry added with measured evidence. |
| `docs/decisions.md` updated for new decisions | PASS | Phase 2 decisions appended. |
| No commit/push/deploy | PASS | This phase stops at uncommitted working-tree changes; publishing requires explicit approval. |
| Screen-reader run | BLOCKED | No screen-reader harness in this environment; axe and focus measurements are the available evidence, not a screen-reader pass. |
| Live wallet signature | BLOCKED | Browser verification uses a mock connector; no wallet-signed transaction was requested or sent. |
| Panel-body keyboard traversal | UNVERIFIED | Shell controls were exercised end to end; the 34 panel bodies were not exhaustively tab-walked. |
| Landing 3D canvas | BLOCKED | Console logged `THREE.WebGLRenderer: Context Lost.` and a later restore while the landing hero mounted; shell and panels were unaffected. |
