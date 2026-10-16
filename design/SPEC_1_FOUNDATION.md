# PART 1 OF 5

Save this text as `design/SPEC_1_FOUNDATION.md`. Do NOT start any work. Parts 1-5 are one task; work starts only after Part 5. Where this file conflicts with design/RULES.md, this file wins.

## GOAL

Rebuild the UI of this CallGuard repo to match a design (landing + all app panels): dark navy theme, green accent, 3D landing hero. UI layer only.

## REPO FACTS (from docs/analysis.md)

Vite 5 + React 18 SPA, react-router-dom 7, TypeScript, Tailwind 3.4 + hand-written src/index.css driven by CSS variables, zustand, bun, wagmi/viem/connectkit, recharts, framer-motion. Fonts: Geist + Geist Mono (keep). App panels are NOT URL routes: zustand `activePanel` + lazy map in AppShell.tsx; nav in Sidebar.tsx. Marketing pages in src/marketing. Existing light theme via [data-theme="light"] and existing viz (NetworkGraph, SLACanvas): reuse, do not rewrite from scratch. Never use next/dynamic: use React.lazy + Suspense.

## HARD RULES

- Use all installed skills (frontend-design, responsive, a11y, etc.).
- UI layer only. Do NOT touch contracts, api/ functions, ABIs, env, hook logic, store logic, routes, or the activePanel mechanism.
- Keep every existing feature, field, button, copy, and data flow in every panel. No removals, no additions, no renames.
- Do not invent copy, numbers, claims, partners, customers. Missing copy -> `TODO-COPY`.
- Do not stop to ask me. When a decision is needed, choose the most conservative option (keep existing behavior), append it to `docs/decisions.md` (decision + reason), and continue.
- The reference image is NOT on disk. The text specs in these parts are the only source. Never block on the image.
- Reply max 15 lines per message; never paste file contents or diffs.

## TOKENS (measured from the reference; apply to existing variable names, keep names)

DARK: page bg #000D1A | sidebar bg #000C16 | card #051528 | card border #0B1E30 | sidebar divider #112939 | active nav fill #014237 | accent #19D186 (bright/hover/glow #1CE08E) | success #14D29E | pending blue #1F77EF | failed/slashed red #EE4539 | text #FDFEFF | muted text #8A9FB2

LIGHT: page bg #F1F5FA | alt bg #EAF0F8 | topbar #F7F9FC | card #F9FBFD | card border #EAF1F8 (cards rely on a soft shadow) | text #091636 | muted #667A98 | accent/blue/red same as dark

Old literals to replace everywhere in src/ and tailwind.config.js (only if still present): #0A0E14->#000D1A, #10151E->#051528, #12B981->#19D186, rgba(18,185,129,x)->rgba(25,209,134,x).

Style: cards radius 14-16px, 1px border, subtle glow; buttons/chips fully rounded; large light-to-medium headings; hashes/addresses in Geist Mono.

## WORKFLOW

- State lives in files: docs/panel-inventory.md (status per panel), docs/progress.md (3-line summary per batch), docs/decisions.md.
- Work in small batches. After each batch: typecheck + build, update inventory/progress, git commit, continue.
- If context usage passes ~70%, finish the current batch, commit, write progress.md, and tell me to start a fresh session with the RESUME prompt.

END OF PART 1.
