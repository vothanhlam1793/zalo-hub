# Sprint 3 — test key

Weights total 100. **Critical** cases gate release. Planned only.

| ID / weight | Input and setup | Expected / pass criteria |
|---|---|---|
| S3-T01 / 15 **critical** | A/B accounts share `direct:customer1`; tag scoped A, tag scoped B, historical global tag; assign/unassign/read | No cross-account associations/cache writes; foreign scoped tag rejected; global tag assignment scoped to requested account |
| S3-T02 / 15 **critical** | Migration fixture: unique match, ambiguous global match, orphan, legacy/canonical ID difference, duplicate mapping | Only proven rows migrated; exact originals/unresolved rows preserved; original counts accounted for; no guessed fanout; indexes/constraints valid |
| S3-T03 / 15 **critical** | HTTP/WS viewer/editor/admin/master/super-admin/no-auth/no-membership; query/body legacy routes; forged source/account | Permissions match design; account bypass only for super-admin; legacy routes cannot skip policy; no event/data leakage |
| S3-T04 / 10 | Create, rename, recolor, delete used internal label; invalid/duplicate name/color; historical global label | Stable ID on edit; controlled 400/409; only allowed roles mutate; deletion clears joins and all affected labels_json in transaction |
| S3-T05 / 10 | Repeated PUT/remove, concurrent rename/assign/delete, DB failure injected before commit | Idempotent result; no dangling/stale cache; transaction rolls back; no event emitted before commit |
| S3-T06 / 15 **critical** | Zalo unsupported method, failed/malformed reply, partial definitions, complete assignment snapshot, removed mirrored label, repeated/concurrent sync | Old data survives error/partial; explicit sync status; complete mirror reconciles only its account/source; no duplicate labels; internal labels untouched |
| S3-T07 / 10 | Two authorized browsers plus unauthorized account; rename/assign/remove; reconnect; event during fetch; failed older optimistic mutation | Correct keyed invalidation and eventual authoritative state; dirty-during-fetch revalidation; no old rollback overwrites newer state; unauthorized browser receives nothing |
| S3-T08 / 5 | Desktop/mobile manager/picker/filter, 500 conversations, text search, no-label filter, switch account mid-mutation | Role-aware accessible UI; counts/filter scoped correctly; changed tag appears promptly; no old errors/data in new account |
| S3-T09 / 5 **critical** | Spy on text/attachment/sticker send and automation entrypoints while executing all tag mutations/sync | Zero send/automation executions; build/typecheck pass; confirmed label management only |

## Required evidence

- Migration preflight and postflight row counts, unresolved record counts/reasons, labels_json vs joins comparison.
- Actual Zalo fixture provenance and a statement of whether memberships/definition deletions are authoritative.
- Two-browser screenshots/trace for realtime propagation and permission denial.
- Synthetic migration tests and approved live import must be reported separately. Never claim two-way label synchronization; write-back is deferred.
- A score above a threshold cannot compensate for an account-isolation or data-loss failure.
