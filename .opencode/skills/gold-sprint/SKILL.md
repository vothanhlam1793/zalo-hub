---
name: gold-sprint
description: >
  Multi-phase execution workflow for substantial codebase work after the task is reasonably clear. Covers 3 modes: (1) Gold/Sprint for large feature delivery across planning, implementation, verification, and testing; (2) Reorg for restructuring messy codebases with proposal, confirmation, migration, and verification; (3) Docgen for generating project and module documentation for existing codebases. Use this whenever the user wants to deliver a sizeable feature, run a structured sprint, reorganize a messy repo with explicit checkpoints, or generate comprehensive docs for a real codebase. If the request is still vague, the repo must be reviewed first, or the workflow files do not exist yet, use `task-intake` first so the shared `workflow/` contract is initialized before Gold Sprint begins.
---

# Gold Sprint Skill

Three modes for managing large codebases. Read the user's intent and pick the right mode — don't ask if it's obvious.

## Shared workflow contract

This skill does not start from a blank slate when a shared workflow already exists.

Before selecting `GOLD`, `REORG`, or `DOCGEN`, read the shared workflow files if present:

- `workflow/brief.md`
- `workflow/repo_assessment.md`
- `workflow/handoff.md`

Use `references/shared-workflow-contract.md` as the contract for shared files.

Rules:

- All notes inside `workflow/` must be written in English.
- Treat `workflow/brief.md` and `workflow/repo_assessment.md` as the primary source of truth.
- Update `workflow/plan.md`, `workflow/verification.md`, `workflow/decision_log.md`, and `workflow/handoff.md` as execution progresses.
- Skill-specific files may add depth, but they must stay aligned with the shared workflow files.
- If `workflow/` does not exist and the task is still at the beginning, do not invent a parallel note structure. Hand off to `task-intake` first unless the user explicitly wants to skip intake and accepts the risk.

---

## MODE SELECTION

| User says… | Mode |
|---|---|
| Build / implement / feature mới / sprint / gold | → **GOLD** |
| Rối / cơ cấu lại / restructure / refactor thư mục | → **REORG** |
| Tài liệu / docs / README / onboarding / AGENTS.md | → **DOCGEN** |
| Codebase mới tiếp nhận, không biết bắt đầu từ đâu | → **REORG** then **DOCGEN** |

---

## MODE 1 — GOLD (Feature Development)

Build new features with full quality gates across sprints.

### Core Concepts
- **Gold**: A large feature = 3–4 sprints. Has its own folder.
- **Sprint**: One complete dev cycle. Produces testable output.
- **Phase**: Named agent role. Always runs sequentially.

### Folder Structure
```
workflow/
├── brief.md
├── repo_assessment.md
├── plan.md
├── verification.md
├── handoff.md
└── decision_log.md

gold_<N>_<slug>/
├── gold_brief.md
├── gold_summary.md
└── sprint_<N>/
    ├── plan.md             ← Planner: technical plan
    ├── test_key.md         ← Planner: test cases + scoring
    ├── report.md           ← Tester: score 0–100%
    ├── coder_response.md   ← Coder: failure analysis
    └── sprint_summary.md   ← Main: final assessment
```

### Sprint Execution (run in order, no skipping)
```
[ ] MAIN      → Confirm sprint scope with user
[ ] PLANNER   → Write plan.md (escalate if needed) + test_key.md
[ ] MAIN      → If escalated: confirm with user before continuing
[ ] CODER     → Implement per plan.md
[ ] VERIFIER  → Check code quality; send back to Coder if critical issues
[ ] TESTER    → Run test_key.md, write report.md (score 0–100%)
[ ] CODER     → Write coder_response.md (failure root cause, not re-implementation)
[ ] MAIN      → Write sprint_summary.md, present to user, ask: next sprint / pause / adjust?
```

### Phase Discipline (mandatory)

This workflow is sequential in both logic and communication. Do not silently blend phases together.

- Before starting a phase, explicitly announce the transition in chat using a short marker such as `MAIN -> PLANNER`, `PLANNER -> CODER`, `CODER -> VERIFIER`, `VERIFIER -> TESTER`, `TESTER -> MAIN`.
- Each phase must complete its required artifact(s) before the next phase begins.
- Do not skip `VERIFIER` or `TESTER` just because the sprint feels small. Small scaffolding/documentation sprints may use lightweight verification/testing, but they must still produce the expected files.
- `MAIN` is the only role that talks to the user for confirmations. `PLANNER`, `CODER`, `VERIFIER`, and `TESTER` work through artifacts.
- If one assistant is performing multiple roles, it must still behave as if the roles are separate: finish one phase, report that it is complete, then move to the next phase.
- If a phase discovers missing information or a meaningful tradeoff, control returns to `MAIN`, who asks the user before work continues.
- Do not treat quick progress updates as a substitute for phase completion. Phase completion requires the artifact for that phase.

### Minimum Artifacts Per Phase

- Shared workflow state before execution: `workflow/brief.md`, `workflow/repo_assessment.md`, `workflow/handoff.md`
- Shared execution state during and after execution: `workflow/plan.md`, `workflow/verification.md`, `workflow/decision_log.md`
- `MAIN` at Gold kickoff: `gold_brief.md`
- `PLANNER`: `plan.md` and `test_key.md`
- `CODER`: code/document/file changes required by the plan
- `VERIFIER`: verification notes in the sprint record or explicit pass/fail assessment before testing
- `TESTER`: `report.md`
- `CODER` after testing: `coder_response.md`
- `MAIN` at sprint close: `sprint_summary.md`

For small or non-code sprints, `VERIFIER` may be concise and `TESTER` may validate structure/scope instead of runtime behavior, but both phases still happen in order.

### Phase Responsibilities

**MAIN** — sole contact with user. Never skips confirmation before new sprint or Gold.
- Gold kickoff: read shared workflow files → clarify only what is still missing → write gold_brief.md → confirm → Sprint 1
- Sprint end: read report.md + coder_response.md → write sprint_summary.md → present → ask next step
- Continuing gold: read gold_brief.md + last sprint_summary.md → propose scope → confirm

**PLANNER** — technical precision, no ambiguity.
- update `workflow/plan.md` first, then write sprint `plan.md`: scope, architecture decisions + rationale, file/module breakdown, implementation sequence, risks
- test_key.md: 3–10 test cases, each with input/expected output/pass criteria/weight (weights sum to 100%)
- Escalate to Main when: architecture has real tradeoffs, new tech stack additions, touching sensitive modules, anything user flagged as needing sign-off. See `references/escalation_guide.md`.

**CODER** — implement exactly per plan.md. Stop and report to Main if plan is contradictory.

**VERIFIER** — structural check only (no running tests). Flag: plan vs implementation mismatches, broken imports, missing error handling. Update `workflow/verification.md` with the current state before Tester runs. Send critical issues back to Coder before Tester runs.

**TESTER** — score = Σ(weight × pass_factor). pass_factor: 1.0 pass / 0.5 partial / 0.0 fail.

**CODER (response)** — for each failed test: root cause + fixable next sprint? + suggested fix. Analysis only, no re-implementation. Record important tradeoffs in `workflow/decision_log.md`.

See `references/shared-workflow-contract.md` for shared file expectations and `references/file_templates.md` for exact mode-specific output formats.

---

## MODE 2 — REORG (Codebase Restructuring)

For codebases that are messy, hard to navigate, or have grown without structure.

### Flow
```
[ ] ANALYZER  → Scan codebase, understand current structure
[ ] PROPOSER  → Propose new structure (tree + rationale + risk)
[ ] MAIN      → Present proposal to user, wait for confirm
[ ] USER      → Confirm / adjust / reject parts
[ ] MIGRATOR  → Generate migration plan (file moves, import updates)
[ ] MAIN      → Present migration plan, confirm before execution
[ ] EXECUTOR  → Execute refactor (move files, update imports, fix references)
[ ] VERIFIER  → Confirm no broken imports, tests still pass, app still runs
[ ] MAIN      → Report to user: what moved, what's left, any issues
```

### ANALYZER
Scan the project and update `workflow/repo_assessment.md` before producing `reorg/analysis.md`:
- Current folder tree (full depth)
- Identified problems: mixed concerns, circular dependencies, inconsistent naming, orphaned files, modules too large/too small
- Hotspots: which files are imported the most? which are never imported?
- Tech stack detected (framework, language, conventions)

### PROPOSER
Update `workflow/plan.md`, then produce `reorg/proposal.md`:

```
## Proposed Structure

<new folder tree here>

## Changes Explained
For each moved/renamed item:
- FROM: src/utils/authHelper.ts
- TO:   src/modules/auth/helpers/auth.helper.ts  
- WHY:  Auth logic scattered across utils — belongs with auth module
- RISK: 12 files import this — imports will be updated automatically

## Risk Assessment
| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking existing imports | High | Auto-update all import paths |
| CI/CD path references | Medium | List files that need manual check |
| ... | | |

## If You Don't Refactor
<what gets worse over time if left as-is>

## Phased Approach (if large)
- Phase 1 (safe, low risk): ...
- Phase 2 (medium risk, needs testing): ...
- Phase 3 (high impact, do last): ...
```

**Main presents proposal and asks:** "Đồng ý toàn bộ / điều chỉnh phần nào / bỏ qua phần nào?"

### MIGRATOR
After user confirms, produce `reorg/migration_plan.md`:
- Exact list of file moves: `mv src/A src/B`
- Import update map: which files need which import paths changed
- Files requiring manual review (ambiguous references, dynamic imports)
- Rollback instructions

**Main presents migration plan and confirms before EXECUTOR runs.**

### EXECUTOR
Run the migration plan step by step. Log each action to `reorg/execution_log.md`. If any step fails: stop, log the failure, report to Main — do not continue blindly.

### VERIFIER (Reorg)
After execution:
- Check all imports resolve (no broken references)
- Run existing tests if available
- Check app entry point still works
- Update `workflow/verification.md`
- Produce `reorg/verification.md`: pass/fail per check

---

## MODE 3 — DOCGEN (Documentation Generation)

Generate complete documentation for an existing codebase — even if none exists yet.

### Flow
```
[ ] SCANNER   → Map entire codebase: modules, APIs, dependencies, entry points
[ ] DRAFTER   → Generate all doc files (see list below)
[ ] MAIN      → Present docs to user for review (summary, not every file)
[ ] USER      → Approve / flag things that look wrong
[ ] REFINER   → Apply user corrections, fill gaps flagged during review
[ ] MAIN      → Confirm docs are in place, tell user what was generated
```

### Docs Generated

**In `docs/` folder (project-level):**
- `README.md` — project overview, what it does, how to run, env vars, quickstart
- `ARCHITECTURE.md` — high-level system design, module map, data flow diagram (ASCII)
- `ONBOARDING.md` — step-by-step guide for a new dev joining the project
- `CHANGELOG.md` — inferred from git log or code comments; format: Keep a Changelog
- `AGENTS.md` — for AI agents: what this codebase does, module map, conventions, sensitive areas, do/don't

**Alongside code (module-level):**
- `<module>/README.md` — what this module does, public interface, dependencies
- Inline JSDoc/docstrings for public functions missing them (added to source files)
- `<module>/API.md` — if module exposes HTTP endpoints: route, method, request, response, auth

### SCANNER
Update `workflow/repo_assessment.md`, then produce `docgen/scan.md` (internal, not shown to user):
- All modules detected + their purpose (inferred from code)
- All public API endpoints
- All environment variables used
- External dependencies and what they're used for
- Entry points (main files, CLI commands, cron jobs)
- Gaps: what exists but has zero documentation?

### DRAFTER
Write all docs based on scan. Rules:
- Write for a human who has never seen this codebase
- Be specific — no filler like "this module handles various tasks"
- For AGENTS.md: write as instructions to an AI, not a human
- For CHANGELOG.md: if no git log available, create a template with [FILL] markers
- Flag uncertain things with `<!-- TODO: verify this -->`
- Update `workflow/handoff.md` to show what documentation was generated and what still needs human review.

### REFINER
After user feedback: update flagged sections, remove TODOs that got answered, fill gaps.

### AGENTS.md Format
```markdown
# AGENTS.md — <Project Name>

## What This Project Does
<2-3 sentences, technical and precise>

## Stack
- Language: ...
- Framework: ...
- DB: ...
- Key dependencies: ...

## Module Map
| Module | Location | Responsibility |
|--------|----------|---------------|
| Auth | src/modules/auth/ | JWT auth, session management |
| ... | | |

## Conventions
- File naming: ...
- API style: ...
- Error handling pattern: ...

## Sensitive Areas (ask before touching)
- payment.service.ts — complex business logic
- migrations/ — never edit manually

## Common Tasks
- Add a new API endpoint: follow src/modules/user/ as template
- Add a new background job: see src/jobs/README.md

## Do NOT
- Edit .env.production directly
- Run migrations without backup
```

---

## Communication Style

- **Main → User**: conversational Vietnamese or English (match user's language), clear summary, explicit confirmation ask
- **All agents → files**: technical, precise, no ambiguity, no padding
- **Main never proceeds** to the next phase without user confirmation at checkpoints

---

## References

- `references/shared-workflow-contract.md` — Shared workflow files used across skills and future agents
- `references/file_templates.md` — Full templates for all Gold/Sprint output files
- `references/escalation_guide.md` — When Planner escalates vs. decides independently
