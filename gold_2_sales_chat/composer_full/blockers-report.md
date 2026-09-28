# Composer blockers report — 2026-09-27

## Delivery
- [x] Explicit durable move from locked composer to user/account/conversation outbox. New text/files can be drafted while old unknown/failed batches remain visible. Persistence failure leaves source locked; old retry/status/resume address immutable batch IDs, not current draft. No reload sends. Outbox survives logout and remains owner-gated.
- [x] Conversation manual queue respects unresolved batches; explicit old resume avoids deadlock behind queued text. Backend serial gate stops competing batch execution on unknown/sending conversation receipts and stops the current batch after an ambiguous child.
- [x] Staging byte release requires durable sent receipt, completed persistence, explicit sender mirror confirmation and no persistence error. Repair completion is certified after checking stored identities/media. FK metadata and payload hash remain; accepted replay skips byte reads.
- [x] Explicit failed-item abandonment route/UI permanently disables replay, including preparation failures without receipts. Unknown/sending/queued references stay protected. Deletion shares execution advisory gate, retains deleting tombstone on object failure and retries safely.
- [x] Bounded cleanup after execution, before upload quota admission across owner conversations, and explicit cleanup. Deleted metadata no longer consumes quota. Unreferenced objects retain 24-hour TTL; terminal proven references release immediately.

## Verification results
- Frontend `npm run typecheck`: PASS.
- Backend `npx tsc --noEmit`: PASS.
- Focused backend suite: 37 passed, 0 failed, 0 skipped with disposable PostgreSQL 16 `_test` DB. Tests include actual advisory locks, unknown competing batches, abandonment, object deletion failure/retry, metadata-only accepted replay. Additional final composer rerun: 5 passed, including real upload admission with 101 deleted metadata records.
- Frontend `test:sales-chat`: 22 passed.
- `test:composer:browser`: PASS at 390px and 1280px. Real Chromium IndexedDB/mock HTTP covers failed/successful detach, new draft reload, immutable old retry preserving new text, unknown archived batch blocking new dispatch, zero reload POSTs, existing file/caption/concurrency coverage.
- Frontend build: PASS; existing large main-chunk warning remains (~716 kB minified).
- `git diff --check`: PASS.
- Read-only local disk: workspace and `/tmp` share 1.4 TiB filesystem, 348 GiB available, 75% used. This does not measure remote MinIO capacity.

Disposable Docker PostgreSQL used localhost-only ephemeral port, unique schemas, existing cached image, no production credentials. Container stopped/removed after tests. Only isolated test migrations ran; no production migrations/deployment/commit.

## Necessary limitations
- Live MinIO/SDK and end-to-end repaired-message DB lifecycle remain deployment validation gates; object service is mocked in lifecycle integration tests. PostgreSQL locks/metadata were real.
- Legacy sent receipts without the new explicit mirror evidence remain retained. No unsafe URL-based inference or bulk backfill. Accepted sends whose mirror failed remain retained and never resend; a separate audited media recovery mechanism may be needed.
- Unknown batches allow drafting but intentionally block competing sends in the same conversation. They cannot be force-abandoned or expire destructively. Existing non-composer server send endpoints do not share the staged-batch global gate; this is not a universal provider dispatch scheduler.
- Outbox is browser-local, not a server list/sync feature. Clearing site data loses local recovery navigation. Completed outbox entries/blobs are retained; no automatic local retention pruning. Cross-tab last-writer conflicts remain an existing IndexedDB whole-draft limitation (no cross-tab CAS/leader lease added).
- Cleanup is opportunistic/scoped, not a global scheduled janitor. Unknown references legitimately consume quota. Safe storage limits remain enforced rather than bypassed.
- Tests cover Chromium, not Firefox/Safari or assistive-technology certification. No production latency claims.

## CODER response
No executed tests failed. Review-driven fixes included skipped-write fail-closed behavior, hydration preserving old IDs when a newer draft was typed, old-batch GET invalidation during detach, persisted abandonment, and unresolved backend receipt barrier. Limits above are deliberate or explicitly deferred, not claimed complete.

## MAIN summary
Both requested product blocker paths implemented and locally verified. Existing dirty work preserved; no concurrent agents used. Existing composer reports are historical; this report and lifecycle contract amendment supersede their locked-draft/permanent-reference limitations for newly verified receipts.
