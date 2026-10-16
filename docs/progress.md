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
