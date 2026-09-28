# Composer blockers — approved implementation scope

MAIN -> PLANNER: user explicitly authorized both blockers, sequential ownership, no deployment/migrations/commit. Preserve all existing dirty changes.

## Plan
- Keep immutable batches in the existing user/account/conversation IndexedDB record as an outbox, atomically persisting the move before unlocking the draft. Legacy locked drafts remain recoverable. Separate accessible tray actions address batch IDs, never the newer draft.
- Share unresolved-batch barriers with the existing manual conversation queue. No reload POST, no implicit batch execution when a gate is occupied.
- Retain FK metadata and immutable hashes. Release staging bytes only for verified durable sent receipts with mirrored media and completed persistence, or explicitly abandoned definite failures. Serialize abandonment/cleanup against batch execution. Retry deletion after crashes; never reuse abandoned children.
- Opportunistic bounded cleanup before uploads plus explicit cleanup, no production janitor or migrations.

## Test key
1. Durable detach/reload/new draft and immutable old retry (25%).
2. Scoped storage failure/unknown and queue safety (20%).
3. Sent/mirror/repair lifecycle, metadata replay, quota recovery (25%).
4. Explicit failure abandonment, unknown protection, delete retry (20%).
5. Frontend/backend typechecks and existing regression suites (10%).

Live DB/MinIO/SDK checks require isolated infrastructure and are reported separately from mocked/local checks.
