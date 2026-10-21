# Phase process — persistent requirements, completion checklists, phase transitions

This file exists because of a verified incident, not as a general preference. Keep it short and follow it.

## Why this file exists (evidence)

On 2026-10-18 the Phase 4 brief (`design/PHASE_4.md`) was delivered at 20:10:02 (UTC+3) and was
summarised by the context-pruning plugin ~2 minutes later. Later sweeps produced summaries that
blended phases, and Phase 4 requirements (for example zoom/pan, and the §13 documentation rule)
never reached the following turn. Full evidence, timestamps and the plugin state file are recorded
in the previous investigation; the point here is the rule below.

A requirement that only exists in chat can be summarised away. A requirement that exists in a file
cannot.

## 1. Phase requirements live in the repository

- The delivered prompt of a phase is stored verbatim in `design/PHASE_<n>.md` when such a file
  exists (`PHASE_1.md` … `PHASE_5.md` today; the markers below are what make it verbatim).
  Phases 6, 7 and 8 have no verbatim prompt file: their prompts arrived in chat and are recorded
  instead as plans, a scope note and checklists — `design/PHASE_6_PLAN.md`,
  `design/PHASE_7_PLAN.md`, `design/PHASE_8.md`, and the files in `design/phase-checklists/`.
- The original wording sits between the markers
  `<!-- BEGIN VERBATIM PROMPT (original wording, unchanged) -->` and `<!-- END VERBATIM PROMPT -->`.
  **Never edit inside the markers.** Notes go in the provenance header or outside the markers.
- The provenance header records: source, session id, message id, delivery time, size, sha256 of the
  text, and any duplicate delivery. A prompt is only "original" if it was copied from that source.
- If a prompt cannot be recovered: say so explicitly. Do not reconstruct from memory or from
  summaries and call it original. See `design/PHASE_5.md` for the required wording of that case.
- Existing specifications (`design/SPEC_*.md`, `design/RULES.md`, `docs/*`) are never overwritten
  by this series.

## 2. Every phase ends with a completion checklist

Create `design/phase-checklists/PHASE_<n>_CHECKLIST.md` before the phase's work starts, and fill it
as work proceeds. One row per requirement in the phase prompt.

Status vocabulary — exactly these four:

| Status | Meaning |
|---|---|
| `PASS` | Implemented **and** verified, with the evidence named in the same row. |
| `PARTIAL` | Implemented, but something in the requirement is missing, unverified, or only partly covered. |
| `FAIL` | Required and not done, or done and shown not to work. |
| `UNVERIFIED` | Not measured. Absence of a failure report is not evidence. |

Rules:

- **Implementation and verification are separate columns.** "I wrote the code" is not a result;
  "typecheck exit 0", "screenshot path", "measured value 267px" is a result.
- A `PASS` requires a named verification that actually ran in this environment. Do not claim a test
  passed unless it ran and passed. If the environment cannot run a check (no screen reader, no
  tablet viewport), the row is `UNVERIFIED` or `PARTIAL`, never `PASS`.
- **A phase must not be reported as fully complete while any required row is `PARTIAL`, `FAIL`, or
  `UNVERIFIED`.**
- Skipped requirements are listed explicitly with the reason they were skipped.
- A requirement too vague to verify is recorded as written, classified `UNVERIFIED`, and flagged.

Template:

```markdown
# Phase <n> completion checklist

Prompt: design/PHASE_<n>.md (sha256 of the verbatim body: <hash>)
Phase commits: <sha> (<subject>), <sha> (<subject>)
Filled: <date> · Overall: NOT COMPLETE (see rows)

| # | Requirement (phase section) | Implementation evidence | Verification method | Actual result | Status | Limitation / blocker |
|---|---|---|---|---|---|---|
| 1 | §1 … | src/x.tsx:41 | bun run typecheck | exit 0 | PASS | — |
| 2 | §5 … | — | — | not attempted | FAIL | reason |
```

## 3. Phase transitions

Before starting a new phase:

1. **Read the phase prompt file** `design/PHASE_<n>.md` — the file, not a summary of it.
2. **Read `design/RULES.md`**, the relevant `docs/decisions.md` entries, and the previous phase's
   checklist unresolved rows (`PARTIAL` / `FAIL` / `UNVERIFIED`).
3. **Verify the real repository state** with `git status`, `git log --oneline -10` and fresh file
   reads. Do not trust a previous turn's summary — including your own.
4. **Keep scope to the current phase.** Unresolved items from an earlier phase are carried into the
   checklist as their own rows, not silently fixed (and not silently dropped).
5. **Never carry skill-usage claims across phases.** Each phase's checklist reports which skills
   were actually loaded or read *in that phase*, with timestamps. A skill used in an earlier phase
   is not evidence for this one.
6. **Record skipped requirements and why.** "Skipped because the environment cannot run it" is a
   valid entry; silence is not.

## 4. Scope

This file and `design/PHASE_1.md`–`PHASE_5.md` change documentation and configuration only. They do
not change application code, and they do not retro-fit earlier phases. Retro-fitting happens through
the checklists, one phase at a time, when that phase is next touched.
