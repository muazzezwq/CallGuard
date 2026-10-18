<!--
Phase 4 — original prompt, recovered verbatim.
Source:     OpenCode session storage, /root/.local/share/opencode/opencode.db (tables message/part, role=user)
Session:    ses_eb4f80b11ffenLQxHoNHeXii07
Message id: msg_14ffde6dd001RccPnBCK5LdqpX
Delivered:  2026-10-18 20:10:02 (UTC+3) = 2026-10-18 17:10:02Z
Fidelity:   byte-for-byte copy of the delivered message text; 14544 characters; sha256 b673e11c9251b12ce9c045760c8c4370f9729206fffd6b9c9ed8b3ddc2acfe69
Note:       this prompt reached the model at 20:10:02 (UTC+3) and was summarised by the
            context-pruning plugin about two minutes later; the text below is the message as
            stored, not a summary.
Everything below is the original wording. Do not edit it; add notes outside the markers.
-->

<!-- BEGIN VERBATIM PROMPT (original wording, unchanged) -->
CallGuard — Phase 4: Premium SLA Canvas, Interactive Protocol Visualization & Workflow UX

Mission

Transform CallGuard's existing SLA Canvas into a premium, interactive protocol workspace that feels like a professional Web3 infrastructure tool.

This phase builds on the actual implementations of Phases 1–3. Do not assume earlier phases are complete just because their specifications exist. Inspect the repository and current implementation before making changes.

The goal is to make SLA flows easy to understand, inspect, configure, and monitor without sacrificing protocol correctness, usability, performance, or the existing architecture.

Do not stop at a visual mockup. Implement the real experience using the project's existing components, state, contract integrations, and supported data sources.

1. Mandatory repository and documentation review

Before changing anything:

- Inspect the current Git status and preserve all unrelated user changes.
- Read "design/SPEC_1" through "design/SPEC_9_FIXES.md", or the actual relevant specification files present in the repository.
- Read "docs/progress.md", "docs/decisions.md", "docs/audit.md", and "docs/panel-inventory.md" if present.
- Inspect the existing SLA Canvas, "SLACanvas", "NetworkGraph", app shell, panel registry, shared primitives, design tokens, theme implementation, and related hooks.
- Trace existing contract calls, API endpoints, transaction flows, validation rules, and error handling used by the Canvas.
- Identify what is already implemented, partially implemented, broken, or missing.
- Do not replace working functionality with invented abstractions or duplicate existing components.

Follow the repository's current architecture and conventions. Do not migrate frameworks, replace routing or state management, or add dependencies without a demonstrated need.

2. Discover and use all relevant installed skills

Inspect the skills available in the current OpenCode environment. Read and apply every skill that materially helps this task.

Look for relevant skills covering:

- Frontend design and premium interface design
- Web design guidelines and UI quality audits
- Design systems and component architecture
- Interaction design, information architecture, and workflow UX
- React, TypeScript, and state management
- Graphs, node-based editors, and data visualization
- Animation, motion design, and microinteractions
- Responsive and mobile-first design
- Accessibility and keyboard navigation
- Web performance and rendering optimization
- Browser automation, visual regression, and testing
- Smart contract integration and Web3 UX, if available

Do not assume these exact skill names exist. Discover the installed skills, read the relevant instructions, and use the applicable guidance during implementation.

Do not install every available skill indiscriminately. Prioritize skills that improve this specific task.

In the final report, list the skills actually discovered, read, and applied. Never claim to have used a skill that was not available or actually consulted.

3. Define the Canvas experience

The Canvas should feel like an interactive protocol workspace rather than a collection of static cards.

Use the current design system from earlier phases where implemented. Maintain consistent typography, spacing, borders, surfaces, focus states, and semantic colors across dark and light themes.

The visual direction should remain:

- Deep navy and charcoal surfaces.
- Emerald green as the primary protocol accent.
- Restrained cyan and turquoise for supporting visual signals.
- Subtle borders, layered surfaces, and clear depth.
- Crisp, readable labels and carefully controlled visual density.
- Purposeful animation instead of constant decorative movement.

Avoid excessive gradients, glowing borders, unnecessary 3D effects, generic dashboard styling, and visual clutter.

4. SLA flow visualization

Inspect the existing Canvas implementation and improve its actual workflow representation.

Where supported by the current product model, make the SLA lifecycle visually understandable through connected stages such as:

1. Provider configuration
2. Stake and pricing
3. Caller request and payment
4. Request execution
5. Receipt creation and verification
6. Successful settlement or timeout handling
7. Refund and slashing outcomes, where applicable

Use the real protocol flow and contract behavior as the source of truth. Do not display stages as implemented features if the code does not support them.

The visualization should communicate:

- The direction of the request and payment flow.
- Dependencies between stages.
- The distinction between normal and failure paths.
- Which stage is selected, active, completed, unavailable, or in error.
- Where the relevant transaction, receipt, or contract interaction occurs, when the existing implementation exposes that information.

Use a clear visual hierarchy. Nodes must remain legible at different zoom levels, and connections should be distinguishable without relying on color alone.

If the existing Canvas uses a node-based library or custom graph renderer, improve and reuse it where practical. Do not introduce another graph library before checking existing dependencies and implementation options.

5. Interaction design

Implement meaningful interactions supported by the actual application:

- Select a node to inspect its details.
- Highlight related nodes and connections when appropriate.
- Show contextual information without forcing users to navigate away unnecessarily.
- Provide clear selected, hover, focus, disabled, loading, and error states.
- Support zoom and pan if the current graph implementation allows it or can support it reliably.
- Provide a usable way to return to the full workflow after zooming or focusing on a section.
- Keep labels and important controls readable during graph navigation.
- Provide helpful empty states when there is no configured workflow or no data.
- Make the primary next action obvious based on the user's actual state.

If the existing product supports editing or configuring SLA parameters, preserve those capabilities and improve their usability. Do not introduce an editor for contract parameters that cannot actually be changed or submitted.

Every visible interactive control must perform its advertised action. Remove or complete inert controls instead of leaving decorative buttons that do nothing.

6. SLA configuration and validation

Inspect the existing configuration forms and their connection to contract writes.

Where supported, make these values clear and easy to review:

- Provider and endpoint
- Stake amount
- Price per call
- Maximum response time
- Slash percentage or penalty configuration
- Relevant limits, balances, and transaction requirements

Use the actual field names, units, contract constraints, and validation rules from the code. Do not invent new defaults, limits, or protocol guarantees.

Improve:

- Inline validation and useful error messages.
- Required-field indicators.
- Numeric precision and USDC formatting.
- Clear distinction between editable, read-only, and computed values.
- Transaction review before wallet confirmation.
- Pending, success, rejection, and failure states.
- Protection against accidental duplicate submissions where relevant.

Never imply that a transaction succeeded before the actual transaction result confirms it. Do not silently change user-entered values.

If a field is unavailable in the current implementation, do not fabricate a control for it merely to fill the interface.

7. Real protocol state and visual feedback

All displayed states must derive from actual application state, contract responses, API responses, or existing indexed data.

Never use fabricated nodes, fake transactions, invented SLA activity, simulated provider states, or hardcoded success metrics to make the Canvas look active.

Handle these cases distinctly:

- Initial loading
- Connected and populated
- Connected but empty
- Wallet disconnected
- Wrong network
- RPC or API unavailable
- Transaction pending
- Transaction rejected
- Transaction failed
- Stale data, when detectable

Where the application has genuine historical or live state, represent it accurately. Where data is unavailable, show a clear unavailable or empty state instead of a plausible-looking placeholder.

Reuse existing polling, caching, and data hooks. Avoid duplicate RPC requests, redundant polling, or unnecessary full-graph rerenders.

8. Connection and animation quality

Improve the visual quality of graph connections and state transitions while preserving readability.

Use motion for meaningful events such as:

- Selecting a node
- Revealing a detail panel
- Following an actual request or settlement state change
- Highlighting a verified transition when supported by real data
- Expanding or collapsing contextual information

Use subtle line movement, particles, or pulses only when they represent a real, identifiable relationship or event.

Do not run an infinite animation across every edge. Do not invent activity to make the graph appear live.

Respect "prefers-reduced-motion". Ensure the workflow remains understandable when animation is disabled.

Prefer lightweight SVG, CSS, canvas, or existing rendering technology appropriate to the current implementation. Profile expensive graph rendering before adding complexity.

9. Layout, responsive design, and mobile

Make the Canvas usable across desktop, tablet, and mobile layouts.

Desktop:

- Use the available space effectively.
- Keep workflow navigation and inspection tools easy to find.
- Avoid oversized empty areas and cramped side panels.
- Ensure the main workflow remains the visual focus.

Tablet:

- Adapt side panels and graph controls to the available width.
- Avoid clipped nodes, hidden controls, and horizontal overflow.

Mobile:

- Prioritize workflow readability and the most important actions.
- Use an appropriate detail drawer, stacked layout, or other interaction pattern supported by the application.
- Make touch targets comfortable to use.
- Ensure zoom, pan, selection, and back-navigation work reliably.
- Do not simply shrink the desktop graph until its labels become unreadable.

Verify both dark and light themes if both are supported.

10. Accessibility and usability

Implement and verify:

- Semantic controls and accessible names.
- Keyboard-operable interactive elements.
- Visible focus indicators.
- Sufficient contrast.
- Status indicators that do not rely only on color.
- Accessible form labels and validation messages.
- Reduced-motion support.
- Appropriate announcements for important asynchronous status changes.
- Logical focus management when dialogs or drawers open and close.

Where a complex graph cannot be fully understood using a screen reader, provide an accessible complementary representation of its stages and relationships.

11. Reuse and engineering quality

Reuse the existing design system, graph components, hooks, contract interfaces, and state management where appropriate.

Avoid:

- Rewriting working Canvas functionality from scratch without justification.
- Creating parallel implementations of existing shared primitives.
- Introducing new dependencies for features already supported by the project.
- Broad refactors unrelated to the Canvas.
- Fake data, arbitrary timeouts, or simulated transaction success.
- Suppressing TypeScript errors or weakening tests to make checks pass.
- Removing existing protocol features simply to simplify the design.

Keep the implementation modular and consistent with repository conventions.

12. Testing and verification

Run the actual checks supported by the repository. Inspect "package.json" and the existing scripts first; do not assume command names.

At minimum, verify as applicable:

- TypeScript type checking.
- Linting.
- Production build.
- Existing unit and integration tests.
- SLA Canvas rendering and core interactions.
- Node selection and contextual details.
- Graph navigation and responsive behavior.
- Form validation and numeric formatting.
- Loading, empty, disconnected, error, and pending states.
- Wallet and network error handling.
- Dark and light theme behavior.
- Keyboard navigation and reduced-motion behavior.
- Browser console errors.
- Layout overflow and clipped controls at mobile and desktop sizes.

Use the project's existing browser-testing tools and relevant installed testing skills. If a browser or test environment is unavailable, state that limitation clearly instead of claiming verification.

Do not claim a test passed unless it actually ran and passed.

13. Documentation and project continuity

Update the existing documentation according to repository conventions:

- "docs/progress.md": record the actual Phase 4 work and verification results.
- "docs/decisions.md": record significant implementation or UX decisions.
- "docs/audit.md": record remaining issues or known limitations, if relevant.
- "docs/panel-inventory.md": update only if the Canvas or related panel inventory actually changed.

Preserve the current progress and do not mark unfinished work as complete.

If this repository has a prescribed phase workflow, follow it. Do not prematurely perform work assigned to later phases.

14. Git and safety requirements

- Inspect "git status" before editing and before finishing.
- Preserve unrelated user changes and untracked files.
- Do not reset, clean, or overwrite unrelated work.
- Do not push, deploy, or publish anything.
- Follow the repository's existing commit policy; do not create a commit unless the applicable specification or the user explicitly authorizes it.
- Do not interfere with another running worktree or development server.
- Do not report completion if the implementation or required checks are incomplete.

15. Final report

When finished, provide a concise but specific report containing:

1. What changed in the SLA Canvas.
2. Which real interactions now work.
3. Which data sources and contract/API flows are used.
4. Which installed skills were actually used.
5. Which tests and verification commands were run, with exact results.
6. Any remaining bugs, limitations, or blocked checks.
7. The actual Git status and whether a commit was created.

Definition of done: The existing SLA Canvas becomes visibly more polished, understandable, responsive, and interactive; real protocol functionality is preserved; all displayed state is truthful; and the changes are verified with the checks that the environment can actually run. 
<!-- END VERBATIM PROMPT -->
