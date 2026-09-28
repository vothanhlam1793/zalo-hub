# Sprint 1 — responsive and correctly acknowledged chat

Status: authorized, entering implementation on 2026-09-22. Contract: `../design.md` sections 2–4 and 7.

## Execution addendum

- Baseline backend and Vite frontend builds pass. Full frontend tsc has existing active-client and historical SSR errors (recorded in `baseline.md`).
- Backend delivery agent owns backend sender/request service/repo/migration, accounts routes and server index wiring. It may add optional backend DTO fields. It does not edit WS/auth-policy files or the user's webhook change.
- Frontend state agent owns active frontend files except `features/realtime/useWebSocket.ts` and its dedicated tests; it owns frontend DTO/API integration and fixes directly touched baseline type errors.
- Realtime agent owns backend WS + narrow account policy helper and frontend realtime hook only. Preserve existing hook interface and add authenticated handshake transparently using the existing auth token. No shared-type/package/index edits.
- Coordinator owns workflow, package/test scripts and baseline artifacts; resolves shared integration and supplies final verification/testing.
- SendReceipt contract is fixed by design section 4.4. POST results append `receipt`; status GET returns `{ receipt }`. Preserve raw `method/result/kind` for old callers. WS remains same message event shape with optional `message.clientRequestId`.
- Provider evidence uses installed SDK source and controlled mocks until an approved live test target is provided. No production restart, migration or live customer send during development.

## Scope and acceptance

Deliver immediate pending feedback, correct status/correlation, isolated drafts/cache, cache-first conversation reads and scoped realtime. Preserve text/image/file sending, existing account lifecycle and API fields. Required test cases: `test_key.md`.

## Task breakdown

| ID | Owner | Change | Dependency/output |
|---|---|---|---|
| S1-01 | Coordinator/tester | Capture HEAD/worktree, baseline builds/typecheck, before browser timing | Baseline report; protect webhook change |
| S1-02 | Backend | Capture SDK receipts and corresponding live echo for text/image/file; inspect provider ID/client ID behavior | Redacted fixtures; mapping table for 1 or multiple message responses |
| S1-03 | Integrator | Freeze SendReceipt, local identity/status and WS authentication types from design | Backend/frontend agree; no parallel shared-type edits |
| S1-04 | Backend | Add send_requests repo/migration/service/status route; explicit dispatch/acceptance/error boundary | S1-02/03; database-backed idempotency and status |
| S1-05 | Frontend state | Add pure reconciliation functions and tests; keyed authoritative store | S1-03; remove content/time matching |
| S1-06 | Frontend state | Draft registry and IndexedDB versioning; queue and File registry; state transitions | S1-05; recoverable user-scoped drafts/pending metadata |
| S1-07 | Realtime | Authenticate sockets, account-scoped fanout, auth expiry/revocation, reconnect cleanup | S1-03; no anonymous path for new flow |
| S1-08 | Frontend + backend | Conversation read path: immediate keyed cache/empty loading state, independent fetch/hydrate, background metadata | S1-05; stored messages available without blocking on Zalo reconnect |
| S1-09 | Frontend + integrator | Composer/bubble integration, scoped callbacks, delivery status, preview, stable scroll | S1-04/06/07/08; both desktop/mobile |
| S1-10 | Verifier/tester | Review; test race conditions, failure paths, metrics and real-account smoke | Report and coder response |

S1-04 and S1-05/06 can proceed in parallel using fixed fixtures. S1-07 has exclusive ownership of WS files. Integrator lands S1-09 after their contracts pass targeted tests.

## Exact code surfaces

- Existing frontend: `src/hooks/useComposer.ts`, `useMessageCache.ts`, `useConversationManager.ts`, `useAccountManager.ts`; `src/stores/chat-store.ts`, `composer-store.ts`; `src/lib/client-db.ts`; `src/features/chat/{useDashboardState,DashboardPage}.tsx/ts`; `ChatPanel.tsx`, `MessageBubble.tsx`; `src/features/realtime/useWebSocket.ts`; `src/{api,bff-api,types}.ts`.
- Existing backend: `src/core/runtime/sender.ts`, `runtime/index.ts`, `src/core/store/message-repo.ts` only where receipt lookup/identity needs it; `src/server/routes/accounts.ts`; `src/server/ws/handler.ts`; `src/server/helpers/auth-middleware.ts` or a shared narrow policy helper; `src/server/index.ts`; `src/core/types.ts`.
- New: files named in design section 2, a send_requests migration, focused pure/DB/browser tests.

Paths above are relative to their backend/frontend package. `DashboardPage.tsx` and `useDashboardState.ts` have different extensions; inspect actual files rather than creating duplicates.

## Implementation notes

1. Preserve compatibility hook exports while changing their implementation to the single store. Remove obsolete state only after callsites migrate.
2. Read SDK return `result` at the real nesting level. Do not fill provider IDs with random local UUIDs. Normalize one receipt for HTTP and local outgoing event.
3. Late ack while viewing B updates A's state, not B's composer/errors. Late callback after logout is discarded by session generation.
4. Persistent cache keys include user/account/conversation. Old unowned cache is refetched, not attributed to the current user.
5. Only queued unsent messages can be cancelled; cancellation of a browser fetch is not cancellation of an SDK send.
6. Unknown outcome pauses that conversation queue. Explain this state; provide status refresh, not a disguised automatic retry button.
7. HTTP GET messages returns local history promptly with existing response shape. Keep account authorization; background reconnect/metadata work must not block the response. Preserve history-sync controls for explicit remote work.
8. Avoid cache replace on a background snapshot. Immutable merges maintain pending rows and richer concurrent events.
9. Fix directly touched type mismatches: reaction callback shape must use `MessageReactionOption` (`icon`, not an invented numeric `type`); remove duplicate banner prop by choosing one account-scoped source.
10. Do not replace all history persistence/runtime deduplication code in this sprint. If backend dedupe collapses two real distinct provider IDs in tests, fix that narrow path and add a regression.

## Verification and deliverables

- Pure state tests prove timing-order invariants, not just snapshots of markup.
- DB tests prove duplicate request claims, conflict, restart unknown and safe retry.
- Browser tests prove immediate pending, draft preservation, viewport isolation, errors, scroll and IME.
- Baseline vs after metrics recorded on the same setup; real SDK latency remains separate.
- Required artifacts after execution: `verification.md`, `report.md`, `coder_response.md`, `sprint_summary.md` plus shared workflow updates.

## Release notes to produce

New receipt/status API, authenticated WS protocol and client reload requirement, request table migration, known unknown-send limitation, cache version change and offline-file reselect behavior. No success claim until relevant test-key cases pass.
