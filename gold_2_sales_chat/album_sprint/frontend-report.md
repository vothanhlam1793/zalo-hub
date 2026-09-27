# Received albums — frontend checkpoint

## Reviewer corrections — 2026-09-27
- Added explicit `onLoadOlder` from useDashboardState to both desktop/mobile ChatPanel instances. The button remains reachable when compressed history does not overflow. Synchronous pending guards in ChatPanel and a scoped in-flight Set in the shared callback prevent duplicate click/scroll requests; existing bounded pagination remains unchanged.
- Scroll snapshots now include stable visible media/caption identity and viewport offset, restored before row fallback. Prefer content beginning in the viewport over a trailing tile sliver. Browser test adds an older member to a scrolled two-image album, changes grid to three, and verifies caption drift below 2px.
- Lightbox image is keyed by selected stable media identity. Distinct slots sharing a URL remount and finish loading after next navigation.
- Final reruns: typecheck PASS; album unit/SSR 6/6; sales-chat 22/22; browser eight scenarios PASS (existing flow plus short history/pending, 2-to-3 inner anchor, identical-URL navigation at both 390px and 1280px); build PASS; bundle warning remains (JS 685.69 kB / gzip 196.70 kB).
- Additional files modified for corrections: `frontend/src/features/chat/useDashboardState.ts`, `frontend/src/features/chat/DashboardPage.tsx`. Tests remain fixture-based, not live provider integration.

## Implementation and verification
- Preserved the pre-existing dirty worktree; no backend edits, endpoint, deployment or commit.
- Pure selector groups only contiguous canonical album IDs within supplied account, conversation, sender ID, direction, self flag and local calendar day. Missing sender/account, invalid dates, text, mixed media and interleaving break runs. Single-message multi-image attachments use the same grid without inventing cross-message membership.
- SDK evidence: installed `backend/node_modules/zalo-api-final/dist/apis/sendMessage.js:247,279` initializes index to upload count minus one and decrements. Complete unique valid indices sort descending; missing/duplicate indices preserve the entire run's input order.
- Original messages retained; provider echo identity deduplicates media, not URLs. Attachment slots remain distinct even with repeated attachment IDs/URLs. Captions, mentions, quotes, delivery actions and received reactions retain original association.
- Fixed-ratio 2/3/4 grids, +N for loaded overflow, full loaded-image lightbox, overflow-image action disclosure, explicit floating per-image controls. Partial totals shown only when consistent; ordinary history scrolling remains the loading mechanism. No automatic album fetch loop.
- ChatPanel aliases original row anchors when an older member becomes the new album head. Scrolled-up realtime updates also preserve anchors. Lightbox tracks selected image identity across list insertion/reordering.
- Structural verifier checked selector purity, boundary/order preservation, action provenance, non-image fallback and no backend/API expansion before tests.

## Exact test results
All commands run in `frontend/`:
- `npm run typecheck`: PASS (final run).
- `npm run test:sales-chat`: 22 passed, 0 failed, 0 skipped.
- `../backend/node_modules/.bin/tsx --tsconfig tsconfig.app.json --test src/features/chat/model/album-selector.test.ts src/features/chat/components/messages/rich-message-render.test.ts src/features/chat/model/message-cache-authority.test.ts tests/notifications.test.ts`: 31 passed, 0 failed, 0 skipped (6 new album tests included).
- `npm run test:albums`: 6 passed, 0 failed, 0 skipped (repeat after selector identity hardening).
- `npm run test:albums:browser`: PASS at 390x900 and 1280x900 using installed Chromium. Tests grid bound, composer bounding-box equality during floating action opening, actual reaction and overflow reply targets, clicked lightbox image/navigation, realtime image identity, and older-member anchor drift under 2px.
- `npm run build`: PASS; 1927 modules; JS 684.47 kB / gzip 196.35 kB; CSS 123.24 kB / gzip 18.94 kB. Existing >500 kB chunk warning remains.
- `git diff --check`: PASS before final documentation.

## Test-driven corrections
- Initial typecheck rejected Array.at under current lib target; replaced with indexing.
- Browser exposed pre-existing Lightbox first-button hiding rule. Replaced with DialogContent showCloseButton=false; added explicit title, close/navigation names and full desktop width.
- Browser harness initially lacked selected composer scope and used siblings inside the app root flex layout; fixed harness initialization/layout, then reran both viewport cases successfully.

## Constraints / handoff
- Browser fixtures intercept image URLs and update ChatPanel props; no live Zalo, actual HTTP pagination, authenticated WS, database or provider-device ordering smoke test was performed.
- Received mixed video/file albums stay separate conservatively; this milestone groups image-only media. No synthetic regrouping across text/date/sender boundaries.
- Account isolation uses the existing account-scoped message-list contract: Message itself has no accountId. Callers must not pass mixed-account lists.
- Missing/conflicting totals remain unknown; a split contiguous run can honestly display a partial count even when another run is loaded elsewhere.
- Existing history onScroll loads older pages. Partial hint directs the user to it; no context endpoint or new loader was introduced.
- Draft uploads, batch sending and other roadmap checkpoints remain deferred.

## Owned application/test files
Modified: frontend/package.json; frontend/src/features/chat/components/ChatPanel.tsx; frontend/src/features/chat/components/MessageBubble.tsx; frontend/src/features/chat/components/Lightbox.tsx; frontend/src/features/chat/components/messages/MessageMedia.tsx.
Added: frontend/src/features/chat/model/album-selector.ts; frontend/src/features/chat/model/message-media.ts; frontend/src/features/chat/model/album-selector.test.ts; frontend/src/features/chat/components/messages/AlbumMessage.tsx; frontend/tests/album-browser.html; frontend/tests/album-browser.tsx; frontend/tests/album-browser.mjs.
