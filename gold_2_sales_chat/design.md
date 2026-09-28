# Detailed technical design

Status: proposed implementation contract for Sales Chat Readiness, 2026-09-22.

## 1. Source-grounded findings

| Current code | Finding | Consequence |
|---|---|---|
| `frontend/src/hooks/useComposer.ts` | Pending messages enter the visible store but not the message cache; result parsing expects `message/msgId` at the top level | HTTP acknowledgement may not reconcile; cache refresh can drop pending messages |
| `backend/src/core/runtime/sender.ts` | Returns `{ method, result }`; text and attachment receipt shapes differ; missing IDs fall back to UUIDs | A synthetic local ID must not be presented as a confirmed provider ID |
| `frontend/src/hooks/useMessageCache.ts` | Pending match may use equal text within 30 seconds | Repeated identical messages can collapse incorrectly |
| `frontend/src/stores/chat-store.ts` | Reconciles every matching pending text in the visible list | One echo may replace multiple pending messages |
| `frontend/src/features/chat/components/MessageBubble.tsx` | Outgoing bubbles always display a sent check; no audio/call renderer | Misleading sending status and poor rich-message UX |
| `frontend/src/hooks/useConversationManager.ts` | Cache miss does not immediately clear the previous list; background replacement can discard concurrent local data | Wrong customer's old content/temporary loss of pending items |
| `frontend/src/lib/client-db.ts` | Message key is bare `id`, not explicit user/account/conversation; no pending cleanup contract | Alias collisions, stale pending rows, and logout isolation require attention |
| `frontend/src/features/chat/useDashboardState.ts` | Subscribes to whole Zustand stores; skips messages for non-selected accounts; owns multiple state copies | Excess renders and late acknowledgements can affect the wrong view |
| `backend/src/core/runtime/normalizer.ts` | Voice is a message kind but its attachment becomes file; unknown msgType becomes text | Voice/file distinction and call interpretation missing |
| `backend/src/core/store/helpers.ts` | Restricts recognized kinds and repairs stored payloads | Adding a renderer alone does not fix old messages |
| `backend/src/core/store/tag-repo.ts` | Assign/read/cache updates use conversation ID without account ID | Ambiguous associations across accounts |
| `backend/src/server/helpers/auth-middleware.ts` | Account middleware reads `params.accountId`, skips if missing | Current tag query/body routes cannot rely on this middleware unchanged |
| `backend/src/server/ws/handler.ts` | Anonymous subscribe; initial account data before auth; generic global broadcast | New tag/message delivery needs a real account-scoped boundary |
| `frontend/src/features/chat/DashboardPage.tsx` | Desktop and mobile wiring coexist; duplicate `showDisconnectBanner` prop in desktop | Validate typecheck and both layouts, not only build output |

These are static observations. No production timing or provider format was measured during design.

## 2. Implementation shape: small seams in existing paths

Keep `backend/src/server/index.ts` and `frontend/src/main.tsx` as entrypoints. New files below are proposed, not already implemented. Avoid directory-wide moves.

```text
backend/src/
  server/services/send-request-service.ts   # idempotency/correlation for explicit user sends
  server/routes/send-requests.ts            # query an existing send intent
  server/services/tag-service.ts            # account policy + transactional label operations
  server/ws/handler.ts                     # authenticated scoped delivery
  core/store/send-request-repo.ts
  core/store/tag-repo.ts                    # extend existing repo, not a competing implementation
  core/runtime/normalizer.ts                # extend shared normalizer
  core/runtime/message-presentation.ts      # bounded provider-to-call/media mapping helpers
  core/runtime/sender.ts                   # additive receipts, preserve SDK behavior

frontend/src/
  features/chat/model/message-reconciliation.ts  # pure merge/alias/state transitions
  features/chat/model/message-presentation.ts    # small display selectors; no provider parser
  features/chat/hooks/useSendMessage.ts
  features/chat/components/messages/
    MessageDeliveryStatus.tsx
    VoiceMessage.tsx
    CallMessage.tsx
    StickerMessage.tsx
  features/tags/
    api.ts
    useTags.ts
    TagPicker.tsx
    TagManagerDialog.tsx
    TagFilter.tsx
  stores/chat-store.ts                     # authoritative messages per conversation
  stores/composer-store.ts                 # drafts per conversation
  lib/client-db.ts                         # persistent cache + pending metadata
```

Public DTO types stay in existing `backend/src/core/types.ts` and `frontend/src/types.ts` for this increment. Contract tests prevent drift. Do not import backend runtime types into browser builds or repurpose service JWT contracts for this work.

## 3. Identity and ownership rules

- `ConversationKey = [systemUserId, accountId, conversationId]`, encoded as a tuple/JSON string, never inferred from the currently selected account during an async completion.
- Public conversation IDs retain `direct:<threadId>` / `group:<threadId>`.
- DB row IDs and provider message IDs are separate identities. Parse an account prefix only using the known storage helper convention; never blindly split arbitrary provider IDs.
- Server message identity is account + conversation + canonical stored ID; aliases may include provider ID and provider client ID when observed.
- `clientRequestId` is a UUID generated by the browser for one send intent, distinct from provider `cliMsgId`.
- Add optional `clientRequestId` to the canonical backend/frontend message DTO for Hub-generated outgoing correlation. Only attach it using a known send request/receipt mapping. Do not inject it into unverified SDK fields or infer it on unrelated incoming echoes. Persist receipt-to-message references in `send_requests`; history can recover the association from that mapping without requiring every raw provider payload to contain it.
- A UI `localId` remains stable while a pending row acquires server IDs. React keys should not change on acknowledgement.
- Active conversation/account is a view selection, not the destination of an in-flight operation.
- Logout or user replacement cancels unsent tab-local work, revokes object URLs and clears that user's cache. Old async callbacks cannot repopulate a new user's state.

## 4. Sprint 1: message state and responsiveness

### 4.1 One state owner

`chat-store.ts` owns normalized message data keyed by ConversationKey. `useMessageCache` becomes a thin compatibility adapter to that owner while callers migrate; it must not maintain a second Map of the same messages.

Proposed conceptual state (names may be adjusted by the integrator):

```ts
type DeliveryState = 'queued' | 'sending' | 'sent' | 'failed' | 'unknown';

type LocalMessageMeta = {
  localId: string;
  clientRequestId?: string;
  delivery?: DeliveryState; // absent for ordinary received/history messages
  errorCode?: string;
  errorText?: string;
  retryable?: boolean;
  attachmentNeedsReselect?: boolean;
};

type ConversationMessageState = {
  messagesByLocalId: Record<string, Message & LocalMessageMeta>;
  orderedLocalIds: string[];
  aliases: Record<string, string>; // scoped provider/stored/client-request alias -> localId
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  hasMoreHistory: boolean;
  selectionGeneration: number;
};
```

Use focused Zustand selectors. Typing into a draft must not rebuild every conversation summary/message bubble. Preserve existing list order/time presentation and account unread state.

### 4.2 Submit flow

1. Read the current draft and capture its user/account/conversation key synchronously.
2. Ignore IME composition Enter. Guard the same DOM submission from duplicate execution, not all equal text or all submits within 250 ms.
3. Generate `clientRequestId` and stable local ID. Insert the pending row into the authoritative conversation state before any network await.
4. Snapshot File/Blob into a tab-local submission registry; create image preview URL. Clear only the captured draft, never a newly typed draft in a later completion.
5. Dispatch immediately if that conversation has no send in flight; otherwise queue in memory. Other conversations remain independent. This is manual chat serialization, not a bulk-send/job engine.
6. Use the explicit captured IDs for HTTP, cache updates, status and summary updates.
7. Feed HTTP acknowledgement and WS messages through the same reconciliation functions.
8. On ambiguous outcome, pause subsequent queued sends for that conversation to preserve intended order; show status and allow cancellation of unsent items. Continue after the ambiguous item resolves.

No artificial delay is added to the happy path. A successful result means Zalo accepted the send, not that the recipient received/read it.

### 4.3 Reconciliation rules

Match in this order, with aliases scoped to the conversation:

1. Matching `clientRequestId` from a trusted Hub receipt/event.
2. Matching canonical stored ID or observed provider ID.
3. Matching observed provider `cliMsgId`.
4. Otherwise insert a distinct message. Text + time is not an identity key.

HTTP receipts join `clientRequestId` to every canonical provider message emitted for that request. If the WS echo arrived first, merge the already-inserted server row into the pending local row once that alias arrives. Keep the local render key. For an SDK operation emitting multiple real messages (e.g. caption plus image), preserve each real message; do not collapse them to a single message merely because the send request is shared. Receipt fixtures determine that mapping.

An echo without correlation may briefly exist separately from the pending row until a receipt resolves it. Do not guess an association to make it look smoother. Test and document this degraded case.

When a provider response lacks an ID, use one local storage ID for the Hub record if needed and leave providerMessageId absent. Do not generate two independent fallback UUIDs for stored/provider IDs. The provider adapter must classify acceptance from a verified response shape; an arbitrary truthy object is insufficient proof.

Refresh/history merge must preserve unsent/unresolved rows and richer attachment/reaction metadata. An older HTTP snapshot may not downgrade a newer terminal delivery state. Stable ordering uses timestamp and a deterministic ID/local sequence tiebreaker.

### 4.4 Additive send API contract

Existing URLs remain:

```text
POST /api/accounts/:accountId/send
  JSON: { conversationId, text, clientRequestId?, retry? }

POST /api/accounts/:accountId/send-attachment
  multipart: conversationId, file, caption?, clientRequestId?, retry?

GET /api/accounts/:accountId/send-requests/:clientRequestId
```

`retry` is false/absent normally; multipart represents true as `"true"`. New browser clients always include clientRequestId. Legacy callers without it retain existing response fields and send behavior, but receive no new idempotency guarantee. Validate account authorization before multipart processing on the touched route.

Append a receipt to existing successful `{ method, result, kind? }` responses:

```ts
type SendReceipt = {
  clientRequestId: string;
  accountId: string;
  conversationId: string;
  status: 'sending' | 'sent' | 'failed' | 'unknown';
  messages: Message[]; // canonical Hub message DTOs, possibly multiple; empty while unresolved
  providerMessageIds: string[]; // actual observed IDs only
  acceptedAt?: string;
  error?: { code: string; message: string; retryable: boolean };
};
// POST response: existing fields + { receipt: SendReceipt }
// GET response: { receipt: SendReceipt }
```

Responses:

| Situation | HTTP | Semantics |
|---|---:|---|
| Accepted/previously accepted identical request | 200 | `sent` receipt; no repeat SDK invocation |
| Request is still running or outcome unknown | 202 | `sending`/`unknown`; query status, never implicitly resend |
| Same request ID with different fingerprint | 409 | Reject; do not call SDK |
| Validation/auth/account/session failure before SDK dispatch | 4xx | Definite failure; actionable message |
| Known provider rejection | appropriate 4xx/5xx | `failed`, retryability based on evidence |
| Timeout/disconnect after dispatch, no definitive receipt | 202 if possible | `unknown`; retain request; if HTTP is lost, client queries status |
| Status ID does not exist | 404 | Not proof a concurrently arriving POST cannot exist; use same request ID |

Always keep top-level `error` string on error responses for existing fetch clients. New fetch/send adapter must also preserve structured receipt/status rather than discarding non-2xx bodies. Lack of a provider ID alone does not justify a fabricated provider ID or an assertion of recipient delivery.

### 4.5 Minimal durable request registry (not bulk sending)

Add `send_requests` via a new migration:

| Column | Meaning |
|---|---|
| `account_id`, `client_request_id` | Composite primary key |
| `system_user_id`, `conversation_id` | Initiator and explicit target |
| `payload_hash` | Deterministic SHA-256 of normalized target/text/attachment metadata + file digest; exclude retry flag |
| `status` | sending/sent/failed/unknown |
| `provider_receipt_json` | Observed IDs/acceptance time; sanitized, no SDK credentials |
| `message_refs_json` | Stored/provider IDs required to reconstruct canonical receipt messages |
| `error_code`, `retryable` | Sanitized outcome; no stack/raw token |
| `attempt_count`, `created_at`, `updated_at` | Debugging and atomic retry control |

Do not store file bytes or an automatic execution job here. No automatic pruning in this increment; deleting idempotency keys without a retention protocol permits accidental resend.

Algorithm:

1. Authorize, validate, fingerprint; atomically insert `sending` before invoking the SDK. Unique constraint handles simultaneous duplicate requests across tabs.
2. A conflict reads the existing row: verify owner/target/hash; return state, not a second send. Status queries require editor access AND initiating user, or authorized admin/master/super-admin.
3. Do not hold a DB transaction open across SDK/network/media work.
4. On provider acceptance, persist actual receipt immediately, before optional MinIO/local message work. If message persistence then fails, keep `sent`; repair local data using the receipt without calling send again.
5. Persist canonical message refs once available. Map the same payload through HTTP and runtime event paths.
6. On definite pre-dispatch error/rejection: `failed`. On an ambiguous post-dispatch error: `unknown`.
7. After backend restart, abandoned `sending` rows become `unknown`. Never auto-execute them.
8. Explicit retry of `failed && retryable` uses the SAME key and payload with `retry:true`, atomic compare-and-set to `sending`, incrementing attempt count. Never allow this transition from `sent`, `sending` or `unknown`.

This prevents repeat Hub execution for known request IDs; it cannot guarantee exactly-once Zalo delivery across a crash between remote acceptance and persisting its receipt. If provider lookup cannot resolve such a case, UI remains `Chưa xác nhận`; do not silently retry or match by text.

Initial browser timeout defaults: 30 seconds for text, 120 seconds for attachments, configurable constants. A client abort after dispatch means unknown, not cancellation or rejection. Poll request status every 2 seconds for up to 30 seconds while the same user session is active, then stop and offer manual status refresh; recheck on reconnect/reload. Capture timeout metrics before tuning. A server-side SDK timeout also means unknown unless rejection is definitive. A late provider success may upgrade unknown to sent, using the same attempt identity; it must not downgrade sent later or dispatch a replacement send.

The provider may accept a message before local DB/media fails in current code. Split that error boundary carefully in `sender.ts`; do not let all exceptions become `retryable:true`.

### 4.6 Cache, draft and reload behavior

- IndexedDB is a cache, not a second source of UI truth. Reads hydrate the store; writes follow successful store transitions.
- Version the cache schema to explicit user/account/conversation/local ID keys; add pending metadata/draft stores as needed. Existing messages without a trustworthy system user are disposable cache: invalidate/refetch rather than assign them to the next user.
- Persist text drafts and serializable pending intents, but not bearer tokens, raw credentials or object URLs.
- Do not auto-send hydrated queued/sending intents on reload. Query send-request status; queued-not-dispatched items become a recoverable draft. Files without bytes require reselecting the file before a definite-failure retry.
- Revoke blob URLs only when confirmed media replaces them, the item is discarded, or user session ends; not simply on conversation switch if the preview is still needed.
- IndexedDB unavailable/quota/version failures fall back to in-memory chat, with no unhandled rejection.
- Network fetch starts independently of IndexedDB hydration. Stale DB reads cannot overwrite a newer WS/HTTP result. Guard with user identity and key/generation.
- Reads of stored chat should use account-scoped DB/cache first and not wait for Zalo reconnect or sender-name enrichment. Metadata refresh is background. Offline sending still requires a live session.
- Scroll: maintain the first visible message anchor on prepend; auto-scroll on own send or when already near bottom. Incoming messages while reading old history show a new-message indicator. Account switch is a different key even if conversation ID is equal.

### 4.7 Realtime scope needed by this work

Keep `/ws` and existing event names. Add a token-bearing `authenticate` message before application data. Until authenticated, only `connected`/auth error is permitted; remove primary-account payloads before auth.

```ts
// Browser -> server
{ type: 'authenticate', token: string }
{ type: 'subscribe', accountId: string, conversationId: string }
{ type: 'unsubscribe' }
// Server -> browser
{ type: 'authenticated' }
{ type: 'conversation_message', accountId: string, message: Message }
```

For compatibility, a token-bearing first subscribe may authenticate and subscribe atomically. Anonymous subscription is not accepted. Retain the current JWT mechanism; do not put the token in the WS URL/logs.

Maintain authenticated identity and authorized account set per socket. Conversation subscriptions scope message payloads. Summaries/session updates are sent only for authorized accounts, even if another account is selected, preserving sidebar badges. `unsubscribe` removes the active conversation subscription, not the authenticated identity. Permission changes invalidate/recheck the account set; token expiry ends the authenticated session. Apply super-admin semantics consistently with HTTP.

All account-data broadcasts carry accountId and go through scoped fanout; do not add a new global tag event path. Transport-level `connected` remains global. Coordinate backend/frontend rollout because old clients omit auth. Resubscribe after reconnect; dispose sockets without scheduling reconnect after unmount/logout.

## 5. Sprint 2: message presentation

### 5.1 Canonical additive fields

Add `call` to backend/frontend MessageKind and all kind parsers. Add optional `call` field:

```ts
type CallMetadata = {
  media: 'audio' | 'video' | 'unknown';
  outcome: 'completed' | 'missed' | 'declined' | 'cancelled' | 'unknown';
  durationSeconds?: number; // finite nonnegative; explicit source-unit conversion
};
```

Use existing direction/timestamp; do not fabricate call outcome from generic text. Add `Attachment.durationSeconds?` for UI-safe duration, preserving legacy `duration` unchanged until its unit is verified. Backend projection converts only documented/fixture-proven units; browser media metadata can provide duration when absent.

Fixtures must distinguish live wrapper shapes (e.g. nested data) from stored raw shapes. A single bounded normalizer is shared by live ingestion and historical projection. Keep raw source intact; never render raw JSON/HTML as a fallback.

### 5.2 Normalizer rules

- Match call identifiers only from SDK source/documentation or captured fixtures. Unknown formats remain safe fallback, not guessed missed calls.
- Voice attachment type becomes `voice` when verified by message kind; audio MIME on ordinary file can also enable playback without rewriting history.
- Preserve mirrored `/media/` URLs over expired provider URLs during repair. Remote URL belongs in sourceUrl when appropriate.
- Sticker asset may be image, animated image, sprite or unsupported payload. Prove the format first; use a supported thumbnail/static fallback when no renderer exists. No guessed CDN URL templates.
- Emoji-only rendering uses grapheme-aware matching for a small number of emoji (1–3), including ZWJ/skin tones; mixed text stays ordinary text.
- For historical messages, extend `core/store/helpers.ts`, `message-repo.ts` and runtime repair paths consistently. Prefer read-time projection; no automatic destructive backfill. If metadata must be stored, add a nullable column and preserve old/raw fields.
- Every message-kind addition needs sidebar preview, attachment selection and monitor/history regression tests. `call` must not be downgraded to text by `toMessageKind`.

### 5.3 Render components

`MessageBubble` retains shared sender/quote/time/reaction/delivery shell; selects a renderer instead of growing more nested conditional blocks.

| Renderer | Behavior |
|---|---|
| Text/emoji | Existing text/quote behavior; 1–3 emoji may use larger transparent presentation |
| Sticker | Bounded size (~160 px desktop, responsive), contain aspect ratio; loading/error/unsupported fallback; timestamp/reactions retained |
| Voice | Native audio engine, accessible play/pause, elapsed/total and seek when supported; one clip playing at a time; no autoplay |
| Call | Audio/video icon + localized outcome + duration if known; neutral text for unknown; no fake call action |
| File/video/image | Preserve behavior and downloads/lightbox; voice handled before generic file branch |

On audio error show a comprehensible message plus open/download for the valid source URL. A missing source is a disabled player with explanation, not a broken empty `<audio>` element. Use keyboard-accessible buttons/labels. Switching account/conversation or unmounting pauses playback and releases listeners.

### 5.4 Media delivery

Inspect current `/media/*` route and MinIO metadata with actual audio. If seeking requires it, implement single-byte-range requests: 200 full, 206 with Content-Range/Accept-Ranges/length, 416 invalid range. HEAD and disconnect/error cleanup must not leak streams. No arbitrary remote fetch proxy or codec conversion service in this scope. Unsupported codecs use a clear fallback and are reported as a remaining limitation.

## 6. Sprint 3: label management

### 6.1 Product behavior

Desktop: selected account sidebar shows label filter + `Quản lý nhãn`; chat header shows chips + `Gắn nhãn`. Details panel may reuse the same picker, not a second implementation. Mobile uses the same data/actions in a sheet/dialog.

- Picker: search labels, show current selections, assign/remove with per-action pending status and rollback on failure.
- Manager: create/rename/recolor/delete account-internal labels. Show usage count before deletion and ask confirmation because assignments will be removed.
- Filter: v1 supports one selected label, `Tất cả`, and `Chưa gắn nhãn`; text search combines with the filter. Count is account-scoped matching conversations, not a claim of unique customers across accounts.
- Same label name in different accounts is allowed. Stable UUID is the identity. Name trimming, 1–80 characters, hex `#RRGGBB`, optional emoji max 16 Unicode code points. Reject normalized duplicate internal names in one account with 409; do not delete historical duplicates during migration.
- Define normalized duplicate names as Unicode NFC + trimmed whitespace + case-insensitive comparison; serialize same-account name checks/writes in a transaction (e.g. an account-scoped advisory lock) while legacy duplicates prevent adding a blanket unique index. Apply the same rule to create and rename, excluding the edited ID. Do not rely on an unlocked read-then-insert.
- New labels source=`system`, accountId required. Clients cannot set source=`zalo`/`ai`; those are reserved for import/existing integrations.
- Existing source=`ai` definitions are not newly generated here. They remain viewable/filterable/assignable if already usable, with definition editing disabled in v1.
- Zalo label definitions and assignments are a read-only mirror in UI. Sale edits on Zalo and explicitly syncs to Hub. A separate Hub label can mark a customer without changing Zalo. Write-back is an evidence-dependent future extension, not an implied two-way feature.
- Group conversations can carry internal labels, but no customer merge or group-member labeling is introduced.

### 6.2 Account-safe association model

Keep `tags.id` stable. Evolve `conversation_tags` to:

```text
account_id       NOT NULL
conversation_id  NOT NULL  # canonical public conversation ID after verified mapping
tag_id           NOT NULL  # FK tags(id), delete cascade retained
assigned_by      NOT NULL  # manual | zalo_sync | bot (existing values preserved)
created_at
PRIMARY KEY (account_id, conversation_id, tag_id)
INDEX (account_id, tag_id, conversation_id)
```

Every repository read/write/cache update takes explicit accountId. Resolve API conversation IDs to DB rows using account + canonical type/thread mapping, not just `WHERE id = ?`. Add composite FK to conversations only if live schema preflight proves the required unique key and ID mapping; never assume it from the API shape.

Source of truth is tags + associations. `conversations.labels_json` remains a derived cache for compatibility, refreshed in the SAME transaction as tag mutations. Rename/recolor/delete refreshes every affected account/conversation in a batched way, not one query per row without bounds. Assignment and delete lock the tag row before mutation to serialize concurrent edits; publish only after commit.

Global tags (`tags.account_id IS NULL`) are historical shared definitions: visible within authorized account operations, assignable to the requested account, editable/deletable only by super-admin. No new global-label creation UI in this release. Keep their IDs; do not clone silently per account.

### 6.3 Migration preflight and ambiguity handling

The current association has no accountId and no conversation FK. Before migration, report counts of:

1. Associations resolved to exactly one account/conversation using scoped tag ownership and conversation mapping.
2. Global labels whose conversation ID matches multiple accounts.
3. Account labels with no matching conversation in their own account.
4. Orphan tag/conversation references, duplicate canonical mappings, duplicate internal names.

Copy exact original rows to a migration backup table/report before backfill. Backfill only unique, verified associations. Never duplicate an ambiguous assignment across all matching accounts. Keep ambiguous/unresolved rows in an explicit migration review table with original values/reason; they do not enter active scoped assignments until resolved. The coordinator gets counts and must approve any rollout that would hide unresolved legacy assignments. This is a concrete data transition checkpoint, not permission to delete records.

Use a new forward migration rather than editing `20260918230000_create_tags_system.ts`. Test on a copy including ambiguous fixtures. During cutover old unscoped writers must be stopped; new frontend/backend and migration deploy together. Verify row accounting: original rows = migrated original rows + preserved unresolved rows (after documented deduplication, if any).

Rollback is application + data-aware. Restoring the old join schema after new account-specific writes may collapse records; preserve/export new rows and prefer a forward fix. Do not run a destructive `down` on a live upgraded database.

### 6.4 Scoped HTTP contract

Add canonical account routes; frontend uses these:

| Method/path under `/api/accounts/:accountId` | Body/query | Result | Minimum permission |
|---|---|---|---|
| GET `/tags` | none | `{ tags: TagItem[], capabilities }` | viewer |
| POST `/tags` | `{ name, color, emoji? }` | `{ tag }` | admin |
| PATCH `/tags/:tagId` | `{ name?, color?, emoji? }` | `{ tag }` | admin; owned internal tag only |
| DELETE `/tags/:tagId` | none | `{ deleted, affectedConversationCount }` | admin; owned internal tag only |
| GET `/conversations/:conversationId/tags` | none | `{ tags }` | viewer |
| PUT `/conversations/:conversationId/tags/:tagId` | none | `{ tags }` | editor |
| DELETE `/conversations/:conversationId/tags/:tagId` | none | `{ tags }` | editor |
| POST `/tags/sync` | none | `{ tags, sync: { status, importedCount, assignmentsComplete, warning? } }` | admin |

`TagItem` retains existing fields. Optional `usageCount` is scoped to the requested account. `capabilities` declares server-derived `canManageAccountTags`, `canAssignTags`, `canSyncZaloTags`, `canManageGlobalTags`; server still enforces each mutation. Definition edit/delete of global labels requires super-admin regardless of account membership. Source=`zalo`/`ai` writes through manual CRUD are rejected with a clear code.

All target IDs/ownership are validated server-side. Missing accountId = 400, no auth = 401, insufficient access = 403, unknown/mismatched resource = 404, duplicate/unsupported mutation = 409. Existing `requireAccountAccess` must receive a real path param, not silently skip query/body account IDs.

Existing `/api/tags` endpoints become compatibility adapters to the same service: require explicit account context for assignments, preserve response fields where feasible, and reject ambiguous requests with 400. Do not retain an unrestricted fallback. Unscoped legacy list returns only definitions visible to the authenticated user, never all system tags. Audit current consumers before switching routes; document deliberate behavior changes.

### 6.5 Zalo synchronization semantics

Validate `getLabels()` response using fixtures. Existing code assumes `labelData[].conversations`; absence is not an empty authoritative assignment list.

- No SDK method: `status: unsupported`, preserve existing data; UI explains capability unavailable.
- Provider failure/malformed response: `status: failed`, preserve prior labels/assignments; do not return success with an empty list.
- Valid definitions but unknown/partial assignment data: upsert definitions, `assignmentsComplete:false`, preserve assignments and show partial status.
- Complete, authoritative assignment snapshot: transactionally reconcile source=`zalo_sync` associations for that account only, including removals. Never remove manual/system labels.
- Provider label removal is applied only after a validated complete definition snapshot, scoped by account + provider label ID. Preserve a report of removed mirrored definitions/assignments; never infer deletion from pagination/error/empty malformed response.
- Serialize label sync per account. Running it twice has the same final result. A client sync timeout does not start a parallel import on retry.

### 6.6 Realtime and concurrent updates

Use the authenticated account fanout from Sprint 1. New event:

```ts
type TagsInvalidated = {
  type: 'tags_invalidated';
  eventId: string;
  accountId: string;
  reason: 'definition_changed' | 'assignment_changed' | 'sync_completed';
  conversationIds?: string[]; // canonical IDs; omit for account-wide refresh
};
```

Publish after commit. For a global definition change, fan out one event per affected account; never a global data broadcast. Client invalidates only the keyed account data and debounces a scoped fetch (~150 ms). Preserve a dirty flag if an event arrives during a fetch; re-fetch once more afterwards so an older response cannot erase a later invalidation. Optimistic assignment overlays survive old summaries until mutation confirmation/fetch. A failed old mutation must not roll back a newer successful one.

Reconnect triggers authoritative tag/summary refresh for the active account; WS events are not a durable history. This avoids introducing revisions/event-log infrastructure solely for label UI.

Tag mutations must never call Dify, sender, webhook message creation or any send API. Future automation can use stable IDs and account-qualified associations later.

## 7. Performance measurement and acceptance boundaries

- Record `submit -> pending commit/paint`, `HTTP duration`, `SDK duration`, `local persistence duration`, `confirmation paint` separately. Log request/account IDs and timings, not customer text or secrets.
- Target p95 submit-to-visible pending <=100 ms on the recorded test workstation; cached-conversation first paint <=150 ms. At least 30 samples each, with fixed fixture size (50 visible messages, 500 summaries) and browser/device/network stated.
- Cold-cache load has no invented fixed SLA; compare before/after and ensure skeleton/no stale content appears promptly. Investigate blocking reconnect/name resolution on measured slow GET paths.
- Preserve DB-first groups and parallel warm-start fixes. No new periodic full-account reload on each keystroke/send.
- Use React profiling first. Introduce list virtualization only if measured message DOM cost remains a bottleneck after selector/render fixes.

## 8. Compatibility and known unknowns

The current backend serves the frontend and also has a separate admin bundle; `bff-api.ts` wraps direct `api.ts`. Work on the active `frontend/src/features` components, not the compatibility wrappers as a second implementation. Keep `/`, `/m`, `/admin` reachable.

SDK receipt shape, client-ID injection, call discriminators, duration units, sticker asset format and Zalo label membership completeness are evidence-dependent. Agents must record verified shapes in test fixtures and their report; no fabricated success data. Preserve old API fields and raw payloads. Every contract deviation needs a decision-log entry and coordinator review before dependent agents implement it.
