<!--
Phase 2 — original prompt, recovered verbatim.
Source:     OpenCode session storage, /root/.local/share/opencode/opencode.db (tables message/part, role=user)
Session:    ses_eb4f80b11ffenLQxHoNHeXii07
Message id: msg_14ee3efc4001S0tvi0nzBTWgqc
Delivered:  2026-10-18 15:02:03 (UTC+3) = 2026-10-18 12:02:03Z
Fidelity:   byte-for-byte copy of the delivered message text; 19271 characters; sha256 1b4a7691130b58e4ec897f777d33c0724c4a4f3e8accfdb30eb8818d7ca1012b
Delivered twice, byte-identical (sha256 1b4a7691130b58e4ec897f777d33c0724c4a4f3e8accfdb30eb8818d7ca1012b):
            - first:  msg_14ee3efc4001S0tvi0nzBTWgqc  2026-10-18 15:02:03 (UTC+3)
            - second: msg_14fba30d2001hLVmIPT0yPIkE9  2026-10-18 18:56:04 (UTC+3)
Everything below is the original wording. Do not edit it; add notes outside the markers.
-->

<!-- BEGIN VERBATIM PROMPT (original wording, unchanged) -->
CallGuard — Phase 2: Premium Application Shell, Navigation & Responsive UX

PRIMARY OBJECTIVE

Implement Phase 2 of the CallGuard application redesign: transform the existing application shell into a premium, cohesive, responsive control center for on-chain SLA infrastructure.

This phase focuses on the application-wide layout and navigation:

- Main application shell.
- Sidebar and navigation hierarchy.
- Top navigation bar.
- Main content container.
- Page and panel transitions.
- Responsive navigation.
- Global status and contextual actions.
- Consistent integration with the design system established in Phase 1.

The result should feel like a professional developer platform used to operate real infrastructure—not a generic dashboard template.

Use your full available design and engineering capabilities. Explore and use all relevant installed OpenCode skills, project skills, and supported tools that can materially improve the result.

Do not stop after producing a plan. Inspect the repository, implement the changes, run checks, verify the interface, and document the actual results.

---

1. READ THE CURRENT PROJECT STATE FIRST

Before editing anything, inspect:

- "git status"
- "git log --oneline -5"
- All applicable design specifications, including the latest completed phase.
- "design/SPEC_1" through the latest relevant specification.
- "design/SPEC_9_FIXES.md", if it exists.
- "docs/progress.md"
- "docs/decisions.md"
- "docs/audit.md"
- "docs/panel-inventory.md", if available.
- The current design system and theme tokens.
- "src/AppShell.tsx" or the actual current application-shell implementation.
- "src/Sidebar.tsx" or the actual current navigation implementation.
- The real entry point, panel registry, lazy-loading logic, and "activePanel" state.
- All navigation groups and currently registered panels.
- Existing global header, toolbar, notification, wallet, network, and settings components.
- Current desktop and mobile behavior.
- Existing keyboard navigation and accessibility behavior.
- Existing routing, state-management, and theme mechanisms.
- Current dependencies and package scripts.

File names above are starting points, not assumptions. Locate the actual files in the current repository.

Do not assume Phase 1 is complete merely because a previous prompt requested it. Inspect its actual implementation and Git state. Reuse its tokens and components if present; if work is incomplete, maintain compatibility and document any dependency that cannot safely be resolved.

Preserve existing uncommitted changes and work from other agents.

2. DISCOVER AND USE ALL RELEVANT AVAILABLE SKILLS

Before implementation, inspect the skills actually available to OpenCode.

Do not limit yourself to a single frontend skill. Review every available skill that could materially improve this phase.

Prioritize relevant skills covering:

- Frontend design and premium visual composition.
- Web design guidelines.
- Design systems and component architecture.
- Information architecture and navigation.
- UX research principles and interaction design.
- Responsive and mobile-first design.
- Advanced CSS and layout.
- Motion design and microinteractions.
- Accessibility and keyboard navigation.
- Frontend performance and code splitting.
- React and TypeScript engineering.
- Browser testing and visual verification.
- Design review and interface quality assurance.

Also inspect any relevant installed skills not listed above. Use their actual instructions and capabilities.

If a skill provides useful checklists, implementation guidelines, testing methods, or design references, follow them.

Do not invent skill names, pretend to have loaded a skill, or claim a skill was used without evidence.

Combine the best techniques into one coherent interface. Avoid implementing conflicting recommendations from different skills without resolving the conflict.

Record the relevant skills actually used in the final report.

3. DESIGN VISION

Build a refined, dark-first infrastructure control center consistent with CallGuard's existing identity.

Visual direction

- Deep navy and near-black surfaces.
- Emerald as the primary interactive accent.
- Restrained cyan and turquoise for technical visualisations.
- Clear visual hierarchy.
- Subtle, layered surfaces.
- Fine, low-contrast borders.
- Consistent spacing and typography.
- Carefully controlled shadows.
- Minimal but meaningful glow.
- Readable technical information.
- Strong active-navigation states.
- Precise alignment and balanced whitespace.

Use the existing CallGuard brand assets and Phase 1 semantic design tokens wherever available.

Do not invent a new brand identity, competing color palette, or unrelated visual language.

The application shell should provide a stable visual frame for every panel. The shell must be visually polished but should not dominate the content inside it.

Avoid excessive gradients, oversized decorative elements, unnecessary glass effects, glowing outlines on every surface, and repetitive dashboard cards.

4. SIDEBAR REDESIGN

The sidebar is the main navigation system for the application.

Inspect the existing navigation structure and registered panels before changing it.

Preserve all currently available destinations, actions, panel identifiers, and relevant navigation behavior.

Do not remove or rename a panel simply because a different grouping looks cleaner.

Desktop sidebar

Create a premium, compact, well-organized navigation system with:

- CallGuard logo and identity.
- Clear navigation groups.
- Consistent icons.
- Readable labels.
- A strong but restrained selected state.
- Hover and keyboard-focus states.
- Optional section dividers where useful.
- A discoverable collapse/expand control, if appropriate.
- A consistent bottom area for settings or existing utility actions.

The sidebar should support a dense technical application without looking crowded.

Use the project's existing icon library and brand assets. Avoid emoji as navigation icons.

Navigation hierarchy

Inspect the actual panel inventory and group existing panels into meaningful categories.

Possible categories include:

- Overview.
- Build: SLA Canvas, Call Builder.
- Discover: Marketplace, Providers.
- Operations: Calls, Requests, Receipts, Transactions.
- Financials: Payments, Escrow, Claims, Lending.
- Intelligence: Reputation, Analytics, Quality.
- Developer Tools: API, Integrations, Documentation.
- System: Notifications, Settings, Network.

These are examples only. Use categories that accurately reflect the actual application.

Do not add dead links or navigation items for features that do not exist.

Every existing panel must remain reachable unless the current product intentionally restricts it.

Active navigation

Make the selected destination immediately recognizable.

Use a consistent active state based on the design tokens, such as:

- A subtle accent surface.
- A slim emerald indicator.
- Clear label and icon contrast.
- An optional restrained transition.

Do not rely on color alone to indicate the selected item.

Ensure that navigation state stays synchronized with the actual active panel or current route.

Collapsed sidebar

If a collapsed sidebar fits the existing architecture, implement it carefully.

Requirements:

- Icons remain recognizable.
- Tooltips reveal labels.
- Accessible names remain available.
- Keyboard navigation still works.
- The collapse state does not break panel width calculations.
- State persistence is used only if compatible with the existing preference system.

Do not introduce unnecessary global state or a new storage mechanism.

5. TOP BAR / GLOBAL TOOLBAR

Design a clean, compact top bar that provides useful global context without duplicating the sidebar.

Inspect the current application to determine which controls already exist.

Potential elements include:

- Current panel title or breadcrumb.
- Network identity and connection state.
- Wallet connection or account control.
- Notifications.
- Theme switcher, if already supported.
- Relevant panel-level actions.
- Responsive navigation trigger.

Only include elements that are meaningful and supported by the current product.

Network status

Show the real network context when available.

Distinguish clearly between:

- Connected.
- Connecting.
- Disconnected.
- Error.
- Wrong network, if the existing wallet/network logic supports that state.

Do not display a permanent green "Connected" indicator when the network or wallet is actually disconnected.

Never fabricate network health or transaction activity.

Wallet integration

Preserve the existing wallet connection mechanism and all current wallet-related behavior.

Do not replace the wallet provider, connector, hooks, or configuration.

The redesign may improve layout, spacing, labels, and interaction feedback, but must not change transaction semantics or wallet behavior.

Notifications

If the application already has a notification system, integrate it into the new shell without duplicating it.

Ensure notification controls open the actual existing interface and expose the correct unread state if available.

Do not create fake notifications to make the toolbar appear active.

6. MAIN CONTENT AREA

The shell must provide a consistent environment for all existing panels.

Implement or refine:

- Main content container.
- Consistent page gutters.
- Responsive width constraints.
- Header-to-content spacing.
- Panel titles and descriptions where appropriate.
- Contextual actions.
- Consistent background and border relationships.
- Correct overflow behavior for dense tables and technical panels.

Avoid forcing every panel into the same fixed-width card layout.

Some panels need full-width tables. Others need forms, visualisations, graphs, or multi-column layouts.

The shell should support those differences rather than constraining them.

Preserve panel-specific layouts and their existing functionality.

Panel header conventions

Where suitable, establish a reusable convention for:

- Page title.
- Optional description.
- Breadcrumb or category context.
- Primary action.
- Secondary actions.
- Status or metadata.

Do not force redundant headings into panels that already implement their own effective header.

Avoid double padding and duplicate title bars.

7. NAVIGATION TRANSITIONS AND MOTION

Use the existing animation tools and design tokens where appropriate.

Explore relevant motion-design skills and choose techniques that improve perceived quality without making navigation slower.

Potential improvements:

- Subtle sidebar active-indicator transitions.
- Smooth collapse and expansion.
- Lightweight mobile drawer animation.
- Gentle panel entrance transitions.
- Controlled opacity and transform transitions.
- Clear loading feedback for lazy-loaded panels.
- Responsive hover and focus feedback.

Motion must be restrained, purposeful, and consistent.

Do not animate every element.

Avoid:

- Large sliding transitions that delay interaction.
- Animations that make panel content appear to jump.
- Animating expensive layout properties unnecessarily.
- Continuous decorative loops in the application shell.
- Heavy blur effects.
- Unnecessary animation dependencies.
- Page transitions that cause wallet or panel state to reset.

Respect "prefers-reduced-motion".

Panel transitions must not interfere with data loading, focus management, keyboard navigation, or user interaction.

8. MOBILE AND RESPONSIVE NAVIGATION

Do not treat mobile as a smaller desktop sidebar.

Create a deliberate responsive experience.

Desktop

- Persistent sidebar.
- Compact global toolbar.
- Efficient use of horizontal space.
- Content layouts appropriate for dense technical work.

Tablet

- Collapsible sidebar or another suitable navigation mode.
- Correct content widths.
- No overlapping global controls.
- Clear panel titles and actions.

Mobile

Use an appropriate pattern based on the existing architecture, such as:

- A slide-in navigation drawer.
- A compact top bar.
- A clear menu trigger.
- A visible current-panel title.
- Accessible overlay and dismissal behavior.

Requirements:

- No horizontal page overflow.
- No clipped navigation labels.
- No inaccessible hidden controls.
- No body scrolling behind an open modal drawer.
- Escape-key dismissal where appropriate.
- Correct focus handling.
- Correct backdrop interaction.
- Touch-friendly targets.
- Drawer closes appropriately after navigation.
- Browser back behavior remains correct where relevant.
- Existing wallet and notification actions remain accessible.

If a bottom navigation pattern is considered, use it only if the actual information architecture supports a small set of high-frequency destinations. Do not squeeze the entire application into a bottom bar.

Verify behavior at realistic narrow viewport sizes.

9. RESPONSIVE AND ACCESSIBLE INTERACTIONS

All interactive shell elements must have meaningful behavior.

- Use actual buttons for actions.
- Use actual links where navigation semantics require links.
- Preserve keyboard navigation.
- Provide visible focus indicators.
- Use accessible names for icon-only buttons.
- Give tooltips appropriate interaction behavior.
- Ensure focus remains visible on dark and light themes.
- Avoid hover-only controls.
- Ensure the mobile drawer is accessible to assistive technology.
- Use appropriate "aria-expanded", "aria-controls", and dialog semantics where needed.
- Do not add redundant or misleading ARIA attributes.

Do not use clickable "div" elements when a native button or link is appropriate.

Do not solve accessibility warnings by suppressing rules without addressing the underlying issue.

10. TECHNICAL CONSTRAINTS

The current repository is the source of truth.

- Preserve the current React, Vite, TypeScript, Tailwind, Zustand, routing, wallet, and theme architecture.
- Preserve the existing "activePanel" model if it remains the current navigation mechanism.
- Preserve lazy-loaded panels and current panel registration.
- Preserve all existing routes and navigation destinations.
- Preserve contract integrations, API behavior, hooks, stores, and transaction logic.
- Preserve existing notification and wallet behavior.
- Reuse the Phase 1 design tokens and shared components.
- Reuse installed dependencies wherever possible.
- Do not introduce unnecessary libraries.
- Do not convert the application to another framework.
- Do not replace real data with mocks.
- Do not add fake status indicators.
- Do not remove features to simplify the layout.
- Do not overwrite unrelated work.
- Do not reset or clean the working tree.
- Do not push, deploy, or publish without explicit approval.

Do not use this phase as an excuse to redesign every application panel individually. The task is the shared shell and navigation foundation.

11. PERFORMANCE REQUIREMENTS

The shell is present throughout the application, so its performance matters.

- Avoid unnecessary React re-renders across all panels.
- Keep navigation interactions responsive.
- Preserve existing lazy-loading behavior.
- Avoid eager imports of heavy visualisation libraries.
- Avoid introducing unnecessary global event listeners.
- Clean up observers and listeners correctly.
- Avoid expensive animations on large layout containers.
- Prevent layout shifts during panel transitions.
- Do not add a new dependency for a simple CSS transition.
- Keep the mobile navigation lightweight.
- Ensure collapsing or opening the sidebar does not break existing charts or canvases.

Measure or inspect the actual production build where feasible. Do not claim performance improvements without evidence.

12. VERIFICATION WORKFLOW

Execute the work in coherent increments.

Step A — Baseline

Inspect the repository, existing shell, navigation, panel registry, and available skills.

Record existing failures separately from new regressions.

Step B — Information architecture

Map the existing panel inventory to the proposed navigation structure.

Check that every existing panel remains reachable and that no duplicate or nonexistent destinations are introduced.

Step C — Implement

Update the shell, sidebar, toolbar, responsive navigation, and related reusable components.

Keep the changes focused on Phase 2.

Step D — Browser verification

Use the existing browser preview workflow when available.

If another session owns an existing development server, do not interrupt it. Use a separate available port for your own checks.

Verify:

- Initial application render.
- Every navigation group.
- Panel selection.
- Sidebar collapse and expansion.
- Current-panel synchronization.
- Wallet controls.
- Network status.
- Notifications.
- Theme switching.
- Keyboard navigation.
- Mobile drawer.
- Escape dismissal and focus handling.
- Direct navigation and browser back behavior where applicable.
- Long panel titles.
- Dense panel content.
- Reduced-motion mode.
- No clipping or horizontal overflow.
- No new console errors.
- No broken lazy-loaded panels.

Use real application state and actual navigation behavior.

If browser automation is unavailable, report the limitation and perform the checks that are possible.

Step E — Automated checks

Run the actual project commands available for:

- TypeScript.
- ESLint.
- Production build.
- Relevant automated tests.

Do not assume script names. Inspect "package.json" and use the correct commands.

Fix regressions introduced by the changes.

Do not report a passing check unless it was executed successfully.

Step F — Documentation

Update the appropriate project progress and decision documents.

Record the completed shell work, navigation decisions, skills actually used, verification results, and remaining issues.

Follow the existing commit workflow. Do not create unrelated commits or push changes without explicit approval.

13. ACCEPTANCE CRITERIA

Phase 2 is complete when:

- The application has a cohesive, premium shell.
- The sidebar hierarchy accurately reflects the real panel inventory.
- Every existing panel remains reachable.
- Active navigation accurately reflects the current panel or route.
- The global toolbar displays real, supported application state.
- Wallet and network interactions remain functional.
- Panel content fits the shell without forced layout regressions.
- Desktop, tablet, and mobile navigation have been checked.
- Keyboard navigation and focus handling work correctly.
- Motion respects reduced-motion preferences.
- Existing lazy-loading and architecture remain intact.
- TypeScript, lint, build, and relevant tests have been executed where available.
- Browser verification has been performed where possible.
- Progress and decisions are documented.
- No unauthorized push or deployment has occurred.

FINAL REPORT

Provide a concise report including:

1. Files changed.
2. Sidebar groups and navigation behavior.
3. Top-bar changes.
4. Mobile and responsive behavior.
5. Animations and interaction improvements.
6. Relevant installed skills actually used.
7. TypeScript, lint, build, and test results.
8. Browser verification results.
9. Remaining issues and limitations.

Begin by inspecting the actual repository and current project instructions, then implement Phase 2. Do not stop after writing a plan. 
<!-- END VERBATIM PROMPT -->
