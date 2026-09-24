# Sprint 1 realtime implementation handoff

Status: CODER implementation complete; formal VERIFIER/TESTER handoff pending. Tests were **authored, not executed**, per the explicit task instruction. No deployment, database migration, production connection, live send, package-script change or commit was performed.

## Owned files

| File | Change |
|---|---|
| `backend/src/server/ws/handler.ts` | Authenticated handshake, account/conversation-scoped fanout, expiry/revocation handling, bounded per-socket queues, listener/timer cleanup |
| `backend/src/server/helpers/account-policy.ts` | Narrow read-only DB policy helper using current user role and actual account membership |
| `frontend/src/features/realtime/useWebSocket.ts` | Transparent JWT authentication, ack-gated subscriptions, session-bound reconnect controller, synchronous logout cleanup, unchanged hook return interface |
| `backend/tests/realtime.test.ts` | Node test suite using a fake account manager, query stub and real loopback WebSocket server |
| `frontend/tests/realtime.test.ts` | Deterministic transport tests with fake sockets and a controlled timer scheduler |
| `frontend/tests/tsconfig.realtime.json` | Isolated realtime source/test typecheck configuration; no script changes |
| This file | Contracts, evidence and integration gaps |

The backend index/routes/account manager/webhook and frontend shared types/stores/API/dashboard were not edited by this task. Concurrent agents' modifications were preserved. Shared workflow artifacts remain coordinator-owned.

## Completed scope

- [x] S1-07 authenticated `/ws`: existing JWT secret/HS256 mechanism; token travels in a message, never the URL or logs. Require a nonempty `userId`, a valid signature and finite expiration.
- [x] No application data before successful authentication. Initial connection sends only `{ type: 'connected' }`. Invalid/anonymous clients receive a sanitized auth error and close.
- [x] Read authorization follows HTTP's current DB role: `super_admin` can access all existing accounts; other users need an account membership. JWT role claims and membership `visible` flags do not grant/restrict read permission. Deleted users fail closed.
- [x] Summaries, session state, sync and unknown scoped events fan out to every permitted account, independent of the selected conversation. Initial summaries are fetched only from existing runtimes; no runtime is started for a socket.
- [x] Conversation messages require both authorized account and exact active conversation subscription. `unsubscribe` removes only that subscription. A denied replacement subscription clears the previous one.
- [x] Fresh DB policy read before every application delivery and subscription, plus a 30-second idle recheck. Membership revocation clears invalid subscriptions; role demotion immediately affects subsequent policy checks. Policy-query failure closes fail-safe without raw DB errors.
- [x] BV-02 correction: reject unrelated account/conversation traffic before queue allocation using established eligibility; retain fresh DB/expiry checks immediately before every admitted delivery. Rejected fanout neither queues work nor triggers a policy query.
- [x] Exact JWT-expiry timer and checks before/after async policy reads. Authentication deadline is 10 seconds. Queued work cannot send after close/expiry.
- [x] Generic `broadcast(payload)` and `broadcastConversationMessage(accountId, message)` remain callable synchronously with the same signatures/void behavior. Delivery is queued asynchronously. Generic `conversation_message` broadcasts also use conversation scoping.
- [x] Unscoped account-data events are dropped, including existing unscoped tag broadcasts. `connected` is the only global exception and its extra fields are stripped. Scoped unknown event names and additive fields remain intact.
- [x] Existing account-manager message listener remains additive. It neither consumes nor replaces webhook/other backend listeners. Incoming/local-outgoing messages retain `{ type: 'conversation_message', accountId, message }`, including `message.clientRequestId` and other additional fields.
- [x] Browser subscribes only after `authenticated`; reconnect repeats authenticate → ack → current subscription. Retry delay is 1/2/4/8/16/30 seconds, reset on authentication success, not just TCP open.
- [x] Frontend session/token/socket guards reject stale callbacks. Disposal invalidates the socket before closing and cancels both handshake/retry timers. Auth-store subscription stops immediately on logout/user replacement; storage/focus events check cross-tab token changes. React cleanup is StrictMode-safe. User-object observation covers a batched logout/login with the same user ID/token.
- [x] Events keep their captured account/conversation IDs; no reassignment using the current UI selection. Additive optional `onEvent` allows unknown events through without changing existing handlers or `{ subscribe, unsubscribe }`.

## Wire contract and failure behavior

```ts
// First client message
{ type: 'authenticate', token: '<existing auth_token JWT>' }
// Server ack, after DB policy lookup
{ type: 'authenticated' }
// Then, as before
{ type: 'subscribe', accountId, conversationId }
{ type: 'unsubscribe' }
// Message shape is unchanged
{ type: 'conversation_message', accountId, message }
```

A token-bearing **first** `subscribe` is supported for compatibility and produces `authenticated` before `subscribed`. An anonymous subscribe is rejected. An already-authenticated socket cannot change identity by reauthenticating; use a new connection.

| Condition | Outcome |
|---|---|
| Invalid/missing JWT, expired token, deleted user | `error`, close `4401`; browser does not loop on the same credential |
| Authentication deadline | `AUTH_TIMEOUT`, close `4408`; browser may reconnect safely |
| Membership absent at subscribe | `ACCOUNT_FORBIDDEN`; keep authenticated socket, no conversation subscription |
| Existing subscribed membership revoked | `ACCOUNT_ACCESS_REVOKED`; remove subscription, keep other authorized accounts |
| Policy DB failure / slow client | Sanitized error, close `1013`; browser backs off |
| Invalid authenticated command | Sanitized error, no data/identity change |

Account snapshots and messages are authorized from a fresh DB statement immediately before transmission; no cached 30-second permission grace is used. Read/query and socket write are not a transaction with administrative membership writes.

The server bounds inbound frames to 16 KiB, pending work to 128 items/socket and queued outbound data to approximately 1 MiB before closing a slow client. Expiry/auth timers are cleared on close; idle-policy timer and manager listener are removed when the WS server closes.

## Dedicated tests (not run)

### Backend — 11 cases

1. Anonymous socket receives no initial/global/account data; unscoped tag events drop; global connected cannot smuggle extra fields.
2. Disjoint users, authorized background account summaries, initial runtime snapshots, exact conversation isolation, outgoing receipt field preservation, unknown scoped events, unsubscribe and backend-listener coexistence.
3. No membership, atomic token-bearing subscribe, DB super-admin bypass, JWT role spoof rejection.
4. Both public broadcast APIs preserve envelopes and scope messages; rejected replacement drops old subscription.
5. Membership revocation, super-admin demotion and deleted-user closure before subsequent delivery.
6. Invalid/expired JWT rejection and active-session expiry closure.
7. Policy DB errors fail closed with sanitized diagnostics.
8. Bursts exceeding the queue bound for non-subscribed conversations and unrelated accounts, including a paused legitimate policy query: no unrelated policy reads/queue exhaustion, healthy authorized delivery afterward.
9. Newly granted account remains filtered until a fresh command refresh; subscribe discovers the grant immediately, then summaries/messages flow without replaying discarded events.
10. Revocation during an in-flight delivery policy read rejects a previously eligible message.
11. Expiry during an in-flight delivery policy read closes the socket; query completion cannot revive delivery.

### Frontend — 5 cases

1. Open authenticates; pre-ack data is ignored; latest captured selection subscribes exactly once after ack; late receipts and unknown fields preserve original account/conversation.
2. Reconnect handshake and one resubscription; stale old-socket close/message callbacks cannot affect the new connection.
3. Connecting/retrying/authenticated disposal cancels all controller timers; even manually invoked stale callbacks cannot reconnect.
4. Token replacement and expiry block old-user events and suppress invalid-credential retry loops.
5. Handshake timeout/backoff, error-plus-close deduplication and unsubscribe while reconnecting.

Suggested formal tester commands, from repository root (**not executed by this task**):

```sh
./node_modules/.bin/tsx --test backend/tests/realtime.test.ts
./node_modules/.bin/tsx --tsconfig frontend/tests/tsconfig.realtime.json --test frontend/tests/realtime.test.ts
```

These suites use no database, Zalo SDK sends or public network. The backend test server binds `127.0.0.1` on an ephemeral port. The query stub models policy results; it is not evidence of real PostgreSQL execution or production query performance.

## Compilation evidence

Executed successfully (no tests):

```sh
./node_modules/.bin/tsc --noEmit -p backend/tsconfig.json
./node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck backend/tests/realtime.test.ts
./node_modules/.bin/tsc --noEmit -p frontend/tests/tsconfig.realtime.json
git diff --check -- backend/src/server/ws/handler.ts backend/src/server/helpers/account-policy.ts frontend/src/features/realtime/useWebSocket.ts backend/tests/realtime.test.ts frontend/tests/realtime.test.ts frontend/tests/tsconfig.realtime.json
```

The broad `tsc --noEmit -p frontend/tsconfig.json` was also attempted during concurrent implementation. It reported 12 diagnostics outside the owned realtime code: historical SSR root/CSS/server declarations plus DashboardPage/ChatPanel/useDashboardState integration issues. See the baseline and coordinator's eventual final typecheck; this is a point-in-time observation, not a final diagnosis of other agents' work. Isolated realtime source/tests compile cleanly.

## Integration requirements and remaining gaps

- Coordinated frontend/backend rollout is required. Old anonymous clients intentionally stop receiving data. No deployment was attempted.
- Local outgoing receipts must be published through the existing runtime/account-manager event path (backend delivery agent owns that integration). The WS listener forwards the canonical DTO unchanged and does not suppress `isSelf` messages. Its fake-manager test covers this seam, not actual provider emission.
- Conversation messages remain subscription-scoped, per section 4.7. A user who switches away before a message is emitted recovers that send via the HTTP receipt/status/history mechanisms owned by the state/delivery agents. This implementation does **not** broadcast all conversation bodies account-wide to compensate.
- Existing dashboard consumers must merge by payload account/conversation and refresh authoritative data on reconnect as appropriate. `onEvent` receives the authenticated ack for optional reconnect invalidation. Full React mounting, dashboard/store races and browser multi-tab behavior remain formal integration-test work.
- Token validity follows the existing HTTP JWT mechanism. Deletion from `system_sessions` alone is not a server-side JWT denylist here (HTTP does not consult it either). Browser logout disposes the socket; token expiry, user deletion and membership/role changes are enforced server-side. A system-wide logout/revocation registry would require coordinated HTTP changes outside scope.
- Cross-tab token removal/replacement stops the old connection. A new connection waits for the auth store to establish the new user session; it does not trust a changed localStorage token as proof of user identity.
- Initial snapshots can fail independently of message delivery; HTTP remains the authoritative bootstrap/fallback. Accounts without a loaded runtime get an empty session status, not an invented empty conversation-history snapshot. No durable WS replay or automatic provider/history sync was added.
- Fresh per-delivery policy reads favor security over caching. Query/load performance and production scale have not been measured. The idle recheck does not proactively remove already-rendered account data from frontend stores; store/UI invalidation belongs to integration.
- The existing fallback development JWT secret is retained for compatibility, not a production-security endorsement.
- Full S1-T08 and the cross-user portions of S1-T03 still require execution by the formal tester. No release-critical case is claimed passed on compilation alone.

## Correction appendix — BV-02 pre-queue eligibility (2026-09-22)

**Review:** `backend_verification.md`, BV-02 P1. Returned to CODER, now ready for VERIFIER recheck. No tests have been executed by this correction task.

### Root cause and fix

Previously, every authenticated socket allocated queue work for every scoped broadcast before discovering that the account or conversation was ineligible. A synchronous burst of more than 128 unrelated events could therefore close a healthy socket as `SLOW_CLIENT` and cause unnecessary policy reads.

`deliver()` now applies the following gates:

1. Before `enqueue`: socket must be open/not closed, account must belong to the socket's established account set, and a `conversation_message` must match both fields of its current subscription. No queue slot, promise chain or DB read is allocated for rejected traffic.
2. At execution: recheck eligibility, since an earlier queued command/delivery may have changed the account set/subscription.
3. Before sending: perform the existing fresh DB policy read, with expiry checks both before and after the await, then check eligibility again. Cached membership only admits work; it never authorizes sending.

Both broadcast APIs, generic scoped unknown events, the exact message envelope, and independent backend listeners remain compatible. Account-wide summaries/status remain independent of conversation selection. The existing queue/backpressure limits still apply to genuinely eligible traffic; an overloaded account can exhaust its own socket budget but cannot spend an unrelated user's budget through these broadcasts. No new summary/status coalescing was needed for this scoped correction.

### Permission gains and ordering

- Subscribe commands intentionally **do not** use cached account membership to deny a request. Their fresh policy lookup discovers a new membership or role promotion immediately.
- Other authenticated commands and admitted application deliveries also refresh the entire permitted account set.
- The existing 30-second idle refresh discovers grants/promotions even if no currently eligible traffic arrives. It uses one queued refresh for an idle socket, not one query per rejected event. Under DB delay, visibility waits for the policy query to finish; there is no claim of an unconditional 30-second wall-clock SLA.
- Rejected broadcasts do not trigger grant refresh and are not replayed. A message published before the subscription is established/acknowledged may be dropped. Authoritative HTTP bootstrap/history/status recovery remains the integration fallback.
- Revocation is still checked freshly before sending, not delayed until that idle interval. Both in-flight revocation and expiry regression cases were added.

### Regression coverage authored

The fake query layer now counts reads per user and can pause a chosen user's next policy query. Existing real-loopback WS fixtures remain isolated from DB/provider services.

- Send 400 message events for each of two non-subscribed conversations (800 total). Each user's following authorized barrier should account for exactly one policy read; both sockets should stay open.
- Pause B's authorized delivery query. Broadcast 400 rounds of A-only summaries/status/unknown events/message bodies (1,600 total), exceeding the bounded queue repeatedly. Release B's query and send another authorized B message. B should stay open, receive no A data/`SLOW_CLIENT`, and perform only its two legitimate delivery policy reads. A is allowed to exhaust its own budget in this overload fixture.
- Grant an account to a previously unassociated user; 400 broadcasts before refresh must not query or exhaust its socket. A new subscribe must discover the grant with one fresh read and receive subsequent authorized data.
- Hold a message authorization query while membership is revoked or the JWT expires; the message must not be sent after completion.

These are authored assertions, **not reported test results**. Existing expiry/revocation tests remain intact. The periodic grant-refresh timer itself was structurally retained, not clock-tested in this correction.

### Correction scope and compilation

Only these files changed in this correction:

- `backend/src/server/ws/handler.ts`
- `backend/tests/realtime.test.ts`
- `gold_2_sales_chat/sprint_1/realtime_implementation.md`

No frontend hook or frontend-agent-owned file was changed. Cross-tab auth-store/session lifecycle and dashboard reconnect integration remain with the frontend agent; this correction requires no client protocol/interface change. BV-01 remains with the backend delivery agent.

Compilation/checks performed without test execution:

- **PASS:** targeted backend realtime test/source compilation using the standalone TypeScript command in the compilation section above.
- **PASS:** scoped `git diff --check` for the changed backend handler/test paths.
- **BLOCKED outside ownership at this point in time:** full `tsc --noEmit -p backend/tsconfig.json` reported three `localPersistence` type errors in `backend/src/server/services/send-request-service.ts` (lines 102, 156, 173) during the parallel BV-01 correction. No diagnostic referenced this correction's realtime source/tests. The earlier full-backend pass above predates this concurrent correction; it is not claimed as the current full-project result.

Next: VERIFIER recheck BV-02, then formal TESTER executes the realtime suite/S1-T08. No migration, deployment, live send, package-script edit or test execution was performed here.
