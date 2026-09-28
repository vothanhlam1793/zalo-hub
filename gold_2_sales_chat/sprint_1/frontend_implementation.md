# Sprint 1 frontend implementation handoff

Date: 2026-09-22. Phase: CODER implementation complete; coordinator verification/testing pending.

## Ownership and boundaries

- Implemented the active SPA under `frontend/src`, plus `frontend/tsconfig.app.json` and this handoff.
- Did **not** edit backend files, package manifests/scripts, workflow files, or `frontend/src/features/realtime/useWebSocket.ts`. Their concurrent changes belong to the other agents/coordinator. The existing Case Station webhook change was not touched.
- No test suite was executed, per the explicit instruction. No Zalo send, deployment, production migration, restart, commit, or push was performed.
- Existing desktop/mobile UI, entrypoints, rich media/quote/reaction shell, and historical SSR configuration remain in place. This is not the Sprint 2 renderer or Sprint 3 tag-management implementation.

## Interfaces for integration

### HTTP / DTOs

`frontend/src/types.ts` exposes the exact design §4.4 `SendReceipt`:

```ts
interface SendReceipt {
  clientRequestId: string;
  accountId: string;
  conversationId: string;
  status: 'sending' | 'sent' | 'failed' | 'unknown';
  messages: Message[];
  providerMessageIds: string[];
  acceptedAt?: string;
  error?: { code: string; message: string; retryable: boolean };
}
```

- `SendResponse` preserves optional legacy `method`, `result`, `kind`, plus `receipt`.
- `Message` adds optional `clientRequestId`, stable `localId`, delivery/error/retry metadata, `attachmentNeedsReselect`, and serializable `localFile` metadata. No fabricated provider IDs are assigned to optimistic rows.
- `api.accountSendText(accountId, conversationId, text, intent?, signal?)` and `api.accountSendAttachment(accountId, conversationId, file, caption?, intent?, signal?)` add `{ clientRequestId?, retry? }` without changing the existing URLs or required fields. Multipart retry is `"true"`.
- `api.sendRequest(accountId, clientRequestId, signal?)` / `bff.sendRequest` reads `GET .../send-requests/:id` returning `{ receipt }`.
- `ApiError` retains HTTP status and structured receipt from non-2xx JSON. Legacy error text remains the Error message.
- `bff.send` forwards request/retry/signal parameters; legacy sticker sending remains untouched. The Sprint 1 controller uses the typed direct API for text/file sends, not SDK response guessing.
- Timeout constants: 30s text, 120s attachment; status reads have a 10s per-read limit. Only status reads are polled (2s delay between completed reads, approximately a 30s polling window). A slow final status read can finish after that window; no POST is scheduled by polling.

### Keyed state / lifecycle

- `conversationKey(userId, accountId, conversationId)` is JSON tuple encoding. IDs containing separators are not split arbitrarily.
- `chatSession.capture()/valid()` provide a user + generation fence. Logout and different-user replacement synchronously invalidate old work, including logout/login as the same user.
- `useChatStore.byConversation[key]` is the authoritative message owner. Entries contain messages, revision, load/error/history state and in-memory cancelled-row tombstones. `messages` is only a reference projection of the selected entry for existing callers, not another message cache.
- Store entrypoints: `selectKey`, `mergeForKey`, `receiptForKey`, `patchMessage`, `removeMessage`, `setLoadState`. All mutation destinations are explicit keys. `useMessageCache` is a stable compatibility adapter over these methods; it no longer owns a Map.
- Conceptual normalized ownership is implemented as one immutable ordered array per key, with pure alias reconciliation at the merge boundary, rather than maintaining competing arrays plus a second alias-index store. Message objects unaffected by a merge retain their references.
- `useComposerStore` owns keyed drafts. Current text/File is a view projection. Draft text/file-name metadata persists; File bytes stay in the tab. Text input subscribes inside `ChatPanel`, so keystrokes do not subscribe the entire dashboard/sidebar to drafts.
- `auth-store` initializes/invalidates the chat session. `workspace-store` persists account selection by system user and clears account data on session replacement. Async authentication completions use their own epoch fence.

### Reconciliation

`features/chat/model/message-reconciliation.ts` exports testable `messageAliases`, `mergeMessages`, `applyReceipt`, `recoverMessage`, and `canRetry`.

- Trusted request correlation can claim an unresolved placeholder; canonical stored/provider aliases and observed client IDs join server rows. Provider IDs are opaque; only the known `${accountId}::` stored-ID prefix is decoded.
- There is **no text/time matching**. Identical messages are separate intents. An uncorrelated WS echo remains separate until a receipt supplies an alias.
- HTTP-first, WS-first and duplicate echoes use the same helper. Merging an already-visible server echo into a pending row retains the pending `localId`/React key.
- A caption-plus-image receipt retains every real canonical message. Shared request IDs do not collapse canonical rows, and differing observed provider IDs are not collapsed merely because `cliMsgId` is shared.
- Sent is monotonic against older receipts/hydration. Stale cache/HTTP snapshots preserve newer reactions, quote/media metadata and local previews. A delayed cached placeholder cannot resurrect a reconciled canonical item. Cancelled-row tombstones prevent an in-flight cache read from resurrecting discarded unsent work.
- The stale-cache merge does not increment the live revision: an IndexedDB hydration must not make the independent newer HTTP fetch look older than the cache.
- An accepted receipt with no IDs still marks acceptance without inventing a provider ID. One observed ID can join an earlier echo even if the receipt's canonical `messages` array is temporarily empty.

### Manual send controller

`features/chat/model/send-controller.ts` exports:

```ts
submitMessage(key, text, file?)
retryMessage(key, message, reselectedFile?)
querySendStatus(key, clientRequestId)
cancelQueued(key, message)
restoreDraft(key, message)
recheckUnresolved()
```

- Submit captures the target/session, UUID, text and File; inserts an optimistic row synchronously; clears only the captured draft; then dispatches. No completion clears a later draft or writes a global send error into another conversation.
- `ManualSendQueue` serializes explicit sends only within a conversation. Independent conversations proceed concurrently. It is not persisted or auto-replayed.
- Unknown/sending rows pause that conversation's queue. Cancelling revalidates the **current** queued state, so stale rendered controls cannot cancel a request that already dispatched.
- Only `failed && retryable` can explicitly retry, using the SAME request key/payload and `retry:true`. Live state is checked again before enqueue. Unknown is never resent, including after 404 lookup, reload, reconnect or focus.
- Interrupted requests are queried, not retried. Old pre-retry status reads are fenced by a local attempt version; late sent evidence can still upgrade the request.
- File bytes and blob URLs remain in a tab-local registry across conversation/account selection. Confirmed replacement media, queued cancellation or session end revokes submitted previews. The draft preview is a separate short-lived URL recreated from the retained File when its composer remounts.
- After reload a missing file requires explicit reselect for definite-failure retry. Name/size/type are checked locally; the backend fingerprint/digest remains authoritative. A fingerprint mismatch must never trigger a new request ID automatically.
- Recovering failed/never-dispatched text into a draft refuses to overwrite an existing newer draft and provides feedback.

### Cache / loading / realtime integration

- IndexedDB keeps the old DB name but upgrades its schema to v2, disposing v1's unowned stores. New message snapshot keys explicitly include user/account/conversation, with each message carrying its stable local ID; drafts and account data are separately user-scoped.
- Writes follow store transitions. No bearer token, File bytes or object URLs are persisted. Cache access catches unavailable/private/quota/transaction failures and falls back to in-memory behavior.
- Session end clears that user's cache. Late reads/writes are fenced. Startup scans that user's unresolved cached conversations, recovers unsent rows as draft-restorable failures, and queries interrupted requests without dispatching anything.
- Selecting a cold conversation immediately projects an empty keyed pane with loading state; cached data is immediate. Network fetch and IndexedDB hydration run independently. Empty success and error are distinct; failures retain cached messages and provide reload.
- Account summaries load independently of provider contacts/groups. Stored reads are not gated on Zalo session availability. Metadata is background-only, with account/session/load-generation guards.
- Incoming WS messages now update the **event's** account/conversation even if another account is selected. Summary/unread handling stays account-scoped.
- The realtime agent's additive `onEvent` callback is consumed for `authenticated` to recheck unresolved requests. Online/focus and connected status also recheck. The hook itself was not edited. Existing `subscribe/unsubscribe` signatures remain in use.

## UI behavior

- Both desktop and mobile pass the same delivery actions/loading/error state to the active `ChatPanel`.
- Footer copy: `Chờ gửi`, `Đang gửi…`, `Đã gửi`, `Gửi chưa thành công`, `Chưa xác nhận kết quả gửi` with the appropriate cancel/retry/query/draft action. Incoming/history rows without local delivery metadata receive no fabricated delivery label.
- Reactions requiring provider IDs are hidden for unresolved rows. A sent label means provider acceptance, not recipient delivery/read.
- Composer stays available while another send runs, subject to account connection/role, nonempty input, missing-file and IME checks. Duplicate guarding is per native submission event, not a 250ms text throttle. Shift+Enter remains a newline. File input value resets after selection so the same file can be selected again.
- Draft image preview, pending image/file preview and lost-file reselect/discard affordances are included.
- Render keys use `localId || id`. Prepend scroll uses a visible message/offset anchor (height delta fallback); incoming while reading older messages shows a count/jump control; own pending sends return to the bottom. The panel is keyed by the complete conversation key across account changes. Reduced-motion users get an instant jump rather than smooth animation.
- Delivery status uses polite live announcements; controls have readable labels. Accessibility/browser behavior is implemented but has **not** been certified by browser or assistive-technology testing.

## File inventory

| Area | Files |
|---|---|
| Contract / aliases | `frontend/src/types.ts`, `api.ts`, `bff-api.ts` |
| Authoritative state / auth lifecycle | `frontend/src/stores/chat-store.ts`, `composer-store.ts`, `auth-store.ts`, `workspace-store.ts` |
| Cache | `frontend/src/lib/client-db.ts` |
| Compatibility/loading/composer hooks | `frontend/src/hooks/useMessageCache.ts`, `useConversationManager.ts`, `useAccountManager.ts`, `useComposer.ts` |
| Pure model / controller (new) | `frontend/src/features/chat/model/chat-session.ts`, `message-reconciliation.ts`, `manual-send-queue.ts`, `send-controller.ts` |
| Active UI | `frontend/src/features/chat/useDashboardState.ts`, `DashboardPage.tsx`, `components/ChatPanel.tsx`, `components/MessageBubble.tsx` |
| Delivery footer (new) | `frontend/src/features/chat/components/messages/MessageDeliveryStatus.tsx` |
| Tests (new, not run) | `frontend/src/features/chat/model/message-reconciliation.test.ts`, `send-controller.test.ts` |
| SPA typecheck (new) | `frontend/tsconfig.app.json` |

## Baseline fixes included

- `accountSyncConversationMetadata` alias corrected; `accountSyncHistory` now receives its options object.
- Restart API alias corrected and restart response includes optional `error`.
- Added existing API aliases needed by active admin views: `accountMobileSync`, `accountSyncAll`, `adminUpdateMembership`.
- Reaction callback consistently uses `MessageReactionOption.icon`.
- Removed duplicate desktop `showDisconnectBanner` prop; selected-account source is retained.
- Lightbox receives its actual `index` and `open` props.
- `tsconfig.app.json` includes active SPA `src` only, excludes test files/historical SSR, and extends the old untouched config. No claim is made that broad historical SSR typecheck is fixed.

## Checks actually performed

1. PASS: `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json` from `frontend`.
2. PASS: static typecheck of the two new test files (not their execution):
   ```sh
   ./node_modules/.bin/tsc --noEmit --target ES2020 --module ESNext --moduleResolution bundler --lib ES2020,DOM --types node --skipLibCheck --esModuleInterop src/features/chat/model/message-reconciliation.test.ts src/features/chat/model/send-controller.test.ts
   ```
3. PASS: `npm run build` from `frontend`. Final observed bundle at this handoff: JS approximately 542.27 kB / 161.45 kB gzip, CSS 90.70 kB / 15.11 kB gzip. Vite retains the baseline >500 kB chunk warning. Build output is not a runtime/performance test.
4. PASS: `git diff --check -- frontend`.
5. Static inspection: removed the old message-cache Map, text/time reconciliation, fabricated pending provider IDs and global 250ms submission suppression.

## Tests prepared for the coordinator — NOT EXECUTED

Suggested command from repository root, using installed backend tsx with no package changes:

```sh
./backend/node_modules/.bin/tsx --test frontend/src/features/chat/model/message-reconciliation.test.ts frontend/src/features/chat/model/send-controller.test.ts
```

Coverage authored: identical repeated intents; HTTP/WS ordering and duplicate echoes; multi-message receipts with shared cli ID; exact opaque aliases; stale hydration/metadata; missing provider IDs; reload classification; user/account/session identity; queue serialization, pause/cancel/logout; synchronous optimistic commit before mocked POST; late acknowledgement after switching; 404 + unknown without resend; structured non-2xx failure and same-key explicit retry; logout callback fencing; cancelled hydration and draft isolation.

These test files use controlled fetch stubs or pure helpers, never real Zalo sends. They are intentionally left unexecuted for the authorized testing phase. The separate realtime-agent tests are not owned by this change.

## Remaining verification / gaps

- Execute the authored tests and the backend/realtime suites only when the coordinator begins TESTER. Static typecheck cannot establish runtime invariants.
- Browser checks remain required: real IndexedDB v1 upgrade/blocked/quota paths; F5 text/file restoration and status lookup; exact blob revocation timing; Vietnamese IME and rapid submit events; desktop/mobile (320–390px); scroll anchoring with delayed media sizes; keyboard/screen-reader announcements; and no console errors.
- No p95 paint measurements or React profiler evidence were collected. The plan's 30-sample/50-message/500-summary benchmark and <=100ms/<=150ms targets remain unverified, not claimed. Browser instrumentation should distinguish optimistic commit/paint, queue wait, HTTP and confirmation.
- No approved live Zalo target was supplied; real text/image/file send/receive, SDK receipt mapping and reload history smoke remain blocked on that approval. Backend/provider fixture evidence is owned by the backend agent.
- The persistent cache uses per-conversation snapshots rather than an IndexedDB row/index per message. Ownership and local-ID semantics are explicit, but very large retained conversations can make writes expensive; measure before introducing another owner or virtualizing the list.
- Uncorrelated echoes may temporarily show beside a pending row until a receipt supplies the alias. Accepted sends without IDs do not gain reaction controls until a real ID arrives. This is deliberate degraded behavior, not text/time guessing.
- Unknown outcomes can remain unresolved indefinitely if the backend/provider cannot prove acceptance/rejection. The UI deliberately provides status refresh, not resend or disguised draft recovery for unknown sends.
- Build warning and historical SSR diagnostics are baseline debt, not silently waived release checks. No deployment-readiness, WCAG certification or live-provider success claim is made here.
