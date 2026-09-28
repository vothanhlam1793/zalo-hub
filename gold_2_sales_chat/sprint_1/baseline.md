# Sprint 1 baseline — 2026-09-22

Source: `5a9f732`. Existing user source modification: `backend/src/server/services/case-station-webhook.ts` (preserve).

## Commands/results before implementation

- `npm run build --prefix backend`: PASS (TypeScript + admin Vite).
- `npm run build --prefix frontend`: PASS (Vite; existing >500kB bundle warning).
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` from frontend: FAIL, 17 diagnostics.

## Baseline typecheck groups

Historical SSR: missing `app/+types/root`, CSS URL declarations, obsolete `createRequestHandler` import in `app/server.ts`, untyped historical build/server import.

Active client: bff-api missing `accountSyncMetadata`, wrong syncHistory arguments, missing accountRestart alias; admin components call missing accountMobileSync/accountSyncAll/adminUpdateMembership aliases; ChatPanel reaction callback uses numeric type instead of icon; duplicate showDisconnectBanner in DashboardPage; wrong Lightbox `initialIndex` prop; restart result omits error field.

Active-client issues will be corrected in frontend integration. A dedicated SPA typecheck can separate the historical SSR tree without pretending that the broad existing tsc baseline passed.

No baseline production latency measurement, browser trace, live send, or production database migration performed.
