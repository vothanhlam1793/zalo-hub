# Structural verification

CODER -> VERIFIER: implementation matches scoped plan. No migration edits or deployment. Existing dirty files patched in place.

- Outbox shares one atomic IndexedDB record with the newer draft; detach failure retains locked source. Immutable payload remains batch-ID addressed.
- Reads never execute sends. Explicit old retry cannot mutate new draft. User-scoped outbox survives logout but remains inaccessible to another user.
- Queued/sending/unknown batches block competing conversation sends; old batch resume may progress ahead of queued text to avoid deadlock. Backend global gate remains authoritative across processes.
- Deletion uses the execution gate and stage row lock; durable deleting tombstone permits retry. FK metadata/hash retained. Abandoned preparation failures cannot execute.
- Receipt sent alone is insufficient: explicit mirror evidence and complete persistence without repair error required. Repair certifies completion only after rows/media match.
- Deferred gates: real PostgreSQL locks, MinIO deletion, live SDK and cross-tab frontend mutation behavior.

VERIFIER -> TESTER: run typechecks, focused backend suite, browser outbox coverage and sales chat regression.
