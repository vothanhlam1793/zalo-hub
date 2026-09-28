# Sprint 1 backend implementation handoff

Status: CODER complete, ready for independent VERIFIER then TESTER. **No tests executed.** No live sends, production migration/restart, deployment or commit. Other agents' WS/auth/frontend/package work and the existing Case Station webhook edit were not edited by this agent.

## Changed files

- `backend/src/core/runtime/sender.ts`: verified receipt projection, multiple emitted messages, lifecycle checkpoints, truthful IDs, separate provider/local failure boundaries, safe temporary upload permissions and timing logs.
- `backend/src/core/runtime/send-contract.ts` (new): lifecycle/execution types, strict receipt parser and definite-failure type.
- `backend/src/core/runtime/index.ts`: lifecycle forwarding; distinct provider IDs no longer fall through to text/time duplicate matching.
- `backend/src/core/types.ts`: optional message `clientRequestId`; additive `SendReceipt`.
- `backend/src/core/store/send-request-repo.ts` (new): atomic insert, retry CAS, attempt-fenced monotonic updates, startup recovery, account/conversation-qualified history correlation, insert-only local repair.
- `backend/src/core/store/message-repo.ts`: avoid double-prefixing known account-scoped stored IDs/attachment IDs; stop treating an arbitrary local ID as provider ID.
- `backend/db/migrations/20260922000000_create_send_requests.ts` (new): composite durable key, status constraint, conversation/status/GIN indexes; intentionally refuses destructive down migration.
- `backend/src/server/services/send-request-service.ts` (new): normalization/fingerprinting, ownership, dispatch timeout/fencing, safe explicit retry, sanitized durable evidence.
- `backend/src/server/routes/accounts.ts`: send/status wiring, authorization before multipart, structured upload errors; DB-first history with unchanged response fields and bounded off-path sender-name updates.
- `backend/src/server/index.ts`: service injection and startup-only abandoned-request recovery after migrations, before serving HTTP.
- `backend/docs/send-requests.openapi.yaml` (new): machine-readable additive API contract.
- `backend/test/{send-request-fixtures.ts,send-request-service.test.ts,sender-receipts.test.ts,accounts-send-routes.test.ts,send-request-repo.postgres.test.ts}` (new).

## Contract/integration notes

- POST text/attachment retains `{ method, result, kind? }`; requests with a UUID `clientRequestId` append exactly the design's `receipt`. Existing JSON base64-image route remains supported. Legacy requests without an ID do not enter the registry and receive no receipt/idempotency guarantee.
- `sent` means Zalo accepted, **not delivered/read**. Fresh successful POST returns the original SDK result; durable replay stores only documented ID fields (IDs represented as strings), never arbitrary SDK credentials/data.
- Accepted/accepted replay: 200. In-flight/unknown POST: 202. Validation: 400. Ownership: 403. Changed fingerprint: 409. Pre-dispatch/session failure: 409 with failed/retryable receipt. Coded text-provider rejection: 422, nonretryable unless future evidence supports a safe whitelist. Registry failure before a usable claim: sanitized 503.
- GET `/api/accounts/:accountId/send-requests/:clientRequestId`: `{ receipt }`; 200 terminal, 202 sending/unknown with `Retry-After: 2`, 404 absent. Requires editor plus initiator, or authorized account admin/master/system super-admin. It never acquires a Zalo runtime. Another user cannot take over a POST identity, even if privileged for status inspection.
- Hash includes normalized explicit conversation, trimmed text/caption, attachment name/MIME/size and SHA-256 bytes. Retry excluded. UUID is normalized to lowercase. No unverified SDK client-ID injection.
- One atomic unique insert before SDK dispatch. Retry only from `failed && retryable` with same payload/key and explicit `retry:true`; CAS increments attempt. A retry for an absent key is 404, never a fresh send. No transactions held over SDK/media calls. No automatic resend of unknown/sent/sending.
- Server budgets: 30s text, 120s attachment. A post-dispatch timeout is unknown; late acceptance can upgrade the same attempt. Timeout before dispatch fences the old callback, allowing safe explicit retry. Browser abort does not cancel backend work.
- Acceptance snapshot is persisted before media/message work. Local failures retain `sent` and a nonretryable warning. GET/replayed sent requests schedule insert-only local message repair from durable snapshots; richer existing messages are not overwritten. This repair never calls Zalo and does not synthesize missing file bytes.
- Receipt messages use canonical `accountId::providerId` stored IDs. Sender-generated events carry the same IDs and request correlation. History recovers correlation only by actual receipt provider IDs under the account/conversation. Echo-before-receipt may remain temporarily separate; no text/time guess was added.
- GET messages reads the registry store directly, without `ensureRuntime`, reconnect, session-active checks or awaited sender-name work. Existing `{ conversationId, messages, count, oldestTimestamp, hasMore }` shape remains. Group-name enrichment is off-path, coalesced per conversation, at most 200 messages per read, with account-qualified batched updates for subsequent reads.

## Installed SDK evidence (read-only, not live captures)

Installed `backend/node_modules/zalo-api-final/package.json:2-3`: version **2.1.1**.

| Source | Evidence / implementation consequence |
|---|---|
| `dist/apis/sendMessage.d.ts:2-8,96-99` | `SendMessageResult = { msgId: number }`; response `{ message: result|null, attachment: result[] }`. `photoId/fileId` are not message receipts. |
| `dist/apis/sendMessage.js:425-449` | Single image can carry its caption; other files can emit a separate caption then attachment. Preserve both real IDs/messages. |
| `dist/apis/sendMessage.js:433-442` | Caption may already be accepted when attachment upload/send throws. Attachment exceptions conservatively remain unknown, including coded errors. |
| `dist/apis/sendMessage.js:82-96` | Results come from `resolveResponse` for individual requests. |
| `dist/utils.js:551-595` | Nonzero provider error codes become `ZaloApiError`; malformed response/HTTP failure lacks a definitive provider acceptance receipt. |
| `dist/Errors/ZaloApiError.js:1-6` | Error name is `ZcaApiError`, with `code`. Coded single-text errors are definite rejection; generic transport errors remain ambiguous. |
| `dist/apis/sendMessage.d.ts:66-95` | No supported clientRequestId/cliMsgId input field in MessageContent. None is injected or inferred. |

Fixtures in `sender-receipts.test.ts` mirror these source shapes, **not** captured customer traffic. Valid observed IDs must be positive integer strings or positive safe-integer numbers. Unsafe rounded numbers, sentinels and missing IDs are rejected. A truthy/malformed/missing-ID result is `unknown`, not invented acceptance. No fallback UUID is advertised as provider identity. Legacy SDK fallback methods remain callable but lack verified receipt classification.

## Compile checks actually performed

From `backend/`:

```sh
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck test/send-request-service.test.ts test/sender-receipts.test.ts test/accounts-send-routes.test.ts test/send-request-repo.postgres.test.ts db/migrations/20260922000000_create_send_requests.ts
```

Both passed after correcting a test logger cast. `git diff --check` also passed. These are compile/static checks only, not test passes. OpenAPI runtime validation has not been run.

## Commands for the formal tester (NOT run)

From `backend/`:

```sh
node --import tsx --test test/send-request-service.test.ts test/sender-receipts.test.ts test/accounts-send-routes.test.ts
node --import tsx --test test/send-request-repo.postgres.test.ts
```

The PostgreSQL case skips unless `SEND_REQUEST_TEST_DATABASE_URL` is explicitly provided; it refuses database names not ending in `_test`. It creates/drops only a random isolated schema and never uses `DATABASE_URL`. It exercises the actual migration, parallel unique claims, retry CAS, stale-attempt fencing, restart unknown, monotonic acceptance and the GIN-query correlation path. No isolated DB was provisioned or contacted here; fake repository tests **do not prove PostgreSQL behavior**.

Controlled tests also cover duplicate/equal-text intents, fingerprint conflict, ownership, 404-before-POST, multipart authorization ordering, offline DB history, missing/invalid IDs, caption+file, provider/local failures, explicit retry, unknown replay suppression, timeout/late completion and legacy envelopes.

## Release blockers / remaining concerns

1. Formal tests, PostgreSQL execution, browser/race integration and approved live text/image/file + matching echoes remain unexecuted. No latency or delivery success is claimed.
2. Installed SDK can hide partial attachment acceptance on exception. Such operations remain unknown; no provider lookup or safe automatic resolution exists in this increment.
3. Crash/DB outage between remote acceptance and durable checkpoint remains an unavoidable unknown window. Best-effort checkpoint recovery never resends. Unknown rows and idempotency keys are not pruned.
4. Local repair preserves message identity/text and any available media URL, but cannot restore an upload whose media save failed after acceptance; later verified echo/history or operator repair is needed. Repair does not rebuild conversation summary metadata; ordinary runtime/history sync still owns summaries.
5. Startup recovery assumes the current single-backend process. Before horizontal replicas/rolling mixed-version deployments, add process ownership/leases and a deliberate recovery protocol. Atomic key claims themselves are database-backed across workers.
6. Migration must precede the new service. Existing production config requests `.js` migrations while this repository's migrations are `.ts` and backend tsc excludes `db/`; coordinator must verify the actual migration packaging/loader at rollout. Do not infer `npm run build` packages this migration. No production action was taken.
7. No new distributed rate limiter; verify ingress limits and DB/query indexes on the real schema before release. SQL repair relies on the same existing message/attachment column contract as `GoldMessageRepo`; real-schema execution remains a test gap.

Coordinator owns shared workflow updates and all release/testing claims; this file is the backend coder handoff only.
