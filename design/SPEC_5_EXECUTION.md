# PART 5 OF 5 (FINAL)

Save this text as `design/SPEC_5_EXECUTION.md`. Parts 1-5 are now the complete task. Read design/SPEC_1 to SPEC_5 once, then START WORK with Phase 0.

## PHASES (commit after each batch; update docs/panel-inventory.md and docs/progress.md)

0. Re-read docs/analysis.md and docs/panel-inventory.md. Make sure the inventory lists all 34 panels + 6 marketing pages; fix gaps.
1. Tokens: apply the Part 1 tokens (skip what is already applied). typecheck + build. Commit.
2. Shared primitives: restyle Card, Stat/Sparkline, Chip, Button, Tabs, Table, inputs/selects, Stepper, and skeleton/empty/error states in src/components/ui, src/ui, src/index.css. Light theme included.
3. Shell: Sidebar, Topbar, MobileNav, drawer, wallet card (spec in Part 2).
4. Reference panels: Overview, Marketplace, Call Builder, Transactions + detail, SLA Canvas.
5. Remaining panels by template (Part 3), in batches of 4-6 panels.
6. Landing without 3D (Part 4), then restyle the other marketing pages.
7. 3D hero scene (Part 4).
8. Final pass: light theme on every panel, responsive 375 / 768 / 1440 with no horizontal overflow, keyboard focus states, color contrast, prefers-reduced-motion.

After each phase: typecheck + build; fix errors before continuing.

## VERIFICATION

- Try `bunx playwright install chromium` (dev only). If it works, screenshot Overview, Marketplace, Call Builder, one T3 panel, and the Landing at 1440px and 375px (dark + light) into docs/screenshots/, compare against the specs in Parts 2-4, and fix visible differences. If Chromium cannot be installed, skip screenshots, verify by reading the rendered components against the specs, and note it in docs/decisions.md.

## ACCEPTANCE

- 34 panels + landing + 5 marketing pages restyled; all "done" in the inventory.
- No existing feature, route, store logic, or data flow lost; typecheck and build pass.
- Dark + light, 375/768/1440, no overflow.
- Final report (max 25 lines): done count, docs/decisions.md highlights, TODO-COPY list, anything unfinished.

RESUME: if context fills up, I will start a new session and paste the resume prompt. Always be ready to continue from docs/progress.md.
