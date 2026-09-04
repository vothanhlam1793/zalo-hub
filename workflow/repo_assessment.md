# Repo Assessment

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
