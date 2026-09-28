# Composer backend integration contract

Base: `/api/accounts/:accountId/composer`. Existing single-send APIs are unchanged.
All endpoints require authenticated account editor access and conversation access;
staging and batches are private to their creating system user (even account admins).
Pass `conversationId=direct:<id>|group:<id>` in the query on **every** request.

## Endpoints (v1)
- `GET /capabilities`: `{version:1, staging:true, batch:true, nativeAlbum:false, maxFileBytes:52428800, maxBatchItems:10, uploadConcurrency:2, ttlSeconds:86400, extensions:{...}}`.
- `POST /staging`: multipart field `file`, exactly one file, no other fields.
  `201 {staging:Stage}`. Queue uploads client-side with at most two in flight.
- `GET /staging`: `{items:Stage[]}` (latest 100, includes expired metadata; refresh before send).
- `GET /staging/:stagingId`: `{staging:Stage}`.
- `DELETE /staging/:stagingId`: `200 {ok:true}`; `409 STAGING_REFERENCED` if retained by a batch. Idempotent for an already deleted owned stage.
- `POST /cleanup`: `{deleted:number}`; removes at most 100 expired unreferenced owned stages in this conversation. Never deletes batch references.
- `POST /batches`: JSON `{clientBatchId:UUID, items:[{stagingId:UUID,clientRequestId:UUID,caption?:string}], retry?:boolean}`.
  IDs and ordered item payload are immutable. Caption max 20,000 chars; 1–10 items.
  `202 {batch:Batch}`; poll status (2s then bounded backoff). Duplicate POST returns the same batch and never auto-resends. `retry:true` explicitly retries only retryable failed children, with the **same IDs**. Unknown/accepted/sending children are never resent. Unstarted queued children require explicit POST to resume after interruption; GET never sends.
- `GET /batches/:clientBatchId`: `200 {batch:Batch}`. Read-only delivery status.

`Stage = {id,accountId,conversationId,fileName,mimeType,size,sha256,status:'uploading'|'ready'|'expired'|'deleted',createdAt,expiresAt}`. No public object URLs or MinIO keys exposed. An interrupted upload stays `uploading` until its TTL; never submit it in a batch.

`Batch = {clientBatchId,accountId,conversationId,status:'queued'|'sending'|'sent'|'partial'|'failed'|'unknown',items:[{stagingId,clientRequestId,caption,status:'queued'|'sending'|'sent'|'failed'|'unknown',retryable,providerMessageIds:string[],receipt?:SendReceipt,error?:{code,message}}]}`.
Children reuse the existing `SendRequestService` receipt, idempotency, acceptance checkpoint and repair path. One staged object is buffered at a time for the SDK; uploads spool to disk and stream into MinIO. No native album claim: per-file receipts are the authoritative mapping, captions are per-item.

Errors: `{code,error}`, 400 validation, 401 unauthenticated, 403 access denied, 404 not found (including other owners), 409 immutable-ID conflict / referenced stage / expired stage, 413 file size, 429 capacity, 503 dependency unavailable. Do not replace IDs after a timeout; first query status. Request hash covers ordered IDs, captions and immutable staging content metadata. No automatic send on startup, GET, or unknown outcome.

Execution is globally bounded to one staged batch at a time. A competing POST durably reserves its items but may return them `queued`; it does not install an automatic send job. Show a user-operated **Resume** action that repeats the original POST (same payload/IDs). Preparation failures require `retry:true`; accepted/unknown children still never resend. Staging quota is 100 objects / 500 MiB per user/account (including retained batch references); four active uploads per process, two per user/account. Batch references are deliberately retained indefinitely in this version; quota/retention monitoring is required. Cleanup is explicit, scoped, and bounded, not an automatic scheduler.

## Ownership / rollout
Backend owner writes only backend and this directory. MAIN owns frontend, deployment and production migration. Additive migration and verification commands will be recorded in `backend-report.md`. Production is not modified by this owner. Extension endpoints (voice, poll, forward, undo, reminder, contact, location, sticker catalogue) are delegated back to MAIN unless explicitly verified and listed in the final report; capability flags must remain false for unimplemented extensions.
# Lifecycle amendment — 2026-09-27

`POST /staging/:id/abandon?conversationId=...` explicitly abandons definite failed referenced children under existing composer ownership/editor checks. Returns `{ok:true}`; 409 for unresolved/unmirrored references or active execution gate. Never abandons unknown/sending/queued work. Retry of an abandoned child is disabled permanently, including preparation failures with no send receipt.

Cleanup now retains FK/hash metadata while marking deleted after successful object deletion. Referenced sent bytes can release before TTL only with durable `localPersistence:complete`, `mediaMirrorComplete:true`, and no persistence error. Sender sets mirror proof after media-store save; repair can certify completed persistence after verifying message/media rows. Old receipts without mirror proof remain retained. Unreferenced stages retain the 24-hour TTL; unknown references never expire destructively. Interrupted deletion retries via durable `deleting` status. Bounded cleanup also runs after execution and before upload admission across the owner's conversations; deleted metadata does not consume quota. GET status does not delete or dispatch.
