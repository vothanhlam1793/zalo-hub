# Plan

## Active Plan — Sales Chat Readiness, 2026-09-22

This section supersedes the historical service-extraction execution plan below for the current initiative.

### Objective
Produce an implementation-ready handoff for another agent team, then deliver three scoped sales-facing increments in the current monolith.

### Planner Deliverables
- `gold_2_sales_chat/README.md`: reading order and coordinator prompt.
- `gold_2_sales_chat/gold_brief.md`: confirmed scope and design defaults.
- `gold_2_sales_chat/design.md`: identities, state machine, receipt/API/schema, presentation, tag and realtime contracts.
- `gold_2_sales_chat/ux.md`: interface layout, state-specific copy, labels and mobile interactions.
- `gold_2_sales_chat/execution.md`: agent ownership, ordering, commands and release/rollback guidance.
- `gold_2_sales_chat/sprint_{1,2,3}/plan.md` and `test_key.md`: task IDs, file maps, acceptance inputs/outputs/weights.

### Sequence
1. Sprint 1: responsive send and account-safe state/cache/drafts/acknowledgements.
2. Sprint 2: fixture-based voice/call/sticker rendering and historical projection.
3. Sprint 3: transactional scoped tags, management UI, Zalo import and realtime invalidation.

### Execution Authorization and Baseline
User authorized implementation and agent delegation on 2026-09-22. Sprint 1 execution starts from `5a9f732`. Backend and frontend builds pass baseline; broad frontend typecheck fails with legacy SSR types plus active-client API alias, reaction callback, duplicate prop, Lightbox and restart-response type errors. Fix the active-client errors as part of touched integration; report the legacy SSR scope separately. Agent ownership is recorded in Sprint 1's plan execution addendum.

### Verification
Each sprint requires structural review, targeted automated tests, builds/typecheck and applicable browser/live smoke evidence. Test keys sum to 100; critical correctness cases are mandatory regardless of score. Do not mark unavailable live checks as passed.

### Decisions / Gates
- Detailed design defaults are proposed in the handoff; receiving MAIN confirms Sprint 1 before execution.
- Evidence-dependent provider mappings and ambiguous tag backfill require resolution before their implementation/release.
- Production cutover and live test targets are coordinated separately; no automatic deployment follows document creation.

---

## Historical Plan — Independent Services

## Objective
Execute the approved three-service reorganization through verified, incremental extraction phases.

## In Scope
- Phase 1 service workspace, contracts, independent health checks, and deployment foundations.
- Detailed extraction maps and cutover controls for later phases.

## Out of Scope
- Extracting Zalo runtime source before Phase 1 verification.
- Rewriting stable Zalo runtime behavior.
- Introducing a message broker before a concrete scaling need is validated.

## Files / Modules
- `backend/src/core/runtime/`
- `backend/src/core/store/`
- `backend/src/server/`
- `bff/src/`
- `frontend/app/`
- `frontend/src/features/`

## Proposed Approach
Start with the service foundation, then extract Zalo Gateway, Management API, and Web Platform in that order. Use a shared PostgreSQL instance with service-owned schemas during the first milestone.

## Risks
- Splitting the runtime before contract coverage may cause account session regressions.
- Cross-schema queries would prevent a later physical database split.
- Browser-facing access to the Zalo Gateway would bypass management authorization.

## Steps
1. Approve the exact migration plan.
2. Execute and verify Phase 1 only.
3. Approve Phase 2 extraction after Phase 1 report.
4. Continue sequentially through later phases.

## Verification Plan
- Build and start every service independently.
- Validate contract authentication and authorization boundaries.
- Run account onboarding, account administration, and chat smoke flows.

## Approval Needed
- Approval of `reorg/migration_plan.md` and Phase 1 execution.
