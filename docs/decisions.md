# Decisions

Conservative choices made without stopping. Format: decision + reason.

- **Phase 1 — `#14D29E` (success) not added as a token.** No existing variable maps to it; adding one would introduce a new token. Success uses the existing green accent; Slashed/Failed use red. Reason: keep variable names, avoid new tokens.
- **Phase 1 — sidebar bg `#000C16` / active nav fill `#014237` applied at the shell/class level, not as global tokens.** The repo has no `--sidebar` token (sidebar uses `--bg-1`); changing `--bg-1` would darken every card. Reason: keep existing token names and avoid restyling unrelated surfaces.
