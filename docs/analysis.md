# CallGuard frontend analysis

Docs-only snapshot of the frontend as it exists today. No code was changed.

## Framework and tooling

- **Framework:** Vite 5 + React 18 single-page app. **Not Next.js** — there is no App Router or Pages Router.
- **Routing:** `react-router-dom` 7 (`BrowserRouter` in `src/App.tsx`).
- **Language:** TypeScript 5.6 (`tsconfig.json`, `tsc --noEmit` typecheck).
- **Package manager:** bun (`bun.lock` is authoritative; Vercel builds with bun). A `package-lock.json` is also committed.
- **Build entry:** `src/main.tsx` → `src/App.tsx`. `vite.config.ts` uses `@vitejs/plugin-react` and `vite-plugin-node-polyfills`.
- **Contract toolchain (separate):** Foundry (`foundry.toml`, `lib/` git submodules).

## Styling

- **Tailwind 3.4** (`tailwind.config.js`) plus a large hand-written stylesheet `src/index.css` (~2,700 lines).
- Tailwind theme colors are **CSS variables** (`var(--bg-0)`, `var(--accent)`, `var(--danger)`, …) not literal hex. The real values live in `:root` in `src/index.css`.
- **No CSS Modules and no UI component library** (no shadcn/MUI/Chakra). Primitives are hand-rolled in `src/ui/` and `src/components/ui/`.
- Utility class merging via `clsx` + `tailwind-merge`.
- **Light theme already exists** via `[data-theme="light"]` on `<html>`/`<body>`, toggled by the zustand store (`AppShell.tsx`).

### Fonts in use

- **Geist** (UI/display) and **Geist Mono** (addresses, hashes, code), loaded from Google Fonts in `index.html`.
- CSS variables: `--font-sans`, `--font-display` = Geist; `--font-mono` = Geist Mono.
- *(The rebuild brief originally named DM Sans + Space Mono; per decision the repo's Geist faces are kept.)*

## Charts, graph and animation libraries

- **`recharts` 2.13** — declarative charts.
- **Hand-rolled `<canvas>`** rendering in `src/ui/Sparkline.tsx`, `src/components/ui/Sparkline.tsx`, `src/components/panels/Analytics.tsx`, `src/components/panels/Marketplace.tsx`.
- **Existing viz components:** `src/components/viz/NetworkGraph.tsx`, `src/components/viz/SLACanvas.tsx`. These are custom (SVG/canvas), not a 3D library.
- **`framer-motion` 11.3** — installed and used (`src/lib/motion.ts`, panels).
- **Not installed:** `three`, `@react-three/fiber`, `@react-three/drei`, `postprocessing`, `Playwright`.

## Folder structure (frontend)

```
src/
  main.tsx                 app entry
  App.tsx                  router + wallet gate
  index.css                design tokens + component CSS
  marketing/               public marketing pages (+ marketing.css)
    Landing.tsx HowItWorks.tsx Docs.tsx Providers.tsx Security.tsx About.tsx MarketingLayout.tsx
  components/
    layout/                AppShell, Sidebar, AppTopbar, AppFooter, CommandPalette,
                           LiveBar, UsdcBanner, OnboardingWizard, RoleModal,
                           ContextualHint, ProgressTracker (+ shell.css)
    panels/                the ~34 in-app panels (see panel-inventory.md)
    ui/                    Sparkline
    viz/                   NetworkGraph, SLACanvas
    ArcFeeNotice.tsx ProviderCard.tsx ErrorBoundary.tsx PasskeyWallet.tsx UnifiedBalance.tsx
  ui/                      design-system primitives (Button, Card, Modal, Tabs, ...)
  hooks/                   useOnchain, useSubgraph, usePasskeyWallet, useBudgetCap, ...
  lib/                     config.ts (addresses + ABIs), subgraph.ts, cctp.ts, utils.ts, motion.ts
  store/                   useAppStore.ts (zustand)
api/                       Vercel serverless functions (separate deployable)
```

Pages live in `src/components/panels/` (in-app) and `src/marketing/` (public). Hooks live in `src/hooks/`. Shared UNI primitives live in `src/ui/` and `src/components/ui/`.

## Wallet / web3 and data fetching

- **Wallets:** `wagmi` 2 + `viem` 2 + `connectkit`. `useAccount` gates the app.
- **Passkey wallet:** `@circle-fin/modular-wallets-core` via `src/hooks/usePasskeyWallet.ts` (reads `VITE_CLIENT_KEY`, `VITE_CLIENT_URL`).
- **Data fetching:**
  - **On-chain:** `src/hooks/useOnchain.ts` (contract reads/writes) using addresses + ABIs from `src/lib/config.ts`.
  - **Subgraph:** `src/hooks/useSubgraph.ts` + `src/lib/subgraph.ts` query the Goldsky subgraph at `CONFIG.subgraphUrl` (POST `fetch`).
  - **Facilitator / serverless API:** `api/*.js` Vercel functions reached via `fetch` (e.g. `/api/...`, `/callService`, `/nano/*`); several panels call these for quotes, settlement, pays, verification.
  - **Cross-chain:** `src/lib/cctp.ts` (CCTP bridge helpers).
- **Server code** (`api/`, `x402-facilitator/`) reads unprefixed env vars first, falling back to `VITE_*`.

## Current theme / layout shell

- **Route split:** `/` → `MarketingLayout` with child routes; `/app` → `AppGate`. If the wallet is not connected, `AppGate` redirects to `/`; otherwise it renders `AppShell`.
- **Panels are NOT URL routes.** Within `AppShell`, the active panel is chosen by the zustand store's `activePanel` (`PanelId`) and rendered from a `React.lazy` map in `src/components/layout/AppShell.tsx`. `x402` is normalized to `calls` in `src/store/useAppStore.ts`.
- **Shell composition:** `AppTopbar` (hamburger + command palette + panel label), collapsible `Sidebar` (grouped nav: primary, Reputation, Developer Tools, Operations), `LiveBar`, `UsdcBanner`, `ErrorBoundary` + `Suspense` around the active panel, `AppFooter`.
- **Overlays:** `CommandPalette` (Ctrl/Cmd+K), `OnboardingWizard`, `RoleModal`, `ContextualHint`, mobile bottom nav.
- **Theme/mode:** `theme` (dark/light) applied via `data-theme`; `mode` (simple/pro) applied via body classes. Sidebar labels and some copy switch on `mode`.
