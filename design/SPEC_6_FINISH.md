CONTINUE AND FINISH. Work autonomously, no questions, log decisions in docs/decisions.md. Same rules as design/SPEC_1 (UI layer only, keep all features and data flow, no invented copy).

PHASE A: Overview + shared primitives (design/SPEC_2). Fix via shared components so all panels benefit.
1. Card titles ("Live Network", "Recent Activity", "Transaction Flow", "Service Health", ...): title case as in SPEC_2, ~15px, medium weight, primary text color. Remove the tiny uppercase letter-spaced header style.
2. Stat cards: always render the sparkline area; no data -> dim flat baseline; show the green delta chip only when a real delta exists.
3. Live Network: scale NetworkGraph to fill the card, larger glowing nodes, soft green radial glow behind the center, keep Provider/Caller chips and legend.
4. Topbar: "Arc Testnet" pill (green dot) + wallet pill (avatar, short address, chevron) on the right, real network/address. Drop the "ARC TESTNET · LIVE" eyebrow only if it duplicates the pill.
5. Transaction Detail: "Transaction Details" must be the main title and the call id a secondary mono line (currently reversed).
Commit.

PHASE B: panel-level errors. For every panel that fetches data (useSubgraph, on-chain reads, API calls), replace ad-hoc error markup with the shared <ErrorState> (keep existing message text and retry actions). List changed panels in docs/audit.md. Commit.

PHASE C: sweep with real screenshots. Create a throwaway branch tmp-screenshots with the mock wallet (never merge). For each of the 34 panels: navigate (expand the "Developer Tools" group first when needed), WAIT until the page title matches, screenshot dark 1280, dark 411, light 1280; delete any screenshot whose title does not match. Compare with SPEC_2/SPEC_3 templates and fix shared primitives first on main. Record pass / fixed / blocked per panel in docs/audit.md. Also check the Transaction Detail with seeded mock data in the throwaway branch if the subgraph returns nothing. Batches of 4-6 panels, typecheck + build + commit.

PHASE D: landing at 1280 and 411, dark + light: 3D scene renders, SVG fallback with reduced-motion, no overflow, section order and navbar anchors per SPEC_4.

PHASE E: delete tmp-screenshots; confirm main has no mock-wallet code (git grep -n "mock(\|AutoConnect" src). typecheck + build. Update docs/progress.md.

If context passes ~70%: commit, update progress.md, tell me to start a fresh session.
FINAL REPORT (max 15 lines): per-panel pass/fixed/blocked counts, what changed visually, 3D status, anything unfinished.
