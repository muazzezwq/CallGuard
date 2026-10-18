<!--
Phase 5 — NO ORIGINAL PROMPT EXISTS. This file is a placeholder, not a specification.
Nothing in this file is an original requirement. Do not implement anything from it.
-->

# Phase 5 — original prompt not recoverable

**Status: NOT RECOVERED / NOT RECONSTRUCTED.**

No Phase 5 prompt was ever delivered to the model, so there is no wording to preserve.
This file exists only so the `design/PHASE_n.md` series is complete and so a future
Phase 5 can be added in the same place.

## Provenance of this conclusion

Searched (whole machine, read-only):

- `~/.local/share/opencode/opencode.db`, table `part` joined to `message`:
  every text part written by a user, in every session (6,182 messages / 25,336 parts total).
  - Case-insensitive search for `phase 5`, `phase five`, `phase_5`, `faz 5`, `aşama 5`: 10 hits,
    none of them a Phase 5 brief. 8 hits are assistant text from older, unrelated sessions
    (the earlier SPEC_1–SPEC_9 / panel-batch project). 1 hit is a progress-note heading
    (`docs/progress.md` "Phase 5 — Batch …"), 1 hit is this task's own brief.
  - All user messages longer than 4,000 characters in the whole database were listed and read by
    title. The delivered redesign briefs are: Phase 1 (twice), Phase 2 (twice), Phase 3, Phase 4,
    plus the earlier "Premium Landing Page" brief. There is no Phase 5 prompt.
- `docs/` and `design/` in the repository: `docs/progress.md` line 28 says
  "Next: Phase 5 remaining panels by template (T1-T7)" and lines 30–52 contain
  "Phase 5 — Batch 1…5" — that is the **old, earlier spec-driven panel project** (its own
  numbering: Phase 0–9, `design/SPEC_1…SPEC_9`). It is not the redesign Phase 5 and its
  requirements are already implemented and recorded (all 34 panels `done`).

## What is known about the redesign numbering

| Delivered prompt | File | Numbering used |
|---|---|---|
| Design system foundation | `design/PHASE_1.md` | redesign Phase 1 |
| Application shell / navigation / responsive UX | `design/PHASE_2.md` | redesign Phase 2 |
| Overview dashboard / live protocol intelligence | `design/PHASE_3.md` | redesign Phase 3 |
| SLA Canvas / interactive protocol visualization | `design/PHASE_4.md` | redesign Phase 4 |
| — | this file | never delivered |

The redesign briefs are written as self-contained per-phase instructions ("implement Phase N of a
larger application-wide redesign"), and each does not name the phases after it. No recovered text
describes what a Phase 5 would contain.

## How to complete this file when a Phase 5 arrives

1. Add the delivered prompt verbatim between the same markers used in `PHASE_1.md`–`PHASE_4.md`:

   ```
   <!-- BEGIN VERBATIM PROMPT (original wording, unchanged) -->
   …original text…
   <!-- END VERBATIM PROMPT -->
   ```

2. Fill the provenance header (source, session, message id, delivery time, size, sha256).
3. Do not summarise it and do not paraphrase requirements — copy them.
4. Copy the checklist template from `design/PHASE_PROCESS.md` to
   `design/phase-checklists/PHASE_5_CHECKLIST.md` before starting work.
