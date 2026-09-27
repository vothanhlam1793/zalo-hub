# Composer backend implementation / handoff

## Integration artifact (written first)
`gold_2_sales_chat/composer_full/backend-contract.md`
Machine-readable endpoints: `backend/docs/composer.openapi.yaml`.

## Implemented
- `/api/accounts/:accountId/composer` capabilities, single-file multipart staging, scoped list/status/delete, scoped TTL cleanup, durable batch reservation/submission and read-only status.
- Mandatory user/account-editor/conversation checks before upload allocation; ownership is not bypassable by administrators. Per-child dispatch rechecks permissions.
- Private MinIO staging bucket on existing MinIO infrastructure. No public URLs, provider URLs, or object keys returned. Public bucket policies fail closed.
- Random object names; SHA-256 verified before provider upload; immutable ordered batch metadata hash; per-item stable request IDs using the existing SendRequestService.
- Disk multipart spool (50 MiB/file), four uploads/process and two/user/account, 100-file / 500 MiB quota, 24-hour TTL; one object buffer loaded per batch child, no Buffer.concat duplication.
- PostgreSQL advisory execution lock plus process admission: one staged batch executes at a time. No independent provider-send implementation, native album claim, or automatic unknown resend.
- Additive tables and indexes in `backend/db/migrations/20260927150000_create_composer_staging.ts`. Down migration deliberately refuses destructive removal of durable identities.
- Existing single-send endpoints unchanged; accounts router only imports/mounts the composer router and adds scoped dispatch authorization.

## Verification (2026-09-27)
VERIFIER: reviewed scope, privacy boundaries, stage-delete/reference row locking, immutable payload checking, timeout/late-settlement serialization, stable-ID replay, and explicit retry behavior. Corrected multipart parts bound and bounded process admission. Typecheck passes.

TESTER commands from `backend/`:
```sh
npx tsc --noEmit
npx tsx --test test/composer.test.ts test/send-request-service.test.ts test/accounts-send-routes.test.ts test/sender-receipts.test.ts test/send-persistence-repair.test.ts
```
Result: **34 passed, 0 failed, 1 skipped**. `git diff --check` passes.
Composer tests exercise validation, truthful aggregation, anonymous pre-parser rejection. Existing send tests cover CAS retries, unknown/late acceptance, local repair and account send routing.

Isolated PostgreSQL test is implemented but **not run**: no `SEND_REQUEST_TEST_DATABASE_URL` configured and no available psql/docker found in this shell. It generates a unique schema, applies only the two send/composer migrations, checks ownership, expired cleanup/reference retention, concurrency, immutable replay, accepted/unknown no-resend and explicit preparation retries, then drops that schema. Run against an explicitly disposable database whose name ends in `_test`:
```sh
SEND_REQUEST_TEST_DATABASE_URL='postgres://.../zalohub_test' npx tsx --test test/composer.test.ts test/send-request-repo.postgres.test.ts
```
No live MinIO, SDK, browser, production database or customer messaging smoke performed.

## Operational requirements / MAIN deployment owner
1. Review and apply additive migration `20260927150000_create_composer_staging.ts` using the existing deployment migration process after backup/preflight. This owner did **not** run migrations or deploy.
2. Provision private bucket `zalohub-composer-staging` (override `MINIO_STAGING_BUCKET`) using existing `MINIO_ENDPOINT/PORT/ACCESS_KEY/SECRET_KEY` aliases. Optional `MINIO_USE_SSL=true`. App needs object put/get/delete and bucket policy read; preprovision bucket to avoid needing creation rights. Do not point at the public media bucket; do not install indiscriminate lifecycle expiration on this bucket (active references must survive TTL).
3. Ensure private writable OS temp directory and at least 200 MiB concurrent spool capacity; configure proxy body limit >=50 MiB plus multipart overhead, upload timeout >=120 seconds. Restart-crashed temp directories require an age-based OS temp housekeeping policy when no uploader is active.
4. DB pool needs spare connections beyond the held execution-lock transaction. Existing startup SendRequestRepo recovery remains authoritative for interrupted `sending` rows. Never reset unknown rows to failed to force retry.
5. Frontend must honor two-upload queue and use exact contract IDs. Competing batches can remain queued: user-operated Resume repeats original POST; no automatic send worker. GET/status never executes. Explicit failed retry uses same IDs with retry:true.
6. Cleanup endpoint deletes <=100 expired unreferenced owned stages. It is not a global janitor. Interrupted uploads remain durable uploading records until expiry. Monitor staging count/bytes, temp disk, object errors, queued/unknown children and composer failure logs.
7. Conservative safety: all batch-referenced stages are retained indefinitely, including completed batches, and count toward quota. A future audited terminal-reference release/retention job is needed before sustained high-volume use; do not work around quota by deleting active objects. This is a known operational limitation, not a completed general-purpose storage lifecycle.
8. Existing server single-process startup recovery assumptions still apply. Execution transaction protects staged batches, not arbitrary pre-existing single-send requests. SDK-internal memory and transport retries are inherited, not claimed bounded by this wrapper.

## Scope delegated back to MAIN
Sticker catalogue/details, voice semantics, poll, forward, undo, reminder, contact and location extensions were not changed or claimed verified. All new composer extension capability flags are false. Existing legacy poll/sticker/forward routes still exist but their exposure is not asserted safe/complete by this work. MAIN should assign verified SDK extension contracts separately.

## Owned files
- `backend/src/server/routes/accounts.ts` (15 additive lines only)
- `backend/src/server/routes/composer.ts`
- `backend/src/server/services/composer-service.ts`
- `backend/src/server/services/composer-object-store.ts`
- `backend/db/migrations/20260927150000_create_composer_staging.ts`
- `backend/test/composer.test.ts`
- `backend/docs/composer.openapi.yaml`
- This report and backend contract.

CODER response: no executed tests failed. DB/MinIO integration remains an explicit pre-deployment gate. Dirty prior edits preserved. No frontend/WS edits, no commits, no production changes. Shared workflow files left to MAIN to avoid competing agent writes.
