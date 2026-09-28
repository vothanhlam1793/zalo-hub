# Sprint 2 — voice, call and sticker presentation

Status: planned. Depends on Sprint 1 message identity/status contract and verified merge. Contract: `../design.md` section 5.

## Task breakdown

| ID | Owner | Change | Output |
|---|---|---|---|
| S2-01 | Backend/media + tester | Collect redacted live/history samples for call outcomes, voice formats, sticker/large icon | Fixture table: provider msgType/wrapper, asset source/type, duration units, expected UI |
| S2-02 | Integrator | Freeze call metadata, durationSeconds and safe unknown behavior | Shared type patch and fixture contract |
| S2-03 | Backend/media | Extend normalization/projection across live ingestion, history reads and runtime repair | One semantic mapping used consistently; raw/source data retained |
| S2-04 | Frontend/media | Add voice/call/sticker renderer components and emoji-only selector | Presentational fixtures/demo states and accessible controls |
| S2-05 | Backend/media | Verify audio MIME/streaming; add single-range handling if required | Tested `/media/*` full/range/error paths |
| S2-06 | Integrator | Wire message shell, sidebar previews, desktop/mobile and cache refresh | Existing text/image/video/file/quote/reaction regression preserved |
| S2-07 | Verifier/tester | Structural review, fixture tests, browser playback and real sample verification | Test report; unsupported format list with evidence |

S2-03 and S2-04 can run concurrently after S2-02. Existing runtime/store repairs can overwrite normalized fields, so S2-03 must verify the complete reader path, not only `normalizeMessageKind`.

## File map

- Backend: `src/core/runtime/normalizer.ts`, `listener.ts`, `index.ts` repair path; proposed `message-presentation.ts`; `src/core/store/helpers.ts`, `message-repo.ts`; backend types; `/media/*` section of `src/server/index.ts` (integrator ownership).
- Frontend: `src/types.ts`, `src/utils.ts` if attachment predicates need adjustment; `features/chat/components/MessageBubble.tsx` and new `messages/*`; sidebar preview mapper; `ChatPanel.tsx` lightbox/scroll integration.
- Tests: redacted provider fixtures, normalizer/history projection roundtrip, media route integration, renderer/playback browser cases.

## Presentation behavior

- Preserve shared sender name, timestamp, quote, reaction and Sprint 1 delivery status across renderers.
- Do not display `[voice]` or transport JSON as the primary content when a proper voice/call renderer exists.
- Sticker dimensions reserve layout space to prevent scrolling jumps; broken URL has readable fallback.
- Audio play is user-initiated, one player at a time; account/conv switch pauses it. Browser loadedmetadata can supply unknown duration.
- Call unknown fields stay unknown; incoming does not imply missed; zero duration does not imply declined.
- For media without browser codec support, show fallback and report the exact limitation. No unplanned transcoding service.
- Historical projection applies to messages read from DB and refreshed cache. Do not require rewriting every stored message to show an improved bubble.

## Required fixture inventory

1. Incoming/outgoing voice with accessible media; missing/expired URL; unsupported codec sample.
2. At least one actual call payload; additional outcomes only claimed supported when fixture-proven.
3. Static sticker, animated/large-icon sample causing reported issue, missing asset.
4. Stored `rawMessageJson` wrapper variant and already-mirrored attachment URL.
5. Ordinary text containing phone/call-related words to prove it is not misclassified.
6. Mixed emoji/text, skin tone and family ZWJ emoji examples.

A missing fixture is a blocked format mapping, not a license to invent msgType values. Frontend skeleton components can proceed using canonical DTO fixtures clearly marked synthetic.

## Release gate

Pass `test_key.md`; report which real formats were verified and which fell back. Preserve raw data and old media downloads. If a new DB column is needed, add a nullable forward migration and test old rows; default plan uses additive read-time call metadata projection.
