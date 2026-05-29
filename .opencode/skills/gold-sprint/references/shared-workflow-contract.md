# Shared Workflow Contract

Use this contract for every new initiative. All workflow notes are written in English.

Create the `workflow/` directory if it does not exist. If it already exists, read and update the existing files instead of creating parallel files with different names.

## Core rules

1. `workflow/brief.md` is the main source of truth for the current initiative.
2. `workflow/repo_assessment.md` is the main source of truth for repo health and readiness.
3. `workflow/handoff.md` is the required bridge between skills, phases, or future agents.
4. All shared workflow notes must be written in English, even if the chat with the user is in another language.
5. Skill-specific artifacts may add detail, but they must not contradict the shared workflow files.

## Directory layout

```text
workflow/
├── brief.md
├── repo_assessment.md
├── plan.md
├── verification.md
├── handoff.md
└── decision_log.md
```

## `workflow/brief.md`

```markdown
# Brief

## Goal
<Single clear outcome>

## Scope
<Current scope and priority boundary>

## Context
<Repo area, modules, files, or investigation scope>

## Constraints
- <Constraint 1>
- <Constraint 2>

## Verify
- <Verification step 1>
- <Verification step 2>

## Recommended Mode
- intake | direct-change | sprint | reorg | docgen

## Current Status
- draft | confirmed | in_progress | blocked | completed
```

## `workflow/repo_assessment.md`

```markdown
# Repo Assessment

## Overall Status
- ready-for-work | needs-clarification | needs-normalization | needs-reorg | needs-docgen

## Structure Summary
<How the repo is organized today>

## Existing Docs
<README, architecture docs, onboarding docs, agent docs>

## Entry Points
<Main app/service/CLI entry points>

## Build / Run / Test
<Commands found or missing>

## Key Modules
<Important modules, source-of-truth files, sensitive areas>

## Risks
- <Risk 1>
- <Risk 2>

## Missing Context
- <Missing item 1>
- <Missing item 2>

## Recommendation
<What should happen next and why>
```

## `workflow/plan.md`

```markdown
# Plan

## Objective
<Goal of the current execution phase>

## In Scope
- ...

## Out of Scope
- ...

## Files / Modules
- ...

## Proposed Approach
<Implementation or restructuring approach>

## Risks
- ...

## Steps
1. ...
2. ...

## Verification Plan
- ...

## Approval Needed
- <User decisions still required>
```

## `workflow/verification.md`

```markdown
# Verification

## Expected Checks
- ...

## Performed Checks
- ...

## Results
- pass | partial | fail

## Issues Found
- ...

## Confidence
- low | medium | high

## Recommended Next Step
<What should happen next>
```

## `workflow/handoff.md`

```markdown
# Handoff

## Current State
<Where the initiative stands now>

## Completed
- ...

## Pending
- ...

## Recommended Next Skill
- task-intake | gold-sprint | repo-preflight | direct execution

## Files To Read First
- workflow/brief.md
- workflow/repo_assessment.md

## Open Questions
- ...
```

## `workflow/decision_log.md`

```markdown
# Decision Log

## Decision
<What was decided>

## Why
<Reasoning>

## Alternatives Considered
- ...

## Impact
<What this changes>

## Follow-up
- ...
```
