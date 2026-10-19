<!--
Phase 5 — provenance header (outside the markers; never edit inside them)

Source:    the user's message in this session (chat), OpenCode message store
Session:   ses_eb4f80b11ffenLQxHoNHeXii07
Message:   msg_1542df7dc001OPZ46XRH35F95L
Delivered: 2026-10-19T15:41:01 (local) / 2026-10-19T12:41:01Z
Size:      16240 characters, 16248 bytes (UTF-8)
sha256:    96ead39ffabe5f47160d0e343e86916128230b90679b8e3fc1ab867e1e4f7345  (of the verbatim body between the markers)
Duplicate: none — delivered once in this session.
Note:      This file replaces the earlier placeholder, which recorded that no Phase 5
           prompt had been delivered. The conclusion in that placeholder is now
           superseded: the prompt was delivered on the date above and is stored here
           verbatim. Earlier phases' files are untouched.
-->

<!-- BEGIN VERBATIM PROMPT (original wording, unchanged) -->
CallGuard — Phase 5: Premium Marketplace, Provider Discovery & Provider Management

Mission

Transform CallGuard's existing Marketplace and Provider-related screens into a polished, trustworthy, data-driven interface for discovering SLA providers, comparing offers, inspecting provider details, and managing provider services.

This phase must build on the actual implementation of Phases 1–4. Inspect the current repository and verify what has really been completed before making changes.

The goal is a production-quality experience for an on-chain SLA marketplace—not a static design mockup.

Preserve existing protocol behavior, contract integrations, APIs, application architecture, and working features. Improve the UX without inventing capabilities or data.

1. Inspect the repository first

Before editing:

- Check "git status" and preserve unrelated modifications and untracked files.
- Read the applicable "design/SPEC_*" files and current phase instructions.
- Review "docs/progress.md", "docs/decisions.md", "docs/audit.md", and "docs/panel-inventory.md" if present.
- Inspect the actual Marketplace, Providers, Provider Details, and related panels.
- Identify the real panel registry and navigation structure.
- Trace the current contract reads, writes, hooks, APIs, indexer queries, filtering, and provider state management.
- Identify which provider fields and actions are genuinely supported.
- Review the shared components and design tokens implemented in earlier phases.
- Inspect existing tests and browser-testing tools.

Do not assume a component, route, endpoint, contract method, or feature exists merely because it appears in this prompt. Locate the real implementation first.

2. Discover and apply relevant installed skills

Inspect the skills available in the current OpenCode environment. Read and apply all skills that materially help this task.

Consider skills covering:

- Frontend and premium interface design
- Web design guidelines and design-system consistency
- Marketplace UX and information architecture
- Data tables, filtering, sorting, and search
- React and TypeScript engineering
- Web3 wallet and transaction UX
- Accessibility and responsive design
- Animation and microinteractions
- Performance and rendering optimization
- Browser testing and visual regression
- Security and smart-contract interaction patterns, where relevant

Do not assume the names of these skills. Discover what is actually installed, read the relevant instructions, and apply them during implementation.

Do not install unrelated skills or add dependencies without a clear reason.

Record which skills were actually used in the final report. Never claim to have used a skill that was not available or read.

3. Design direction

Maintain the established CallGuard visual identity:

- Deep navy and charcoal surfaces.
- Emerald green as the primary accent.
- Restrained cyan and turquoise for secondary emphasis.
- Subtle borders and carefully layered surfaces.
- Clear typography and consistent spacing.
- Compact but readable information density.
- Purposeful motion and restrained visual effects.

Reuse the existing design tokens and shared primitives rather than introducing a second visual system.

Ensure Marketplace and Provider screens look like parts of the same application as Overview and SLA Canvas.

Avoid generic marketplace templates, excessive glow, oversized cards, unnecessary gradients, and decorative metrics that do not help users make decisions.

4. Marketplace: provider discovery

Improve the existing Marketplace to help users discover and evaluate available SLA providers.

Where supported by actual data, present useful information such as:

- Provider or agent name and verified identity.
- Service or endpoint description.
- Price per call and currency.
- Required stake or collateral.
- Maximum response time or configured SLA.
- Availability or operational status.
- Historical success rate, if genuinely calculated.
- Completed call count, if available.
- Reputation or routing score, if supported by the actual protocol.
- Network and contract context.
- Relevant verification or registration status.

Only display fields supported by the current implementation. Do not fill gaps with invented values.

Organize the information so users can compare providers quickly without opening every detail page.

Provider cards and list views

Inspect the current presentation and choose the most suitable layout for the real information density.

If both cards and tables already exist, make their roles clear rather than maintaining redundant views without a reason.

Each provider entry should have:

- A clear identity and service description.
- A strong visual hierarchy for price and SLA.
- Secondary information that is easy to scan.
- A clear status indicator.
- A contextual action, such as viewing details or initiating a supported call.

Keep cards compact and consistent. Avoid presenting every field with equal visual weight.

For table layouts, implement appropriate column widths, alignment, truncation, sorting affordances, and responsive behavior.

Do not introduce an action that is not connected to a real supported workflow.

5. Search, filters, and sorting

Audit the existing search and filtering logic before improving the interface.

Where supported by the available fields, provide useful filtering options such as:

- Search by provider name or service description.
- Maximum price.
- Response-time range.
- Minimum stake or available stake information.
- Operational status.
- Relevant network or verification status.
- Supported reputation or performance thresholds.

Provide sorting options only when the corresponding data exists, for example:

- Lowest price.
- Fastest configured response time.
- Highest verified success rate.
- Highest supported reputation score.

Requirements:

- Filters must affect the actual displayed results.
- Search must not be a decorative input.
- Sorting must use the underlying values, not formatted display strings.
- Numeric sorting must correctly handle decimals and units.
- Multiple filters must work together.
- Clearing filters must restore the appropriate results.
- Loading, empty, and error states must remain distinct.
- If the backend does not support a filter, determine whether safe client-side filtering is appropriate; do not imply that unsupported server-side filtering exists.
- Keep the active filter state understandable and easy to reset.

Do not add complicated filter controls when the available provider dataset is too small to justify them.

6. Provider details

Improve the existing provider detail experience if one exists.

Organize real information into a clear hierarchy:

- Identity and service overview.
- Price and SLA configuration.
- Stake and collateral information.
- Actual performance and reputation data.
- Relevant contract or network information.
- Recent activity or history, if available.
- Supported actions and their current state.

Make important values easy to compare and interpret.

For addresses and transaction hashes, use appropriate truncation with a way to inspect or copy the complete value. Use existing explorer-link logic only where the network and destination are known and valid.

Show the difference between:

- Verified information.
- Provider-supplied configuration.
- Calculated historical statistics.
- Unavailable information.

Do not imply that a provider is trustworthy merely because its profile is complete. Do not claim security audits, identity verification, or performance guarantees unless the implementation and data support those claims.

7. Provider management

Inspect the existing provider management panels and preserve their current capabilities.

Where implemented, improve the workflows for:

- Registering or configuring a provider.
- Updating supported SLA parameters.
- Reviewing price and stake requirements.
- Viewing the provider's own service status.
- Inspecting relevant transactions or call history.
- Understanding pending and completed actions.
- Managing supported provider settings.

Keep provider discovery separate from provider administration where that distinction makes the interface clearer.

Do not expose administrative controls to users who are not authorized to use them.

For every write operation:

1. Validate the input using the actual contract and application constraints.
2. Clearly explain the proposed change.
3. Show relevant costs and requirements where available.
4. Let the user review the transaction before wallet confirmation.
5. Represent pending, confirmed, rejected, and failed outcomes correctly.
6. Refresh the relevant state after the actual transaction result.

Never report success before confirmation. Do not submit duplicate transactions because of repeated clicks or rerenders.

Do not create a new registration or editing workflow if the underlying protocol does not support it.

8. Price, stake, and SLA presentation

Make financial and operational values precise and easy to understand.

- Respect the actual USDC denomination and token decimals used by the current contracts.
- Avoid floating-point arithmetic for financial calculations when integer-safe utilities are available.
- Distinguish price per call from total cost.
- Distinguish provider stake from caller payment.
- Explain units beside response-time and percentage values.
- Display unavailable or unknown values explicitly.
- Avoid rounding that materially changes the meaning of small payments.
- Do not infer current liquidity, available stake, or provider availability from unrelated fields.
- Use existing formatting utilities where appropriate.

If the application supports estimating a call cost, use the real pricing logic and clearly state which components are included. Do not invent fees or guarantees.

9. Reputation and performance data

Audit the origin and meaning of every provider score and performance statistic.

If the repository has a genuine reputation or routing system, represent it clearly and consistently.

For each metric, determine:

- Its actual data source.
- Whether it is historical or current.
- How it is calculated.
- Whether its sample size is meaningful.
- Whether it can be stale or unavailable.

Do not combine unrelated scores into a new invented ranking formula.

Do not display success-rate percentages without a valid denominator. Do not show fake sparklines, fabricated trends, or simulated activity.

If a metric cannot be verified, omit it or display an appropriate unavailable state.

10. Loading, empty, and error states

Implement deliberate states for the real data lifecycle:

- Initial loading.
- Search in progress, if applicable.
- Results available.
- No providers registered.
- No providers match the filters.
- Wallet disconnected.
- Unsupported network.
- RPC or API unavailable.
- Stale data, when detectable.
- Provider details unavailable.
- Transaction pending.
- Transaction rejected.
- Transaction failed.

Use skeletons only when they help communicate the eventual layout. Avoid infinite loading states when the underlying request has failed.

Provide clear recovery actions where appropriate, such as retrying a failed read or resetting filters.

Do not make errors look like empty results.

11. Meaningful motion and visual feedback

Use restrained animations to improve usability:

- Subtle provider-card hover states.
- Clear transitions when filters change.
- Smooth reveal of provider details.
- Feedback when copying an address.
- Appropriate status transitions after real data changes.
- Loading indicators for actual asynchronous operations.

Avoid infinite card animations, fake live indicators, artificial counter increments, and decorative activity that suggests nonexistent network events.

Respect reduced-motion preferences and ensure that all essential information remains available without animation.

12. Responsive behavior

Test Marketplace and Provider screens on desktop, tablet, and mobile.

Desktop:

- Make comparison and scanning efficient.
- Use the available width without stretching text excessively.
- Keep important filters easy to access.

Tablet:

- Adapt the filter layout and information density.
- Avoid clipped actions and unnecessarily wide tables.

Mobile:

- Use stacked cards or an appropriate compact layout.
- Preserve price, SLA, provider identity, and primary actions.
- Make filters usable without taking over the screen.
- Ensure long addresses, names, and endpoint descriptions do not break the layout.
- Avoid forcing users to scroll horizontally through a wide table when a better layout is practical.

Test both supported themes and respect the application's existing navigation patterns.

13. Accessibility

Verify:

- Semantic labels and accessible form controls.
- Keyboard navigation through search, filters, results, and actions.
- Visible focus states.
- Appropriate contrast.
- Status indicators that do not rely on color alone.
- Clear form errors and transaction feedback.
- Accessible dialogs, drawers, and menus.
- Reduced-motion support.
- Comfortable touch targets on mobile.

Do not sacrifice accessibility for visual effects or compact layouts.

14. Performance and architecture

- Reuse existing data hooks, caching, polling, and query infrastructure.
- Avoid fetching the same provider data multiple times.
- Avoid introducing a new state-management layer.
- Keep filtering and sorting efficient for the expected dataset.
- Preserve pagination or virtualization if already supported and necessary.
- Avoid expensive animations on large lists.
- Do not introduce new packages without justification.
- Do not change contract interfaces or APIs merely to simplify the UI.
- Preserve existing functionality and navigation.

15. Verification and testing

Inspect the repository's actual scripts and testing setup, then run the applicable checks.

Verify:

- TypeScript type checking.
- Linting.
- Production build.
- Relevant unit and integration tests.
- Marketplace rendering with real provider data.
- Search, combined filters, sorting, and reset behavior.
- Empty, loading, stale, and error states.
- Provider detail navigation.
- Copy and explorer-link behavior.
- Provider management permissions and validation.
- Transaction lifecycle handling, where applicable.
- Financial formatting and numeric sorting.
- Desktop, tablet, and mobile layouts.
- Dark and light themes.
- Keyboard navigation and reduced-motion behavior.
- Browser console errors.

Use available browser-testing and design-audit skills. Do not claim browser verification if a browser was not actually used.

Do not weaken tests, hide errors, or claim a successful build without running it.

16. Documentation and Git safety

Update the existing documentation according to the repository's conventions:

- "docs/progress.md": actual Phase 5 implementation and verification results.
- "docs/decisions.md": important UX or technical decisions.
- "docs/audit.md": remaining issues or limitations, when relevant.
- "docs/panel-inventory.md": only if the actual panel inventory changes.

Before finishing:

- Check "git status".
- Preserve unrelated changes.
- Follow any repository-specific phase and commit instructions.
- Do not push, deploy, or publish.
- Do not commit unless explicitly authorized or required by the applicable repository instructions.
- Do not interfere with another worktree or running development server.

17. Final report

Provide a concise report covering:

1. Marketplace and Provider screens improved.
2. Working search, filtering, sorting, and navigation.
3. Provider management actions that genuinely work.
4. Real data sources and contract/API integrations used.
5. Installed skills actually read and applied.
6. Tests and commands run, with exact results.
7. Remaining bugs, limitations, or blocked checks.
8. Final Git status and whether a commit was created.

Definition of done: Users can discover and compare real providers, understand their actual SLA and pricing information, inspect provider details, and use supported provider-management workflows through a consistent, responsive, accessible CallGuard interface—with no fabricated data and no regressions to existing protocol functionality. 
<!-- END VERBATIM PROMPT -->
