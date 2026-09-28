# Repo Assessment

## Current Assessment — Sales Chat Readiness, 2026-09-22

Source baseline: `5a9f732`. Status: ready for scoped implementation planning; provider fixtures, browser measurements and data preflight still required. Historical assessment below is not the active topology description.

### Active Code Paths
- Backend entry: `backend/src/server/index.ts`, Express API/WS, PostgreSQL, MinIO, account runtime.
- Browser entry: `frontend/src/main.tsx`, `app/AppRoutes.tsx`; desktop `/`, mobile `/m`, admin `/admin`.
- `frontend/src/bff-api.ts` currently wraps `api.ts` and calls `/api`; it is not the production BFF migration described below.
- `services/*`, `bff/` and earlier reorganization artifacts remain present. They are not the target of this upgrade and are not being deleted or redeployed.

### Findings Relevant to This Work
- Pending messages and server cache updates have separate owners; reconciliation uses equal text in some paths.
- Sender returns nested SDK result while composer reads top-level message IDs; no truthful per-message delivery state.
- Draft/sending state is global; asynchronous account/conversation updates require explicit keyed state.
- Voice lacks an audio renderer, call type has no canonical mapping, sticker fallback is weak.
- Tag association table lacks account ID; repository mutation/cache refresh can be unscoped.
- WS permits anonymous subscription and unscoped broadcasts; touched delivery/tag paths need a coordinated scoped transport.
- Tag frontend has partial assign/filter support, but definition editing and event handling are incomplete.
- No standard test scripts in backend/frontend manifests; frontend Vite build does not typecheck. Directly touched React props/types have baseline inconsistencies to record and fix.

### Worktree and Evidence
- Existing user modification: `backend/src/server/services/case-station-webhook.ts`.
- Read-only source inspection completed; no baseline builds, runtime tests, migrations or live sends performed by this design task.
- Detailed path references, contracts and unresolved SDK/schema evidence: `gold_2_sales_chat/design.md` and `gold_brief.md`.

### Recommendation
Start Sprint 1 with baseline/evidence collection and receipt/state contracts. Keep stable runtime behavior, apply targeted fixes and add meaningful regression coverage. Treat service extraction and large-scale reorganization as deferred history.

---

## Historical Assessment — Independent Services

## Overall Status
- needs-reorg

## Structure Summary
The repository is currently a three-process transition: `backend/` combines Zalo integration, persistence, management APIs, WebSocket delivery, Dify automation, and a legacy admin SPA; `bff/` proxies authenticated browser traffic; `frontend/` is a React Router SSR web application with chat and admin features.

## Existing Docs
- `README.md`, `ARCHITECTURE.md`, and `DEPLOY.md` describe the previous direct frontend-to-backend design and need replacement after the service split.
- `reorg/` has an earlier proposal for capability folders, but it conflicts with the newly confirmed independent-service direction.

## Entry Points
- Backend: `backend/src/server/index.ts`
- BFF: `bff/src/index.ts`
- Web: `frontend/app/start.ts`, `frontend/app/server.ts`
- Zalo account runtime: `backend/src/server/account-manager.ts`, `backend/src/core/runtime/`

## Build / Run / Test
- Backend: `npm run build --prefix backend`
- BFF: `npm run build --prefix bff`
- Web: `npm run build --prefix frontend`
- No standard automated test suite is currently configured.

## Key Modules
- Zalo runtime and store: `backend/src/core/runtime/`, `backend/src/core/store/`
- Management auth and routes: `backend/src/server/routes/system-auth.ts`, `backend/src/server/routes/admin.ts`
- Browser gateway: `bff/src/`
- Web chat and admin: `frontend/src/features/chat/`, `frontend/src/features/admin/`

## Risks
- WebSocket authorization currently lacks an equivalent account-membership boundary.
- Default credentials and fallback secrets exist in source code.
- The frontend/BFF migration is partially complete and code paths are duplicated.
- No automated regression suite protects the Zalo runtime or service contracts.

## Missing Context
- The required service-to-service authentication mechanism is not selected.
- The data migration and production cutover plan have not been defined.
- Retention and deletion policy for Zalo message data is not defined.

## Recommendation
Approve a service-boundary proposal before moving source files. Implement the first milestone as an incremental extraction of Zalo Gateway while Management API and Web Platform adapt through stable internal contracts.
