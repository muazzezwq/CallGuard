<!--
Phase 3 — original prompt, recovered verbatim.
Source:     OpenCode session storage, /root/.local/share/opencode/opencode.db (tables message/part, role=user)
Session:    ses_eb4f80b11ffenLQxHoNHeXii07
Message id: msg_14fc816fb001he1x2amFwKwkoM
Delivered:  2026-10-18 19:11:15 (UTC+3) = 2026-10-18 16:11:15Z
Fidelity:   byte-for-byte copy of the delivered message text; 19464 characters; sha256 c5c4d83458171afc9876ee265a54b65671dc6582dbc2ac3b57935bda9afbd477
Everything below is the original wording. Do not edit it; add notes outside the markers.
-->

<!-- BEGIN VERBATIM PROMPT (original wording, unchanged) -->
CallGuard — Phase 3: Premium Overview Dashboard, Live Protocol Intelligence & Data Visualization

PRIMARY OBJECTIVE

Implement Phase 3 of the CallGuard application redesign: transform the existing Overview panel into a premium, information-rich, responsive protocol operations dashboard.

The Overview must give users a clear, trustworthy picture of the current CallGuard system, its actual on-chain activity, provider availability, SLA performance, payment and escrow state, and recent operations.

This must be a functional redesign of the existing application—not a static concept, mockup, or replacement dashboard filled with fabricated data.

Use all relevant design and engineering skills available to OpenCode. Explore the installed skills before implementation and apply the best available techniques for dashboard design, data visualization, motion design, accessibility, responsive engineering, and performance.

Do not stop after writing a plan. Inspect, implement, test, and verify the actual application.

---

1. INSPECT THE REAL PROJECT FIRST

Begin with:

- "git status"
- "git log --oneline -5"
- Current design specifications and applicable project instructions.
- "docs/progress.md"
- "docs/decisions.md"
- "docs/audit.md"
- "docs/panel-inventory.md", if available.
- The actual Overview component and its imports.
- The current application shell and design tokens.
- Existing data hooks, stores, services, and event subscriptions.
- Existing charts, tables, metric cards, and empty states.
- Current network configuration and explorer-link helpers.
- Existing loading, error, retry, and disconnected states.
- Current package scripts and available testing tools.

Inspect the results of Phases 1 and 2 rather than assuming those phases have been completed successfully. Reuse their actual tokens, shared components, layout, and navigation if present.

If an earlier phase remains incomplete, preserve compatibility and document any dependency that prevents safe implementation.

Inspect the actual repository before choosing component names, data sources, or file locations.

2. EXPLORE AND USE ALL RELEVANT INSTALLED SKILLS

Inspect the skills available to OpenCode and use all that materially improve this task.

Review relevant skills covering:

- Frontend design and premium dashboard composition.
- Design systems and component reuse.
- Data-dense information architecture.
- Data visualization and chart design.
- React and TypeScript implementation.
- Responsive layouts and mobile UX.
- Motion design and meaningful microinteractions.
- Accessibility and keyboard navigation.
- Performance optimization.
- Browser-based testing and visual inspection.
- Web design guidelines.
- Code quality and regression testing.

Also inspect other available skills if they are relevant.

Read and follow the actual instructions of the applicable skills. Resolve conflicting advice thoughtfully and keep the final design cohesive.

Do not invent skill names or claim that an unavailable skill was used. Record the relevant skills actually used in the final report.

3. DESIGN DIRECTION

Build a polished protocol operations dashboard consistent with CallGuard's existing identity.

Visual principles:

- Deep navy and near-black surfaces.
- Emerald as the primary accent.
- Restrained cyan and turquoise for relevant data visualizations.
- Clear typography and strong information hierarchy.
- Fine borders and subtle surface separation.
- Carefully controlled shadows and glow.
- Compact but readable data presentation.
- Consistent spacing and alignment.
- Meaningful empty and loading states.
- Clear distinction between primary metrics and secondary information.

Reuse the existing design tokens and shared primitives.

Do not introduce a competing color palette, unrelated visual style, excessive gradients, unnecessary glass effects, or glowing borders on every card.

The dashboard should feel like a professional developer and infrastructure operations product.

4. DEFINE THE OVERVIEW INFORMATION ARCHITECTURE

Inspect the existing Overview panel, actual panel inventory, and available protocol data before deciding on the final composition.

The Overview should answer five questions quickly:

1. Is the application connected to the expected network?
2. What protocol activity has actually occurred?
3. What financial and SLA state is visible from the available data?
4. What has happened recently?
5. What should the user inspect or do next?

Use a deliberate hierarchy instead of placing every metric into equally prominent cards.

Suggested page structure

A. Overview header

- Clear page title.
- Short, useful description.
- Real network context.
- Relevant existing actions.
- Refresh status or last-updated information when supported by the data source.

B. Network and protocol status

A compact section communicating actual connection and data availability.

Possible states:

- Connected.
- Connecting.
- Disconnected.
- Error.
- Data unavailable.
- Data loading.

Do not conflate wallet connectivity, RPC connectivity, and indexer health. Show separate statuses only when their underlying state can actually be determined.

C. Primary metric cards

Inspect the existing metrics and choose the most valuable available indicators.

Potential metrics:

- Total calls.
- Active providers.
- Escrowed USDC.
- SLA success rate.

Other metrics may be used if they are better supported by the actual implementation.

For each metric, define:

- Clear label.
- Correct value and unit.
- Optional concise explanation.
- An honest loading, unavailable, or error state.
- A trend only when sufficient real historical data exists.

Do not invent percentage changes or compare against nonexistent historical values.

D. Main analytical section

Use the actual data available to select useful visualizations, for example:

- Call activity over time.
- SLA outcomes.
- Provider distribution.
- Escrow or payment activity.

Only include charts that answer a real question. Fewer meaningful charts are better than many decorative ones.

E. Live Network and Recent Activity

These two cards should form a balanced layout on suitable desktop widths.

- Both cards should have a consistent visual height when displayed side by side.
- Both should use deliberate internal spacing.
- Both should handle empty, loading, and error states consistently.
- The Recent Activity list must not stretch or distort the layout because of long transaction identifiers.
- The Live Network panel must show genuine network or protocol information—not simulated nodes pretending to represent live activity.

On smaller screens, stack the cards naturally.

F. Next actions

Where supported, provide contextual links to existing destinations, such as:

- Create an SLA.
- Open the Marketplace.
- Open Call Builder.
- Inspect a receipt.
- View a provider.

Only show actions that correspond to real, existing functionality.

Avoid redundant CTA buttons that compete with the main dashboard information.

5. REAL DATA ONLY — NON-NEGOTIABLE

This is an on-chain infrastructure dashboard. Data integrity matters more than visual impressiveness.

Trace every metric to its actual source.

Inspect:

- Existing RPC queries.
- Contract reads and event logs.
- Existing indexer or subgraph integrations.
- Current data hooks and caches.
- Recent transaction data.
- Existing analytics calculations.
- Network and wallet state.
- Current block or timestamp information when available.

Reuse existing sources rather than creating a parallel data system.

Metric rules

- Do not fabricate total calls, providers, escrow, transactions, or SLA success rates.
- Do not insert hardcoded sample values to fill empty cards.
- Do not simulate a live feed.
- Do not animate counters toward made-up targets.
- Do not display a fabricated percentage change.
- Do not treat an empty result as proof that the protocol has never had activity.
- Do not interpret a failed request as a genuine zero.
- Do not label cached data as live without disclosing its freshness.
- Do not mix data from different networks.
- Do not silently substitute testnet data into a mainnet context or vice versa.

When data is unavailable, show a useful empty or unavailable state with a clear explanation where appropriate.

Distinguish zero from unknown, loading, disconnected, and error states.

If a metric's current definition is ambiguous, inspect its existing implementation and document the correct interpretation before changing its presentation.

Do not modify contract behavior or financial calculations for display purposes.

6. METRIC CARDS AND SPARKLINES

Create a coherent metric-card design using existing shared primitives.

Each card should provide:

- Clear title.
- Readable primary value.
- Correct unit and formatting.
- Optional concise contextual label.
- Consistent loading and error states.
- Optional sparkline if genuine historical data exists.

Sparkline requirements

Sparklines must enhance the metric rather than serve as decoration.

- Use actual historical values.
- Do not invent a trend when only one current value exists.
- Do not stretch a short series into a misleading time range.
- Use a consistent chart baseline and padding.
- Make the sparkline use the available card width without clipping.
- Preserve its intended aspect ratio.
- Prevent SVG paths from overflowing their container.
- Avoid unnecessary axis labels in compact charts.
- Provide accessible context for the data represented.

If no real historical series exists, use a clean card without a fake sparkline.

Numeric formatting

Use appropriate formatting for:

- USDC amounts.
- Percentages.
- Counts.
- Block numbers.
- Durations.
- Timestamps.

Respect the project's existing precision conventions and financial semantics.

Do not silently round values in ways that misrepresent financial amounts.

Use tabular numerals where helpful.

7. LIVE NETWORK VISUALIZATION

If the existing Live Network component can be reused, inspect and improve it rather than replacing it unnecessarily.

The visualization should communicate actual, meaningful information such as:

- Available providers.
- Known protocol relationships.
- Observed activity.
- Connection or query status.
- Relevant network metadata.

Only visualize relationships that the application can actually substantiate.

If the underlying data does not support a live graph, present a useful network-status view instead of fabricating topology.

Visual behavior

Where suitable, use:

- Subtle node highlighting.
- Lightweight transitions when real state changes.
- Clear selected or active states.
- Tooltips for meaningful nodes.
- A restrained emerald/cyan palette.
- A graceful static or simplified fallback.

Avoid constant motion that suggests network activity when no new data is arriving.

Do not introduce a new heavyweight 3D scene into Overview merely because the landing page has one.

Reuse existing visualization dependencies and keep the Overview fast.

8. RECENT ACTIVITY

Build a readable activity panel based on real, available records.

Potential fields, depending on the existing data model:

- Event or operation type.
- Transaction or receipt identifier.
- Provider or relevant participant.
- Timestamp.
- Status.
- Relevant amount.
- Network context.

Only display fields that actually exist and can be interpreted correctly.

Requirements:

- Use accurate status labels.
- Handle long hashes and identifiers without overflow.
- Provide links to the correct explorer when the destination is known and supported.
- Preserve access to the full identifier.
- Make timestamps understandable.
- Show a clear empty state when there are no returned records.
- Distinguish no results from request failure.
- Keep list scrolling controlled and accessible where appropriate.

Do not fabricate activity to make the dashboard look busy.

9. LIVE UPDATES AND REFRESH BEHAVIOR

Inspect how data is currently fetched and updated.

Reuse existing polling, subscriptions, caching, or event-driven refresh mechanisms where appropriate.

- Do not introduce duplicate polling loops.
- Avoid unnecessary full-page rerenders.
- Avoid aggressive RPC requests.
- Avoid unbounded event scans.
- Respect existing rate limits and caching behavior.
- Clean up subscriptions and timers correctly.
- Handle temporary network failures gracefully.
- Keep stale data distinguishable from fresh data.
- Avoid flashing all metric cards during every refresh.

If manual refresh is already supported or appropriate, provide clear feedback for the refresh action.

Only display a refresh timestamp if it reflects an actual refresh or data-update event.

10. PURPOSEFUL MOTION AND INTERACTION

Explore applicable motion-design skills and use the existing project's animation tools where appropriate.

Possible enhancements:

- Subtle metric-value transitions when real values change.
- Lightweight chart transitions.
- Controlled card hover feedback.
- Smooth disclosure of additional details.
- Clear loading skeletons.
- Gentle status-indicator transitions.
- Subtle highlighting of newly observed activity when supported by the data source.

Do not use animation to fabricate activity or exaggerate changes.

Avoid:

- Infinite decorative pulsing.
- Fake counting animations.
- Large motion that delays interaction.
- Expensive blur filters.
- Constant chart animation.
- Animation that makes numbers difficult to read.
- Excessive use of Framer Motion for simple CSS transitions.

Respect "prefers-reduced-motion".

Animation must never be necessary to understand the dashboard.

11. RESPONSIVE DESIGN

Design and verify the actual Overview at desktop, tablet, and narrow mobile widths.

Desktop

- Strong information hierarchy.
- Balanced metric cards.
- Analytical sections that use space efficiently.
- Live Network and Recent Activity at matching heights where displayed side by side.
- Full-width sparklines within their metric cards.
- Comfortable data density.

Tablet

- Adapt grid columns appropriately.
- Prevent compressed charts and metrics.
- Reflow activity lists when necessary.

Mobile

- Stack sections logically.
- Keep primary metrics readable.
- Avoid tiny chart labels.
- Prevent horizontal overflow.
- Preserve access to transaction identifiers and relevant actions.
- Make refresh and navigation controls touch-friendly.
- Reduce visualization complexity if necessary.

Do not simply shrink the desktop dashboard.

12. ACCESSIBILITY

Ensure:

- Semantic heading hierarchy.
- Accessible chart summaries or equivalent textual context.
- Visible keyboard focus.
- Meaningful accessible names.
- Sufficient contrast.
- Status communication that does not depend on color alone.
- Keyboard-operable interactive elements.
- Reduced-motion support.
- Proper loading and error announcements where appropriate.
- No inaccessible hover-only information.
- No unnecessary ARIA attributes.

Do not disable accessibility lint rules to avoid fixing real problems.

13. PERFORMANCE AND ARCHITECTURE

- Preserve the existing application architecture.
- Reuse current dependencies.
- Avoid unnecessary new dependencies.
- Keep charts and visualization code appropriately split where the current architecture supports it.
- Avoid eager imports of heavy 3D or charting libraries without a demonstrated need.
- Avoid unnecessary React state updates.
- Avoid rendering an entire activity list when a bounded list is sufficient.
- Prevent chart resize loops.
- Clean up observers and listeners.
- Avoid expensive work on every render.
- Preserve existing data hooks, caches, and network protections.
- Do not modify contracts, API semantics, settlement logic, or transaction behavior.

Do not rewrite unrelated application panels.

14. IMPLEMENTATION AND VERIFICATION

Work autonomously in clear increments.

Step A — Baseline

Inspect the current Overview, its data sources, design system, application shell, and recent Git changes.

Run available baseline checks when feasible.

Step B — Data audit

Create a short internal mapping of each displayed metric to its real source and calculation.

Identify unavailable metrics rather than inventing values.

Step C — Implement

Improve the existing Overview using the current shared components and design tokens.

Implement the metric cards, analytical areas, Live Network, Recent Activity, empty states, and responsive behavior as supported by the actual data.

Step D — Browser verification

Use the existing preview workflow when available.

Do not interrupt a development server owned by another session. Use a separate available port for your own verification.

Verify:

- The Overview loads correctly.
- All displayed metrics use real data.
- Loading, empty, disconnected, and error states are distinct.
- Live Network represents actual information.
- Recent Activity contains genuine records.
- Sparklines use real historical data.
- Sparklines occupy the intended card width.
- Live Network and Recent Activity align correctly.
- Responsive layouts work.
- Charts resize correctly.
- Navigation actions work.
- No new console errors occur.
- Reduced-motion behavior works.
- No horizontal overflow or content clipping occurs.

Step E — Automated checks

Inspect the actual package scripts and execute the appropriate available commands for:

- TypeScript.
- ESLint.
- Production build.
- Relevant automated tests.

Fix regressions introduced by the changes.

Do not claim that tests, browser checks, or performance measurements passed unless they were actually performed.

Step F — Documentation and Git

Update:

- "docs/progress.md"
- "docs/decisions.md"

Update other existing documentation only when relevant.

Record actual changes, skills used, verification results, known limitations, and remaining work.

Follow the repository's established commit conventions. Do not commit unrelated changes. Do not push or deploy without explicit approval.

15. ACCEPTANCE CRITERIA

Phase 3 is complete when:

- Overview presents a clear and useful view of actual protocol state.
- Primary metrics are correctly sourced and formatted.
- No fabricated metrics, trends, or activity are displayed.
- Loading, empty, unavailable, disconnected, and error states are handled correctly.
- Live Network and Recent Activity use a consistent, balanced layout.
- Sparklines display genuine historical data and fit their available width.
- Charts and activity panels remain readable on mobile.
- Animations are restrained, meaningful, and accessible.
- Existing application functions and data sources remain intact.
- TypeScript, lint, build, and relevant tests have been executed where available.
- Browser verification has been performed where possible.
- Actual results and unresolved issues are documented.
- No unauthorized push or deployment has occurred.

FINAL REPORT

Provide a concise report including:

1. Overview components and files changed.
2. Metrics implemented and their real data sources.
3. Charts and visualizations implemented.
4. Live Network and Recent Activity behavior.
5. Responsive and animation improvements.
6. Relevant skills actually used.
7. TypeScript, lint, build, and test results.
8. Browser verification results.
9. Any metrics unavailable because the data source does not support them.
10. Remaining issues.

Start by inspecting the actual repository, applicable specifications, and available skills. Then implement the complete Overview redesign. Do not stop after producing a plan. 
<!-- END VERBATIM PROMPT -->
