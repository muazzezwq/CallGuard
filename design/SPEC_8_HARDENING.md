First save this task as design/SPEC_8_HARDENING.md (exact text). Work autonomously, no questions, log decisions in docs/decisions.md. UI/tooling layer only: do not change contracts, api/ logic, hooks, store or lib. Commit per item (typecheck + build). Reply max 10 lines.

1. REAL LINT. package.json "lint" is `echo 'lint ok'`. Add ESLint (flat config) with typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-jsx-a11y and make "lint" run it. Existing violations are "warn", except react-hooks/rules-of-hooks and correctness rules (error). Fix only trivial, clearly safe issues in UI files; never touch hook/store/lib logic. Put the top 8 warning rules with counts in docs/audit.md. `bun run check` must pass.

2. SECURITY HEADERS. vercel.json sets only CORS on /api. Add headers for all non-API routes: X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera, microphone, geolocation off), X-Frame-Options DENY plus CSP frame-ancestors 'none'. First check whether any page is meant to be iframe-embedded (api/widget.js is an embeddable widget); if so exclude those paths and log it. Do NOT add a full CSP (wallet, RPC and fonts make it risky); write a Report-Only CSP suggestion into docs/decisions.md instead.

3. TOKENIZE RAW COLORS in PipelineHook, CallBuilder, Analytics, Webhooks, Mcp, Disputes, Requests, Register: replace raw hex in TSX with existing CSS variables (--accent, --danger, --warn, --info, --text-dim, --border, ...). Canvas colors go through the existing resolveColor() pattern. Also .cgt-terminal #0a0e14 (src/index.css:1810) -> var(--bg-0). Check light theme afterwards.

4. REPO HYGIENE. vercel.json has buildCommand, so dist/ need not be tracked: `git rm -r --cached dist`, add dist/ to .gitignore (keep outputDirectory dist). Keep only the latest 8 files in docs/screenshots, `git rm --cached` the rest and gitignore them. Do not rewrite history.

5. BUNDLE (no behavior change). Add build.rollupOptions.output.manualChunks in vite.config.ts for vendor groups (react, wagmi/viem/connectkit, recharts, framer-motion, three stack) for long-term caching. Do not change imports or provider code. Report chunk sizes before/after.

6. SLA Canvas title: in the Transactions detail, title the SLA Canvas card "SLA Canvas" (currently "SLA lifecycle"). Review the 8 `outline: none` rules: each must have a visible :focus-visible replacement.
