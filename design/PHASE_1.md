<!--
Phase 1 — original prompt, recovered verbatim.
Source:     OpenCode session storage, /root/.local/share/opencode/opencode.db (tables message/part, role=user)
Session:    ses_eb4f80b11ffenLQxHoNHeXii07
Message id: msg_14ed0eb0d001jd9sO4cRwc7iD4
Delivered:  2026-10-18 14:41:16 (UTC+3) = 2026-10-18 11:41:16Z
Fidelity:   byte-for-byte copy of the delivered message text; 11228 characters; sha256 d2a22b3ba105bac6d1079380eb15fa1c5bff320c86ac6d0f4ea4500d5e97eefe
Delivered twice:
            - first:  msg_14ed0eb0d001jd9sO4cRwc7iD4  2026-10-18 14:41:16 (UTC+3)  [this copy, 11228 chars]
            - second: msg_14f9a4ad9001I52mE944WmHzx5  2026-10-18 18:21:14 (UTC+3)  [11195 chars]
            The second copy is identical except: (a) it omits the leading line
            "tüm skillerden faydalanabilirsin ?", and (b) the final line carries two trailing spaces.
Everything below is the original wording. Do not edit it; add notes outside the markers.
-->

<!-- BEGIN VERBATIM PROMPT (original wording, unchanged) -->
tüm skillerden faydalanabilirsin ?CallGuard — Phase 1: Premium Design System Foundation

OBJECTIVE

Implement the foundational design system for the existing CallGuard application.

This is Phase 1 of a larger application-wide redesign. Establish a consistent, premium visual language and reusable UI primitives that later phases can use across all existing application panels.

Work autonomously. Inspect the current repository, follow its actual architecture and project instructions, implement the changes, run checks, and document the results. Do not stop after creating a plan.

1. INSPECT BEFORE CHANGING ANYTHING

Start with:

- "git status"
- "git log --oneline -5"
- Current design specifications and project instructions.
- "docs/progress.md"
- "docs/decisions.md"
- "docs/audit.md"
- Current theme tokens and "src/index.css".
- Existing shared components and application shell.
- Existing light-theme implementation.
- Existing typography, icons, buttons, cards, inputs, tables, modals, tooltips, and notification components.
- Current package scripts and installed dependencies.

Read the latest applicable design specifications and respect unfinished work from previous phases.

Inspect available OpenCode skills and use relevant installed skills for frontend design, design systems, accessibility, responsive design, motion design, and web performance. Follow the actual skill instructions. Do not invent or claim skills that are unavailable.

Do not assume existing files, components, or token names without inspecting them.

2. DESIGN DIRECTION

Create a premium, technical, restrained design system for an on-chain SLA infrastructure application.

Visual identity

- Deep navy and near-black application surfaces.
- Emerald green as the primary accent, aligned with existing CallGuard branding.
- Cyan and turquoise for selected technical visualisations and secondary highlights.
- Clear foreground/background contrast.
- Subtle layered surfaces and fine borders.
- Carefully controlled shadows and glows.
- Consistent spacing and typography.
- Readable technical data and transaction identifiers.
- A premium developer-tool aesthetic rather than a generic dashboard template.

Use the existing logo and brand assets where available.

Use the current brand tokens when appropriate. Do not introduce a second competing palette or change branding arbitrarily.

Avoid excessive gradients, glowing borders on every card, inconsistent rounded corners, excessive padding, oversized typography in dense panels, and unnecessary decorative effects.

3. BUILD A CONSISTENT TOKEN SYSTEM

Inspect the existing CSS variables and theme architecture first.

Establish or refine semantic tokens for:

Colors

- Application background.
- Primary and secondary surfaces.
- Elevated surfaces and overlays.
- Primary and secondary text.
- Muted and disabled text.
- Borders and dividers.
- Primary accent.
- Accent hover and pressed states.
- Focus rings.
- Success, warning, error, and informational states.
- Chart and visualisation colors where shared tokens are appropriate.

Typography

- Font family and fallback stacks.
- Body text.
- Headings.
- Labels and helper text.
- Numeric metrics.
- Monospace technical values.
- Font weights and line heights.

Reuse the existing Geist and Geist Mono setup if it remains appropriate.

Spacing and layout

- Consistent spacing scale.
- Standard content gaps.
- Form field spacing.
- Card padding.
- Section spacing.
- Responsive page gutters.
- Sidebar and header sizing where appropriate.

Shape and elevation

- Consistent border-radius scale.
- Border colors and thickness.
- Shadow levels.
- Overlay and modal elevation.
- Focus-ring styles.

Motion

Define a small, consistent motion system:

- Fast feedback transitions.
- Standard UI transitions.
- Slower panel or disclosure transitions.
- Easing conventions.
- Reduced-motion behavior.

Prefer a small number of reusable tokens instead of scattered arbitrary durations.

Do not create tokens for every individual CSS declaration. Establish a useful, maintainable system.

4. DARK AND LIGHT THEMES

Preserve and improve the current theme mechanism.

- Dark mode is the primary CallGuard visual experience.
- Light mode must remain functional if it currently exists.
- Both themes must use the same semantic token names.
- Do not hardcode dark-theme colors into reusable components.
- Ensure text, borders, cards, inputs, menus, dialogs, and focus indicators remain legible in both themes.
- Preserve the user's existing theme preference behavior.
- Do not introduce a new theme management dependency.

Verify theme switching if it is already supported.

5. REUSABLE UI PRIMITIVES

Audit existing shared components before creating anything new.

Reuse and improve existing components where appropriate. Add only genuinely missing primitives.

Establish consistent styling and interaction states for relevant shared components, including:

- Buttons and icon buttons.
- Inputs, textareas, and selects.
- Checkboxes and switches.
- Cards and panels.
- Badges and status indicators.
- Tabs and segmented controls.
- Tables and table toolbars.
- Tooltips and popovers.
- Dialogs and confirmation modals.
- Loading indicators and skeletons.
- Empty states.
- Error states.
- Toasts and notifications.
- Section headers and action groups.
- Metric labels and numeric values.

Not every component needs a new implementation if a suitable one already exists.

Do not replace working components just to create a visually different abstraction.

For each relevant component, ensure consistent:

- Default appearance.
- Hover appearance.
- Focus-visible appearance.
- Active and pressed appearance.
- Disabled appearance.
- Loading behavior.
- Error behavior where applicable.

Use semantic HTML elements and accessible interaction patterns. Keyboard behavior must match the component's purpose.

6. DATA-DENSE APPLICATION DESIGN

CallGuard is a technical application, so design tokens must work for real operational interfaces.

Pay particular attention to:

- Dense tables.
- Contract addresses and transaction hashes.
- USDC amounts and numeric precision.
- SLA durations and status indicators.
- Code blocks and API data.
- Filter controls.
- Long labels.
- Empty and loading states.
- Provider details.
- Multi-step transaction workflows.

Use tabular numerals for aligned numeric information where appropriate.

Long addresses and identifiers must be displayed legibly without breaking the layout. Use deliberate wrapping, truncation, or copy controls where suitable, while preserving access to the full value.

Do not change numeric precision, financial semantics, transaction data, or business logic for visual consistency.

7. ACCESSIBILITY AND RESPONSIVE BEHAVIOR

- Maintain adequate contrast.
- Use visible focus indicators.
- Preserve keyboard navigation.
- Avoid relying exclusively on color to communicate status.
- Respect "prefers-reduced-motion".
- Avoid animations that interfere with reading or interaction.
- Ensure reusable components remain usable on narrow screens.
- Preserve touch-friendly targets where appropriate.
- Do not introduce horizontal overflow.
- Keep the existing application shell and responsive behavior functional.

Fix accessibility issues directly related to components modified during this phase. Do not silently expand the task into an unrelated application-wide rewrite.

8. ANIMATION FOUNDATION

Establish reusable motion conventions without adding unnecessary animation to every component.

Use CSS transitions and the project's existing animation tools where appropriate.

Suitable examples:

- Short button feedback.
- Subtle hover transitions.
- Smooth disclosure and tab transitions.
- Consistent modal entrance and exit.
- Lightweight skeleton animation.
- Restrained notification transitions.

Avoid:

- Constant pulsing on ordinary cards.
- Unnecessary animated gradients.
- Expensive blur transitions.
- Global animation effects that distract from data.
- Continuous animation loops when no information is changing.
- Animations that make the application feel slow.

The heavier 3D experience and advanced network animations belong to later targeted phases, not to every shared component.

9. TECHNICAL CONSTRAINTS

- Preserve the existing React, Vite, TypeScript, Tailwind, Zustand, routing, wallet, and theme architecture.
- Reuse installed dependencies.
- Do not migrate frameworks.
- Do not change contracts, API behavior, hooks, stores, or transaction semantics to achieve visual changes.
- Do not remove existing features.
- Do not replace real data with sample data.
- Do not add unnecessary dependencies.
- Do not alter environment variables or secrets.
- Do not overwrite unrelated work.
- Do not reset or clean the working tree.
- Do not push or deploy without explicit approval.
- Do not commit unrelated changes.

The goal is a shared design foundation, not a complete redesign of every panel in this phase.

10. IMPLEMENTATION WORKFLOW

1. Record the current Git state.
2. Inspect the existing design system and identify inconsistencies.
3. Review the applicable installed design and accessibility skills.
4. Document the proposed token and component decisions.
5. Implement the semantic token system.
6. Preserve and verify dark/light themes.
7. Improve or create the minimum necessary reusable primitives.
8. Verify representative existing panels without redesigning all of them.
9. Run the actual TypeScript, lint, build, and relevant test commands available in the project.
10. Inspect the result in the existing browser preview workflow where available.
11. Fix regressions introduced by this phase.
12. Update "docs/progress.md" and "docs/decisions.md".

Use small, coherent changes. Keep the implementation compatible with the next redesign phases.

If an existing development server belongs to another session, do not interrupt it. Use a separate available port for your own verification.

11. ACCEPTANCE CRITERIA

This phase is complete when:

- The application has a consistent semantic design token system.
- Dark and light themes work using the existing theme mechanism.
- Shared UI primitives use consistent styling and states.
- Typography, spacing, colors, borders, radii, and motion follow a coherent system.
- Existing components and features remain functional.
- Representative panels render correctly with the updated foundation.
- Modified components retain accessible focus and keyboard behavior.
- TypeScript, lint, build, and relevant tests have been executed where available.
- Actual results and any pre-existing failures are documented.
- Progress and design decisions are recorded.
- No unauthorized push or deployment has occurred.

Do not report success for checks that were not executed.

FINAL REPORT

Provide a concise report covering:

- Files changed.
- Token system established.
- Components reused, improved, or created.
- Dark/light theme verification.
- Relevant skills actually used.
- TypeScript, lint, build, and test results.
- Browser verification performed.
- Known limitations and remaining work.

Begin by inspecting the repository and current specifications, then implement Phase 1. Do not stop after producing a plan. 
<!-- END VERBATIM PROMPT -->
