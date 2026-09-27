# Frontend implementation plan

Preserve all existing dirty frontend/album work. No backend edits, deploy or commit.

1. Add versioned scoped durable composer records (blobs, mentions, reply, immutable batch), migrating legacy drafts without deleting message caches. Surface quota/private-mode degradation.
2. Add contract-based authenticated staging/batch transport and controller: two concurrent uploads, capability limits, stable IDs, per-child optimistic rows/receipts, GET-only bounded recovery and explicit resume/retry.
3. Integrate multi-file selection/drop/paste, reorder, bounded accessible preview, per-file captions and first-item common caption disclosure. Local emoji/templates and canvas edits are isolated frontend tools.
4. Verify structural/session/race safety; run typecheck/build, existing sales-chat and album regressions, plus browser storage and partial-batch tests.

## Test key
- Storage migration/blob+reply+mention roundtrip, ownership, failure fallback: 25%.
- Immutable batches, partial retry, GET-only reload, concurrency/cancellation: 30%.
- Browser attachment controls/preview/mobile and local tools: 20%.
- Existing regressions + typecheck/build: 25%.

Contract limitation: batch v1 does not accept mentions or quote IDs. Preserve these in drafts and block attachment sending with these fields instead of silently dropping them.
