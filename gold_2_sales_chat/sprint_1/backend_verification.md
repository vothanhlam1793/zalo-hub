# Sprint 1 backend verification

**Phase:** VERIFIER — read-only structural review, 2026-09-22.  
**Decision:** **RETURN TO CODER** for two blocking findings below. No implementation tests, builds, migrations, provider calls, or production operations were executed in this review. Only this documentation file was edited.

## Scope and evidence

Reviewed `../design.md` (especially sections 3, 4.3–4.7), `plan.md`, `test_key.md`, `backend_implementation.md`, and `realtime_implementation.md` against the current worktree. Inspected sender/send-contract, request service/repository, message persistence/deduplication integration, accounts routes, migration/startup wiring, WS handler/account policy, and authored backend tests. Consulted installed SDK and Knex source where necessary.

Frontend implementation is assigned to another reviewer. The pre-existing user change to `backend/src/server/services/case-station-webhook.ts` is excluded. Existing surrounding code is cited only to explain how new changes interact with it, not as an independent backlog of pre-existing defects. Line references describe the worktree at review time.

The implementation has good boundaries: explicit request ownership, database-backed claims and attempt-fenced retry, acceptance before optional local work, conservative attachment-exception handling, and fail-closed WS authorization. These do not eliminate the integration races below.

## Blocking findings

### BV-01 — 🔴 P1: Status lookup can insert an incomplete accepted message and permanently prevent its media from being saved to history

**Primary locations:**

- `backend/src/server/services/send-request-service.ts:89–100`: every GET of a `sent` request schedules repair, including while the original send's local work is still running. Duplicate POST replay does likewise at line 127.
- `backend/src/core/store/send-request-repo.ts:63–84`: repair inserts accepted snapshots, skips attachments without a URL, and skips the entire message once a matching provider ID exists (`if (exists) continue`, line 72).

**Supporting integration:** `backend/src/core/runtime/sender.ts:70–77,197–211`; `backend/src/core/runtime/index.ts:176–183,305–327`.

**Concrete scenario:**

1. Zalo accepts an image/file. `onAccepted` commits `status: sent` and its message snapshot **before** `mediaStore.saveBuffer`. The snapshot has attachment name/type/size but no URL yet.
2. The client lost its POST response, is polling status, or another tab repeats the same request. GET/replay starts `repairLocal` while media storage is slow.
3. Repair inserts the message into `messages`, omitting the URL-less attachment.
4. The original media save succeeds. Its subsequent runtime append checks `hasMessageByProviderIdForAccount`, finds the repair row, and returns `false` without writing the richer message or publishing its normal message event.
5. The final request checkpoint contains the media URL, but every later repair hits `if (exists) continue`. History continues returning the skeletal message with no attachment; for a new conversation the skipped normal append also skips its summary upsert. The stored file/request snapshot alone does not repair the history row.

**Impact:** A normal recovery/status operation can cause durable local content loss even though both provider delivery and media storage succeeded. The request correctly remains nonretryable `sent`, but local repair cannot converge. This violates the accepted/local-failure recovery and richer-history preservation requirements in design sections 4.3 and 4.5.

**Recommended minimum fix:** Coordinate repair with the original local-persistence phase so an intermediate acceptance snapshot cannot compete with it. Also make repair fill missing message/media fields and missing attachments on an existing matching row without replacing richer echo data; existence alone is not proof of completed persistence. Ensure a repaired new conversation remains discoverable through its summary. Preserve the no-provider-resend rule.

**Required follow-up case, not run:** Hold `saveBuffer` after the durable acceptance checkpoint; perform status GET and identical POST replay; release media persistence. Assert one provider invocation, one canonical message, usable media in history, and a discoverable conversation. Repeat with process interruption/local failure and subsequent repair from the enriched durable snapshot. Cover caption plus attachment as two distinct messages. Relevant gates: S1-T02/T04/T06.

### BV-02 — 🔴 P1: Unrelated account traffic fills every authenticated socket's queue and can disconnect other accounts

**Primary locations:**

- `backend/src/server/ws/handler.ts:81–104`: `broadcast` submits every scoped event to every authenticated socket; account and conversation eligibility are checked only **inside** its asynchronous delivery work.
- `backend/src/server/ws/handler.ts:54–61,65–72`: each queued event consumes the per-socket pending budget and performs a fresh policy query; reaching 128 queued items closes the socket as `SLOW_CLIENT`.
- `backend/src/server/helpers/account-policy.ts:8–18`: that policy query computes the user's complete authorized account set, rather than checking only the event's account.

**Concrete scenario:** Users A and B have disjoint account memberships. A's account produces a burst of messages/summaries, or the shared DB becomes slow while A's events continue. Every event is queued for B even though B cannot receive it. A burst of 129 scoped broadcasts before queue completion closes B at the pending-work limit, even when B's outbound buffer is empty and its network is fast. Events for other conversations similarly consume the queue before the subscription mismatch is discovered.

**Impact:** Scoped delivery prevents disclosure, but not cross-account availability interference. One busy account can disconnect unrelated users and trigger repeated reconnect/snapshot work. Database work also scales with all authenticated sockets for every event, including events that will certainly be discarded. This is a concrete queue/fanout regression, not a claim based on an unmeasured latency benchmark.

**Recommended minimum fix:** Reject obviously ineligible account/conversation deliveries before allocating per-socket queue work, using the socket's already-established account set/subscription (or equivalent account-indexed routing). Retain a fresh authorization/expiry check immediately before transmitting eligible data, so this optimization does not create a revocation grace period. Define membership-grant refresh behavior and coalesce redundant summary/status work as needed. Do not count another account's discarded traffic as evidence that this client is slow.

**Required follow-up case, not run:** Two authenticated sockets with disjoint accounts; pause policy reads or issue a controlled event burst for A. Verify B stays connected, receives no A data, and does not accumulate A's delivery work. Repeat for non-subscribed conversation bodies, and retain expiry/revocation tests around an in-flight policy query. Relevant gate: S1-T08.

## Other reviewed areas and nonblocking follow-up

### Request ownership and retry CAS

No additional blocking defect found structurally. POST compares initiating user, fingerprint and target before reuse/retry (`send-request-service.ts:121–129`). GET routes require editor access and owner or authorized elevated role. Retry predicates include `failed`, `retryable`, and the observed attempt count (`send-request-repo.ts:36–40`); completion writes fence by attempt and prevent downgrading durable `sent` (`42–47`). Pre-dispatch timeout fences the old dispatch callback. These observations are not substitutes for real PostgreSQL concurrency execution.

### Provider acceptance, distinct IDs, and caption plus attachment

The installed SDK aggregate shape and separate caption/file path support the new projection. Different provider IDs bypass equal-text/time deduplication; caption and attachment slots are retained separately. Acceptance is checkpointed before media/message work, local exceptions do not become retryable provider failures, and attachment exceptions remain ambiguous because a caption may already have been sent.

🟡 **Duplicate-ID robustness follow-up:** `send-contract.ts:42–51` does not reject/coalesce repeated IDs across slots; `sender.ts:54–66` deduplicates only `providerMessageIds`, not `messages`. For a fixture such as `{ message: { msgId: 103 }, attachment: [{ msgId: 103 }] }`, it emits two DTOs with the same canonical ID and incompatible text/media roles, and runtime deduplication can discard the attachment slot. No live/provider evidence establishing that this shape occurs was supplied, so this is not counted as a confirmed release blocker. Consider rejecting inconsistent repeated-slot receipts or normalizing each real provider identity once with a documented merge rule; add a duplicate-slot fixture in addition to the existing distinct-ID caption/file fixture.

### History correlation

`send-request-repo.ts:54–61` qualifies receipt lookup by account and conversation and correlates only observed provider IDs. It does not guess by text. The migration supplies a GIN index for the queried JSONB expression. DB-first history no longer awaits runtime acquisition. No additional cross-account correlation defect was found structurally. The accepted-message repair race in BV-01 still prevents correct history content even when correlation itself is correct.

### Startup recovery and migration loading

`server/index.ts:60–67` runs migrations before abandoned-send recovery and before serving HTTP. Recovery changes `sending` to nonretryable `unknown`, without dispatch. The single-process assumption is explicit; safe multi-replica recovery remains outside the current deployment contract.

**Correction to a handoff concern:** Knex's `migrations.extension: 'js'` is not a `.ts` discovery exclusion. Installed Knex's `migrator-configuration-merger.js:6–15,45–50` and `common/MigrationsLoader.js:2–12` show that default `loadExtensions` includes `.ts`. Therefore the production `extension` setting alone is **not** a confirmed startup bug.

🟡 Packaging/runtime verification remains required: backend tsc excludes `db/`; the Dockerfile separately copies migration sources, whose execution needs a Node version with compatible native TypeScript support or a configured loader. The working directory must resolve `./db/migrations`. This review did not execute a packaged startup, contact a database, or establish the actual deployed runtime/artifact layout; no deployment failure or success is inferred.

### WS authorization, expiry and scoping

No independent disclosure/expiry blocker found in the inspected path. Anonymous clients receive only transport/auth data; JWT algorithm/claims are checked; current DB roles and memberships govern account access; expiry is checked before and after async policy reads and by a timer; closed sockets cannot be revived by queued work. Conversation events require an exact subscription and summaries require account membership. `unsubscribe` retains authentication. The full fresh-policy fanout cost and queue isolation issue is BV-02, not a recommendation to remove authorization checks.

## Verification limitations and next step

Authored tests were read but **not run**. Current sender tests stub the runtime append, and the PostgreSQL request test exercises the request registry without a real messages/attachments repair integration case; neither structurally covers BV-01. Existing realtime tests do not establish isolation under unrelated-account queue saturation. No formal test score, live-send result, or performance result is claimed.

**Next step:** CODER addresses BV-01/BV-02 and authors the regression cases; VERIFIER rechecks the fixes before TESTER executes the relevant critical gates. The acceptance/idempotency/security boundaries are a sound foundation; the required changes should preserve them rather than introduce any automatic resend or weaker authorization.
