# CallGuard UI rebuild: rules

- Design reference: design/reference.png (layout, spacing, look). Copy and values come from the instructions I give you; if they conflict, my text wins for copy and the image wins for look.
- Use all installed skills (frontend-design, responsive, a11y, etc.).
- Do not add, remove, or rename anything not in my instructions. No own design decisions; if a decision is needed, ask me.
- Do NOT touch smart contracts, facilitator backend, ABIs, env files, business logic, or existing routes. UI layer only.
- Keep every existing feature, field, button, copy, and data flow. Wire to existing hooks/endpoints; otherwise use typed mocks marked `// MOCK`.
- Never invent numbers, claims, partners, or customers. Missing copy -> `TODO-COPY`.
- After each task: run typecheck + lint + build, commit, then stop and report.

## Stack (actual — do not assume otherwise)

- Vite 5 + React 18 SPA, react-router-dom 7, TypeScript.
- Tailwind 3.4 + `src/index.css` (CSS variables drive the tokens).
- State: zustand. Package manager: bun.
- Not Next.js: never use `next/dynamic`; use `React.lazy` + `Suspense`.
- Panels are switched by the zustand `activePanel` (PanelId), not URL routes: do not change that mechanism.
- Reuse the existing `[data-theme="light"]` theme and the existing viz components (`NetworkGraph`, `SLACanvas`); do not rewrite them from scratch.

## Tokens

- Tokens: keep the current repo tokens for now (bg #0A0E14, card #10151E, accent #12B981). They will be replaced in a dedicated tokens task by values sampled directly from design/reference.png. Keep existing blue/red status colors until then.
- Fonts: existing Geist (UI) + Geist Mono (addresses, hashes, code). Do not change fonts.
- Cards radius 14-16px, buttons/chips fully rounded. Light theme via CSS variables with a toggle.
