# Plan

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
