# Release HOLD response — findings 2, 3, 6, 8

Preserved senior changes documented in `release-hold-fixes.md` and all dirty upgrades. No deployment, migration execution, production writes, or commit. This evidence does not independently grant release approval.

## 2 — Shared unresolved-operation barrier
- Server: new `conversation-send-barrier.ts` uses one PostgreSQL advisory transaction lock per account/conversation. Text/file receipt claim and retry, batch reservation, and action reservation check unresolved `send_requests`, `composer_actions`, and reserved batch children under this lock. User ID is deliberately not part of the barrier: another editor cannot bypass it. Archiving a batch locally does not clear its server children.
- Same-ID action replay is checked before the barrier. Text claim returns an existing identity before checking competing work. Batch replay retains existing immutable validation and remains accessible. A batch child excludes its own parent reservation, but not unknown/sending siblings; accepted children do not self-deadlock. GET/status/recovery never dispatch.
- Frontend: senior's `ensureConversationRecovered` and `conversationRecovery.ready` contract retained. Strict shared hydration now also reads local tool action identities; errors remain closed. Tools await this barrier and check local cached messages, current batch, archived outbox, and tool receipts before creating an identity. Text queue and batch dispatch also check shared tool receipts. Late terminal receipts cannot be downgraded by stale unknown lists.
- Server remains authoritative for cross-tab/user/process races. Local checks improve UX; they do not claim cross-tab atomicity. Legacy non-idempotent endpoints are not upgraded by this patch; new composer paths use receipt-backed sends.

## 3 — Definitive failure / safe recovery
- Reservation now precedes asynchronous SDK preparation. Preparation failure settles a durable `rejected` receipt with `result.dispatched:false`; it is terminal and does not hold the conversation barrier. Exceptions after dispatch remain unknown.
- Synchronous admission 429 includes `reserved:false, dispatched:false` for that invocation only. Generic DB failures never receive those proof fields.
- Added authorized `POST actions/:id/recover`: transaction locks the same conversation and reads/seals the identity. An absent ID gets a rejected tombstone, so a delayed POST cannot later reserve/send it. Existing unknown operations are NOT reset or retried. Foreign scope remains 404. Status GET404 by itself never unlocks.
- UI retains failed/timeout local identities and offers explicit “Khôi phục cùng ID (không gửi)”. Terminal proof clears the local barrier; query/recovery never submit another provider action. Unknown persisted receipts are no longer removed from localStorage prematurely.
- Crashed/hung preparation may remain unknown conservatively; no automated reclaim can dispatch it. Recovery cannot certify an already-reserved unknown action as unsent.

## 6 — Semaphore race
Active permit acquired synchronously before awaiting reservation, released on reserve failure, duplicate replay, preparation failure or final provider settlement. HTTP timeout does not release active provider work. At capacity, same-ID existing receipt remains readable/replayable. Regression starts eight calls with a delayed reservation: exactly four enter reserve; other four return proven admission 429. Repeated duplicate and DB-failure cases confirm permit release.

## 8 — Sticker keyword
UI disables empty/whitespace search. Route trims and requires 1–100 characters before SDK search. Contract no longer advertises empty-keyword catalogue. Unit and browser assertions cover this behavior.

## Executed release evidence
- Backend `npx tsc --noEmit`: PASS.
- Focused backend suite covering tools/composer/send service/sender/account routes and PostgreSQL test declarations: **41 passed, 3 skipped** before the final added keyword unit test. Final tools-only rerun: **9 passed**, no failures.
- The three PostgreSQL tests were skipped: no `SEND_REQUEST_TEST_DATABASE_URL` configured. New `conversation-barrier.postgres.test.ts` covers real cross-feature claim race, unknown tools blocking text/batch, own-ID replay, reserved/unknown archived batch blocking tools, own child dispatch and absent-ID sealing. Not claimed executed. Existing isolated test fixtures now include the already-existing action/composer migrations required by the barrier.
- Frontend `npm run typecheck`, `npm run build`: PASS (existing chunk-size warning remains).
- Frontend recovery/context/shared barrier tests: **7 passed**. Sales-chat regressions: **22 passed**.
- Composer browser: PASS at 390px/1280px.
- Extended tools browser: PASS at 390px/1280px, including empty search disabled, unknown send blocking, reload/query no resend, 429 + GET404 stays blocked, explicit recovery clears with no extra provider POST.
- `git diff --check`: PASS.
- Final tools-browser rerun had one transient 1280px reload timeout waiting for the launcher; an immediate full rerun passed both widths. Recorded as a harness/reload flake, not hidden as a clean first-pass result.

## Remaining release gate
Run the new and updated PostgreSQL tests against an explicitly disposable migrated fixture before removing HOLD. No live provider/MinIO/microphone test performed. Existing action/composer tables must be present when these server changes are enabled; no schema changes added in this fix. Review cross-tab behavior and full integration with the senior's independently owned changes. The text controller's pre-existing GET404 retry policy was not rewritten here; this patch's strict absent-ID sealing applies to extended actions.
