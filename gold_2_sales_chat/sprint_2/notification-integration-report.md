# Notification integration — 2026-09-27

## Approved scope and implementation
- [x] Separate minimal `conversation_notification` envelopes from subscription-filtered detail updates.
- [x] Explicit runtime `new` marker forwarded through account manager; history, reactions and attachment mirrors remain data-only.
- [x] Stable account/conversation/message deduplication in server and frontend (bounded 10,000-entry in-memory windows).
- [x] Conversation permission check on every conversation-scoped notification/update; authorization failures now fail closed rather than bypassing permissions.
- [x] Canonical backend kind/text previews via shared frontend messagePreview; no raw payload or media attachments in notification envelopes.
- [x] Server mute state plus optimistic local mute; group preference, account-qualified focused conversation, meeting sound/desktop preferences and hidden preview privacy.
- [x] Settings reads guarded by session, revision and request generation; serialized debounced saves owned by service, cancelled on logout. No side effects inside React state setters.
- [x] Mute rollback patches only mute fields; session/latest operation guards reject stale replies and remote-event superseded responses.
- [x] Existing settings UI retained. Corrected background sync status copy to backend message and synchronized progress stage union.

## Structural verification
Reviewed listener sources, permission helper, payload allowlist, per-socket queue filtering, session boundaries, settings service and mute rollback. Runtime/history distinction required small additive edits to runtime/index.ts, runtime/listener.ts, runtime/types.ts and account-manager.ts, preserving concurrent rich-message changes. Permission test fixtures now answer actual authorization queries instead of relying on exception bypass.

## Test evidence
- Backend sales-chat: 39 passed, 1 isolated PostgreSQL test skipped (no SEND_REQUEST_TEST_DATABASE_URL).
- Backend new-event/history + persistence repair: 5 passed.
- Frontend notification/settings/mute: 4 passed.
- Frontend sales-chat: 22 passed.
- Frontend typecheck and Vite build passed; existing >500 kB bundle warning remains.
- Final backend typecheck passed; realtime + new-event/history rerun passed 13/13. Final frontend typecheck and notification suite rerun passed. git diff --check passed.

## Limitations and handoff
- No production writes, migrations, deployment, commits, provider messages or live browser notification smoke tests.
- WebSocket notification delivery is transient, not a durable replay or cross-tab single-notification guarantee.
- Cross-account desktop clicks focus the app but do not navigate to a conversation under the wrong account; same-account selection is preserved.
- Settings persistence remains best-effort on network failure; already dispatched HTTP writes cannot be cancelled server-side on logout. Pending writes and all stale local response application are guarded.
- Meeting mode retains the existing contract: silence sound and desktop popups; generic/privacy-aware tab indication remains available.

## Tests/files
New: backend/test/notification-events.test.ts, frontend/tests/notifications.test.ts, frontend/src/features/notifications/mute-update.ts.
Extended: backend/tests/realtime.test.ts, backend/test/accounts-send-routes.test.ts.
