# Frontend composer implementation report

Date: 2026-09-27. Existing dirty upgrades and received-album implementation preserved. No backend edits, deployment, migration execution, or commit performed by this owner.

## Implemented

- Multi-attachment draft model: add/remove, native multi-select, file drop, image paste, drag reorder and keyboard-accessible up/down controls, per-item captions. Common text is explicitly applied to the first item only. No native album claim.
- Bounded image/video/file preview dialog using the existing trusted local blob registry. Unknown file formats are downloadable, not embedded. Video uses native controls, metadata preload, no autoplay.
- Durable version-2 draft records within existing user-scoped IndexedDB cache: blobs, metadata, mentions, reply context, staging metadata and immutable batch payload/results. Legacy text/file-name records migrate to explicit missing-file rows without dropping existing message caches. Interrupted uploading restores as local, never auto-uploads/sends.
- Quota/private-mode failure surfaces a warning, attempts metadata-only persistence, and keeps in-memory blobs. Batch submission fails closed if immutable IDs cannot be persisted before POST.
- Authenticated/session-guarded contract transport with conversation query on every call, request abort deadlines, two global staging upload slots, capability file/item limits capped at 50 MiB/10. Upload UI is indeterminate, not invented byte progress.
- Fresh staging GET before initial send; stable UUID batch/item IDs and frozen ordered captions. Explicit retry sends the same payload plus retry:true and is offered only for eligible failed children. Explicit Resume handles reserved queued items. Reload polls GET only, bounded to six attempts with backoff; unknown children are never automatically resent.
- Per-child optimistic pending IDs and receipt merging through the existing authoritative chat store. Batch children cannot enter legacy single-message resend/cancel/restore paths. Local pending previews are reconstructed from durable blobs and released after canonical replacement/session change.
- Removing an unsent uploading item prevents sending it; if upload completes later, its returned stage is deleted. This intentionally does not promise provider cancellation. Submitted batches cannot be canceled through an unsupported endpoint.
- Local emoji cursor insertion (with mention-offset adjustment), personal quick replies scoped to user/account/conversation in IndexedDB, persisted add/insert/delete controls.
- Canvas rotate 90 degrees and center crop 10–100%, PNG export, 40 MP processing guard. Edited bytes receive a new attachment/stage identity; UI discloses format/metadata loss and moving the edited item to the end. This is a real basic center-crop tool, not a freeform crop editor.
- Existing text-send path retained. Safety correction: polling timeout leaves an ambiguous send unknown/non-retryable; sending/unknown messages cannot be canceled by legacy local deletion.

## Files owned/touched

- New model modules: `frontend/src/features/chat/model/composer-types.ts`, `composer-controller.ts`.
- New UI: `frontend/src/features/chat/components/ComposerAttachments.tsx`, `ComposerLocalTools.tsx`.
- Integrated existing files: `frontend/src/api.ts`, `lib/client-db.ts`, `stores/composer-store.ts`, `hooks/useComposer.ts`, `types.ts`, `features/chat/components/ChatPanel.tsx`, `components/messages/MessageDeliveryStatus.tsx`, `model/send-controller.ts`, `frontend/package.json`.
- Browser harness: `frontend/tests/composer-browser.{html,tsx,mjs}`.
- Plan/report: this directory's `frontend-plan.md`, `frontend-report.md`.

## Verification

Structural review completed before testing: auth/session ownership, immutable IDs, no batch replay on reload, caption mapping, cancellation boundary, preview ownership, preserving received albums. Review fixes included blocking legacy batch-child actions, storage ownership checks, and invalidating stale GET results around explicit POSTs.

Commands run from `frontend/`:

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS; existing large-main-chunk warning remains (~704 kB minified / 203 kB gzip) |
| `npm run test:sales-chat` | PASS, 22 tests |
| `npm run test:albums` | PASS, 6 tests |
| `npm run test:albums:browser` | PASS, desktop/mobile plus short history, inner-anchor and same-URL regressions |
| `npm run test:composer:browser` | PASS at 390px and 1280px |
| tsx tests: message-cache-authority, rich-message-render, notifications | PASS, 25 tests |

Composer browser coverage uses real Chromium IndexedDB and mocked HTTP: legacy migration, blob bytes/reply/mention roundtrip, foreign-user scope rejection, metadata fallback warning (injected persistence failure), emoji insertion, local template save, drop/paste/remove, reorder, modal close, upload peak concurrency=2, common/per-item captions, durable reload with zero POST, partial retry with identical IDs/ordered payload.

Not claimed: live Zalo/media-storage smoke, real disk quota exhaustion, Firefox/Safari, assistive-technology certification, image editing E2E coverage, or backend integration against a running migrated server. Current automated score against the weighted plan is partial rather than full acceptance: browser cancellation/session stress and edit-image coverage remain desirable.

## Contract requests / operational limits

1. **Batch v1 has no mentions or reply/quote fields.** Frontend restores them faithfully but blocks attachment batches containing those fields with a clear explanation, rather than silently dropping context. Please extend the immutable item contract with validated mention/quote fields if these must be sent with attachments.
2. **No cancel/archive batch endpoint or list-batches endpoint.** The UI retains the current immutable batch until all children are sent, then allows a new draft. A permanent failure/unknown batch intentionally remains visible/locked; supporting safe dismissal into a durable outbox and drafting a new batch concurrently needs a follow-up outbox UX. Text-only drafting while that batch is locked is not available in this implementation.
3. Staging cancellation is logical, not an assertion that the network stopped: a late successful upload is deleted. A timed-out upload with no returned ID may occupy server quota until explicit backend cleanup/TTL. No unsafe background cleanup is introduced.
4. Server-retained batch references count toward its stated staging quota. Existing backend retention policy remains unchanged. Local blob storage is removed when the completed composer is cleared or the user cache is cleared on logout; unresolved drafts keep their bytes.
5. Other extension endpoints/tools remain untouched and unadvertised. The future extension agent should treat `ComposerLocalTools.tsx` and `ComposerAttachments.tsx` as implemented local tools and coordinate edits to `ChatPanel.tsx`.

## Handoff

Frontend files are stable for the extension agent. Run `npm run test:composer:browser` after changes to attachment, draft, auth, or batch controls. Keep the backend contract's GET-only recovery and stable immutable POST payload invariant. Remaining limitations above must not be described as fully verified production behavior.
