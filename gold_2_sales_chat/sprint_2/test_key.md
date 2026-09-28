# Sprint 2 — test key

Weights total 100. **Critical** cases gate release. Planned only.

| ID / weight | Input and setup | Expected / pass criteria |
|---|---|---|
| S2-T01 / 15 **critical** | Same fixture through live listener normalization, stored-message projection and runtime repair | Equivalent canonical kind/metadata; call stays call; mirrored local URL preserved; raw source unchanged |
| S2-T02 / 20 **critical** | Real supported voice clip on target desktop/mobile browser; play, pause, seek, end, start second clip, switch account/chat | Audible playback, truthful duration/progress, one active player, pause/cleanup on switch; no autoplay; keyboard-operable controls |
| S2-T03 / 10 | Missing URL, expired media, unsupported codec, metadata still loading | Clear loading/unavailable state; fallback open/download only with valid URL; no endless spinner or uncaught error |
| S2-T04 / 15 **critical** | Verified call fixtures and unknown payload; plain text mentioning calls | Appropriate icon/outcome/duration only when supplied; unknown neutral; no false missed-call classification or raw JSON bubble |
| S2-T05 / 15 | Static/animated sticker fixture, empty/broken asset, emoji-only ZWJ/skin-tone, mixed text | Bounded aspect ratio, supported animation or stated static fallback, no broken empty image; emoji selector does not consume ordinary text |
| S2-T06 / 10 | Full audio GET, valid start/end/suffix range, invalid range, HEAD, client disconnect; image/video regression | Correct 200/206/416 headers and lengths where range support implemented; clean streams; existing downloads/playback remain functional |
| S2-T07 / 10 | Historical DB rows/cached messages refreshed; quotes, reactions, image/file/video, sidebar preview | Improved renderer works after refresh without destructive backfill; shell metadata and existing interactions preserved |
| S2-T08 / 5 | Build/typecheck; mobile narrow viewport; voice/sticker load while reading history | No new errors, no horizontal overflow, stable reading anchor; report actual fixture/browser coverage |

## Evidence requirements

- Name fixture ID and provenance (SDK/source or approved real sample), not private customer identity.
- Duration tests state source units and expected seconds; include absent duration and 0.
- A synthetic DTO proves renderer behavior only, not provider integration.
- If range support is not required by tested media, document why and test the retained full-response route; do not mark unimplemented range scenarios as passed.
- Record unsupported formats explicitly in the sprint report; do not claim universal Zalo sticker/call support.
