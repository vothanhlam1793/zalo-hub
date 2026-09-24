# Sprint 1 frontend verification

**VERIFIER — BLOCKED; return to CODER.** Reviewed 2026-09-22 against `../design.md` §§3–4 and the frontend/realtime implementation handoffs. Static source inspection only: **no tests, builds, live sends, or feature-source edits**. Backend implementation review remains separate. Paths below are relative to `frontend/src`; line numbers refer to the reviewed worktree.

The keyed message owner, captured send targets, structured API errors, removal of text/time matching, and authenticated transport are good foundations. Both desktop and mobile wire the new delivery actions. The following frontend correctness issues prevent sign-off.

## Blocking findings

### F1 — 🔴 Cross-tab credential replacement does not invalidate chat work

**Paths:** `features/realtime/useWebSocket.ts:210–223`; `stores/auth-store.ts:23–69`; `features/chat/model/chat-session.ts:6–16`; `api.ts:15–25`; `features/chat/model/send-controller.ts:59–71`.

**Scenario:** Tab A remains open as user U while another tab logs out or logs in as V. The storage/focus handler disposes only the socket; U's auth store, chat-session generation, drafts, send queue, and cache writers remain valid. HTTP reads and queued/manual sends subsequently read V's bearer token from shared localStorage while retaining U's captured conversation/cache identity. With shared account access, U's queued text can actually be sent using V's credentials. A late U callback can also repopulate U's cache after the other tab cleared it.

**Minimum fix:** Centralize credential-change handling in the auth/session lifecycle. On token removal/replacement, invalidate the chat generation and clear old-user work/state/cache before accepting more operations; establish the replacement identity through authentication. Bind HTTP work to the captured credential/session, rather than silently borrowing whichever token is currently stored. Do not call provider logout merely to clear another tab's local session.

### F2 — 🔴 Reentrant queue dispatch persists an older `queued` snapshot after dispatch

**Paths:** `stores/chat-store.ts:65–90`; `features/chat/model/send-controller.ts:173–182`; `features/chat/model/manual-send-queue.ts:17–27`; `lib/client-db.ts:48–56`; `features/chat/model/message-reconciliation.ts:93–101`.

**Scenario:** A send is `unknown`, its HTTP call has finished, and B is queued behind it. A status receipt or trusted WS echo resolves A. The store publishes that transition before saving its snapshot. Its synchronous subscriber resumes B, patches B to `sending`, and schedules the newer cache write. Control then returns to the outer transition, which schedules its older snapshot with B still `queued`. That older write wins. Reload before B's receipt recovers B as `UNSENT_RELOAD`, even though its POST was dispatched, and offers draft recovery/new-request sending instead of querying the original request. This can duplicate a customer message.

**Minimum fix:** Make persistence revision-aware and serialize/coalesce writes from the latest committed keyed state. Alternatively prevent synchronous dispatch reentrancy and still enforce monotonic snapshot writes. A dispatched intent must never be persisted again as never-dispatched `queued`.

### F3 — 🔴 Caption receipts inherit the attachment placeholder's media

**Paths:** `features/chat/model/message-reconciliation.ts:13–20,53–64,74–77`; `features/chat/model/send-controller.ts:171–180`; `features/chat/components/MessageBubble.tsx:42–49,168–173`.

**Scenario:** Submit an image with a caption. A receipt emits `[captionText, image]`. The first canonical row claims the single optimistic image placeholder. Because the caption has no attachments, `combine()` retains the placeholder's blob attachment. The real image is then inserted separately. The UI renders the uploaded image twice, including on the text-caption row. That row permanently retains the blob URL, so the registry never releases the preview/File even after canonical image media arrives. The authored multi-message fixture starts with a text-only placeholder and does not cover this path.

**Minimum fix:** Assign the attachment placeholder/preview to the corresponding canonical media row, not simply the first request-correlated row. Preserve previews only for the same logical media message; do not inherit `attachments`/`localFile` into an independent caption. Release the preview when that media row has confirmed replacement media.

### F4 — 🔴 Shared client IDs can still collapse distinct observed provider messages

**Paths:** `features/chat/model/message-reconciliation.ts:4–9,43–46,63–68`.

**Scenario:** Two valid DTOs have IDs `account::caption` and `account::image`, share `cliMsgId`, and omit the optional `providerMessageId` field on either row. `messageAliases()` correctly derives their different provider IDs from the known storage prefix, but `conflictingProvider()` checks only the explicit field. Consequently the shared client alias matches and one real message replaces the other. This affects HTTP/history/WS ordering and multi-message receipts despite the handoff's preservation claim.

**Minimum fix:** Determine provider conflicts from the same normalized observed-provider identities used by `messageAliases()`, including the known stored-ID convention. A weaker client alias must not join rows whose known provider identities differ.

### F5 — 🔴 Reconnect does not recover missed messages in the open pane

**Paths:** `features/chat/useDashboardState.ts:113–130,316–327,370–376`; `features/realtime/useWebSocket.ts:115–123`; `hooks/useConversationManager.ts:127–140`.

**Scenario:** Leave a conversation open, lose WS/network connectivity, receive a customer reply during the outage, then reconnect. Authentication resubscribes and rechecks only this browser's unresolved outgoing requests. It never fetches the open conversation's history. Even if an initial summary updates the sidebar preview, the missing incoming message is absent from the pane indefinitely until the user reselects/reloads. The existing refresh helper likewise reloads summaries/metadata, not message bodies.

**Minimum fix:** On authenticated reconnect, fetch and merge authoritative messages for the captured active conversation and refresh relevant summaries. Keep session/key/revision fences and preserve local pending rows; status polling is not a substitute for missed-message recovery.

### F6 — 🔴 Dashboard remount retains the selected pane but loses its subscription

**Paths:** `app/AppRoutes.tsx:23–25`; `features/realtime/useWebSocket.ts:179–186,205–207,224–239`; `features/chat/useDashboardState.ts:228–243`; `hooks/useConversationManager.ts:108–114`.

**Scenario:** Open a conversation, navigate to `/admin`, and return to `/` or `/m`. Zustand retains `activeKey`/`activeConversationId`, but the old hook/socket was disposed and the new hook's selection ref is empty. Restoration deliberately does nothing when an active conversation already exists. Since subscription is otherwise set only by selecting a conversation, the cached pane appears selected but receives no new conversation messages. Reauthentication alone does not fix an empty transport selection.

**Minimum fix:** Initialize/synchronize each mounted realtime hook's subscription from the authoritative active conversation key, independently of saved-selection restoration. Unsubscribe on clearing selection/unmount and merge a fresh snapshot when resuming the pane.

## Review boundary / next step

- Inspected controller/queue/reconciliation, stores/cache, auth/session, loading hooks, dashboard/composer/bubbles, API adapter, and frontend realtime lifecycle, including both layouts.
- No confirmed self-sustaining React render loop was found in the inspected source; this is not a browser/profiler certification. In particular, shallow selectors alone do not prove keystroke isolation: the runtime draft `revision` is spread into composer state (`stores/composer-store.ts:27,41–42`) and retained by the dashboard's rest selector (`features/chat/useDashboardState.ts:46`).
- Runtime correctness, IndexedDB behavior, IME/accessibility, viewport behavior, and latency remain untested in this phase. Existing authored tests are not treated as passing evidence.
- Resolve F1–F6, then repeat structural verification before the coordinator starts TESTER. Preserve the single-owner/captured-identity approach while closing these lifecycle boundaries.
