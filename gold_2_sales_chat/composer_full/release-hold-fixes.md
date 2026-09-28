# Release HOLD response — findings 1, 4, 5, 7

## Ownership / scope
User authorized these four fixes and shared-barrier groundwork only. Extended-tools service/component untouched. Existing dirty work preserved. No deployment, production migrations or commit. Release remains HOLD pending other owner's work and integration review.

## Implemented
- **1:** `conversation-recovery.ts` tracks per-conversation idle/loading/ready/error; `ensureConversationRecovered(key)` shares a session-fenced promise for strict IndexedDB draft + message-cache reads. Dispatch cannot pass until both have merged. Chat-cache and draft writes are withheld during recovery. Read failure stays closed, permits editing and exposes recovery warning. UI Send preserves the draft and asks for another explicit click after recovery; internal explicit queued intents remain blocked by recovery/unresolved state. Reload does not enqueue sends.
- **4:** Delayed hydration overlays only touched fields, merges new attachments with stored unsubmitted attachments, keeps untouched reply/mention context, and preserves loaded batch identities in outbox. When new text invalidates old mention offsets, original text/mentions/reply are retained together in durable `recoveredDrafts`, with an explicit recovery control. Never apply old offsets to different text. No pre-hydration write can overwrite unread attachment/context data.
- **5:** Mention-bearing caption whitespace is preserved exactly in parseBatch, normalizeSend and sender; offsets remain unchanged, including normal mentionTag trailing space. New intents receiving explicit `BATCH_VALIDATION_REJECTED` before reservation unlock and remove optimistic placeholders. Existing intents and ambiguous errors remain immutable. No 404-based unlock.
- **7:** Append false/missing callback marks local persistence failed even if the media mirror succeeded; processing continues so remaining accepted slots can be mirrored/repaired. Only repository repair after actual scoped message/media verification can set `localPersistenceVerified:true`. Cleanup requires this marker plus prior sent/mirror/complete conditions AND rechecks actual rows before deletion. Missing message, missing attachment, incomplete provider-ID coverage or repair failure retains staging.

## Shared barrier contract for other owner
1. Import `ensureConversationRecovered(key)` from composer-store; await it using a captured session.
2. Check `conversationRecovery.ready(key)` from `model/conversation-recovery.ts` immediately before dispatch. Promise resolves on failure too; ready MUST be checked. State is not equivalent to unresolved-send clearance.
3. Apply the shared unresolved-operation policy after hydration, including tools receipts when that owner integrates them. The groundwork currently loads composer and message caches only; it does not claim extended-action recovery.
4. Do not auto-send recovered intents. `conversationRecovery.subscribe` is available for existing explicit in-memory queues only; session reset clears state. Do not manually mark ready from a caller.
5. Preserve strict recovery reads and write deferral; optional-cache empty fallbacks are unsafe for dispatch decisions.

## Explicit regressions / verification
- New frontend `composer-recovery.test.ts`: 5 PASS. Draft-first/messages-late with unknown cached send, messages-first/draft-late with unknown outbox, edits/context preservation and withheld saves, strict read failure, mention-only freeze offsets, confirmed validation unlock vs ambiguous retention.
- Existing sales-chat suite: 22 PASS.
- Chromium composer integration: PASS at 390px and 1280px.
- Both frontend/backend TypeScript checks: PASS.
- Focused backend suite: 39 PASS, 0 skipped against disposable PostgreSQL 16. Includes sender append=false and exact SDK mention payload regression; real PostgreSQL missing-message/missing-attachment cleanup refusal; failed persistence retained until actual repository repair verifies and certifies rows; existing lifecycle/replay/abandonment/quota tests.
- Initial frontend transport tests failed because their no-IndexedDB fixture marked ready after starting a real strict recovery; corrected fixture establishes already-recovered state before selecting. Production gate was not weakened.

## Limitations / next review
- Other owner's extended-tools barrier integration remains outstanding. This is not global release approval.
- Live provider/MinIO not exercised; PostgreSQL was real, object service mocked. Browser cross-tab CAS and existing browser-local outbox retention limitations remain.
- Failed IndexedDB recovery intentionally prevents sending instead of pretending no pending work exists. Editing remains in memory until a successful recovery; warning is shown.
- Legacy receipts without mirror/verification evidence remain retained. Verification marker is JSON metadata, no new migration required.
