# Extended sender tools — implementation and verification

2026-09-27. All pre-existing dirty upgrades preserved. No commit, deployment, migration execution, production data write, or live customer send.

## Implemented contracts and UI

New `backend/src/server/routes/extended-tools.ts`, `services/extended-tools-service.ts`, `frontend/src/features/chat/components/ComposerExtendedTools.tsx`; small integration in accounts router, runtime accessor, ChatPanel and authenticated composer transport. Machine-readable contract: `backend/docs/extended-tools.openapi.yaml`.

`+ Công cụ` sits beside existing emoji/templates. Runtime capability fetch controls actual buttons; offline/unavailable methods are not advertised. Routes always independently require authenticated account editor and conversation access, even without parent middleware. Forward rechecks destination authorization. Source messages are looked up by account-qualified storage identity and conversation; recall requires an outgoing source and genuine provider/client IDs.

| Feature | Exact supported behavior / limitation |
|---|---|
| Stickers | Installed `getStickers(keyword)` + `getStickersDetail(ids)`; max 40 search results with previews; server resolves the selected detail again, calls `sendSticker(detail, thread, type)`. Empty keyword uses SDK search, not a fabricated pack catalogue. |
| Poll | Group-only `createPoll({question, options}, groupId)`, 2–10 options. Advanced poll switches not exposed. |
| Forward | Stored text only, one authorized destination, `forwardMessage({message, threadIds}, type)`. No attachment forwarding or invented message-ID overload. Destination currently entered as `direct:ID` / `group:ID`. |
| Recall | Installed API is `undo({msgId, cliMsgId}, thread, type)`, **not** `undoMessage`. Own stored messages only with real IDs. Provider policy/time window remains authoritative. Receipt records provider response status; no fake local deletion. |
| Reminders | Installed `createReminder(options, thread, type)` and `editReminder(options including topicId, thread, type)`. Title + local datetime UI, topic ID returned for future edits. No reminder listing/calendar/repeat UI. |
| Contact | Real `sendCard({userId}, thread, type)`; ID entry. No invented sendContact endpoint. |
| Voice recording | Real MediaRecorder, microphone permission, stop, 2-minute/20-MiB guard, track cleanup on close/scope/logout. Adds a File to existing attachment draft for staging/review/explicit send. **Audio-file fallback**, not native Zalo voice. |
| Native voice | `sendVoice({voiceUrl}, thread, type)` and `uploadAttachment(...) -> fileUrl` exist, but browser codec compatibility is not verified. Capability false. No arbitrary URL submission, credentials, public staging objects or fake voice claim. |
| Location | No installed API found. Capability false; no send button. |
| Attachment quote/mentions | Additive immutable batch item `mentions` / `quoteMessageId`, first child only from frontend draft; JSONB `send_context`. Existing per-file `sendMessage` receives context. Group mentions bounds checked. Quote is loaded from same conversation, must have real raw SDK metadata, requires nonempty caption. Unsupported/missing metadata fails before SDK send rather than silently dropping quote. SDK may send quoted caption separately from attachment. |

Legacy sticker/poll/forward routes/wrappers remain untouched and are **not used by the new tools**; their mismatched SDK signatures discovered in review are not claimed fixed for legacy consumers.

## Idempotency and truthful state

- Additive `composer_actions` keyed by account + UUID, initiator/conversation ownership, normalized immutable action hash. PostgreSQL insert-on-conflict is the dispatch claim; mismatched body gets 409, foreign owner gets 404.
- Reserve `unknown` before provider mutation. Only fresh insertion dispatches. Same-ID POST, GET, reload, crash recovery and uncertain exceptions never redispatch. No mutation retry is offered, even for provider rejection; conservative safety over availability.
- 15-second action HTTP wait budget permits late settlement; browser deadline 20 seconds. SDK underlying call cannot be cancelled by this wrapper. Four active mutation workers and eight route operations per router/process bound occupancy; no automatic retries. SDK transport behavior is inherited. Catalogue/preparation calls still depend on SDK timeouts; no claim of a hard provider cancellation deadline.
- Sanitized identifiers/status only in receipts, not SDK credentials or raw provider objects. `accepted` means provider response accepted, not delivered/read. Malformed/unsafe numeric message IDs remain unknown.
- Browser saves action identity before POST and fails closed if storage cannot persist. Reload queries owned server receipts (latest 50) plus unresolved local IDs. Unknown blocks further tool mutations in that conversation UI; status checks are GET-only. This is intentionally conservative, not a full durable outbox UX.
- Extended sends rely on provider realtime/history for canonical message display. They do not synthesize fake message bubbles or recall deletion. No new WS schema.

## Deployment owner prerequisites (not executed)

Apply existing composer migration then new additive migrations:
1. `20260927170000_extended_action_receipts.ts`
2. `20260927171000_composer_item_context.ts`

Down migrations refuse destructive receipt/context loss. No janitor deletes receipt identities. Existing staging privacy, quotas and retention limitations remain. Run isolated PostgreSQL integration plus approved SDK/browser microphone smoke before production acceptance. Review account SDK compatibility on reconnect. Existing application TLS/auth/database protections are reused; no infrastructure changes.

## Verification / TESTER

Structural review: auth before SDK, target authorization, account-qualified source ID, quote lookup, immutable hash, insert claim, unknown/no replay, numeric ID validation, recording cleanup, credential/session checks. Corrected reminder `reminderId` mapping and source-message storage prefix during review.

Executed:
- Backend `npx tsc --noEmit`: PASS.
- `npx tsx --test test/extended-tools.test.ts test/composer.test.ts test/accounts-send-routes.test.ts test/sender-receipts.test.ts test/send-request-service.test.ts`: **36 passed, 1 skipped**, no failures.
- Follow-up backend extended/composer tests after review corrections: **9 passed, 1 skipped**.
- Frontend `npm run typecheck`, `npm run build`: PASS; existing >500-kB chunk warning remains (~713 kB minified).
- Frontend `npm run test:sales-chat`: **22 passed**.
- Frontend explicit tsx `extended-tools.test.ts`: **1 passed** (first-child immutable context).
- `npm run test:composer:browser`: PASS at 390px and 1280px (existing staging/draft regressions).
- `node tests/extended-tools-browser.mjs`: PASS at 390px and 1280px (authenticated capability/search, real component action click, uncertain receipt disables sends, reload/status zero repeat POST).
- `git diff --check`: PASS.

Not executed: PostgreSQL migration/atomicity integration (no isolated test database configured), live SDK sending, actual microphone capture/codec interoperability, live MinIO upload. Mock receipt concurrency is not a substitute for PostgreSQL integration. Weighted local plan: validation/contracts 25/25, auth 25/25, receipts 12.5/25 (DB gate open), frontend 25/25 = **87.5/100 local evidence**, not production acceptance.

## CODER response / MAIN handoff

No executed tests failed. Remaining acceptance work is integration evidence, not permission to deploy. Main-owned batch draft unlock/durable outbox is intentionally unchanged. No full-composer completion claim: native voice/location, rich forward, reminder list UI, polished destination/contact pickers and live provider confirmation remain outside this delivered slice.
