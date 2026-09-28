# Upgrade verification — 2026-09-27

## Structural verification
Reviewed projection, all message readers, summary previews, renderer URL handling, cache precedence, notification authorization and settings races. Review findings were returned to implementation and fixed: ordinary sentinel text suppression, quote JSON leakage, unprojected summaries, stale IndexedDB precedence, optimistic blob previews and overlapping mute requests.

## Final executed checks
- Backend `npx tsc --noEmit`: pass.
- Backend rich-message, notification-event and persistence-repair tests: 21 passed.
- Backend sales-chat suite: 39 passed, 1 skipped (isolated PostgreSQL database not configured).
- Frontend typecheck: pass.
- Frontend renderer/cache/notification tests: 25 passed.
- Frontend sales-chat suite: 22 passed.
- Frontend production build: pass; main chunk exceeds 500 KB warning.
- Total final test execution: 107 passed, 1 skipped.

## Score against upgrade-plan test key
- Provider fixtures/plain text: 25/25.
- Stored projection: 15/20 (mocked repository SQL, no isolated PostgreSQL execution).
- Renderers: 15/20 (SSR/unit verified, real browser codec and visual smoke pending).
- Notification permissions/settings: 20/20 in automated coverage; live OS notification smoke pending.
- Regression/typecheck/build: 15/15.
- Automated/fixture milestone score: 90/100; not a production readiness claim.

## Coder response
No failing final automated tests. Review defects were corrected before final testing. Skipped integration and missing live-browser evidence require environment-specific verification, not a claim of completion.

## Delivered
Provider-aware PC/realtime projection; read-time history/summary/quote repair; media/call/system/location/card renderers; multiple attachments and lightbox identity; voice playback; reaction counts; notification-only fanout with conversation permissions; versioned presentation cache preserving drafts/pending; mute/settings race guards.

## Remaining scope
- Album IDs/order/count are extracted; cross-message and cross-pagination album grouping is not implemented.
- Existing reactions are rendered; complete reaction removal/late-event semantics and new recall/group/reminder event ingestion remain follow-up work.
- Polls/reminders/custom cards have conservative readable fallbacks, not full interactive state or provider actions.
- Numeric call reasons/types remain unmapped; ID-only stickers have a readable fallback, no invented asset URL.
- No production batch rewrite/backfill tool or migration was executed; historical correction is read-time projection.
- No deployment, service restart, live media fetch/codec smoke, OS notification smoke, production SQL performance check, or commit.
- Presentation is reconstructed from raw payload and stored attachments; synthetic presentation-only fields do not have a database persistence guarantee.
- Notification dedup is bounded/in-memory and not cross-tab/durable. Mute self-echo matching is best-effort without a server operation ID.
