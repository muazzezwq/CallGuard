# SPEC_9 FIXES
Work autonomously, no questions, log decisions in docs/decisions.md. UI/tooling layer only (no contracts, api logic, hooks, store, lib). Same rules as design/SPEC_1 and SPEC_6. Commit per item after typecheck + eslint + build. Replies max 10 lines.

1. EAGER THREE. After SPEC_8's manualChunks, dist/index.html modulepreloads vendor-three and the entry imports it statically; landing and /app now download ~217 KB gzip of three they may not need. Fix vite.config.ts so three/R3F/drei stay in the lazy HeroScene graph only (drop the vendor-three group or move only what is safe), and remove the empty vendor-charts group. Acceptance: after `vite build`, index.html has NO modulepreload/script for any three chunk, the entry file has no static import of it, eager gzip total is back to roughly the pre-SPEC_8 size (about 480 KB gzip), and the app and landing still mount with 0 console errors (wallet connect modal must still open). Report eager gzip before/after.

2. LOCKFILES. package-lock.json is out of sync (`npm ci` fails: eslint packages missing). The project uses bun: git rm package-lock.json, add "installCommand": "bun install --frozen-lockfile" to vercel.json, and confirm `bun install --frozen-lockfile` passes.

3. LANDING per SPEC_4.
 a. Transaction Flow: replace the numbered cards with a horizontal stepper: circles with check marks connected by lines, lighting up in sequence on scroll (vertical on narrow screens). Keep the same four labels.
 b. Canvas transparency: after the Bloom pass read the canvas corner pixel with gl.readPixels; alpha must be 0. If Bloom makes the canvas opaque, remove postprocessing and fake the glow with additive halo sprites (this also drops @react-three/postprocessing).
 c. Chip and node clipping: "AI Agents" and the top-right hexagon are cut off at the canvas edge; keep them inside the frustum or give .mk-hero__art overflow: visible with padding.
 d. Hero text and sections must share one container left edge.

(Items 4-6 and the standing rule follow in Part 2.)

4. OVERVIEW per SPEC_2: Live Network and Recent Activity cards stretch to equal height in their row (empty state centered); stat card sparkline baseline spans the full card width.

5. LINT HYGIENE. Turn "no-undef" off for TS files (false positives). Fix the 57 jsx-a11y/label-has-associated-control warnings by associating labels with inputs (htmlFor/id or wrapping), without changing behavior. For the 25 clickable div warnings, add role="button", tabIndex={0} and an Enter/Space key handler where the element is purely a click target.

6. Tokenize the remaining raw hex in Agent, Verify, Quality, ProviderProfile, Notifications, Lending (CSS variables; canvas colors via resolveColor()).

## STANDING RULE: keep the mock preview in sync with main
A mock preview worktree exists at /root/projects/onur-mock (branch tmp-screenshots) with its dev server on port 5173, run by another session. Do NOT touch port 5173 and do NOT run your own server on it. For your own checks (gl.readPixels alpha, mount tests, screenshots) use a separate dev server from this worktree on port 5199.

After EVERY commit on main, run these (the tool may ask permission for the external directory: that is expected):
  git -C /root/projects/onur-mock stash
  git -C /root/projects/onur-mock merge --ff-only main
  git -C /root/projects/onur-mock stash pop
Then:
 - Stash pop conflict: keep main's version of every file, re-apply only the mock shim (wagmi mock connector in src/lib/config.ts, AutoConnect in src/main.tsx, MOCK_ENABLED dev gate). Untracked files (node_modules, mockSeed.ts) stay.
 - merge --ff-only fails: report one line and stop syncing; never force or rebase.
 - Run `npm install` in onur-mock only if package.json changed; never commit lockfile or node_modules changes there.
 - If vite.config.ts or index.html changed, tell me (the mock dev server needs a restart by the other session); otherwise HMR picks it up.
 - Reply with one line per sync: "sync <short sha> ok" or what failed.
Hard rules: the mock shim is never committed to main; tmp-screenshots is never pushed. At the end run in this worktree: git grep -n "MOCK_ENABLED\|mock(\|AutoConnect" -- src (must be empty) and report it. Do NOT delete onur-mock or tmp-screenshots until I ask.
