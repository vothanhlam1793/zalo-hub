# Plan

## Objective
Define and approve the target architecture for three independently deployable services before source migration.

## In Scope
- Service responsibilities and ownership boundaries.
- Database/schema ownership.
- Internal HTTP and event contracts.
- Deployment topology and health checks.
- Incremental migration phases.

## Out of Scope
- Full source migration before approval.
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
Create an independently deployable Zalo Gateway first, then adapt the Management API and Web Platform through authenticated internal APIs and event contracts. Use a shared PostgreSQL instance with service-owned schemas during the first milestone.

## Risks
- Splitting the runtime before contract coverage may cause account session regressions.
- Cross-schema queries would prevent a later physical database split.
- Browser-facing access to the Zalo Gateway would bypass management authorization.

## Steps
1. Approve the proposed service topology and ownership boundaries.
2. Define service-to-service authentication and contract versioning.
3. Create service workspaces, schema boundaries, health endpoints, and deployment definitions.
4. Extract Zalo runtime and persistence behind the Gateway contract.
5. Adapt Management API, BFF, and Web Platform.
6. Verify independent builds, starts, health checks, and preserved workflows.

## Verification Plan
- Build and start every service independently.
- Validate contract authentication and authorization boundaries.
- Run account onboarding, account administration, and chat smoke flows.

## Approval Needed
- Approval of `reorg/proposal.md`.
- Service-to-service authentication selection.
