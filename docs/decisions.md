# Decisions

Conservative choices made without stopping. Format: decision + reason.

- **Phase 1 — `#14D29E` (success) not added as a token.** No existing variable maps to it; adding one would introduce a new token. Success uses the existing green accent; Slashed/Failed use red. Reason: keep variable names, avoid new tokens.
- **Phase 1 — sidebar bg `#000C16` / active nav fill `#014237` applied at the shell/class level, not as global tokens.** The repo has no `--sidebar` token (sidebar uses `--bg-1`); changing `--bg-1` would darken every card. Reason: keep existing token names and avoid restyling unrelated surfaces.
- **Phase 4 — `design/reference.png` is not on disk.** Only the text spec exists. Used the text specs (Parts 1-5) as the source of truth. Reason: image unavailable; specs cover copy and layout.
- **Phase 4 — Transaction Detail has no "View on Explorer" button.** The subgraph row exposes the `callId` (bytes32), not the escrow transaction hash, so an explorer link would be invented. The SLA Canvas + Details card already trace the lifecycle. Reason: never invent data.
- **Phase 4 — SLA Canvas kept as the repo's isometric 4-plate board.** RULES says reuse existing viz (`NetworkGraph`, `SLACanvas`) and do not rewrite from scratch; the reference's 2D hex-node layout is a guide only. Reason: stack rule wins.
- **Phase 4 — panel radii fixed with heuristic scripts (`/tmp/radii2.mjs`, `/tmp/radii3.mjs`).** Only inline `borderRadius` values in a safe set were changed (fields -> 10, buttons -> 999, cards -> 14); tiny badges/dots untouched. Values outside the mapping were left as-is. Reason: avoid visual regressions on elements that would not benefit.
- **Phase 4 — generic `monospace` / `JetBrains Mono` replaced with `var(--font-mono)` (Geist Mono) in 7 panels, and `Nano`'s hard-coded code-block colors tokenized.** Reason: fonts are fixed to Geist + Geist Mono; no raw palette values.
