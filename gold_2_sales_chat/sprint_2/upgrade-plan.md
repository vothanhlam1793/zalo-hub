# Rich message upgrade — 2026-09-27

Approved baseline: 2ea9921. Execute the user's reviewed rich-message and notification upgrade in the existing monolith.

## Contract
- Extend backend GoldMessageKind / frontend MessageKind with call, system, location, link, card, unknown.
- Add optional presentation to messages: { version: 1; durationSeconds?: number; url?: string; thumbnailUrl?: string; latitude?: number; longitude?: number; albumId?: string; albumIndex?: number; albumTotal?: number; unavailable?: boolean }. Do not infer call outcome from duration or undocumented numeric codes.
- Attachments retain existing fields; duration is milliseconds. Frontend gains duration?: number.
- Pure backend projection normalizes both PC and realtime, preserves mirrored media and identity, and serves every history reader. Recognize structured JSON only with provider evidence; ordinary text JSON stays text.
- Frontend renders canonical fields, never reparses provider raw JSON. Missing source has readable fallback. Shared preview respects user privacy settings.
- New-message notification uses an account/conversation-authorized event distinct from subscribed detail messages. Updates must not notify.

## Sequence and ownership
1. Backend: normalizer/projection, store readers, PC importer, types, fixture tests.
2. Frontend: types, renderers, preview helper/sidebar/quote, media tests.
3. Realtime integration: WS permissions and notification event, dashboard settings races, notification service tests.
4. Verify integration, typecheck, regression tests and build. Historical display is repaired on read; production batch mutation/deploy require operational verification.

## Test key
1. Provider fixtures and plain JSON preservation: 25%.
2. Stored projection preserves identity/local URLs, repeated projection stable: 20%.
3. Renderer voice/video/call/system/missing source and preview: 20%.
4. Notification fanout permissions, no duplicate notification, settings: 20%.
5. Existing reconciliation/realtime tests and builds: 15%.

Unknown provider subtype mapping, live codec playback, full interactive polls/reminders and production backfill must be explicitly reported if not verified.
